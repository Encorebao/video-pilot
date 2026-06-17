from __future__ import annotations

from pathlib import Path
import mimetypes
import re
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse

from app.repositories.app_state import remember_project
from app.schemas.media import DeleteMediaResponse, ImportMediaRequest, ImportMediaResponse
from app.services.analysis_adapter import load_project_analysis
from app.services.media_delete import delete_project_media
from app.services.media_import import import_media
from app.services.project_manifest import open_project

router = APIRouter(prefix="/api/media", tags=["media"])


@router.post("/import", response_model=ImportMediaResponse)
def import_media_endpoint(payload: ImportMediaRequest) -> ImportMediaResponse:
    try:
        media_items, project = import_media(
            payload.folderPath,
            payload.filePaths,
            payload.mode,
        )
        project = project.model_copy(
            update={"analysis": load_project_analysis(payload.folderPath).model_dump()}
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    remember_project(project)
    return ImportMediaResponse(mediaItems=media_items, project=project.model_dump())


@router.delete("/{media_id}", response_model=DeleteMediaResponse)
def delete_media_endpoint(
    media_id: str,
    folder_path: str = Query(alias="folderPath", min_length=1),
) -> DeleteMediaResponse:
    try:
        project_data, removed_project_file = delete_project_media(folder_path, media_id)
        project = open_project(folder_path)
        project = project.model_copy(
            update={"analysis": load_project_analysis(folder_path).model_dump()}
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    remember_project(project)
    return DeleteMediaResponse(
        deletedMediaId=media_id,
        removedProjectFile=removed_project_file,
        project=project_data | {"analysis": project.analysis},
    )


def _resolve_media_path(folder_path: str, media_id: str) -> Path:
    project = open_project(folder_path)
    project_folder = Path(project.folderPath).resolve()
    item = next((media for media in project.media if media.get("id") == media_id), None)
    if item is None:
        raise FileNotFoundError(f"Media item not found: {media_id}")

    if item.get("projectPath"):
        path = (project_folder / str(item["projectPath"])).resolve()
        if project_folder not in path.parents:
            raise ValueError("Invalid project media path")
    else:
        path = Path(str(item.get("originalPath", ""))).expanduser().resolve()

    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Media file not found: {path}")
    return path


def _resolve_media_path_without_exists_check(folder_path: str, media_id: str) -> Path:
    project = open_project(folder_path)
    project_folder = Path(project.folderPath).resolve()
    item = next((media for media in project.media if media.get("id") == media_id), None)
    if item is None:
        raise FileNotFoundError(f"Media item not found: {media_id}")

    if item.get("projectPath"):
        path = (project_folder / str(item["projectPath"])).resolve()
        if project_folder not in path.parents:
            raise ValueError("Invalid project media path")
        return path

    return Path(str(item.get("originalPath", ""))).expanduser().resolve()


def _resolve_project_file_path(folder_path: str, file_path: str) -> Path:
    project = open_project(folder_path)
    project_folder = Path(project.folderPath).resolve()
    raw_path = Path(file_path).expanduser()
    path = raw_path.resolve() if raw_path.is_absolute() else (project_folder / raw_path).resolve()

    if path != project_folder and project_folder not in path.parents:
        raise ValueError("Invalid project file path")
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Project file not found: {path}")
    return path


def _iter_file_range(path: Path, start: int, end: int, chunk_size: int = 1024 * 1024):
    with path.open("rb") as file:
        file.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = file.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


@router.get("/stream")
def stream_media_endpoint(
    folder_path: str = Query(alias="folderPath", min_length=1),
    media_id: str = Query(alias="mediaId", min_length=1),
    range_header: Optional[str] = Header(default=None, alias="Range"),
):
    try:
        path = _resolve_media_path(folder_path, media_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    file_size = path.stat().st_size
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
    }

    if range_header:
        match = re.match(r"bytes=(\d*)-(\d*)$", range_header.strip())
        if not match:
            raise HTTPException(status_code=416, detail="Invalid range header")
        start_text, end_text = match.groups()
        start = int(start_text) if start_text else 0
        end = int(end_text) if end_text else file_size - 1
        if start >= file_size or end < start:
            raise HTTPException(status_code=416, detail="Requested range not satisfiable")
        end = min(end, file_size - 1)
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        headers["Content-Length"] = str(end - start + 1)
        return StreamingResponse(
            _iter_file_range(path, start, end),
            status_code=206,
            media_type=content_type,
            headers=headers,
        )

    headers["Content-Length"] = str(file_size)
    return StreamingResponse(
        _iter_file_range(path, 0, max(file_size - 1, 0)),
        media_type=content_type,
        headers=headers,
    )


@router.get("/status")
def media_status_endpoint(
    folder_path: str = Query(alias="folderPath", min_length=1),
    media_id: str = Query(alias="mediaId", min_length=1),
) -> dict:
    try:
        path = _resolve_media_path_without_exists_check(folder_path, media_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "mediaId": media_id,
        "exists": path.exists() and path.is_file(),
    }


@router.get("/frame")
def stream_project_frame_endpoint(
    folder_path: str = Query(alias="folderPath", min_length=1),
    frame_path: str = Query(alias="framePath", min_length=1),
):
    try:
        path = _resolve_project_file_path(folder_path, frame_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NotADirectoryError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(
        path,
        media_type=content_type,
        headers={"Cache-Control": "no-store"},
    )
