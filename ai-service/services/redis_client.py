"""Async Redis client for ai-service.

Provides connection lifecycle management and helper functions
for the file processing idempotency / blocking-lock keys.
"""

from __future__ import annotations

import logging

import redis.asyncio as aioredis

from config import settings

logger = logging.getLogger(__name__)

_client: aioredis.Redis | None = None


async def connect() -> None:
    global _client
    _client = aioredis.from_url(settings.redis_url, decode_responses=True)
    await _client.ping()
    logger.info("Redis connected: %s", settings.redis_url)


async def disconnect() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
        logger.info("Redis disconnected")


def get_client() -> aioredis.Redis:
    if _client is None:
        raise RuntimeError("Redis not connected — call connect() first")
    return _client
