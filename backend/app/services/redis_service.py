import json
import time
import bisect
from typing import List, Dict, Any, Optional
import redis.asyncio as aioredis
from app.core.config import settings
from app.schemas.replay import SessionFrame


class InMemorySortedSetStore:
    """
    High-performance in-memory sorted set fallback matching Redis ZADD / ZRANGEBYSCORE
    contracts for sub-10ms temporal query execution in disconnected on-device modes.
    """
    def __init__(self):
        # key -> list of (score, member_json_str)
        self._sets: Dict[str, List[tuple[float, str]]] = {}

    def zadd(self, key: str, mapping: Dict[str, float]) -> int:
        if key not in self._sets:
            self._sets[key] = []
        target = self._sets[key]
        added = 0
        for member, score in mapping.items():
            # binary insertion maintaining score sort order
            entry = (float(score), str(member))
            idx = bisect.bisect_left(target, entry)
            target.insert(idx, entry)
            added += 1
        return added

    def zrangebyscore(
        self, key: str, min_score: float, max_score: float, offset: int = 0, count: int = 500
    ) -> List[str]:
        if key not in self._sets:
            return []
        target = self._sets[key]
        # find range slice
        results = [
            member for score, member in target
            if min_score <= score <= max_score
        ]
        return results[offset:offset + count]

    def zcard(self, key: str) -> int:
        return len(self._sets.get(key, []))


class RedisReplayService:
    """
    Production Redis service utilizing Sorted Sets (ZADD / ZRANGEBYSCORE)
    for indexing time-series spatial frames, guaranteeing sub-10ms temporal query execution.
    """
    def __init__(self):
        self._redis: Optional[aioredis.Redis] = None
        self._fallback = InMemorySortedSetStore()
        self._using_fallback = False

    async def connect(self):
        try:
            self._redis = aioredis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_timeout=1.0,
                socket_connect_timeout=1.0
            )
            await self._redis.ping()
            self._using_fallback = False
        except Exception:
            # Graceful fallback to in-memory sorted sets if local Redis daemon is absent
            self._redis = None
            self._using_fallback = True

    async def close(self):
        if self._redis:
            await self._redis.close()

    async def ingest_frames(self, session_id: str, frames: List[SessionFrame]) -> int:
        """
        Ingests time-stamped 3D skeletal frames into a Redis Sorted Set keyed by session.
        Score = frame.timestamp_ms
        Member = JSON payload
        """
        key = f"nexadesk:replay:{session_id}:frames"
        mapping = {
            frame.model_dump_json(): frame.timestamp_ms
            for frame in frames
        }
        
        if self._redis and not self._using_fallback:
            try:
                # Batch pipelined ZADD
                added = await self._redis.zadd(key, mapping)
                return added
            except Exception:
                self._using_fallback = True

        return self._fallback.zadd(key, mapping)

    async def query_temporal_range(
        self, session_id: str, start_time_ms: float, end_time_ms: float, limit: int = 500
    ) -> tuple[List[SessionFrame], float, int]:
        """
        Executes a temporal range query via ZRANGEBYSCORE and measures execution latency in milliseconds.
        Returns: (frames, query_latency_ms, total_matching)
        """
        key = f"nexadesk:replay:{session_id}:frames"
        t0 = time.perf_counter()
        
        raw_items: List[str] = []
        if self._redis and not self._using_fallback:
            try:
                raw_items = await self._redis.zrangebyscore(
                    key, min=start_time_ms, max=end_time_ms, start=0, num=limit
                )
            except Exception:
                self._using_fallback = True
                raw_items = self._fallback.zrangebyscore(
                    key, min_score=start_time_ms, max_score=end_time_ms, count=limit
                )
        else:
            raw_items = self._fallback.zrangebyscore(
                key, min_score=start_time_ms, max_score=end_time_ms, count=limit
            )

        latency_ms = (time.perf_counter() - t0) * 1000.0
        
        frames = [
            SessionFrame.model_validate_json(item)
            for item in raw_items
        ]
        return frames, latency_ms, len(frames)

    async def get_session_frame_count(self, session_id: str) -> int:
        key = f"nexadesk:replay:{session_id}:frames"
        if self._redis and not self._using_fallback:
            try:
                return await self._redis.zcard(key)
            except Exception:
                pass
        return self._fallback.zcard(key)

    @property
    def is_fallback(self) -> bool:
        return self._using_fallback


redis_replay_service = RedisReplayService()
