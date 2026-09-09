import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.redis_service import redis_replay_service


@pytest.fixture(autouse=True)
async def setup_redis():
    await redis_replay_service.connect()
    yield
    await redis_replay_service.close()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
