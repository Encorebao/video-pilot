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


def _project_with_script_edit_inputs(client: TestClient, project_folder: Path) -> dict:
    client.post(
        "/api/projects/init",
        json={"folderPath": str(project_folder), "name": "Script Demo"},
    )
    project = client.post(
        "/api/projects/open",
        json={"folderPath": str(project_folder)},
    ).json()["project"]
    project["media"] = [
        {
            "id": "media-main",
            "name": "main-talk.mp4",
            "type": "video",
            "importMode": "referenced",
            "originalPath": str(project_folder / "main-talk.mp4"),
            "durationInFrames": 900,
            "sourceLabel": "main-talk.mp4",
            "notes": "店铺负责人介绍招牌菜。",
        },
        {
            "id": "media-unanalysed",
            "name": "no-analysis.mp4",
            "type": "video",
            "importMode": "referenced",
            "originalPath": str(project_folder / "no-analysis.mp4"),
            "durationInFrames": 300,
            "sourceLabel": "no-analysis.mp4",
        },
    ]
    project["analysis"] = {
        "overallSummary": "已有视觉分析",
        "sceneCount": 1,
        "transcriptCount": 0,
        "detectedFillerWordCount": 0,
        "keyframes": [],
        "transcriptSegments": [],
        "editSuggestions": [],
        "legacySummary": {
            "taxonomy_version": "v1",
            "total_videos": 1,
            "image_model": "vl",
            "videos": [
                {
                    "video": "main-talk.mp4",
                    "video_meta": {"duration_seconds": 30, "fps": 30},
                    "overall_summary": "人物在店内介绍菜品。",
                    "visual_analysis": {
                        "total_scenes": 1,
                        "scenes": [
                            {
                                "index": 0,
                                "start": 0,
                                "end": 10,
                                "duration": 10,
                                "vl_analysis": {
                                    "subject": "店铺负责人",
                                    "action": "介绍招牌菜",
                                    "environment": "店内",
                                    "edit_role": "主线讲述",
                                    "search_keywords": ["店铺", "招牌菜", "介绍"],
                                    "edit_suggestion": "适合作为主线开场。",
                                },
                            }
                        ],
                    },
                }
            ],
        },
    }
    project["sceneGroups"] = {
        "settings": {"gapMinutes": 10},
        "groups": [
            {
                "id": "scene-group-1",
                "title": "店内拍摄",
                "notes": "地点在大阪店内，任务是介绍菜单。",
                "mediaIds": ["media-main"],
                "source": "manual",
                "createdAt": "2026-05-06T10:00:00+08:00",
                "updatedAt": "2026-05-06T10:00:00+08:00",
            }
        ],
    }
    project["subtitles"] = {
        "settings": {
            "model": "mlx-community/whisper-large-v3-turbo",
            "language": "zh",
            "maxWordsPerSegment": 24,
        },
        "segments": [
            {
                "id": "subtitle-1",
                "mediaId": "media-main",
                "startFrame": 0,
                "endFrame": 180,
                "text": "大家好今天介绍我们店里的招牌菜。",
            }
        ],
    }
    client.put(
        "/api/projects/save",
        json={"folderPath": str(project_folder), "project": project},
    )
    return project


def test_script_context_preview_uses_only_analyzed_media_and_counts_bytes(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()
    _project_with_script_edit_inputs(client, project_folder)

    response = client.get(
        "/api/script-edit/context-preview",
        params={"folderPath": str(project_folder)},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["excludedMediaCount"] == 1
    assert body["rawPromptBytes"] > body["compressedPromptBytes"] > 0
    candidate_ids = [candidate["id"] for candidate in body["candidates"]]
    assert candidate_ids == ["main:media-main:0", "broll:media-main:0"]
    assert "店铺负责人介绍招牌菜" in body["compressedPrompt"]
    assert "地点在大阪店内" in body["compressedPrompt"]
    assert "字幕摘要" in body["compressedPrompt"]
    sections = {section["id"]: section for section in body["promptSections"]}
    assert sections["visual_analysis"]["label"] == "片段分析"
    assert sections["visual_analysis"]["compressedBytes"] > 0
    assert sections["subtitles"]["itemCount"] == 1
    assert sections["subtitles"]["rawBytes"] >= sections["subtitles"]["compressedBytes"] > 0
    assert sections["scene_groups"]["compressedBytes"] > 0
    assert sections["media_notes"]["itemCount"] == 1


def test_script_context_preview_filters_broll_candidates(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    project_folder = tmp_path / "project"
    project_folder.mkdir()
    _project_with_script_edit_inputs(client, project_folder)

    response = client.get(
        "/api/script-edit/context-preview",
        params=[
            ("folderPath", str(project_folder)),
            ("mode", "broll_sort"),
            ("candidateIds", "broll:media-main:0"),
        ],
    )

    assert response.status_code == 200
    body = response.json()
    assert [candidate["id"] for candidate in body["candidates"]] == ["broll:media-main:0"]
    assert {candidate["role"] for candidate in body["candidates"]} == {"broll"}
    assert "main:media-main:0" not in body["compressedPrompt"]


def test_script_edit_job_saves_draft_and_apply_creates_compound_timeline(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import script_edit
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    project_folder.mkdir()
    _project_with_script_edit_inputs(client, project_folder)
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

    def fake_generate_script_edit_draft(_config, _project_name, _context, _messages, request):
        assert request["mode"] == "rough_cut"
        return {
            "version": "script_cut_v1",
            "title": "大阪店铺粗剪",
            "mode": "rough_cut",
            "targetDurationSeconds": 10,
            "summary": "用口播作为主线，补店内画面。",
            "scriptBeats": [
                {
                    "id": "beat-1",
                    "title": "开场",
                    "purpose": "介绍主题",
                    "storyText": "介绍店铺和招牌菜。",
                    "targetDurationSeconds": 10,
                }
            ],
            "tracks": {
                "main": [
                    {
                        "beatId": "beat-1",
                        "candidateId": "main:media-main:0",
                        "timelineStartFrame": 0,
                        "startOffsetFrames": 0,
                        "durationInFrames": 240,
                        "reason": "字幕内容符合主线。",
                    }
                ],
                "broll": [
                    {
                        "beatId": "beat-1",
                        "candidateId": "broll:media-main:0",
                        "timelineStartFrame": 90,
                        "startOffsetFrames": 30,
                        "durationInFrames": 90,
                        "reason": "补充店内画面。",
                    }
                ],
            },
            "excludedCandidates": [],
            "warnings": [],
        }

    monkeypatch.setattr(script_edit, "generate_script_edit_draft", fake_generate_script_edit_draft)

    create_response = client.post(
        "/api/script-edit/jobs",
        json={
            "projectFolder": str(project_folder),
            "quickStart": "vlog",
            "message": "做一个 10 秒店铺介绍。",
            "mode": "rough_cut",
            "candidateIds": ["main:media-main:0", "broll:media-main:0"],
        },
    )
    assert create_response.status_code == 200
    assert create_response.json()["job"]["type"] == "script_edit"

    process_next_job()
    job = client.get(f"/api/jobs/{create_response.json()['job']['id']}").json()["job"]
    assert job["status"] == "completed"
    draft_id = job["result"]["draftId"]

    project = client.post(
        "/api/projects/open",
        json={"folderPath": str(project_folder)},
    ).json()["project"]
    assert project["scriptEdits"]["sessions"][0]["messages"][0]["role"] == "user"
    assert project["scriptEdits"]["drafts"][0]["id"] == draft_id

    apply_response = client.post(f"/api/script-edit/drafts/{draft_id}/apply")

    assert apply_response.status_code == 200
    project_body = apply_response.json()["project"]
    active_timeline_id = project_body["activeTimelineId"]
    timeline = project_body["timeline"]
    assert active_timeline_id == timeline["id"]
    assert timeline["kind"] == "compound"
    assert timeline["sourceDraftId"] == draft_id
    assert [track["name"] for track in timeline["videoTracks"]] == ["B-roll", "主视频"]
    assert [track["name"] for track in timeline["audioTracks"]] == ["原声"]
    assert timeline["videoTracks"][0]["clips"][0]["startFrame"] == 90
    assert timeline["videoTracks"][1]["clips"][0]["mediaId"] == "media-main"
    assert timeline["audioTracks"][0]["clips"][0]["sourceIn"] == timeline["videoTracks"][1]["clips"][0]["sourceIn"]
    main_timeline = next(item for item in project_body["timelines"] if item["kind"] == "main")
    assert main_timeline["videoTracks"] == []
    assert main_timeline["audioTracks"] == []
    assert project_body["scriptEdits"]["drafts"][0]["applied"] is True

    second_apply_response = client.post(f"/api/script-edit/drafts/{draft_id}/apply")

    assert second_apply_response.status_code == 200
    second_project = second_apply_response.json()["project"]
    compound_timelines = [item for item in second_project["timelines"] if item["kind"] == "compound"]
    assert len(compound_timelines) == 2
    timeline_ids = [item["id"] for item in compound_timelines]
    assert len(timeline_ids) == len(set(timeline_ids))


def test_broll_sort_job_uses_selected_candidates_and_applies_to_compound(monkeypatch, tmp_path: Path):
    client = _client_with_temp_state(monkeypatch, tmp_path)
    from app.services import script_edit
    from app.services.job_worker import process_next_job

    project_folder = tmp_path / "project"
    project_folder.mkdir()
    _project_with_script_edit_inputs(client, project_folder)
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

    def fake_generate_script_edit_draft(_config, _project_name, context, _messages, request):
        assert request["mode"] == "broll_sort"
        assert request["candidateIds"] == ["broll:media-main:0"]
        assert [candidate["id"] for candidate in context["candidates"]] == ["broll:media-main:0"]
        return {
            "version": "script_cut_v1",
            "mode": "broll_sort",
            "title": "B-roll 排序",
            "targetDurationSeconds": 8,
            "summary": "只排序 B-roll 镜头。",
            "scriptBeats": [
                {
                    "id": "beat-1",
                    "title": "氛围",
                    "purpose": "补充画面",
                    "storyText": "用店内镜头建立氛围。",
                    "targetDurationSeconds": 8,
                }
            ],
            "tracks": {
                "main": [
                    {
                        "beatId": "beat-1",
                        "candidateId": "main:media-main:0",
                        "timelineStartFrame": 0,
                        "startOffsetFrames": 0,
                        "durationInFrames": 120,
                        "reason": "B-roll 模式不应保留主线。",
                    }
                ],
                "broll": [
                    {
                        "beatId": "beat-1",
                        "candidateId": "broll:media-main:0",
                        "timelineStartFrame": 0,
                        "startOffsetFrames": 30,
                        "durationInFrames": 120,
                        "reason": "补充店内画面。",
                    }
                ],
            },
            "excludedCandidates": [],
            "warnings": [],
        }

    monkeypatch.setattr(script_edit, "generate_script_edit_draft", fake_generate_script_edit_draft)

    create_response = client.post(
        "/api/script-edit/jobs",
        json={
            "projectFolder": str(project_folder),
            "quickStart": "broll",
            "message": "只把可用 B-roll 排个顺序。",
            "mode": "broll_sort",
            "candidateIds": ["broll:media-main:0"],
        },
    )
    assert create_response.status_code == 200

    process_next_job()
    job = client.get(f"/api/jobs/{create_response.json()['job']['id']}").json()["job"]
    assert job["status"] == "completed"
    draft_id = job["result"]["draftId"]

    project = client.post(
        "/api/projects/open",
        json={"folderPath": str(project_folder)},
    ).json()["project"]
    draft = project["scriptEdits"]["drafts"][0]
    assert draft["mode"] == "broll_sort"
    assert draft["tracks"]["main"] == []
    assert len(draft["tracks"]["broll"]) == 1

    apply_response = client.post(f"/api/script-edit/drafts/{draft_id}/apply")

    assert apply_response.status_code == 200
    timeline = apply_response.json()["project"]["timeline"]
    assert timeline["kind"] == "compound"
    assert timeline["name"] == "B-roll 排序"
    assert [track["name"] for track in timeline["videoTracks"]] == ["B-roll"]
    assert timeline["audioTracks"] == []
