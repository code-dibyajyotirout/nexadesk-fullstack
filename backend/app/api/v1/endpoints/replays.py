from fastapi import APIRouter, HTTPException, Query
from app.schemas.replay import (
    SessionReplayCreate,
    SessionReplayResponse,
    SessionFrame,
)
from app.services.redis_service import redis_replay_service

router = APIRouter()


@router.post("/replays", summary="Ingest time-stamped 3D skeletal frames into Redis Sorted Set")
async def ingest_replay(payload: SessionReplayCreate):
    if not payload.frames:
        raise HTTPException(status_code=400, detail="Replay must contain at least 1 frame")
        
    added = await redis_replay_service.ingest_frames(payload.session_id, payload.frames)
    return {
        "status": "ingested",
        "session_id": payload.session_id,
        "frames_stored": added,
        "storage_engine": "Redis 7 Sorted Sets (ZADD)" if not redis_replay_service.is_fallback else "InMemory SortedSet Store",
    }


@router.get("/replays/{session_id}", response_model=SessionReplayResponse, summary="Query temporal frame range (Sub-10ms Sorted Set benchmark)")
async def get_replay_range(
    session_id: str,
    start_ms: float = Query(0.0, description="Start time filter in epoch milliseconds"),
    end_ms: float = Query(float("inf"), description="End time filter in epoch milliseconds"),
    limit: int = Query(500, le=5000, description="Max frame count to retrieve"),
):
    frames, latency_ms, total = await redis_replay_service.query_temporal_range(
        session_id=session_id,
        start_time_ms=start_ms,
        end_time_ms=end_ms,
        limit=limit,
    )
    
    return SessionReplayResponse(
        session_id=session_id,
        total_frames=total,
        query_latency_ms=round(latency_ms, 3),
        frames=frames,
        start_time_ms=start_ms,
        end_time_ms=end_ms,
    )
