from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime


class LandmarkPoint(BaseModel):
    x: float = Field(..., description="Normalized X coordinate in [0, 1]")
    y: float = Field(..., description="Normalized Y coordinate in [0, 1]")
    z: float = Field(default=0.0, description="Normalized depth coordinate Z")


class SessionFrame(BaseModel):
    timestamp_ms: float = Field(..., description="High-resolution epoch millisecond timestamp")
    gesture: str = Field(..., description="Classified gesture archetype")
    cursor_x: float = Field(..., description="Normalized cursor viewport X coordinate")
    cursor_y: float = Field(..., description="Normalized cursor viewport Y coordinate")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    landmarks: List[LandmarkPoint] = Field(default=[], description="21 MediaPipe skeletal hand landmarks")
    active_window_id: Optional[str] = None


class SessionReplayCreate(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=64)
    user_id: str = Field(default="anonymous_recruiter")
    frames: List[SessionFrame] = Field(..., min_length=1)
    metadata: Dict[str, Any] = Field(default={})


class SessionReplayQuery(BaseModel):
    session_id: str
    start_time_ms: float
    end_time_ms: float
    limit: int = Field(default=500, le=5000)


class SessionReplayResponse(BaseModel):
    session_id: str
    total_frames: int
    query_latency_ms: float
    frames: List[SessionFrame]
    start_time_ms: float
    end_time_ms: float
