import json
from pathlib import Path

from app.schemas.analysis import AnalysisResults
from app.services.analysis_merge import legacy_scene_count, merge_legacy_summaries
from app.services.project_manifest import open_project


def load_project_analysis(folder_path: str) -> AnalysisResults:
    project = open_project(folder_path)
    analysis = dict(project.analysis)
    summaries: list[dict] = []
    legacy_summary_path = Path(project.folderPath) / "output" / "summary.json"

    try:
        with legacy_summary_path.open(encoding="utf-8") as summary_file:
            summaries.append(json.load(summary_file))
    except FileNotFoundError:
        pass

    analysis_folder = Path(project.folderPath) / "analysis"
    if analysis_folder.exists():
        for summary_path in sorted(
            analysis_folder.glob("*.json"),
            key=lambda path: path.stat().st_mtime,
        ):
            try:
                summaries.append(json.loads(summary_path.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError):
                continue

    manifest_summary = analysis.get("legacySummary")
    if isinstance(manifest_summary, dict):
        summaries.append(manifest_summary)

    merged_summary = merge_legacy_summaries(*summaries)
    analysis["legacySummary"] = merged_summary
    if merged_summary is not None:
        analysis["sceneCount"] = legacy_scene_count(merged_summary)

    return AnalysisResults.model_validate(analysis)
