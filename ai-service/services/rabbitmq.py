"""RabbitMQ consumer infrastructure for ai-service.

Provides:
- connect / disconnect lifecycle tied to FastAPI lifespan
- Full topology declaration: ai_exchange, file_convert_queue, DLX, DLQ
- start_file_convert_consumer() to consume file conversion tasks with manual ACK
"""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable

import aio_pika
from aio_pika.abc import AbstractIncomingMessage

from config import settings

logger = logging.getLogger(__name__)

# module-level state
_connection: aio_pika.abc.AbstractRobustConnection | None = None
_channel: aio_pika.abc.AbstractChannel | None = None


async def connect(max_retries: int = 5, retry_delay: float = 3.0) -> None:
    """Establish a robust connection to RabbitMQ with retries and declare topology."""
    global _connection, _channel

    for attempt in range(1, max_retries + 1):
        try:
            _connection = await aio_pika.connect_robust(settings.rabbitmq_url)
            _channel = await _connection.channel()
            await _channel.set_qos(prefetch_count=1)

            # 声明完整拓扑
            await _declare_topology()

            logger.info("rabbitmq connected and topology declared")
            return
        except Exception:
            if attempt == max_retries:
                raise
            logger.warning(
                "rabbitmq connect attempt %d/%d failed, retrying in %.1fs …",
                attempt,
                max_retries,
                retry_delay,
            )
            await asyncio.sleep(retry_delay)


async def _declare_topology() -> None:
    """Declare exchanges, queues, and bindings (idempotent).

    Topology:
        ai_exchange (topic)
        ├── ai.file.convert  →  file_convert_queue
        └── (dead letter)    →  ai_dlx_exchange (fanout) → file_convert_dlq
    """
    assert _channel is not None

    # 1. 主 exchange（topic），Go 后端也会声明，双方幂等
    ai_exchange = await _channel.declare_exchange(
        "ai_exchange", aio_pika.ExchangeType.TOPIC, durable=True,
    )

    # 2. Dead-letter exchange（fanout）
    dlx_exchange = await _channel.declare_exchange(
        "ai_dlx_exchange", aio_pika.ExchangeType.FANOUT, durable=True,
    )

    # 3. Dead-letter queue
    dlq = await _channel.declare_queue("file_convert_dlq", durable=True)
    await dlq.bind(dlx_exchange)

    # 4. 文件转换队列，reject / 过期的消息进入 DLQ
    file_convert_queue = await _channel.declare_queue(
        "file_convert_queue",
        durable=True,
        arguments={
            "x-dead-letter-exchange": "ai_dlx_exchange",
        },
    )
    await file_convert_queue.bind(ai_exchange, routing_key="ai.file.convert")

    logger.info("topology declared: ai_exchange, file_convert_queue, DLX, DLQ")


async def disconnect() -> None:
    """Gracefully close channel and connection."""
    global _connection, _channel
    if _channel and not _channel.is_closed:
        await _channel.close()
    if _connection and not _connection.is_closed:
        await _connection.close()
    _channel = None
    _connection = None
    logger.info("rabbitmq disconnected")


async def start_file_convert_consumer(
    callback: Callable[[AbstractIncomingMessage], Awaitable[None]],
) -> None:
    """Start consuming file_convert_queue with manual ACK.

    The *callback* receives an ``AbstractIncomingMessage``. It must:
    - ``await message.ack()`` on success
    - ``await message.reject(requeue=False)`` on permanent failure (routes to DLQ)
    """
    if _channel is None:
        raise RuntimeError("rabbitmq not connected — call connect() first")

    # 获取已声明的队列（幂等，passive=False 即 declare_queue 是幂等的）
    queue = await _channel.declare_queue(
        "file_convert_queue",
        durable=True,
        arguments={
            "x-dead-letter-exchange": "ai_dlx_exchange",
        },
    )
    await queue.consume(callback, no_ack=False)
    logger.info("consuming file_convert_queue (manual ACK, prefetch=1)")
