from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class AnalysisResults(BaseModel):
    overallSummary: str = ""
    sceneCount: int = 0
    transcriptCount: int = 0
    detectedFillerWordCount: int = 0
    keyframes: list[dict] = Field(default_factory=list)
    transcriptSegments: list[dict] = Field(default_factory=list)
    editSuggestions: list[dict] = Field(default_factory=list)
    keywordDictionary: list[str] = Field(default_factory=list)
    legacySummary: Optional[Dict[str, Any]] = None
