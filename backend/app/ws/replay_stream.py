import json
import asyncio
from typing import Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

ws_router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: str):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

@ws_router.websocket("/ws/replay")
async def websocket_replay_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial handshake
        await websocket.send_text(json.dumps({
            "type": "HANDSHAKE_ACK",
            "status": "connected",
            "service": "NexaDesk WebSocket Replay Hub",
            "active_clients": len(manager.active_connections)
        }))
        
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                # Echo and broadcast spatial frame telemetry to all subscribers
                await manager.broadcast(json.dumps({
                    "type": "SPATIAL_TELEMETRY_BROADCAST",
                    "payload": payload
                }))
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"error": "Malformed JSON"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
