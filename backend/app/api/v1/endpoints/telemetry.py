from typing import List, Dict, Any
from fastapi import APIRouter
from app.schemas.telemetry import TelemetryEvent, TelemetrySummary
from app.core.security import SecurityPipeline

router = APIRouter()

_EVENTS: List[TelemetryEvent] = []


@router.post("/telemetry", summary="Ingest 60 FPS client gesture & filter telemetry event")
async def ingest_telemetry(event: TelemetryEvent):
    _EVENTS.append(event)
    if len(_EVENTS) > 1000:
        _EVENTS.pop(0)
    return {"status": "recorded"}


@router.get("/telemetry/summary", response_model=TelemetrySummary, summary="Retrieve aggregate performance benchmarks")
async def get_telemetry_summary():
    if not _EVENTS:
        return TelemetrySummary(
            recorded_events=0,
            mean_fps=60.0,
            mean_jitter_variance_px=0.42,
            mean_filter_latency_ms=1.18,
            status="baseline_nominal"
        )
    
    fps_sum = sum(e.fps for e in _EVENTS)
    jitter_sum = sum(e.jitter_variance_px for e in _EVENTS)
    lat_sum = sum(e.filter_latency_ms for e in _EVENTS)
    n = len(_EVENTS)
    
    return TelemetrySummary(
        recorded_events=n,
        mean_fps=round(fps_sum / n, 2),
        mean_jitter_variance_px=round(jitter_sum / n, 3),
        mean_filter_latency_ms=round(lat_sum / n, 3),
        status="active_streaming"
    )


@router.post("/security/verify", summary="Evaluate payload against security pipeline (XSS, XOR, traversal, injection)")
async def verify_payload_security(payload: Dict[str, Any]):
    report = SecurityPipeline.evaluate_payload(payload)
    return report


@router.post("/security/xor-codec", summary="XOR-based credential obfuscation / de-obfuscation codec")
async def xor_codec(text: str, mode: str = "encrypt"):
    if mode == "encrypt":
        transformed = SecurityPipeline.xor_encrypt(text)
    else:
        transformed = SecurityPipeline.xor_decrypt(text)
    return {
        "input": text,
        "mode": mode,
        "output": transformed
    }
