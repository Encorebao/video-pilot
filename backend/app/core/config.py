from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
STORAGE_DIR = BACKEND_ROOT / "storage"
APP_DB_PATH = STORAGE_DIR / "app.db"
PROJECT_MANIFEST_NAME = "video-pilot.project.json"
LEGACY_PROJECT_MANIFEST_NAME = "video-studio.project.json"
WHISPER_MODELS_DIR = BACKEND_ROOT / "models"


def ensure_storage_dirs() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    WHISPER_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    (STORAGE_DIR / "temp").mkdir(parents=True, exist_ok=True)
    (STORAGE_DIR / "logs").mkdir(parents=True, exist_ok=True)
