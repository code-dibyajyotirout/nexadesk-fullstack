from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
from datetime import datetime, timezone


class TelemetryEvent(BaseModel):
    client_id: str
    fps: float = Field(..., ge=0.0, le=240.0)
    jitter_variance_px: float = Field(..., ge=0.0)
    filter_latency_ms: float = Field(..., ge=0.0)
    active_windows_count: int = Field(default=0, ge=0)
    gesture_state: str = Field(default="IDLE")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    hardware_accelerated: bool = Field(default=True)
    extra: Dict[str, Any] = Field(default={})


class TelemetrySummary(BaseModel):
    recorded_events: int
    mean_fps: float
    mean_jitter_variance_px: float
    mean_filter_latency_ms: float
    status: str
