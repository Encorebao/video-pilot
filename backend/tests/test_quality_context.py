from app.services.job_worker import _normalize_segment_analysis


def test_close_up_quality_does_not_mark_shallow_depth_of_field_as_rejected():
    segment = _normalize_segment_analysis(
        {
            "visual": {"shot_type": "特写"},
            "quality": {"grade": "废片", "issues": ["严重虚焦"]},
        },
        segment_type="broll",
        transcript="",
        frame_quality={
            "grade": "废片",
            "issues": ["严重虚焦"],
            "blur_score": 12.0,
            "is_blurry": True,
        },
    )

    quality = segment["quality"]
    assert quality["grade"] == "可用"
    assert quality["issues"] == ["浅景深焦外虚化，需人工确认主体焦点"]
    assert quality["close_up_blur_tolerated"] is True
    assert quality["focus_context"] == "特写镜头允许焦外虚化，未单独作为废片依据"


def test_non_close_up_quality_keeps_severe_blur_rejected():
    segment = _normalize_segment_analysis(
        {
            "visual": {"shot_type": "中景"},
            "quality": {"grade": "废片", "issues": ["严重虚焦"]},
        },
        segment_type="broll",
        transcript="",
        frame_quality={
            "grade": "废片",
            "issues": ["严重虚焦"],
            "blur_score": 12.0,
            "is_blurry": True,
        },
    )

    assert segment["quality"]["grade"] == "废片"
    assert segment["quality"]["issues"] == ["严重虚焦"]
