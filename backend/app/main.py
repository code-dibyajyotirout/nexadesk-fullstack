from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.services.redis_service import redis_replay_service
from app.api.v1.router import api_router
from app.ws.replay_stream import ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: attempt connection to Redis (or activate graceful in-memory sorted set store)
    await redis_replay_service.connect()
    yield
    # Shutdown: cleanly close connections
    await redis_replay_service.close()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Production-grade distributed backend supporting sub-10ms Redis sorted set spatial queries, AI scaffolding, and WebSockets.",
    lifespan=lifespan,
)

# Cross-Origin Resource Sharing Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if settings.CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route Registrations
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(ws_router)


@app.get("/", summary="Root index")
async def root():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "operational",
        "docs_url": "/docs",
    }
