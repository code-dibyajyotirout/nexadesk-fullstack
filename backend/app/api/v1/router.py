from fastapi import APIRouter
from app.api.v1.endpoints import (
    health,
    workspaces,
    replays,
    ai,
    telemetry,
)

api_router = APIRouter()

api_router.include_router(health.router, tags=["Health & Status"])
api_router.include_router(workspaces.router, tags=["Workspaces & Virtual Filesystem"])
api_router.include_router(replays.router, tags=["Redis 7 Session Replay Sorted Sets"])
api_router.include_router(ai.router, tags=["AI Code Scaffolding"])
api_router.include_router(telemetry.router, tags=["Telemetry & Security Verification"])
