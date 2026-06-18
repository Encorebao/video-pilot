from __future__ import annotations

import hashlib
import json
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Any

from app.services.quality_metrics import analyze_keyframe_quality

APP_DIR = Path(__file__).resolve().parents[1]
FIXED_LUTS = {
    "s-log3-cine / s-gamut3-cine": APP_DIR
    / "resources"
    / "luts"
    / "sony_slog3_sgamut3cine_to_rec709.cube",
}


def get_video_duration(video_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ],
        capture_output=True,
        text=True,
    )
    try:
        return float(result.stdout.strip())
    except (TypeError, ValueError):
        return 0.0


def get_video_fps(video_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=r_frame_rate",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ],
        capture_output=True,
        text=True,
    )
    try:
        num, den = result.stdout.strip().split("/")
        return round(float(num) / float(den), 3)
    except (TypeError, ValueError, ZeroDivisionError):
        return 0.0


def get_video_resolution(video_path: Path) -> str:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
            str(video_path),
        ],
        capture_output=True,
        text=True,
    )
    try:
        width, height = result.stdout.strip().split(",")
        return f"{width}x{height}"
    except (TypeError, ValueError):
        return "unknown"


def _parse_sony_xml_sidecar(video_path: Path) -> dict[str, Any]:
    xml_path = next(video_path.parent.glob(f"{video_path.stem}M*.XML"), None)
    if xml_path is None:
        xml_path = next(video_path.parent.glob(f"{video_path.stem}M*.xml"), None)
    if xml_path is None:
        return {}

    try:
        root = ET.parse(xml_path).getroot()
        ns_uri = root.tag.split("}")[0].lstrip("{") if root.tag.startswith("{") else ""
        ns = {"m": ns_uri} if ns_uri else {}

        def find(path: str):
            return root.find(path, ns) if ns else root.find(path.replace("m:", ""))

        def attr(path: str, name: str, default: str = "") -> str:
            elem = find(path)
            return (elem.get(name) or default) if elem is not None else default

        meta: dict[str, Any] = {"xml_sidecar": xml_path.name}
        created_at = attr("m:CreationDate", "value")
        if created_at:
            try:
                dt = datetime.fromisoformat(created_at)
                meta["creation_time"] = dt.isoformat()
                meta["creation_time_ts"] = round(dt.timestamp())
            except ValueError:
                meta["creation_time"] = created_at
            meta["time_source"] = "xml_sidecar"

        device = find("m:Device")
        if device is not None:
            if device.get("manufacturer"):
                meta["camera_make"] = device.get("manufacturer")
            if device.get("modelName"):
                meta["camera_model"] = device.get("modelName")

        lens = find("m:Lens")
        if lens is not None and lens.get("modelName"):
            meta["lens_model"] = lens.get("modelName")

        video_frame = find("m:VideoFormat/m:VideoFrame")
        if video_frame is not None:
            if video_frame.get("captureFps"):
                meta["capture_fps"] = video_frame.get("captureFps")
            if video_frame.get("videoCodec"):
                meta["video_codec_detail"] = video_frame.get("videoCodec")

        video_layout = find("m:VideoFormat/m:VideoLayout")
        if video_layout is not None:
            width = video_layout.get("pixel", "")
            height = video_layout.get("numOfVerticalLine", "")
            if width and height:
                meta["resolution"] = f"{width}x{height}"

        recording_mode = find("m:RecordingMode")
        if recording_mode is not None and recording_mode.get("type"):
            meta["recording_mode"] = recording_mode.get("type")

        group_path = './/m:Group[@name="CameraUnitMetadataSet"]'
        group = root.find(group_path, ns) if ns else root.find(group_path.replace("m:", ""))
        if group is not None:
            item_tag = f"{{{ns_uri}}}Item" if ns_uri else "Item"
            color: dict[str, str] = {}
            for item in group.findall(item_tag):
                name = item.get("name", "")
                value = item.get("value", "")
                if name == "CaptureGammaEquation":
                    color["gamma"] = value
                elif name == "CaptureColorPrimaries":
                    color["gamut"] = value
                elif name == "CodingEquations":
                    color["matrix"] = value
            if color:
                meta["color_science"] = color

        return meta
    except Exception as exc:
        return {"xml_sidecar_error": str(exc)}


def _annotate_log_profile(meta: dict[str, Any]) -> None:
    color = meta.get("color_science") if isinstance(meta.get("color_science"), dict) else {}
    gamma = str(color.get("gamma") or "").lower()
    gamut = str(color.get("gamut") or "").lower()
    profile_parts = [part for part in (gamma, gamut) if part]
    is_log = any(token in gamma for token in ("log", "s-log", "v-log", "c-log", "n-log", "hlg"))
    if is_log:
        meta["log_detected"] = True
        meta["log_profile"] = " / ".join(profile_parts) if profile_parts else gamma
    elif "log_detected" not in meta:
        meta["log_detected"] = False


def get_video_shooting_meta(video_path: Path) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(video_path),
        ],
        capture_output=True,
        text=True,
    )
    try:
        data = json.loads(result.stdout or "{}")
        fmt = data.get("format", {})
        tags: dict[str, str] = {}
        tags.update({key.lower(): value for key, value in fmt.get("tags", {}).items()})
        for stream in data.get("streams", []):
            tags.update({key.lower(): value for key, value in stream.get("tags", {}).items()})

        raw_time = (
            tags.get("creation_time")
            or tags.get("date")
            or tags.get("com.apple.quicktime.creationdate")
        )
        if raw_time:
            try:
                dt = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
                meta["creation_time"] = dt.isoformat()
                meta["creation_time_ts"] = round(dt.timestamp())
                meta["time_source"] = "metadata"
            except ValueError:
                meta["creation_time"] = raw_time
                meta["time_source"] = "metadata"
        else:
            mtime = video_path.stat().st_mtime
            meta["creation_time"] = datetime.fromtimestamp(mtime).isoformat()
            meta["creation_time_ts"] = round(mtime)
            meta["time_source"] = "file_mtime"

        for key in ("com.apple.quicktime.make", "make", "manufacturer"):
            if tags.get(key):
                meta["camera_make"] = tags[key]
                break
        for key in ("com.apple.quicktime.model", "model", "camera_model", "device_model"):
            if tags.get(key):
                meta["camera_model"] = tags[key]
                break
        for key in ("com.apple.quicktime.software", "software", "firmware", "encoder"):
            if tags.get(key):
                meta["camera_software"] = tags[key]
                break
        bit_rate = fmt.get("bit_rate")
        if bit_rate:
            meta["bitrate_kbps"] = round(int(bit_rate) / 1000)
    except Exception as exc:
        meta["metadata_error"] = str(exc)

    xml_meta = _parse_sony_xml_sidecar(video_path)
    if xml_meta:
        meta.update(xml_meta)
    _annotate_log_profile(meta)
    return meta


def resolve_frame_color_transform(shooting_info: dict[str, Any]) -> dict[str, Any]:
    source_profile = str(shooting_info.get("log_profile") or "").strip().lower()
    if not source_profile:
        return {"applied": False, "reason": "no_log_profile"}

    lut_path = FIXED_LUTS.get(source_profile)
    if lut_path is None:
        return {
            "applied": False,
            "source_profile": source_profile,
            "reason": "unsupported_log_profile",
        }
    if not lut_path.exists():
        return {
            "applied": False,
            "source_profile": source_profile,
            "target_profile": "rec709",
            "lut_name": lut_path.name,
            "lut_path": str(lut_path),
            "reason": "lut_missing",
        }

    return {
        "applied": True,
        "source_profile": source_profile,
        "target_profile": "rec709",
        "lut_name": lut_path.name,
        "lut_path": str(lut_path),
    }


def detect_scenes(video_path: Path, threshold: float = 30.0) -> list[dict[str, Any]]:
    try:
        from scenedetect import ContentDetector, detect
    except ImportError:
        return []

    try:
        scene_list = detect(str(video_path), ContentDetector(threshold=threshold))
    except Exception:
        return []

    scenes: list[dict[str, Any]] = []
    for index, scene in enumerate(scene_list):
        start_frame, end_frame = scene[0], scene[1]
        start_time = start_frame.get_seconds()
        end_time = end_frame.get_seconds()
        scenes.append(
            {
                "index": index,
                "start": round(start_time, 2),
                "end": round(end_time, 2),
                "duration": round(end_time - start_time, 2),
            }
        )
    return scenes


def clamp_time(time_sec: float, duration: float) -> float:
    if duration <= 0:
        return 0.0
    if time_sec >= duration:
        return round(max(duration - 0.1, 0.0), 3)
    if time_sec < 0:
        return 0.1 if duration > 0.1 else 0.0
    return round(time_sec, 3)


def _full_scene_probe_count(scene_duration: float) -> int:
    if scene_duration < 0.6:
        return 1
    if scene_duration < 2.0:
        return 3
    if scene_duration < 6.0:
        return 5
    if scene_duration < 12.0:
        return 7
    return 9


def _initial_scene_probe_count(scene_duration: float) -> int:
    full_count = _full_scene_probe_count(scene_duration)
    if full_count <= 3:
        return full_count
    if scene_duration < 6.0:
        return 3
    return 5


def _scene_probe_times(
    scene: dict[str, Any],
    video_duration: float,
    *,
    count: int,
) -> list[dict[str, float | str]]:
    start = float(scene.get("start", 0.0))
    end = float(scene.get("end", start))
    if end < start:
        start, end = end, start

    if count <= 1:
        middle = clamp_time((start + end) / 2.0, video_duration)
        return [{"label": "sample_01", "time": middle}]

    first_time = clamp_time(start + 0.1, video_duration)
    last_time = clamp_time(end - 0.1, video_duration)
    if last_time <= first_time:
        middle = clamp_time((start + end) / 2.0, video_duration)
        return [{"label": "sample_01", "time": middle}]

    step = (last_time - first_time) / float(count - 1)
    return [
        {
            "label": f"sample_{index + 1:02d}",
            "time": clamp_time(first_time + step * index, video_duration),
        }
        for index in range(count)
    ]


def _select_probe_subset(
    probes: list[dict[str, float | str]],
    *,
    count: int,
) -> list[dict[str, float | str]]:
    if count >= len(probes):
        return probes
    if count <= 1:
        return [probes[len(probes) // 2]]
    indexes = sorted(
        {
            round(index * (len(probes) - 1) / float(count - 1))
            for index in range(count)
        }
    )
    return [probes[index] for index in indexes]


def expanded_scene_probe_times(scene: dict[str, Any], video_duration: float) -> list[dict[str, float | str]]:
    start = float(scene.get("start", 0.0))
    end = float(scene.get("end", start))
    if end < start:
        start, end = end, start
    return _scene_probe_times(
        scene,
        video_duration,
        count=_full_scene_probe_count(end - start),
    )


def scene_probe_times(scene: dict[str, Any], video_duration: float) -> list[dict[str, float | str]]:
    start = float(scene.get("start", 0.0))
    end = float(scene.get("end", start))
    if end < start:
        start, end = end, start
    full_probes = expanded_scene_probe_times(scene, video_duration)
    return _select_probe_subset(
        full_probes,
        count=_initial_scene_probe_count(end - start),
    )


def extract_keyframe(
    video_path: Path,
    time_sec: float,
    output_path: Path,
    size: tuple[int, int] = (720, 404),
    color_transform: dict[str, Any] | None = None,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    duration = get_video_duration(video_path)
    safe_time = clamp_time(time_sec, duration)
    scale_filter = f"scale={size[0]}:{size[1]}:force_original_aspect_ratio=decrease"
    vf_filter = scale_filter
    if color_transform and color_transform.get("applied") and color_transform.get("lut_path"):
        lut_path = str(color_transform["lut_path"]).replace("\\", "\\\\").replace("'", "\\'")
        vf_filter = f"lut3d=file='{lut_path}',{scale_filter}"
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{safe_time:.3f}",
        "-i",
        str(video_path),
        "-vframes",
        "1",
        "-vf",
        vf_filter,
        "-q:v",
        "2",
        str(output_path),
    ]
    subprocess.run(cmd, capture_output=True, check=True)


def extract_video_segment_clip(
    video_path: Path,
    start_sec: float,
    end_sec: float,
    output_path: Path,
    size: tuple[int, int] = (720, 404),
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    duration = get_video_duration(video_path)
    safe_start = clamp_time(start_sec, duration)
    safe_end = clamp_time(end_sec, duration)
    if safe_end <= safe_start:
        safe_end = min(max(duration - 0.1, safe_start + 0.1), safe_start + 0.5)
    clip_duration = max(0.1, safe_end - safe_start)
    scale_filter = f"scale={size[0]}:{size[1]}:force_original_aspect_ratio=decrease"
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{safe_start:.3f}",
        "-i",
        str(video_path),
        "-t",
        f"{clip_duration:.3f}",
        "-an",
        "-vf",
        scale_filter,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-pix_fmt",
        "yuv420p",
        str(output_path),
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    return output_path


def _analysis_output_dir(output_root: Path, video_path: Path) -> Path:
    short_hash = hashlib.md5(str(video_path.resolve()).encode("utf-8")).hexdigest()[:8]
    return output_root / f"{video_path.stem}_{short_hash}"


def extract_video_keyframes(video_path: Path, output_root: Path) -> dict[str, Any]:
    video_output_dir = _analysis_output_dir(output_root, video_path)
    frames_dir = video_output_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    duration = get_video_duration(video_path)
    fps = get_video_fps(video_path)
    resolution = get_video_resolution(video_path)
    shooting_info = get_video_shooting_meta(video_path)
    frame_color_transform = resolve_frame_color_transform(shooting_info)
    scenes = detect_scenes(video_path)
    if not scenes:
        scenes = [
            {
                "index": 0,
                "start": 0.0,
                "end": duration,
                "duration": duration,
            }
        ]

    for index, scene in enumerate(scenes):
        probes = scene_probe_times(scene, duration)
        samples = []
        middle_sample = None
        middle_frame_path = frames_dir / f"frame_{index:03d}.jpg"
        scene_middle = float(scene.get("start", 0.0) or 0.0) + (
            float(scene.get("end", 0.0) or 0.0) - float(scene.get("start", 0.0) or 0.0)
        ) / 2.0
        middle_probe = min(
            probes,
            key=lambda item: abs(float(item["time"]) - scene_middle),
            default=None,
        )
        for probe in probes:
            label = str(probe["label"])
            frame_path = (
                middle_frame_path
                if middle_probe is not None and probe is middle_probe
                else frames_dir / f"frame_{index:03d}_{label}.jpg"
            )
            if frame_color_transform.get("applied"):
                extract_keyframe(
                    video_path,
                    float(probe["time"]),
                    frame_path,
                    color_transform=frame_color_transform,
                )
            else:
                extract_keyframe(video_path, float(probe["time"]), frame_path)
            sample = {
                "label": label,
                "time": round(float(probe["time"]), 2),
                "frame": str(frame_path),
            }
            samples.append(sample)
            if middle_probe is not None and probe is middle_probe:
                middle_sample = sample

        if middle_sample is None and samples:
            middle_sample = samples[len(samples) // 2]

        scene["keyframe"] = middle_sample.get("frame") if middle_sample else None
        scene["keyframe_time"] = middle_sample.get("time") if middle_sample else None
        scene["movement_probe"] = {
            "method": "adaptive_temporal_samples",
            "samples": samples,
        }
        if scene.get("keyframe"):
            scene["quality_metrics"] = analyze_keyframe_quality(
                scene["keyframe"],
                video_path=video_path,
                scene_start=float(scene.get("start", 0.0) or 0.0),
                scene_end=float(scene.get("end", 0.0) or 0.0),
            )

    return {
        "video": video_path.name,
        "video_path": str(video_path),
        "output_dir": str(video_output_dir),
        "video_meta": {
            "duration_seconds": round(duration, 2),
            "resolution": resolution,
            "fps": fps,
        },
        "shooting_info": shooting_info,
        "frame_color_transform": frame_color_transform,
        "visual_analysis": {
            "model": "",
            "total_scenes": len(scenes),
            "scenes": scenes,
        },
    }
