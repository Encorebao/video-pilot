from __future__ import annotations

import json
import base64
from pathlib import Path
from typing import Any

import httpx

from app.repositories.model_configs import ModelRuntimeConfig
from app.services.analysis_taxonomy import taxonomy_prompt_lines


class ModelConfigError(RuntimeError):
    pass


class ModelCallError(RuntimeError):
    pass


def require_runtime_config(config: ModelRuntimeConfig | None, capability: str) -> ModelRuntimeConfig:
    if config is None:
        raise ModelConfigError(f"{capability} model is not configured")
    if not config.enabled:
        raise ModelConfigError(f"{capability} model is disabled")
    if not config.base_url.strip() or not config.model.strip():
        raise ModelConfigError(f"{capability} model endpoint or model name is missing")
    return config


def _endpoint(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def chat_completion(
    config: ModelRuntimeConfig,
    messages: list[dict[str, Any]],
    *,
    timeout: float = 60,
) -> str:
    headers = {"Content-Type": "application/json"}
    if config.api_key.strip():
        headers["Authorization"] = f"Bearer {config.api_key}"

    payload = {
        "model": config.model,
        "messages": messages,
        "temperature": 0.2,
    }
    try:
        response = httpx.post(
            _endpoint(config.base_url, "chat/completions"),
            headers=headers,
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ModelCallError(f"Model request failed: {exc}") from exc

    data = response.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ModelCallError("Model response did not include choices[0].message.content") from exc
    if not isinstance(content, str) or not content.strip():
        raise ModelCallError("Model response content is empty")
    return content


def build_vision_prompt() -> str:
    taxonomy_lines = "\n".join(taxonomy_prompt_lines())
    return (
        "你是一名专业的视频剪辑助手。请对这张视频截帧进行详细分析，以 JSON 格式输出，"
        "保留自然语言描述，同时为素材检索输出稳定枚举标签。\n"
        "所有枚举字段必须只从下面字典值中选择；如果无法判断，选择“不确定”。\n"
        f"{taxonomy_lines}\n"
        "emotion_tags 最多 3 个；search_keywords 3-8 个中文关键词。\n"
        "包含以下字段（用中文回答）："
        "{"
        '"shot_type":"景别",'
        '"camera_movement":"摄像机运动",'
        '"subject":"画面主体",'
        '"subject_category":"主体类型枚举",'
        '"action":"主体动作",'
        '"action_type":"动作枚举",'
        '"environment":"场景环境",'
        '"environment_type":"环境枚举",'
        '"lighting":"光线特征",'
        '"lighting_type":"光线枚举",'
        '"color_tone":"色调风格",'
        '"color_tone_type":"色调枚举",'
        '"emotion_atmosphere":"情绪与氛围",'
        '"emotion_tags":["情绪枚举"],'
        '"edit_role":"剪辑用途枚举",'
        '"search_keywords":["关键词"],'
        '"edit_suggestion":"剪辑建议",'
        '"notable_details":"值得注意的细节或 null"'
        "}。只输出 JSON，不要其他文字。"
    )


def _vision_prompt() -> str:
    return build_vision_prompt()


def describe_frame(config: ModelRuntimeConfig, image_path: Path) -> dict[str, Any]:
    image_b64 = base64.b64encode(image_path.read_bytes()).decode("utf-8")
    content = chat_completion(
        config,
        [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                    {"type": "text", "text": _vision_prompt()},
                ],
            }
        ],
        timeout=120,
    )
    return _extract_json_object(content)


def describe_video_clip(
    config: ModelRuntimeConfig,
    video_path: Path,
    prompt: str,
) -> dict[str, Any]:
    video_b64 = base64.b64encode(video_path.read_bytes()).decode("utf-8")
    content = chat_completion(
        config,
        [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "video_url",
                        "video_url": {"url": f"data:video/mp4;base64,{video_b64}"},
                    },
                ],
            }
        ],
        timeout=180,
    )
    return _extract_json_object(content)


def _extract_json_object(content: str) -> dict[str, Any]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        cleaned = cleaned[start : end + 1]
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ModelCallError("Model response was not valid JSON") from exc
    if not isinstance(parsed, dict):
        raise ModelCallError("Model JSON response must be an object")
    return parsed


def generate_analysis_summary(
    config: ModelRuntimeConfig,
    project_name: str,
    media: list[dict[str, Any]],
) -> dict[str, Any]:
    media_brief = [
        {
            "id": item.get("id"),
            "name": item.get("name"),
            "type": item.get("type"),
            "durationInFrames": item.get("durationInFrames"),
            "sourceLabel": item.get("sourceLabel"),
            "subtitleText": item.get("subtitleText"),
        }
        for item in media
    ]
    content = chat_completion(
        config,
        [
            {
                "role": "system",
                "content": (
                    "你是视频素材编排助手。只返回 JSON 对象，不要 Markdown。"
                    "字段包括 overall_summary, edit_suggestions, videos。"
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "project_name": project_name,
                        "media": media_brief,
                        "requirements": (
                            "根据素材元信息生成基础内容摘要、剪辑建议和每个视频的概要。"
                            "如果缺少真实画面信息，明确说明需要后续视觉分析补充。"
                        ),
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    )
    return _extract_json_object(content)


def build_script_edit_system_prompt() -> str:
    return (
        "你是视频脚本剪辑助手。只输出 JSON 对象，不要 Markdown，不要解释。\n"
        "输出 version 必须是 script_cut_v1。\n"
        "只能使用用户提供的 candidateId，不能发明素材、candidateId、mediaId、时间段或字段。\n"
        "主线内容优先选择有字幕或口播信息的 main candidates。\n"
        "B-roll 只能放在 tracks.broll，用于画面覆盖，不能承担主声音。\n"
        "如果 request.mode 是 broll_sort，只能输出 tracks.broll，tracks.main 必须为空数组。\n"
        "原声音频不需要输出，系统会根据 tracks.main 自动生成。\n"
        "所有 durationInFrames 必须为正整数，timelineStartFrame 和 startOffsetFrames 必须为非负整数。\n"
        "JSON schema："
        "{"
        '"version":"script_cut_v1",'
        '"title":"粗剪标题",'
        '"targetDurationSeconds":90,'
        '"summary":"整体编排说明",'
        '"scriptBeats":[{"id":"beat-1","title":"开场","purpose":"建立主题","storyText":"这一段要讲什么","targetDurationSeconds":12}],'
        '"tracks":{"main":[{"beatId":"beat-1","candidateId":"main:media-id:0","timelineStartFrame":0,"startOffsetFrames":0,"durationInFrames":300,"reason":"选择原因"}],'
        '"broll":[{"beatId":"beat-1","candidateId":"broll:media-id:0","timelineStartFrame":120,"startOffsetFrames":0,"durationInFrames":120,"reason":"补画面原因"}]},'
        '"excludedCandidates":[{"candidateId":"broll:media-id:1","reason":"排除原因"}],'
        '"warnings":[]'
        "}。"
    )


def generate_script_edit_draft(
    config: ModelRuntimeConfig,
    project_name: str,
    context: dict[str, Any],
    messages: list[dict[str, Any]],
    request: dict[str, Any],
) -> dict[str, Any]:
    chat_messages = [
        {"role": "system", "content": build_script_edit_system_prompt()},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "project_name": project_name,
                    "context": {
                        "prompt": context.get("compressedPrompt"),
                        "candidates": context.get("candidates", []),
                        "excludedMediaCount": context.get("excludedMediaCount", 0),
                    },
                    "conversation": messages,
                    "request": request,
                },
                ensure_ascii=False,
            ),
        },
    ]
    content = chat_completion(config, chat_messages, timeout=120)
    return _extract_json_object(content)
