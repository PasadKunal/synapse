import time

import redis.asyncio as aioredis
from fastapi import HTTPException, Request, status

from api.config import settings


class TokenBucketLimiter:
    """Per-user, per-provider token-bucket rate limiter backed by Redis."""

    def __init__(self, redis_url: str):
        self.redis = aioredis.from_url(redis_url, decode_responses=True)
        self.rate = settings.rate_limit_per_second
        self.capacity = settings.rate_limit_capacity

    async def check(self, user_id: str, scope: str = "api") -> None:
        key = f"ratelimit:{scope}:{user_id}"
        now = time.time()

        bucket = await self.redis.hgetall(key)
        if bucket:
            elapsed = now - float(bucket["last_check"])
            tokens = min(self.capacity, float(bucket["tokens"]) + elapsed * self.rate)
        else:
            tokens = float(self.capacity)

        if tokens < 1:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please slow down.",
            )

        await self.redis.hset(key, mapping={"tokens": tokens - 1, "last_check": now})
        await self.redis.expire(key, 3600)


_limiter: TokenBucketLimiter | None = None


def get_limiter() -> TokenBucketLimiter:
    global _limiter
    if _limiter is None:
        _limiter = TokenBucketLimiter(settings.redis_url)
    return _limiter


async def rate_limit_dependency(request: Request) -> None:
    """FastAPI dependency for routes that need rate limiting."""
    user_id = request.state.user_id if hasattr(request.state, "user_id") else request.client.host
    await get_limiter().check(user_id)
