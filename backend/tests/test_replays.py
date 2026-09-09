import pytest
import time


@pytest.mark.asyncio
async def test_replays_sorted_set_sub_10ms(client):
    session_id = "test-session-perf-bench"
    
    # Generate 100 sample frames representing 60 FPS hand tracking
    frames = []
    base_time = 1700000000000.0
    for i in range(100):
        t = base_time + (i * 16.66)
        frames.append({
            "timestamp_ms": t,
            "gesture": "PINCH_CLICK" if i % 20 == 0 else "HOVER",
            "cursor_x": 0.5 + (i * 0.001),
            "cursor_y": 0.4 + (i * 0.001),
            "confidence": 0.98,
            "landmarks": [
                {"x": 0.5, "y": 0.5, "z": 0.0},
                {"x": 0.51, "y": 0.48, "z": -0.01}
            ],
            "active_window_id": "win-ide" if i > 50 else None
        })
        
    ingest_payload = {
        "session_id": session_id,
        "user_id": "recruiter-test",
        "frames": frames,
        "metadata": {"test_run": True}
    }
    
    # 1. Ingest frames into Redis Sorted Set
    ingest_res = await client.post("/api/v1/replays", json=ingest_payload)
    assert ingest_res.status_code == 200
    assert ingest_res.json()["frames_stored"] == 100
    
    # 2. Query temporal range (e.g., frames between t_20 and t_80)
    query_start = base_time + (20 * 16.66)
    query_end = base_time + (80 * 16.66)
    
    t0 = time.perf_counter()
    query_res = await client.get(
        f"/api/v1/replays/{session_id}?start_ms={query_start}&end_ms={query_end}&limit=200"
    )
    http_total_ms = (time.perf_counter() - t0) * 1000.0
    
    assert query_res.status_code == 200
    data = query_res.json()
    assert data["session_id"] == session_id
    assert len(data["frames"]) > 0
    assert data["total_frames"] == len(data["frames"])
    
    # Assert sub-10ms sorted set query latency measured at service level
    service_query_latency_ms = data["query_latency_ms"]
    assert service_query_latency_ms < 10.0, f"Query latency exceeded 10ms target: {service_query_latency_ms}ms"
