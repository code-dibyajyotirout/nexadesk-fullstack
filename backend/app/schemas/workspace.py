from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime


class WorkspaceFileBase(BaseModel):
    name: str = Field(..., description="File name including extension")
    path: str = Field(..., description="Normalized relative path")
    content: str = Field(default="", description="Text content of the file")
    language: str = Field(default="typescript", description="Language identifier for syntax highlighting")


class WorkspaceFileCreate(WorkspaceFileBase):
    pass


class WorkspaceFileResponse(WorkspaceFileBase):
    id: str
    workspace_id: str
    size_bytes: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkspaceBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = Field(default="", max_length=512)
    layout: str = Field(default="cascade", description="Default window arrangement strategy")


class WorkspaceCreate(WorkspaceBase):
    initial_files: Optional[List[WorkspaceFileCreate]] = []


class WorkspaceResponse(WorkspaceBase):
    id: str
    user_id: str
    files: List[WorkspaceFileResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
