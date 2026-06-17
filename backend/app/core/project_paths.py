from pathlib import Path

from app.core.config import LEGACY_PROJECT_MANIFEST_NAME, PROJECT_MANIFEST_NAME

PROJECT_SUBDIRS = ("media", "frames", "audio", "captions", "analysis", "exports", "cache")


def normalize_project_folder(folder_path: str) -> Path:
    folder = Path(folder_path).expanduser().resolve()
    if not folder.exists():
        raise FileNotFoundError(f"Project folder does not exist: {folder}")
    if not folder.is_dir():
        raise NotADirectoryError(f"Project path is not a folder: {folder}")
    return folder


def manifest_path(project_folder: Path) -> Path:
    return project_folder / PROJECT_MANIFEST_NAME


def existing_manifest_path(project_folder: Path) -> Path:
    current_path = manifest_path(project_folder)
    if current_path.exists():
        return current_path
    legacy_path = project_folder / LEGACY_PROJECT_MANIFEST_NAME
    if legacy_path.exists():
        return legacy_path
    return current_path


def ensure_project_subdirs(project_folder: Path) -> None:
    for name in PROJECT_SUBDIRS:
        path = project_folder / name
        if path.exists() and not path.is_dir():
            raise ValueError(f"Project path exists and is not a directory: {path}")
        path.mkdir(parents=True, exist_ok=True)
