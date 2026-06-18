from pathlib import Path


def test_scene_probe_times_uses_lightweight_temporal_samples_first():
    from app.services.frame_extraction import scene_probe_times

    cases = [
        ({"start": 2.0, "end": 2.4}, 1),
        ({"start": 2.0, "end": 3.0}, 3),
        ({"start": 2.0, "end": 5.0}, 3),
        ({"start": 2.0, "end": 8.0}, 5),
        ({"start": 2.0, "end": 15.0}, 5),
    ]

    for scene, expected_count in cases:
        probes = scene_probe_times(scene, video_duration=20.0)

        assert len(probes) == expected_count
        times = [float(probe["time"]) for probe in probes]
        assert times == sorted(times)
        if expected_count > 1:
            assert times[0] > float(scene["start"])
            assert times[-1] < float(scene["end"])


def test_scene_probe_times_collapses_short_scene_to_middle():
    from app.services.frame_extraction import scene_probe_times

    probes = scene_probe_times({"start": 2.0, "end": 2.3}, video_duration=10.0)

    assert probes == [{"label": "sample_01", "time": 2.15}]


def test_expanded_scene_probe_times_adds_more_samples_only_for_uncertain_fallback():
    from app.services.frame_extraction import expanded_scene_probe_times, scene_probe_times

    scene = {"start": 2.0, "end": 15.0}

    initial = scene_probe_times(scene, video_duration=20.0)
    expanded = expanded_scene_probe_times(scene, video_duration=20.0)

    assert len(initial) == 5
    assert len(expanded) == 9
    assert {(probe["label"], probe["time"]) for probe in initial}.issubset(
        {(probe["label"], probe["time"]) for probe in expanded}
    )
    assert [probe["label"] for probe in expanded] == [
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


def test_extract_keyframe_clamps_time_and_runs_ffmpeg(monkeypatch, tmp_path: Path):
    from app.services import frame_extraction

    calls = []
    source = tmp_path / "clip.mp4"
    output = tmp_path / "frame.jpg"
    source.write_bytes(b"video")

    monkeypatch.setattr(frame_extraction, "get_video_duration", lambda _path: 10.0)

    def fake_run(cmd, capture_output, check, text=False):
        calls.append(cmd)
        output.write_bytes(b"jpeg")

    monkeypatch.setattr(frame_extraction.subprocess, "run", fake_run)

    frame_extraction.extract_keyframe(source, 20.0, output)

    assert calls
    assert calls[0][0] == "ffmpeg"
    assert calls[0][3] == "9.900"
    assert output.exists()


def test_extract_keyframe_uses_lut3d_filter_when_color_transform_applied(
    monkeypatch, tmp_path: Path
):
    from app.services import frame_extraction

    calls = []
    source = tmp_path / "clip.mp4"
    output = tmp_path / "frame.jpg"
    lut = tmp_path / "sony_slog3.cube"
    source.write_bytes(b"video")
    lut.write_text("LUT_3D_SIZE 2\n", encoding="utf-8")

    monkeypatch.setattr(frame_extraction, "get_video_duration", lambda _path: 10.0)

    def fake_run(cmd, capture_output, check, text=False):
        calls.append(cmd)
        output.write_bytes(b"jpeg")

    monkeypatch.setattr(frame_extraction.subprocess, "run", fake_run)

    frame_extraction.extract_keyframe(
        source,
        4.0,
        output,
        color_transform={
            "applied": True,
            "lut_path": str(lut),
            "lut_name": lut.name,
            "source_profile": "s-log3-cine / s-gamut3-cine",
            "target_profile": "rec709",
        },
    )

    vf_index = calls[0].index("-vf") + 1
    assert f"lut3d=file='{lut.as_posix()}'" in calls[0][vf_index]
    assert "scale=720:404:force_original_aspect_ratio=decrease" in calls[0][vf_index]


def test_extract_video_segment_clip_clamps_bounds_and_runs_ffmpeg(monkeypatch, tmp_path: Path):
    from app.services import frame_extraction

    calls = []
    source = tmp_path / "clip.mp4"
    output = tmp_path / "scene_000.mp4"
    source.write_bytes(b"video")

    monkeypatch.setattr(frame_extraction, "get_video_duration", lambda _path: 10.0)

    def fake_run(cmd, capture_output, check):
        calls.append(cmd)
        output.write_bytes(b"mp4")

    monkeypatch.setattr(frame_extraction.subprocess, "run", fake_run)

    result = frame_extraction.extract_video_segment_clip(source, -2.0, 20.0, output)

    assert result == output
    assert calls
    cmd = calls[0]
    assert cmd[0] == "ffmpeg"
    assert cmd[cmd.index("-ss") + 1] == "0.100"
    assert cmd[cmd.index("-t") + 1] == "9.800"
    assert "-an" in cmd
    assert output.exists()


def test_extract_video_keyframes_falls_back_to_single_scene(monkeypatch, tmp_path: Path):
    from app.services import frame_extraction

    source = tmp_path / "clip.mp4"
    output_dir = tmp_path / "analysis"
    source.write_bytes(b"video")
    extracted = []

    monkeypatch.setattr(frame_extraction, "get_video_duration", lambda _path: 12.0)
    monkeypatch.setattr(frame_extraction, "get_video_fps", lambda _path: 24.0)
    monkeypatch.setattr(frame_extraction, "get_video_resolution", lambda _path: "1920x1080")
    monkeypatch.setattr(frame_extraction, "detect_scenes", lambda _path: [])

    def fake_extract(video_path, time_sec, output_path, size=(720, 404)):
        extracted.append((video_path, time_sec, output_path.name))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"jpeg")

    monkeypatch.setattr(frame_extraction, "extract_keyframe", fake_extract)

    result = frame_extraction.extract_video_keyframes(source, output_dir)

    assert result["video"] == "clip.mp4"
    assert result["video_meta"] == {
        "duration_seconds": 12.0,
        "resolution": "1920x1080",
        "fps": 24.0,
    }
    assert result["visual_analysis"]["total_scenes"] == 1
    scene = result["visual_analysis"]["scenes"][0]
    assert scene["keyframe_time"] == 6.0
    assert Path(scene["keyframe"]).exists()
    assert scene["movement_probe"]["method"] == "adaptive_temporal_samples"
    assert [sample["label"] for sample in scene["movement_probe"]["samples"]] == [
        "sample_01",
        "sample_03",
        "sample_05",
        "sample_07",
        "sample_09",
    ]
    assert extracted[0] == (source, 0.1, "frame_000_sample_01.jpg")
    assert extracted[2] == (source, 6.0, "frame_000.jpg")
    assert extracted[-1] == (source, 11.9, "frame_000_sample_09.jpg")


def test_extract_video_keyframes_applies_fixed_lut_for_slog3(
    monkeypatch, tmp_path: Path
):
    from app.services import frame_extraction

    source = tmp_path / "clip.mp4"
    output_dir = tmp_path / "analysis"
    source.write_bytes(b"video")
    extracted = []

    monkeypatch.setattr(frame_extraction, "get_video_duration", lambda _path: 12.0)
    monkeypatch.setattr(frame_extraction, "get_video_fps", lambda _path: 24.0)
    monkeypatch.setattr(frame_extraction, "get_video_resolution", lambda _path: "1920x1080")
    monkeypatch.setattr(frame_extraction, "detect_scenes", lambda _path: [])
    monkeypatch.setattr(
        frame_extraction,
        "get_video_shooting_meta",
        lambda _path: {
            "log_detected": True,
            "log_profile": "s-log3-cine / s-gamut3-cine",
        },
    )
    monkeypatch.setattr(
        frame_extraction,
        "analyze_keyframe_quality",
        lambda *_args, **_kwargs: {"grade": "精选", "issues": []},
    )

    def fake_extract(
        _video_path,
        _time_sec,
        output_path,
        size=(720, 404),
        color_transform=None,
    ):
        extracted.append(color_transform)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"jpeg")

    monkeypatch.setattr(frame_extraction, "extract_keyframe", fake_extract)

    result = frame_extraction.extract_video_keyframes(source, output_dir)

    assert result["frame_color_transform"]["applied"] is True
    assert result["frame_color_transform"]["source_profile"] == "s-log3-cine / s-gamut3-cine"
    assert result["frame_color_transform"]["target_profile"] == "rec709"
    assert result["frame_color_transform"]["lut_name"].endswith(".cube")
    assert all(item and item["applied"] is True for item in extracted)


def test_extract_video_keyframes_adds_shooting_info_and_quality_metrics(
    monkeypatch, tmp_path: Path
):
    from app.services import frame_extraction

    source = tmp_path / "clip.mp4"
    output_dir = tmp_path / "analysis"
    source.write_bytes(b"video")

    monkeypatch.setattr(frame_extraction, "get_video_duration", lambda _path: 1.0)
    monkeypatch.setattr(frame_extraction, "get_video_fps", lambda _path: 24.0)
    monkeypatch.setattr(frame_extraction, "get_video_resolution", lambda _path: "1920x1080")
    monkeypatch.setattr(frame_extraction, "detect_scenes", lambda _path: [])
    monkeypatch.setattr(
        frame_extraction,
        "get_video_shooting_meta",
        lambda _path: {"camera_model": "ZV-E1", "time_source": "xml_sidecar"},
    )
    monkeypatch.setattr(
        frame_extraction,
        "analyze_keyframe_quality",
        lambda *_args, **_kwargs: {"grade": "精选", "issues": []},
    )

    def fake_extract(_video_path, _time_sec, output_path, size=(720, 404)):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"jpeg")

    monkeypatch.setattr(frame_extraction, "extract_keyframe", fake_extract)

    result = frame_extraction.extract_video_keyframes(source, output_dir)

    assert result["shooting_info"]["camera_model"] == "ZV-E1"
    scene = result["visual_analysis"]["scenes"][0]
    assert scene["quality_metrics"] == {"grade": "精选", "issues": []}


def test_get_video_shooting_meta_merges_sony_xml_sidecar(monkeypatch, tmp_path: Path):
    from app.services import frame_extraction

    source = tmp_path / "C0001.MP4"
    source.write_bytes(b"video")
    (tmp_path / "C0001M01.XML").write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<NonRealTimeMeta xmlns="urn:schemas-professionalDisc:nonRealTimeMeta:ver.2.20">
  <CreationDate value="2025-11-12T17:53:49+08:00"/>
  <Device manufacturer="Sony" modelName="ZV-E1" serialNo="4294967295"/>
  <Lens modelName="FE 24-50mm F2.8 G"/>
  <VideoFormat>
    <VideoFrame captureFps="59.94p" videoCodec="HEVC_3840_2160_M42210P@L51HT"/>
    <VideoLayout pixel="3840" numOfVerticalLine="2160"/>
  </VideoFormat>
  <RecordingMode type="normal"/>
  <Group name="CameraUnitMetadataSet">
    <Item name="CaptureGammaEquation" value="s-log3-cine"/>
    <Item name="CaptureColorPrimaries" value="s-gamut3-cine"/>
    <Item name="CodingEquations" value="rec709"/>
  </Group>
</NonRealTimeMeta>
""",
        encoding="utf-8",
    )

    class Result:
        stdout = '{"format":{"bit_rate":"223662000","tags":{"encoder":"HEVC Coding"}},"streams":[]}'

    monkeypatch.setattr(frame_extraction.subprocess, "run", lambda *_args, **_kwargs: Result())

    meta = frame_extraction.get_video_shooting_meta(source)

    assert meta["time_source"] == "xml_sidecar"
    assert meta["creation_time"] == "2025-11-12T17:53:49+08:00"
    assert meta["creation_time_ts"] == 1762941229
    assert meta["camera_software"] == "HEVC Coding"
    assert meta["bitrate_kbps"] == 223662
    assert meta["xml_sidecar"] == "C0001M01.XML"
    assert meta["camera_make"] == "Sony"
    assert meta["camera_model"] == "ZV-E1"
    assert meta["lens_model"] == "FE 24-50mm F2.8 G"
    assert meta["capture_fps"] == "59.94p"
    assert meta["video_codec_detail"] == "HEVC_3840_2160_M42210P@L51HT"
    assert meta["resolution"] == "3840x2160"
    assert meta["recording_mode"] == "normal"
    assert meta["color_science"] == {
        "gamma": "s-log3-cine",
        "gamut": "s-gamut3-cine",
        "matrix": "rec709",
    }
    assert meta["log_detected"] is True
    assert meta["log_profile"] == "s-log3-cine / s-gamut3-cine"
