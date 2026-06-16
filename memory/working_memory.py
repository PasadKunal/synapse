"""
Redis-backed working memory — hot, fast, temporary.

Each key lives for 1 hour (TTL). Used to pass intermediate results
between agent nodes without bloating the LangGraph state object.
Also handles Redis pub/sub to stream agent spans to WebSocket clients.
"""

import json
from typing import Any

import redis.asyncio as aioredis
import structlog

from api.config import settings

log = structlog.get_logger()

TTL_SECONDS = 3600  # 1 hour


class WorkingMemory:
    def __init__(self):
        self._client: aioredis.Redis | None = None

    def _get_client(self) -> aioredis.Redis:
        if self._client is None:
            self._client = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._client

    async def set(self, task_id: str, key: str, value: Any) -> None:
        """Store any JSON-serialisable value under task_id:key for 1 hour."""
        full_key = f"wm:{task_id}:{key}"
        await self._get_client().setex(full_key, TTL_SECONDS, json.dumps(value))

    async def get(self, task_id: str, key: str) -> Any | None:
        """Retrieve a value. Returns None if expired or never set."""
        full_key = f"wm:{task_id}:{key}"
        raw = await self._get_client().get(full_key)
        return json.loads(raw) if raw is not None else None

    async def get_all(self, task_id: str) -> dict[str, Any]:
        """Return every key stored under a task as a dict."""
        client = self._get_client()
        keys = await client.keys(f"wm:{task_id}:*")
        if not keys:
            return {}
        values = await client.mget(*keys)
        return {
            k.split(":", 2)[2]: json.loads(v)
            for k, v in zip(keys, values)
            if v is not None
        }

    async def delete_task(self, task_id: str) -> None:
        """Clean up all keys for a task after it completes."""
        client = self._get_client()
        keys = await client.keys(f"wm:{task_id}:*")
        if keys:
            await client.delete(*keys)

    async def publish_span(self, task_id: str, span: dict) -> None:
        """
        Publish an agent span to Redis pub/sub.
        The WebSocket handler subscribes to this channel and forwards
        each span to the connected browser in real time.
        """
        await self._get_client().publish(f"spans:{task_id}", json.dumps(span))
        log.debug("span_published", task_id=task_id, agent=span.get("agent_name"))


# Singleton
working_memory = WorkingMemory()
