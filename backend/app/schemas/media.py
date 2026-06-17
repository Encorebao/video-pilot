from typing import Literal

from pydantic import BaseModel, Field

ImportMode = Literal["copied", "referenced"]


class ImportMediaRequest(BaseModel):
    folderPath: str = Field(min_length=1)
    filePaths: list[str] = Field(min_length=1)
    mode: ImportMode = "copied"


class ImportMediaResponse(BaseModel):
    mediaItems: list[dict]
    project: dict


class DeleteMediaResponse(BaseModel):
    deletedMediaId: str
    removedProjectFile: bool = False
    project: dict
