import json

import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from api.config import settings

ws_router = APIRouter()
_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url)
    return _redis


@ws_router.websocket("/ws/{task_id}")
async def task_stream(websocket: WebSocket, task_id: str):
    """Stream agent spans to the frontend in real time via Redis pub/sub."""
    await websocket.accept()
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(f"spans:{task_id}")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                span = json.loads(message["data"])
                await websocket.send_json(span)
                if span.get("agent_name") == "FINISH":
                    break
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"spans:{task_id}")
        await pubsub.aclose()
