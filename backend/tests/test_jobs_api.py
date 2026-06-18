import json
from pathlib import Path
import xml.etree.ElementTree as ET

from fastapi.testclient import TestClient

from app.main import create_app


def _client_with_temp_state(monkeypatch, tmp_path: Path) -> TestClient:
    import app.main as main
    from app.core import config
    from app.repositories import app_state

    db_path = tmp_path / "app.db"
    monkeypatch.setattr(config, "APP_DB_PATH", db_path)
    monkeypatch.setattr(app_state, "APP_DB_PATH", db_path)
    monkeypatch.setattr(main, "ensure_storage_dirs", lambda: None)
    return TestClient(create_app())


def test_create_analysis_job_returns_queued_job(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()

    response = client.post(
        "/api/analysis/jobs",
        json={"projectFolder": str(project_folder), "mediaIds": ["media-1"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["job"]["type"] == "analysis"
    assert body["job"]["status"] == "queued"
    assert body["job"]["progress"] == 0
    assert body["job"]["projectFolder"] == str(project_folder.resolve())
    assert body["job"]["payload"]["mediaIds"] == ["media-1"]


def test_get_job_returns_created_job(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()
    create_response = client.post(
        "/api/analysis/jobs",
        json={"projectFolder": str(project_folder), "mediaIds": []},
    )

    response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")

    assert response.status_code == 200
    assert response.json()["job"]["id"] == create_response.json()["job"]["id"]


def test_missing_job_returns_404(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)

    response = client.get("/api/jobs/missing")

    assert response.status_code == 404


def test_create_tts_job_returns_queued_job(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()

    response = client.post(
        "/api/voice/tts/jobs",
        json={
            "projectFolder": str(project_folder),
            "text": "旁白文本",
            "voice": "alloy",
            "format": "mp3",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["job"]["type"] == "tts"
    assert body["job"]["payload"]["text"] == "旁白文本"
    assert body["job"]["payload"]["voice"] == "alloy"


def test_create_export_job_returns_queued_job(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()

    response = client.post(
        "/api/export/jobs",
        json={"projectFolder": str(project_folder), "format": "mp4"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["job"]["type"] == "export"
    assert body["job"]["payload"]["format"] == "mp4"


def test_create_subtitle_job_returns_queued_job(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import whisper_service

    monkeypatch.setattr(whisper_service, "ensure_ready", lambda: {"id": "model"})
    project_folder = tmp_path / "project"
    project_folder.mkdir()

    response = client.post(
        "/api/subtitles/jobs",
        json={
            "projectFolder": str(project_folder),
            "mediaIds": ["media-1"],
            "language": "zh",
            "maxWordsPerSegment": 12,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["job"]["type"] == "subtitles"
    assert body["job"]["payload"]["mediaIds"] == ["media-1"]
    assert body["job"]["payload"]["language"] == "zh"
    assert body["job"]["payload"]["maxWordsPerSegment"] == 12


def test_subtitle_text_split_handles_cjk_without_spaces():
    from app.services.job_worker import _split_subtitle_text

    assert _split_subtitle_text("这是一个需要被拆分的长字幕", 4) == [
        "这是一个",
        "需要被拆",
        "分的长字",
        "幕",
    ]


def test_worker_processes_tts_job_and_updates_manifest(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    project_folder.mkdir()
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "TTS Demo"})
    create_response = client.post(
        "/api/voice/tts/jobs",
        json={
            "projectFolder": str(project_folder),
            "text": "生成一段旁白",
            "voice": "alloy",
            "format": "wav",
            "voiceName": "Alloy",
            "emotion": "warm",
            "speed": 1.1,
            "leadSilenceMs": 120,
            "tailSilenceMs": 180,
            "insertionTrackId": "track-audio-voice",
        },
    )

    processed = process_next_job()
    response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")
    project_response = client.post("/api/projects/open", json={"folderPath": str(project_folder)})
    project = project_response.json()["project"]

    assert processed is not None
    assert response.json()["job"]["status"] == "completed"
    assert response.json()["job"]["result"]["mediaItem"]["type"] == "generated-audio"
    assert response.json()["job"]["result"]["clipId"].startswith("clip-tts-")
    assert (project_folder / response.json()["job"]["result"]["outputPath"]).exists()
    assert project["ttsJobs"][0]["voiceName"] == "Alloy"
    assert project["ttsJobs"][0]["emotion"] == "warm"
    assert any(
        clip["mediaId"] == response.json()["job"]["result"]["mediaItem"]["id"]
        for track in project["timeline"]["audioTracks"]
        for clip in track["clips"]
    )


def test_worker_processes_analysis_job_with_configured_llm(
    monkeypatch, tmp_path: Path
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import job_worker
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    project_folder.mkdir()
    client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "Analysis Demo"},
    )
    source_video = tmp_path / "clip.mp4"
    source_video.write_bytes(b"fake mp4")
    client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source_video)],
            "mode": "referenced",
        },
    )
    client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "llm",
                    "baseUrl": "http://127.0.0.1:8000/v1",
                    "model": "local-llm",
                    "enabled": True,
                }
            ]
        },
    )

    def fake_generate_analysis_summary(config, project_name, media):
        return {
            "overall_summary": f"{project_name} / {config.model} / {len(media)}",
            "edit_suggestions": [
                {
                    "title": "保留主镜头",
                    "description": "画面可作为开场素材。",
                }
            ],
            "videos": [
                {
                    "video": item["name"],
                    "overall_summary": "本地模型完成基础分析。",
                    "visual_analysis": {"total_scenes": 1, "scenes": []},
                }
                for item in media
            ],
        }

    monkeypatch.setattr(
        job_worker,
        "generate_analysis_summary",
        fake_generate_analysis_summary,
    )
    create_response = client.post(
        "/api/analysis/jobs",
        json={"projectFolder": str(project_folder), "mediaIds": []},
    )

    process_next_job()
    response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")
    project_response = client.post("/api/projects/open", json={"folderPath": str(project_folder)})
    project = project_response.json()["project"]

    assert response.json()["job"]["status"] == "completed"
    assert response.json()["job"]["result"]["analysisPath"].startswith("analysis/")
    assert project["analysis"]["overallSummary"] == "Analysis Demo / local-llm / 1"
    assert project["analysis"]["editSuggestions"][0]["title"] == "保留主镜头"


def test_worker_analysis_compresses_subtitles_for_llm_prompt(
    monkeypatch, tmp_path: Path
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import job_worker
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    project_folder.mkdir()
    client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "Subtitle Analysis"},
    )
    source_video = tmp_path / "clip.mp4"
    source_video.write_bytes(b"fake mp4")
    client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source_video)],
            "mode": "referenced",
        },
    )
    project = client.post("/api/projects/open", json={"folderPath": str(project_folder)}).json()["project"]
    media_id = project["media"][0]["id"]
    long_text = " ".join(f"第{index}段字幕内容用于描述任务地点和动作" for index in range(80))
    project["subtitles"] = {
        "settings": {
            "model": "mlx-community/whisper-large-v3-turbo",
            "language": "zh",
            "maxWordsPerSegment": 24,
        },
        "segments": [
            {
                "id": f"subtitle-{index}",
                "mediaId": media_id,
                "startFrame": index * 30,
                "endFrame": index * 30 + 20,
                "text": text,
            }
            for index, text in enumerate(long_text.split())
        ],
    }
    client.put(
        "/api/projects/save",
        json={"folderPath": str(project_folder), "project": project},
    )
    client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "llm",
                    "baseUrl": "http://127.0.0.1:8000/v1",
                    "model": "local-llm",
                    "enabled": True,
                }
            ]
        },
    )

    captured_media = []

    def fake_generate_analysis_summary(_config, _project_name, media):
        captured_media.extend(media)
        return {
            "overall_summary": "完成字幕分析",
            "edit_suggestions": [],
            "videos": [],
        }

    monkeypatch.setattr(
        job_worker,
        "generate_analysis_summary",
        fake_generate_analysis_summary,
    )
    create_response = client.post(
        "/api/analysis/jobs",
        json={"projectFolder": str(project_folder), "mediaIds": []},
    )

    process_next_job()

    assert client.get(f"/api/jobs/{create_response.json()['job']['id']}").json()["job"]["status"] == "completed"
    subtitle_text = captured_media[0]["subtitleText"]
    assert subtitle_text.startswith("字幕摘要：")
    assert len(subtitle_text) <= 700
    assert len(subtitle_text) < len(long_text)


def test_worker_analysis_classifies_speech_segments_and_calls_video_vl(
    monkeypatch, tmp_path: Path
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import job_worker
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    source_video = tmp_path / "clip.mp4"
    project_folder.mkdir()
    source_video.write_bytes(b"fake video")
    client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "Segment VL Demo"},
    )
    imported = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source_video)],
            "mode": "referenced",
        },
    ).json()["mediaItems"]
    media_id = imported[0]["id"]
    project = client.post(
        "/api/projects/open",
        json={"folderPath": str(project_folder)},
    ).json()["project"]
    project["subtitles"] = {
        "settings": {
            "model": "mlx-community/whisper-large-v3-turbo",
            "language": "zh",
            "maxWordsPerSegment": 24,
        },
        "segments": [
            {
                "id": "subtitle-1",
                "mediaId": media_id,
                "startFrame": 0,
                "endFrame": 45,
                "text": "欢迎来到这家店，今天介绍招牌产品。",
            }
        ],
    }
    client.put(
        "/api/projects/save",
        json={"folderPath": str(project_folder), "project": project},
    )
    client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "vl",
                    "baseUrl": "http://127.0.0.1:8000/v1",
                    "model": "local-vl",
                    "enabled": True,
                }
            ]
        },
    )
    described_clips = []
    prompts = []

    def fake_extract_video_keyframes(video_path, output_dir):
        frame = output_dir / "frames" / "frame_000.jpg"
        frame.parent.mkdir(parents=True, exist_ok=True)
        frame.write_bytes(b"jpeg")
        return {
            "video": video_path.name,
            "video_path": str(video_path),
            "video_meta": {
                "duration_seconds": 4.0,
                "resolution": "1920x1080",
                "fps": 30.0,
            },
            "visual_analysis": {
                "model": "local-vl",
                "total_scenes": 2,
                "scenes": [
                    {
                        "index": 0,
                        "start": 0.0,
                        "end": 1.8,
                        "duration": 1.8,
                        "keyframe": str(frame),
                        "quality_metrics": {"grade": "可用", "issues": []},
                    },
                    {
                        "index": 1,
                        "start": 1.8,
                        "end": 4.0,
                        "duration": 2.2,
                        "keyframe": str(frame),
                        "quality_metrics": {"grade": "精选", "issues": []},
                    },
                ],
            },
        }

    def fake_extract_video_segment_clip(video_path, start_sec, end_sec, output_path):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"clip")
        return output_path

    def fake_describe_video_clip(config, clip_path, prompt):
        described_clips.append((config.model, clip_path.name))
        prompts.append(prompt)
        if "segment_type: aroll" in prompt:
            return {
                "segment_type": "aroll",
                "speech": {
                    "has_speech": True,
                    "summary": "主持人介绍招牌产品。",
                },
                "visual": {
                    "subject": "人物在店内讲解",
                    "action": "面对镜头说话",
                    "environment": "店铺室内",
                    "place_context": "线下零售店",
                },
                "camera": {
                    "movement": "固定镜头",
                    "movement_confidence": 0.88,
                    "evidence": "人物位置稳定，背景没有明显平移。",
                },
                "quality": {"grade": "可用", "issues": []},
                "edit_role": "主叙事",
            }
        return {
            "segment_type": "broll",
            "speech": {"has_speech": False, "summary": ""},
                "visual": {
                    "subject": "产品陈列",
                    "action": "镜头扫过货架",
                    "environment": "店铺室内",
                    "place_context": "商品陈列区",
                },
            "camera": {
                "movement": "移镜头",
                "movement_confidence": 0.81,
                "evidence": "画面主体从左向右经过货架。",
            },
            "quality": {"grade": "精选", "issues": []},
            "edit_role": "B-roll",
        }

    def fail_describe_frame(_config, _image_path):
        raise AssertionError("analysis should prefer video segment input over single-frame VL")

    monkeypatch.setattr(job_worker, "extract_video_keyframes", fake_extract_video_keyframes)
    monkeypatch.setattr(
        job_worker,
        "extract_video_segment_clip",
        fake_extract_video_segment_clip,
        raising=False,
    )
    monkeypatch.setattr(
        job_worker,
        "describe_video_clip",
        fake_describe_video_clip,
        raising=False,
    )
    monkeypatch.setattr(job_worker, "describe_frame", fail_describe_frame)
    create_response = client.post(
        "/api/analysis/jobs",
        json={"projectFolder": str(project_folder), "mediaIds": []},
    )

    process_next_job()
    response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")
    project_response = client.post("/api/projects/open", json={"folderPath": str(project_folder)})
    project = project_response.json()["project"]

    assert response.json()["job"]["status"] == "completed"
    assert described_clips == [
        ("local-vl", "scene_000.mp4"),
        ("local-vl", "scene_001.mp4"),
    ]
    assert "欢迎来到这家店" in prompts[0]
    assert "segment_type: broll" in prompts[1]
    video = project["analysis"]["legacySummary"]["videos"][0]
    assert video["overall_quality_grade"] == "精选"
    assert video["overall_composite_grade"] == "精选"
    assert isinstance(video["analysis_time_seconds"], float)
    assert video["analysis_time_seconds"] >= 0
    assert video["analysis_time_str"].endswith("秒")
    scenes = video["visual_analysis"]["scenes"]
    assert scenes[0]["segment_type"] == "aroll"
    assert scenes[0]["segment_analysis_source"] == "video_vl"
    assert scenes[0]["speech"]["has_speech"] is True
    assert scenes[0]["speech"]["transcript"] == "欢迎来到这家店，今天介绍招牌产品。"
    assert scenes[0]["segment_analysis"]["camera"]["movement"] == "固定镜头"
    assert scenes[0]["vl_analysis"]["subject"] == "人物在店内讲解"
    assert scenes[0]["vl_analysis"]["place_context"] == "线下零售店"
    assert scenes[0]["vl_analysis"]["camera_movement"] == "固定镜头"
    assert scenes[0]["vl_analysis"]["edit_role"] == "主叙事"
    assert scenes[1]["segment_type"] == "broll"
    assert scenes[1]["segment_analysis_source"] == "video_vl"
    assert scenes[1]["speech"]["has_speech"] is False
    assert scenes[1]["segment_analysis"]["camera"]["movement"] == "移镜头"
    assert scenes[1]["vl_analysis"]["subject"] == "产品陈列"
    assert scenes[1]["vl_analysis"]["camera_movement"] == "移镜头"
    assert scenes[1]["vl_analysis"]["edit_role"] == "B-roll"


def test_worker_analysis_generates_subtitles_before_video_vl_when_missing(
    monkeypatch, tmp_path: Path
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import job_worker, whisper_service
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    source_video = tmp_path / "clip.mp4"
    project_folder.mkdir()
    source_video.write_bytes(b"fake video")
    client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "Transcript First Demo"},
    )
    imported = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source_video)],
            "mode": "referenced",
        },
    ).json()["mediaItems"]
    media_id = imported[0]["id"]
    client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "vl",
                    "baseUrl": "http://127.0.0.1:8000/v1",
                    "model": "local-vl",
                    "enabled": True,
                }
            ]
        },
    )
    events = []
    prompts = []

    def fake_extract_audio_for_subtitles(_source_path, output_path):
        events.append("extract_audio")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"fake wav")
        return output_path

    def fake_transcribe_audio(audio_path, **_kwargs):
        events.append(f"transcribe:{Path(audio_path).name}")
        return [
            {"start": 0.0, "end": 1.4, "text": "第一句介绍门店招牌。"},
            {"start": 1.4, "end": 3.0, "text": "第二句说明适合家庭聚会。"},
        ]

    def fake_extract_video_keyframes(video_path, output_dir):
        frame = output_dir / "frames" / "frame_000.jpg"
        frame.parent.mkdir(parents=True, exist_ok=True)
        frame.write_bytes(b"jpeg")
        return {
            "video": video_path.name,
            "video_path": str(video_path),
            "output_dir": str(output_dir),
            "video_meta": {
                "duration_seconds": 3.0,
                "resolution": "1920x1080",
                "fps": 30.0,
            },
            "visual_analysis": {
                "model": "local-vl",
                "total_scenes": 1,
                "scenes": [
                    {
                        "index": 0,
                        "start": 0.0,
                        "end": 3.0,
                        "duration": 3.0,
                        "keyframe": str(frame),
                        "quality_metrics": {"grade": "可用", "issues": []},
                    }
                ],
            },
        }

    def fake_extract_video_segment_clip(_video_path, _start_sec, _end_sec, output_path):
        events.append("segment_clip")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"clip")
        return output_path

    def fake_describe_video_clip(_config, _clip_path, prompt):
        events.append("describe_clip")
        prompts.append(prompt)
        return {
            "segment_type": "aroll",
            "speech": {"has_speech": True, "summary": "介绍门店招牌和聚会场景。"},
            "visual": {"subject": "讲解者", "environment": "店内"},
            "camera": {"movement": "固定镜头", "movement_confidence": 0.8, "evidence": "画面稳定"},
            "quality": {"grade": "可用", "issues": []},
            "edit_role": "主叙事",
        }

    def fail_describe_frame(_config, _image_path):
        raise AssertionError("analysis should use video segment prompt after transcription")

    monkeypatch.setattr(whisper_service, "ensure_ready", lambda: {"id": "model"})
    monkeypatch.setattr(whisper_service, "transcribe_audio", fake_transcribe_audio)
    monkeypatch.setattr(job_worker, "_extract_audio_for_subtitles", fake_extract_audio_for_subtitles)
    monkeypatch.setattr(job_worker, "extract_video_keyframes", fake_extract_video_keyframes)
    monkeypatch.setattr(job_worker, "extract_video_segment_clip", fake_extract_video_segment_clip)
    monkeypatch.setattr(job_worker, "describe_video_clip", fake_describe_video_clip)
    monkeypatch.setattr(job_worker, "describe_frame", fail_describe_frame)
    create_response = client.post(
        "/api/analysis/jobs",
        json={"projectFolder": str(project_folder), "mediaIds": []},
    )

    process_next_job()
    response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")
    project = client.post(
        "/api/projects/open",
        json={"folderPath": str(project_folder)},
    ).json()["project"]

    assert response.json()["job"]["status"] == "completed"
    assert events == ["extract_audio", "transcribe:source.wav", "segment_clip", "describe_clip"]
    assert project["subtitles"]["segments"][0]["mediaId"] == media_id
    assert [segment["text"] for segment in project["subtitles"]["segments"]] == [
        "第一句介绍门店招牌。",
        "第二句说明适合家庭聚会。",
    ]
    assert "第一句介绍门店招牌" in prompts[0]
    scene = project["analysis"]["legacySummary"]["videos"][0]["visual_analysis"]["scenes"][0]
    assert scene["segment_type"] == "aroll"
    assert scene["speech"]["transcript"] == "第一句介绍门店招牌。 第二句说明适合家庭聚会。"


def test_worker_analysis_reuses_existing_subtitle_file_without_transcribing(
    monkeypatch, tmp_path: Path
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import job_worker, whisper_service
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    source_video = tmp_path / "clip.mp4"
    project_folder.mkdir()
    source_video.write_bytes(b"fake video")
    client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "Existing Subtitle File Demo"},
    )
    imported = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source_video)],
            "mode": "referenced",
        },
    ).json()["mediaItems"]
    media_id = imported[0]["id"]
    subtitle_file = project_folder / "subtitles" / "existing-subtitles.json"
    subtitle_file.parent.mkdir(parents=True, exist_ok=True)
    subtitle_file.write_text(
        json.dumps(
            {
                "segments": [
                    {
                        "id": "subtitle-existing-1",
                        "mediaId": media_id,
                        "startFrame": 0,
                        "endFrame": 75,
                        "text": "这是已经识别好的字幕。",
                        "speaker": "",
                    }
                ],
                "errors": [],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "vl",
                    "baseUrl": "http://127.0.0.1:8000/v1",
                    "model": "local-vl",
                    "enabled": True,
                }
            ]
        },
    )
    prompts = []

    def fail_transcribe_audio(*_args, **_kwargs):
        raise AssertionError("analysis should reuse existing subtitle files")

    def fake_extract_video_keyframes(video_path, output_dir):
        frame = output_dir / "frames" / "frame_000.jpg"
        frame.parent.mkdir(parents=True, exist_ok=True)
        frame.write_bytes(b"jpeg")
        return {
            "video": video_path.name,
            "video_path": str(video_path),
            "output_dir": str(output_dir),
            "video_meta": {
                "duration_seconds": 3.0,
                "resolution": "1920x1080",
                "fps": 25.0,
            },
            "visual_analysis": {
                "model": "local-vl",
                "total_scenes": 1,
                "scenes": [
                    {
                        "index": 0,
                        "start": 0.0,
                        "end": 3.0,
                        "duration": 3.0,
                        "keyframe": str(frame),
                        "quality_metrics": {"grade": "可用", "issues": []},
                    }
                ],
            },
        }

    def fake_extract_video_segment_clip(_video_path, _start_sec, _end_sec, output_path):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"clip")
        return output_path

    def fake_describe_video_clip(_config, _clip_path, prompt):
        prompts.append(prompt)
        return {
            "segment_type": "aroll",
            "speech": {"has_speech": True, "summary": "复用已有字幕。"},
            "visual": {"subject": "讲解者"},
            "camera": {"movement": "固定镜头", "movement_confidence": 0.8, "evidence": "画面稳定"},
            "quality": {"grade": "可用", "issues": []},
            "edit_role": "主叙事",
        }

    def fail_describe_frame(_config, _image_path):
        raise AssertionError("analysis should use video segment prompt with subtitle file text")

    monkeypatch.setattr(whisper_service, "ensure_ready", lambda: {"id": "model"})
    monkeypatch.setattr(whisper_service, "transcribe_audio", fail_transcribe_audio)
    monkeypatch.setattr(job_worker, "extract_video_keyframes", fake_extract_video_keyframes)
    monkeypatch.setattr(job_worker, "extract_video_segment_clip", fake_extract_video_segment_clip)
    monkeypatch.setattr(job_worker, "describe_video_clip", fake_describe_video_clip)
    monkeypatch.setattr(job_worker, "describe_frame", fail_describe_frame)
    create_response = client.post(
        "/api/analysis/jobs",
        json={"projectFolder": str(project_folder), "mediaIds": []},
    )

    process_next_job()
    response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")
    project = client.post(
        "/api/projects/open",
        json={"folderPath": str(project_folder)},
    ).json()["project"]

    assert response.json()["job"]["status"] == "completed"
    assert "这是已经识别好的字幕" in prompts[0]
    assert project["subtitles"]["segments"][0]["text"] == "这是已经识别好的字幕。"
    scene = project["analysis"]["legacySummary"]["videos"][0]["visual_analysis"]["scenes"][0]
    assert scene["speech"]["transcript"] == "这是已经识别好的字幕。"


def test_worker_analysis_marks_frame_fallback_when_video_vl_json_fails(
    monkeypatch, tmp_path: Path
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import job_worker
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    source_video = tmp_path / "clip.mp4"
    project_folder.mkdir()
    source_video.write_bytes(b"fake video")
    client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "Fallback Demo"},
    )
    client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source_video)],
            "mode": "referenced",
        },
    )
    client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "vl",
                    "baseUrl": "http://127.0.0.1:8000/v1",
                    "model": "local-vl",
                    "enabled": True,
                }
            ]
        },
    )

    def fake_extract_video_keyframes(video_path, output_dir):
        frames_dir = output_dir / "frames"
        initial_labels = ["sample_01", "sample_03", "sample_05", "sample_07", "sample_09"]
        frame_paths = [frames_dir / f"frame_000_{label}.jpg" for label in initial_labels]
        for frame in frame_paths:
            frame.parent.mkdir(parents=True, exist_ok=True)
            frame.write_bytes(b"jpeg")
        return {
            "video": video_path.name,
            "video_path": str(video_path),
            "video_meta": {"duration_seconds": 2.0, "fps": 30.0},
            "visual_analysis": {
                "model": "local-vl",
                "total_scenes": 1,
                "scenes": [
                    {
                        "index": 0,
                        "start": 0.0,
                        "end": 2.0,
                        "duration": 2.0,
                        "keyframe": str(frame_paths[2]),
                        "movement_probe": {
                            "method": "adaptive_temporal_samples",
                            "samples": [
                                {
                                    "label": f"sample_{index:02d}",
                                    "time": round(0.2 + index * 0.3, 2),
                                    "frame": str(frame),
                                }
                                for index, frame in enumerate(frame_paths, start=1)
                            ],
                        },
                        "quality_metrics": {"grade": "可用", "issues": []},
                    }
                ],
            },
        }

    def fake_extract_video_segment_clip(video_path, start_sec, end_sec, output_path):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"clip")
        return output_path

    def fail_describe_video_clip(_config, _clip_path, _prompt):
        raise RuntimeError("Model response was not valid JSON")

    described_sequences = []

    def fake_describe_frame(_config, _image_path):
        raise AssertionError("frame fallback should analyze the ordered frame sequence once")

    def fake_describe_frame_sequence(config, frames, prompt):
        described_sequences.append((config.model, frames, prompt))
        return {
            "visual": {
                "shot_type": "近景",
                "subject": "桌上的咖啡杯",
            },
            "camera": {
                "movement": "推镜头",
                "movement_confidence": 0.82,
                "evidence": "咖啡杯在按时间排序的采样帧中逐渐变大，背景边缘向外扩张。",
            },
            "edit_role": "B-roll",
        }

    monkeypatch.setattr(job_worker, "extract_video_keyframes", fake_extract_video_keyframes)
    monkeypatch.setattr(
        job_worker,
        "extract_video_segment_clip",
        fake_extract_video_segment_clip,
        raising=False,
    )
    monkeypatch.setattr(
        job_worker,
        "describe_video_clip",
        fail_describe_video_clip,
        raising=False,
    )
    monkeypatch.setattr(job_worker, "describe_frame", fake_describe_frame)
    monkeypatch.setattr(job_worker, "describe_frame_sequence", fake_describe_frame_sequence)
    create_response = client.post(
        "/api/analysis/jobs",
        json={"projectFolder": str(project_folder), "mediaIds": []},
    )

    process_next_job()
    response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")
    project_response = client.post("/api/projects/open", json={"folderPath": str(project_folder)})
    project = project_response.json()["project"]

    assert response.json()["job"]["status"] == "completed"
    assert len(described_sequences) == 1
    _model, sequence_frames, sequence_prompt = described_sequences[0]
    assert [frame["label"] for frame in sequence_frames] == [
        "sample_01",
        "sample_02",
        "sample_03",
        "sample_04",
        "sample_05",
    ]
    assert [frame["time"] for frame in sequence_frames] == sorted(frame["time"] for frame in sequence_frames)
    assert "ordered_frames" in sequence_prompt
    assert "按时间顺序" in sequence_prompt
    scene = project["analysis"]["legacySummary"]["videos"][0]["visual_analysis"]["scenes"][0]
    assert scene["segment_analysis_source"] == "frame_fallback"
    assert scene["segment_analysis_error"] == "Model response was not valid JSON"
    assert scene["vl_analysis"]["subject"] == "桌上的咖啡杯"
    assert scene["segment_analysis"]["camera"]["movement"] == "推镜头"
    assert [
        sample["camera_movement"]
        for sample in scene["movement_probe"]["samples"]
    ] == ["推镜头", "推镜头", "推镜头", "推镜头", "推镜头"]


def test_worker_analysis_expands_temporal_samples_only_when_sequence_is_uncertain(
    monkeypatch, tmp_path: Path
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import job_worker
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    source_video = tmp_path / "clip.mp4"
    project_folder.mkdir()
    source_video.write_bytes(b"fake video")
    client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "Staged Fallback Demo"},
    )
    client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source_video)],
            "mode": "referenced",
        },
    )
    client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "vl",
                    "baseUrl": "http://127.0.0.1:8000/v1",
                    "model": "local-vl",
                    "enabled": True,
                }
            ]
        },
    )

    def fake_extract_video_keyframes(video_path, output_dir):
        frames_dir = output_dir / "frames"
        initial_labels = ["sample_01", "sample_03", "sample_05", "sample_07", "sample_09"]
        frame_paths = [frames_dir / f"frame_000_{label}.jpg" for label in initial_labels]
        for frame in frame_paths:
            frame.parent.mkdir(parents=True, exist_ok=True)
            frame.write_bytes(b"jpeg")
        return {
            "video": video_path.name,
            "video_path": str(video_path),
            "output_dir": str(output_dir),
            "video_meta": {"duration_seconds": 15.0, "fps": 30.0},
            "visual_analysis": {
                "model": "local-vl",
                "total_scenes": 1,
                "scenes": [
                    {
                        "index": 0,
                        "start": 0.0,
                        "end": 15.0,
                        "duration": 15.0,
                        "keyframe": str(frame_paths[2]),
                        "movement_probe": {
                            "method": "adaptive_temporal_samples",
                            "samples": [
                                {
                                    "label": label,
                                    "time": time_sec,
                                    "frame": str(frame),
                                }
                                for label, time_sec, frame in zip(
                                    initial_labels,
                                    [0.1, 3.8, 7.5, 11.2, 14.9],
                                    frame_paths,
                                )
                            ],
                        },
                        "quality_metrics": {"grade": "可用", "issues": []},
                    }
                ],
            },
        }

    def fake_extract_video_segment_clip(_video_path, _start_sec, _end_sec, output_path):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"clip")
        return output_path

    def fail_describe_video_clip(_config, _clip_path, _prompt):
        raise RuntimeError("Model response was not valid JSON")

    def fail_describe_frame(_config, _image_path):
        raise AssertionError("staged fallback should not return to per-frame VL")

    def fake_expanded_scene_probe_times(_scene, _video_duration):
        return [
            {"label": f"sample_{index:02d}", "time": time_sec}
            for index, time_sec in enumerate(
                [0.1, 1.95, 3.8, 5.65, 7.5, 9.35, 11.2, 13.05, 14.9],
                start=1,
            )
        ]

    extracted_extra_frames = []

    def fake_extract_keyframe(_video_path, time_sec, output_path, size=(720, 404), color_transform=None):
        extracted_extra_frames.append((round(time_sec, 2), output_path.name))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"jpeg")

    described_sequences = []

    def fake_describe_frame_sequence(_config, frames, prompt):
        described_sequences.append(([frame["label"] for frame in frames], prompt))
        if len(described_sequences) == 1:
            return {
                "visual": {"shot_type": "中景", "subject": "街道"},
                "camera": {
                    "movement": "不确定",
                    "movement_confidence": 0.2,
                    "evidence": "初始采样不足以判断。",
                },
                "edit_role": "B-roll",
            }
        return {
            "visual": {"shot_type": "中景", "subject": "街道"},
            "camera": {
                "movement": "移镜头",
                "movement_confidence": 0.78,
                "evidence": "扩展采样中背景连续横向位移。",
            },
            "edit_role": "B-roll",
        }

    monkeypatch.setattr(job_worker, "extract_video_keyframes", fake_extract_video_keyframes)
    monkeypatch.setattr(job_worker, "extract_video_segment_clip", fake_extract_video_segment_clip)
    monkeypatch.setattr(job_worker, "describe_video_clip", fail_describe_video_clip)
    monkeypatch.setattr(job_worker, "describe_frame", fail_describe_frame)
    monkeypatch.setattr(job_worker, "expanded_scene_probe_times", fake_expanded_scene_probe_times)
    monkeypatch.setattr(job_worker, "extract_keyframe", fake_extract_keyframe)
    monkeypatch.setattr(job_worker, "describe_frame_sequence", fake_describe_frame_sequence)
    create_response = client.post(
        "/api/analysis/jobs",
        json={"projectFolder": str(project_folder), "mediaIds": []},
    )

    process_next_job()
    response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")
    project = client.post(
        "/api/projects/open",
        json={"folderPath": str(project_folder)},
    ).json()["project"]

    assert response.json()["job"]["status"] == "completed"
    assert len(described_sequences) == 2
    assert described_sequences[0][0] == [
        "sample_01",
        "sample_03",
        "sample_05",
        "sample_07",
        "sample_09",
    ]
    assert described_sequences[1][0] == [
        "sample_01",
        "sample_02",
        "sample_03",
        "sample_04",
        "sample_05",
        "sample_06",
        "sample_07",
        "sample_08",
        "sample_09",
    ]
    assert [name for _time, name in extracted_extra_frames] == [
        "frame_000_sample_02.jpg",
        "frame_000_sample_04.jpg",
        "frame_000_sample_06.jpg",
        "frame_000_sample_08.jpg",
    ]
    scene = project["analysis"]["legacySummary"]["videos"][0]["visual_analysis"]["scenes"][0]
    assert scene["segment_analysis"]["camera"]["movement"] == "移镜头"
    assert len(scene["movement_probe"]["samples"]) == 9


def test_worker_analysis_extracts_keyframes_and_calls_vl(
    monkeypatch, tmp_path: Path
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import job_worker
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    source_video = tmp_path / "clip.mp4"
    project_folder.mkdir()
    source_video.write_bytes(b"fake video")
    client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "VL Demo"},
    )
    client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source_video)],
            "mode": "referenced",
        },
    )
    client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "vl",
                    "baseUrl": "http://127.0.0.1:8000/v1",
                    "model": "local-vl",
                    "enabled": True,
                }
            ]
        },
    )
    described = []

    def fake_extract_video_keyframes(video_path, output_dir):
        frame = output_dir / "frames" / "frame_000.jpg"
        first_frame = output_dir / "frames" / "frame_000_first.jpg"
        last_frame = output_dir / "frames" / "frame_000_last.jpg"
        frame.parent.mkdir(parents=True, exist_ok=True)
        for item in (first_frame, frame, last_frame):
            item.write_bytes(b"jpeg")
        return {
            "video": video_path.name,
            "video_path": str(video_path),
            "output_dir": str(output_dir),
            "video_meta": {
                "duration_seconds": 2.0,
                "resolution": "1920x1080",
                "fps": 24.0,
            },
            "visual_analysis": {
                "model": "local-vl",
                "total_scenes": 1,
                "scenes": [
                    {
                        "index": 0,
                        "start": 0.0,
                        "end": 2.0,
                        "duration": 2.0,
                        "keyframe": str(frame),
                        "keyframe_time": 1.0,
                        "movement_probe": {
                            "method": "first_middle_last",
                            "samples": [
                                {"label": "first", "time": 0.1, "frame": str(first_frame)},
                                {"label": "middle", "time": 1.0, "frame": str(frame)},
                                {"label": "last", "time": 1.9, "frame": str(last_frame)},
                            ],
                        },
                    }
                ],
            },
        }

    def fake_describe_frame(_config, _image_path):
        raise AssertionError("analysis should use ordered frame sequence fallback")

    def fake_describe_frame_sequence(config, frames, prompt):
        described.append((config.model, [Path(str(frame["frame"])).name for frame in frames], prompt))
        return {
            "visual": {
                "visual_description": "画面中一位讲解者站在温暖的室内空间，身后有产品陈列和柔和灯光，整体适合作为介绍段落。",
                "shot_type": "中景",
                "subject": "人物站在室内",
                "subject_category": "人物",
                "subject_keywords": ["讲解者", "产品陈列"],
                "action_type": "无明显动作",
                "environment_type": "室内空间",
                "scene_keywords": ["温暖室内", "陈列空间"],
                "lighting_type": "柔和光",
                "color_tone_type": "暖色调",
                "emotion_tags": ["宁静", "温暖"],
                "search_keywords": ["人物", "室内", "开场", "讲解者", "产品陈列", "温暖室内"],
            },
            "camera": {
                "movement": "固定镜头",
                "movement_confidence": 0.86,
                "evidence": "按时间排序的采样帧中人物和背景位置稳定。",
            },
            "edit_role": "开场建立",
            "edit_suggestion": "适合作为开场",
        }

    monkeypatch.setattr(job_worker, "extract_video_keyframes", fake_extract_video_keyframes)
    monkeypatch.setattr(job_worker, "describe_frame", fake_describe_frame)
    monkeypatch.setattr(job_worker, "describe_frame_sequence", fake_describe_frame_sequence)
    create_response = client.post(
        "/api/analysis/jobs",
        json={"projectFolder": str(project_folder), "mediaIds": []},
    )

    process_next_job()
    response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")
    project_response = client.post("/api/projects/open", json={"folderPath": str(project_folder)})
    project = project_response.json()["project"]

    assert response.json()["job"]["status"] == "completed"
    assert described == [
        (
            "local-vl",
            ["frame_000_first.jpg", "frame_000.jpg", "frame_000_last.jpg"],
            described[0][2],
        ),
    ]
    assert "ordered_frames" in described[0][2]
    assert project["analysis"]["legacySummary"]["taxonomy_version"] == "v1"
    scene = project["analysis"]["legacySummary"]["videos"][0]["visual_analysis"]["scenes"][0]
    assert scene["vl_analysis"]["subject"] == "人物站在室内"
    assert [
        (sample["label"], sample["camera_movement"])
        for sample in scene["movement_probe"]["samples"]
    ] == [
        ("first", "固定镜头"),
        ("middle", "固定镜头"),
        ("last", "固定镜头"),
    ]
    assert scene["vl_analysis"]["subject_category"] == "人物"
    assert scene["vl_analysis"]["visual_description"].startswith("画面中一位讲解者")
    assert scene["vl_analysis"]["subject_keywords"] == ["讲解者", "产品陈列"]
    assert scene["vl_analysis"]["scene_keywords"] == ["温暖室内", "陈列空间"]
    assert scene["vl_analysis"]["emotion_tags"] == ["宁静", "温暖"]
    assert scene["vl_analysis"]["search_keywords"] == ["人物", "室内", "开场", "讲解者", "产品陈列", "温暖室内"]
    assert project["analysis"]["keywordDictionary"] == [
        "讲解者",
        "产品陈列",
        "温暖室内",
        "陈列空间",
        "人物",
        "室内",
        "开场",
    ]
    assert project["analysis"]["sceneCount"] == 1


def test_worker_analysis_merges_results_from_multiple_jobs(
    monkeypatch, tmp_path: Path
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import job_worker
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    project_folder.mkdir()
    sources = [tmp_path / "clip-a.mp4", tmp_path / "clip-b.mp4"]
    for source in sources:
        source.write_bytes(b"fake video")
    client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "Merged VL Demo"},
    )
    imported = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source) for source in sources],
            "mode": "referenced",
        },
    ).json()["mediaItems"]
    client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "vl",
                    "baseUrl": "http://127.0.0.1:8000/v1",
                    "model": "local-vl",
                    "enabled": True,
                }
            ]
        },
    )

    def fake_extract_video_keyframes(video_path, output_dir):
        frame = output_dir / f"{video_path.stem}.jpg"
        frame.parent.mkdir(parents=True, exist_ok=True)
        frame.write_bytes(b"jpeg")
        return {
            "video": video_path.name,
            "video_path": str(video_path),
            "visual_analysis": {
                "model": "local-vl",
                "total_scenes": 1,
                "scenes": [{"index": 0, "keyframe": str(frame)}],
            },
        }

    def fake_describe_frame(config, image_path):
        return {
            "shot_type": "中景",
            "camera_movement": "固定镜头",
            "subject": image_path.stem,
            "environment_type": "城市街道",
            "lighting_type": "自然光",
            "edit_role": "B-roll",
        }

    monkeypatch.setattr(job_worker, "extract_video_keyframes", fake_extract_video_keyframes)
    monkeypatch.setattr(job_worker, "describe_frame", fake_describe_frame)

    for item in imported:
        client.post(
            "/api/analysis/jobs",
            json={"projectFolder": str(project_folder), "mediaIds": [item["id"]]},
        )
        process_next_job()

    project_response = client.post("/api/projects/open", json={"folderPath": str(project_folder)})
    project = project_response.json()["project"]
    videos = project["analysis"]["legacySummary"]["videos"]

    assert project["analysis"]["legacySummary"]["total_videos"] == 2
    assert project["analysis"]["sceneCount"] == 2
    assert [video["video"] for video in videos] == ["clip-a.mp4", "clip-b.mp4"]
    assert [
        video["visual_analysis"]["scenes"][0]["vl_analysis"]["subject"]
        for video in videos
    ] == ["clip-a", "clip-b"]


def test_worker_analysis_reports_per_media_stage_progress_one_by_one(
    monkeypatch, tmp_path: Path
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.repositories.jobs import get_job
    from app.services import job_worker
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    project_folder.mkdir()
    sources = [tmp_path / "clip-a.mp4", tmp_path / "clip-b.mp4"]
    for source in sources:
        source.write_bytes(b"fake video")
    client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "Progress Demo"},
    )
    imported = client.post(
        "/api/media/import",
        json={
            "folderPath": str(project_folder),
            "filePaths": [str(source) for source in sources],
            "mode": "referenced",
        },
    ).json()["mediaItems"]
    client.put(
        "/api/settings/models",
        json={
            "configs": [
                {
                    "capability": "vl",
                    "baseUrl": "http://127.0.0.1:8000/v1",
                    "model": "local-vl",
                    "enabled": True,
                }
            ]
        },
    )
    create_response = client.post(
        "/api/analysis/jobs",
        json={
            "projectFolder": str(project_folder),
            "mediaIds": [item["id"] for item in imported],
        },
    )
    job_id = create_response.json()["job"]["id"]
    snapshots = []

    def snapshot(label: str):
        job = get_job(job_id)
        assert job is not None
        result = job.result
        snapshots.append(
            (
                label,
                job.progress,
                result.get("stage"),
                result.get("currentMediaId"),
                [
                    (item["mediaId"], item["status"], item["stage"], item["progress"])
                    for item in result.get("items", [])
                ],
                result.get("completedMediaIds", []),
            )
        )

    def fake_extract_video_keyframes(video_path, output_dir):
        snapshot(f"extract-{video_path.name}")
        frame = output_dir / f"{video_path.stem}.jpg"
        frame.parent.mkdir(parents=True, exist_ok=True)
        frame.write_bytes(b"jpeg")
        return {
            "video": video_path.name,
            "video_path": str(video_path),
            "visual_analysis": {
                "model": "local-vl",
                "total_scenes": 1,
                "scenes": [{"index": 0, "keyframe": str(frame)}],
            },
        }

    def fake_describe_frame(config, image_path):
        snapshot(f"vision-{image_path.name}")
        return {
            "shot_type": "中景",
            "camera_movement": "固定镜头",
            "subject": image_path.stem,
        }

    monkeypatch.setattr(job_worker, "extract_video_keyframes", fake_extract_video_keyframes)
    monkeypatch.setattr(job_worker, "describe_frame", fake_describe_frame)

    process_next_job()
    completed = get_job(job_id)
    assert completed is not None

    first_id = imported[0]["id"]
    second_id = imported[1]["id"]
    assert snapshots[0][2] == "extracting"
    assert snapshots[0][3] == first_id
    assert snapshots[0][4] == [
        (first_id, "running", "extracting", 15),
        (second_id, "queued", "queued", 0),
    ]
    assert any(
        label == "extract-clip-b.mp4"
        and completed_ids == [first_id]
        and item_states == [
            (first_id, "completed", "completed", 100),
            (second_id, "running", "extracting", 15),
        ]
        for label, _progress, _stage, _current, item_states, completed_ids in snapshots
    )
    assert completed.status == "completed"
    assert completed.progress == 100
    assert completed.result["completedMediaIds"] == [first_id, second_id]
    assert [
        (item["mediaId"], item["status"], item["stage"], item["progress"])
        for item in completed.result["items"]
    ] == [
        (first_id, "completed", "completed", 100),
        (second_id, "completed", "completed", 100),
    ]


def test_worker_processes_export_job_and_writes_result(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    project_folder.mkdir()
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Export Demo"})
    create_response = client.post(
        "/api/export/jobs",
        json={"projectFolder": str(project_folder), "format": "mp4"},
    )

    process_next_job()
    response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")

    assert response.json()["job"]["status"] == "completed"
    assert response.json()["job"]["result"]["outputPath"].startswith("exports/")
    assert (project_folder / response.json()["job"]["result"]["outputPath"]).exists()


def test_worker_processes_fcpxml_export_job_with_timeline_clips(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    project_folder.mkdir()
    source_video = tmp_path / "clip-a.mp4"
    source_video.write_bytes(b"fake video")
    init_response = client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "FCP Demo"},
    )
    project = init_response.json()["project"]
    project["media"] = [
        {
            "id": "media-video-1",
            "name": "clip-a.mp4",
            "type": "video",
            "importMode": "referenced",
            "originalPath": str(source_video),
            "durationInFrames": 180,
            "sourceLabel": "clip-a.mp4",
        }
    ]
    project["timeline"] = {
        "fps": 30,
        "width": 1920,
        "height": 1080,
        "durationInFrames": 120,
        "videoTracks": [
            {
                "id": "track-video-1",
                "name": "视频 1",
                "type": "video",
                "clips": [
                    {
                        "id": "clip-1",
                        "mediaId": "media-video-1",
                        "title": "开场片段",
                        "startFrame": 30,
                        "durationInFrames": 60,
                        "sourceIn": 15,
                        "color": "",
                        "sourceType": "imported-video",
                    }
                ],
            }
        ],
        "audioTracks": [],
    }
    client.put(
        "/api/projects/save",
        json={"folderPath": str(project_folder), "project": project},
    )
    create_response = client.post(
        "/api/export/jobs",
        json={"projectFolder": str(project_folder), "format": "fcpxml"},
    )

    process_next_job()
    response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")
    job = response.json()["job"]
    output_path = project_folder / job["result"]["outputPath"]
    xml = output_path.read_text(encoding="utf-8")
    root = ET.fromstring(xml)
    asset = root.find("./resources/asset")
    assert asset is not None
    media_rep = asset.find("media-rep")

    assert job["status"] == "completed"
    assert job["result"]["format"] == "fcpxml"
    assert job["result"]["outputPath"].endswith(".fcpxml")
    assert output_path.exists()
    assert '<fcpxml version="1.10">' in xml
    assert 'name="FCP Demo"' in xml
    assert "src" not in asset.attrib
    assert media_rep is not None
    assert media_rep.attrib["kind"] == "original-media"
    assert media_rep.attrib["src"] == source_video.as_uri()
    assert 'name="开场片段"' in xml
    assert 'start="1/2s"' in xml
    assert 'duration="2s"' in xml


def test_worker_treats_dotted_fcpxml_format_as_real_fcpxml(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    project_folder.mkdir()
    client.post("/api/projects/init", json={"folderPath": str(project_folder), "name": "Dotted FCP"})
    create_response = client.post(
        "/api/export/jobs",
        json={"projectFolder": str(project_folder), "format": ".fcpxml"},
    )

    process_next_job()
    response = client.get(f"/api/jobs/{create_response.json()['job']['id']}")
    job = response.json()["job"]
    output_path = project_folder / job["result"]["outputPath"]
    xml = output_path.read_text(encoding="utf-8")

    assert job["status"] == "completed"
    assert job["result"]["format"] == "fcpxml"
    assert output_path.suffix == ".fcpxml"
    assert not output_path.name.endswith(".json")
    assert xml.startswith('<?xml version="1.0" encoding="UTF-8"?>')
    assert not xml.lstrip().startswith("{")
