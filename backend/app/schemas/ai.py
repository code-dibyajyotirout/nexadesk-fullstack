from pydantic import BaseModel, Field
from typing import List, Dict, Optional


class GeneratedFile(BaseModel):
    path: str
    language: str
    content: str
    description: str


class AIScaffoldRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=4096)
    target_stack: str = Field(default="fastapi", description="'fastapi', 'mern', or 'nextjs'")
    workspace_name: Optional[str] = Field(default="generated-app")


class AIScaffoldResponse(BaseModel):
    scaffold_id: str
    target_stack: str
    title: str
    description: str
    files: List[GeneratedFile]
    architecture_overview: str
    generation_latency_ms: float
    security_verified: bool
