import time
from fastapi import APIRouter
from app.core.config import settings
from app.services.redis_service import redis_replay_service

router = APIRouter()

START_TIME = time.time()

@router.get("/health", summary="Distributed health and telemetry probe")
async def get_health():
    uptime_sec = round(time.time() - START_TIME, 2)
    return {
        "status": "operational",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "uptime_seconds": uptime_sec,
        "redis": {
            "mode": "in_memory_fallback" if redis_replay_service.is_fallback else "distributed_redis_7",
            "connected": True
        }
    }
