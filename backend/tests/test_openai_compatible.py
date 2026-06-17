from pathlib import Path

from app.repositories.model_configs import ModelRuntimeConfig
from app.services.openai_compatible import build_script_edit_system_prompt, build_vision_prompt


def test_vision_prompt_includes_taxonomy_constraints():
    prompt = build_vision_prompt()

    assert "所有枚举字段必须只从下面字典值中选择" in prompt
    assert "shot_type: 远景, 全景, 中远景, 中景" in prompt
    assert "edit_role: 开场建立, 过渡, B-roll" in prompt
    assert '"subject_category"' in prompt
    assert '"search_keywords"' in prompt
    assert "emotion_tags 最多 3 个" in prompt
    assert "search_keywords 3-8 个中文关键词" in prompt


def test_script_edit_prompt_restricts_model_to_candidate_ids():
    prompt = build_script_edit_system_prompt()

    assert "只输出 JSON 对象" in prompt
    assert "只能使用用户提供的 candidateId" in prompt
    assert "不能发明素材" in prompt
    assert '"version":"script_cut_v1"' in prompt
    assert '"tracks":{"main"' in prompt
    assert "原声音频不需要输出" in prompt


def test_describe_video_clip_sends_data_video_payload(monkeypatch, tmp_path: Path):
    from app.services import openai_compatible

    video_path = tmp_path / "scene.mp4"
    video_path.write_bytes(b"fake mp4")
    config = ModelRuntimeConfig(
        capability="vl",
        base_url="http://127.0.0.1:8000/v1",
        model="local-vl",
        api_key="",
        enabled=True,
    )
    captured = {}

    def fake_chat_completion(runtime_config, messages, timeout=60):
        captured["config"] = runtime_config
        captured["messages"] = messages
        captured["timeout"] = timeout
        return '{"camera":{"movement":"移镜头"}}'

    monkeypatch.setattr(openai_compatible, "chat_completion", fake_chat_completion)

    result = openai_compatible.describe_video_clip(config, video_path, "请判断运镜")

    assert result == {"camera": {"movement": "移镜头"}}
    assert captured["config"] == config
    assert captured["timeout"] == 180
    content = captured["messages"][0]["content"]
    assert content[0] == {"type": "text", "text": "请判断运镜"}
    assert content[1]["type"] == "video_url"
    assert content[1]["video_url"]["url"].startswith("data:video/mp4;base64,")
