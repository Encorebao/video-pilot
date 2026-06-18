from pathlib import Path

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


def test_vl_frame_sampling_debug_extracts_every_half_second_and_calls_image_vl(
    monkeypatch, tmp_path: Path
):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    video_path = tmp_path / "scene.mp4"
    project_folder.mkdir()
    video_path.write_bytes(b"fake mp4")
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
    from app.services import video_vl_debug

    extracted = []
    posted = []

    monkeypatch.setattr(video_vl_debug, "get_video_duration", lambda _path: 1.1)

    def fake_extract_keyframe(source_path, time_sec, output_path):
        extracted.append((source_path, time_sec, output_path.name))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"jpeg")

    def fake_post_chat_completion(config, messages, *, temperature, max_tokens, timeout):
        image_content = messages[0]["content"][1]
        posted.append(
            {
                "model": config.model,
                "text": messages[0]["content"][0]["text"],
                "image": image_content["image_url"]["url"],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "timeout": timeout,
            }
        )
        return '{"subject":"frame-%d"}' % (len(posted) - 1)

    monkeypatch.setattr(video_vl_debug, "extract_keyframe", fake_extract_keyframe)
    monkeypatch.setattr(video_vl_debug, "post_chat_completion", fake_post_chat_completion)

    response = client.post(
        "/api/vl-debug/frame-sampling",
        json={
            "projectFolder": str(project_folder),
            "videoPath": str(video_path),
            "prompt": "逐帧识别主体",
            "extraInstructions": "不要跨帧猜测。",
            "outputSchema": {"subject": "主体"},
            "intervalSeconds": 0.5,
            "maxFrames": 10,
            "temperature": 0.1,
            "maxTokens": 256,
            "persist": False,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["debugPath"] is None
    assert body["request"]["media"]["kind"] == "sampled_frames"
    assert body["request"]["intervalSeconds"] == 0.5
    assert body["request"]["frameCount"] == 3
    assert [frame["time"] for frame in body["frames"]] == [0.0, 0.5, 1.0]
    assert [frame["parsed"]["subject"] for frame in body["frames"]] == [
        "frame-0",
        "frame-1",
        "frame-2",
    ]
    assert [item[1] for item in extracted] == [0.0, 0.5, 1.0]
    assert [item[2] for item in extracted] == [
        "frame_0000.jpg",
        "frame_0001.jpg",
        "frame_0002.jpg",
    ]
    assert len(posted) == 3
    assert all(item["image"].startswith("data:image/jpeg;base64,") for item in posted)
    assert "逐帧识别主体" in posted[0]["text"]
    assert "不要跨帧猜测。" in posted[0]["text"]
    assert "outputSchema" in posted[0]["text"]


def test_vl_frame_sampling_debug_keeps_per_frame_parse_errors(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    video_path = tmp_path / "scene.mp4"
    project_folder.mkdir()
    video_path.write_bytes(b"fake mp4")
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
    from app.services import video_vl_debug

    monkeypatch.setattr(video_vl_debug, "get_video_duration", lambda _path: 0.1)

    def fake_extract_keyframe(_source_path, _time_sec, output_path):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"jpeg")

    monkeypatch.setattr(video_vl_debug, "extract_keyframe", fake_extract_keyframe)
    monkeypatch.setattr(
        video_vl_debug,
        "post_chat_completion",
        lambda *_args, **_kwargs: "不是 JSON",
    )

    response = client.post(
        "/api/vl-debug/frame-sampling",
        json={
            "projectFolder": str(project_folder),
            "videoPath": str(video_path),
            "prompt": "逐帧识别主体",
            "persist": False,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert body["frames"][0]["parsed"] is None
    assert body["frames"][0]["rawContent"] == "不是 JSON"
    assert "not valid JSON" in body["frames"][0]["parseError"]


def test_vl_video_url_debug_route_is_not_exposed(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)

    response = client.post("/api/vl-debug/video-url", json={})

    assert response.status_code == 404
