from typing import Optional

from pydantic import BaseModel, Field, field_validator


class InitProjectRequest(BaseModel):
    folderPath: str = Field(min_length=1)
    name: str = Field(min_length=1)

    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Project name cannot be empty")
        return stripped


class OpenProjectRequest(BaseModel):
    folderPath: str = Field(min_length=1)


class SaveProjectRequest(BaseModel):
    folderPath: str = Field(min_length=1)
    project: dict


class ProjectManifest(BaseModel):
    id: str
    name: str
    version: str = "0.1.0"
    folderPath: str
    createdAt: str
    updatedAt: str
    media: list[dict] = Field(default_factory=list)
    timeline: dict = Field(default_factory=dict)
    timelines: list[dict] = Field(default_factory=list)
    activeTimelineId: Optional[str] = None
    analysis: dict = Field(default_factory=dict)
    sceneGroups: dict = Field(default_factory=dict)
    subtitles: dict = Field(default_factory=dict)
    scriptEdits: dict = Field(default_factory=dict)
    notes: str = ""
    importTasks: list[dict] = Field(default_factory=list)
    voiceProfiles: list[dict] = Field(default_factory=list)
    ttsJobs: list[dict] = Field(default_factory=list)


class ProjectResponse(BaseModel):
    project: ProjectManifest
