from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

BLUR_THRESHOLD = 50.0
BLUR_SEVERE_THRESHOLD = 30.0
OVEREXPOSE_RATIO = 0.60
UNDEREXPOSE_RATIO = 0.60
BRIGHT_MIN = 40.0
NOISE_THRESHOLD = 15.0
COMPOSITION_THRESHOLD = 0.25
SHAKE_THRESHOLD = 5.0
CLOSE_UP_SHOT_TYPES = {
    "特写",
    "极特写",
    "局部特写",
    "细节特写",
    "微距",
    "close-up",
    "closeup",
    "extreme close-up",
}
FOCUS_ISSUE_KEYWORDS = ("虚焦", "模糊", "失焦", "对焦", "焦外")
TOLERATED_CLOSE_UP_BLUR_ISSUE = "浅景深焦外虚化，需人工确认主体焦点"
TOLERATED_CLOSE_UP_BLUR_CONTEXT = "特写镜头允许焦外虚化，未单独作为废片依据"


def _blur_score(frame: np.ndarray) -> float:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _exposure_score(gray: np.ndarray) -> str:
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()
    total = gray.size
    bright_ratio = hist[230:].sum() / total
    dark_ratio = hist[:25].sum() / total
    if bright_ratio > OVEREXPOSE_RATIO:
        return "overexposed"
    if dark_ratio > UNDEREXPOSE_RATIO:
        return "underexposed"
    return "normal"


def _composition_score(frame: np.ndarray) -> float:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame
    gx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    saliency = np.sqrt(gx**2 + gy**2)
    total = saliency.sum()
    if total < 1e-6:
        return 0.0
    height, width = gray.shape
    ys, xs = np.mgrid[0:height, 0:width]
    cx = (xs * saliency).sum() / total / width
    cy = (ys * saliency).sum() / total / height
    return float(np.sqrt((cx - 0.5) ** 2 + (cy - 0.5) ** 2))


def _noise_score(gray: np.ndarray) -> float:
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    diff = cv2.absdiff(gray, blurred).astype(np.float32)
    return float(diff.std())


def _shake_score(video_path: str | Path, start_sec: float, end_sec: float) -> float:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return 0.0
    try:
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        start_frame = max(0, int(start_sec * fps))
        end_frame = min(total_frames - 1, int(end_sec * fps))
        if end_frame <= start_frame:
            return 0.0
        count = min(6, end_frame - start_frame)
        if count < 2:
            return 0.0
        frames = []
        for frame_index in np.linspace(start_frame, end_frame, count, dtype=int):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(frame_index))
            ok, frame = cap.read()
            if ok:
                small = cv2.resize(frame, (320, 180))
                frames.append(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
        if len(frames) < 2:
            return 0.0
        magnitudes = []
        for index in range(len(frames) - 1):
            flow = cv2.calcOpticalFlowFarneback(
                frames[index],
                frames[index + 1],
                None,
                pyr_scale=0.5,
                levels=3,
                winsize=15,
                iterations=3,
                poly_n=5,
                poly_sigma=1.2,
                flags=0,
            )
            mag, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
            magnitudes.append(float(np.mean(mag)))
        return float(np.mean(magnitudes)) if magnitudes else 0.0
    finally:
        cap.release()


def compute_overall_grade(metrics: dict) -> str:
    if metrics.get("blur_score", 100.0) < BLUR_SEVERE_THRESHOLD:
        return "废片"
    issue_count = len(metrics.get("issues", []))
    if issue_count == 0:
        return "精选"
    if issue_count == 1:
        return "可用"
    if issue_count <= 3:
        return "备选"
    return "废片"


def _issue_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _is_close_up_shot_type(value: object) -> bool:
    normalized = str(value or "").strip().lower()
    return normalized in CLOSE_UP_SHOT_TYPES


def _is_focus_issue(issue: str) -> bool:
    return any(keyword in issue for keyword in FOCUS_ISSUE_KEYWORDS)


def contextualize_quality_for_shot_type(quality: dict, shot_type: object) -> dict:
    if not _is_close_up_shot_type(shot_type):
        return quality

    issues = _issue_list(quality.get("issues"))
    if str(quality.get("grade") or "").strip() != "废片" or not issues:
        return quality
    if any(not _is_focus_issue(issue) for issue in issues):
        return quality

    return {
        **quality,
        "grade": "可用",
        "issues": [TOLERATED_CLOSE_UP_BLUR_ISSUE],
        "close_up_blur_tolerated": True,
        "focus_context": TOLERATED_CLOSE_UP_BLUR_CONTEXT,
    }


def analyze_keyframe_quality(
    keyframe_path: str | Path,
    video_path: str | Path | None = None,
    scene_start: float = 0.0,
    scene_end: float = 0.0,
) -> dict:
    metrics: dict = {
        "blur_score": 0.0,
        "is_blurry": False,
        "exposure": "normal",
        "is_over_exposed": False,
        "is_under_exposed": False,
        "brightness": 0.0,
        "is_too_dark": False,
        "noise_score": 0.0,
        "is_noisy": False,
        "composition_offset": 0.0,
        "is_off_composition": False,
        "shake_score": 0.0,
        "is_shaky": False,
        "grade": "可用",
        "issues": [],
    }
    path = Path(keyframe_path)
    if not path.exists():
        return {**metrics, "grade": "废片", "issues": ["关键帧文件不存在"]}
    frame = cv2.imread(str(path))
    if frame is None:
        return {**metrics, "grade": "废片", "issues": ["关键帧读取失败"]}

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blur = _blur_score(frame)
    exposure = _exposure_score(gray)
    brightness = float(np.mean(gray))
    noise = _noise_score(gray)
    composition = _composition_score(frame)
    shake = 0.0
    if video_path and Path(str(video_path)).exists() and scene_end > scene_start:
        shake = _shake_score(video_path, scene_start, scene_end)

    metrics.update(
        {
            "blur_score": round(blur, 2),
            "is_blurry": blur < BLUR_THRESHOLD,
            "exposure": exposure,
            "is_over_exposed": exposure == "overexposed",
            "is_under_exposed": exposure == "underexposed",
            "brightness": round(brightness, 2),
            "is_too_dark": brightness < BRIGHT_MIN,
            "noise_score": round(noise, 2),
            "is_noisy": noise > NOISE_THRESHOLD,
            "composition_offset": round(composition, 3),
            "is_off_composition": composition > COMPOSITION_THRESHOLD,
            "shake_score": round(shake, 2),
            "is_shaky": shake > SHAKE_THRESHOLD,
        }
    )

    issues: list[str] = []
    if metrics["blur_score"] < BLUR_SEVERE_THRESHOLD:
        issues.append("严重虚焦")
    elif metrics["is_blurry"]:
        issues.append("轻微虚焦")
    if metrics["is_over_exposed"]:
        issues.append("画面过曝")
    if metrics["is_under_exposed"]:
        issues.append("画面欠曝")
    if metrics["is_too_dark"]:
        issues.append("画面过暗")
    if metrics["is_noisy"]:
        issues.append("噪点较多")
    if metrics["is_off_composition"]:
        issues.append("构图偏心")
    if metrics["is_shaky"]:
        issues.append("画面抖动")

    metrics["issues"] = issues
    metrics["grade"] = compute_overall_grade(metrics)
    return metrics
