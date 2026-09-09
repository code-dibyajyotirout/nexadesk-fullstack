import uuid
from datetime import datetime, timezone
from typing import List, Dict
from fastapi import APIRouter, HTTPException, status
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceFileCreate,
    WorkspaceFileResponse,
)
from app.core.security import SecurityPipeline

router = APIRouter()

# In-memory backing store for workspaces and files (mirrors PostgreSQL persistence)
_WORKSPACES_DB: Dict[str, dict] = {}
_FILES_DB: Dict[str, dict] = {}

def _init_default_workspaces():
    if not _WORKSPACES_DB:
        ws_id = "ws-default-prod"
        now = datetime.now(timezone.utc)
        _WORKSPACES_DB[ws_id] = {
            "id": ws_id,
            "user_id": "recruiter-demo",
            "title": "NexaDesk Spatial IDE Production Workspace",
            "description": "Pre-configured spatial development sandbox with live components",
            "layout": "cascade",
            "created_at": now,
            "updated_at": now,
        }
        
        default_files = [
            ("page.tsx", "src/app/page.tsx", "import React from 'react';\n\nexport default function Desktop() {\n  return <div>NexaDesk Shell 60 FPS</div>;\n}", "typescript"),
            ("globals.css", "src/styles/globals.css", ":root { --glass-bg: rgba(10, 16, 26, 0.75); }", "css"),
            ("api.py", "backend/api.py", "from fastapi import FastAPI\napp = FastAPI()\n", "python"),
        ]
        
        for name, path, content, lang in default_files:
            fid = f"file-{uuid.uuid4().hex[:8]}"
            _FILES_DB[fid] = {
                "id": fid,
                "workspace_id": ws_id,
                "name": name,
                "path": path,
                "content": content,
                "language": lang,
                "size_bytes": len(content.encode("utf-8")),
                "created_at": now,
                "updated_at": now,
            }

_init_default_workspaces()


@router.get("/workspaces", response_model=List[WorkspaceResponse], summary="List all workspaces")
async def list_workspaces():
    results = []
    for ws_id, ws_data in _WORKSPACES_DB.items():
        ws_files = [
            WorkspaceFileResponse(**f)
            for f in _FILES_DB.values()
            if f["workspace_id"] == ws_id
        ]
        results.append(WorkspaceResponse(**ws_data, files=ws_files))
    return results


@router.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED, summary="Create a workspace")
async def create_workspace(payload: WorkspaceCreate):
    # Security sanitization
    clean_title = SecurityPipeline.sanitize_input_text(payload.title)
    if not clean_title:
        raise HTTPException(status_code=400, detail="Invalid workspace title")
        
    ws_id = f"ws-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)
    
    ws_data = {
        "id": ws_id,
        "user_id": "recruiter-demo",
        "title": clean_title,
        "description": SecurityPipeline.sanitize_input_text(payload.description or ""),
        "layout": payload.layout,
        "created_at": now,
        "updated_at": now,
    }
    _WORKSPACES_DB[ws_id] = ws_data
    
    created_files = []
    if payload.initial_files:
        for file_create in payload.initial_files:
            is_safe, clean_path = SecurityPipeline.sanitize_file_path(file_create.path)
            if not is_safe:
                continue
            fid = f"file-{uuid.uuid4().hex[:8]}"
            f_data = {
                "id": fid,
                "workspace_id": ws_id,
                "name": SecurityPipeline.sanitize_input_text(file_create.name),
                "path": clean_path,
                "content": file_create.content,
                "language": file_create.language,
                "size_bytes": len(file_create.content.encode("utf-8")),
                "created_at": now,
                "updated_at": now,
            }
            _FILES_DB[fid] = f_data
            created_files.append(WorkspaceFileResponse(**f_data))
            
    return WorkspaceResponse(**ws_data, files=created_files)


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceResponse, summary="Retrieve workspace details")
async def get_workspace(workspace_id: str):
    if workspace_id not in _WORKSPACES_DB:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    ws_data = _WORKSPACES_DB[workspace_id]
    ws_files = [
        WorkspaceFileResponse(**f)
        for f in _FILES_DB.values()
        if f["workspace_id"] == workspace_id
    ]
    return WorkspaceResponse(**ws_data, files=ws_files)


@router.post("/workspaces/{workspace_id}/files", response_model=WorkspaceFileResponse, status_code=status.HTTP_201_CREATED, summary="Create file inside workspace")
async def create_file(workspace_id: str, payload: WorkspaceFileCreate):
    if workspace_id not in _WORKSPACES_DB:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    is_safe, clean_path = SecurityPipeline.sanitize_file_path(payload.path)
    if not is_safe:
        raise HTTPException(status_code=400, detail="Path traversal or invalid path detected")
        
    fid = f"file-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)
    f_data = {
        "id": fid,
        "workspace_id": workspace_id,
        "name": SecurityPipeline.sanitize_input_text(payload.name),
        "path": clean_path,
        "content": payload.content,
        "language": payload.language,
        "size_bytes": len(payload.content.encode("utf-8")),
        "created_at": now,
        "updated_at": now,
    }
    _FILES_DB[fid] = f_data
    return WorkspaceFileResponse(**f_data)
