from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analysis, export, health, jobs, media, projects, script_edit, settings, subtitles, voice, whisper
from app.core.config import ensure_storage_dirs


def create_app() -> FastAPI:
    ensure_storage_dirs()
    app = FastAPI(title="Video Pilot Backend", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):3000",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Accept-Ranges", "Content-Range", "Content-Length"],
    )
    app.include_router(analysis.router)
    app.include_router(export.router)
    app.include_router(health.router)
    app.include_router(jobs.router)
    app.include_router(media.router)
    app.include_router(projects.router)
    app.include_router(script_edit.router)
    app.include_router(settings.router)
    app.include_router(subtitles.router)
    app.include_router(voice.router)
    app.include_router(whisper.router)
    return app


app = create_app()
