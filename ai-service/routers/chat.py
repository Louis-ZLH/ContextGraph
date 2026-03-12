from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from starlette.requests import Request

from models.schemas import (
    ContentBlock,
    GenerateSummaryRequest,
    GenerateSummaryResponse,
    GenerateTitleRequest,
    GenerateTitleResponse,
    StreamChatRequest,
)
from services import llm
from services.llm import TokenUsage, ToolCallEvent
from services.tool_executor import ImagePartialEvent, ResourceCreatedEvent, ToolContext

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])


def _content_block_to_dict(block: ContentBlock) -> dict:
    """Convert a ContentBlock pydantic model to a plain dict."""
    d: dict = {"type": block.type}
    if block.type == "text":
        d["text"] = block.text
    elif block.type == "image_url" and block.image_url:
        d["image_url"] = {"url": block.image_url.url}
    return d


@router.post("/generate-title", response_model=GenerateTitleResponse)
async def generate_title(req: GenerateTitleRequest):
    """Generate a conversation title from the full message context.
    Called by Go backend during SendMessage (parallel with StreamChat).
    """
    messages = []
    for m in req.messages:
        if isinstance(m.content, str):
            messages.append({"role": m.role, "content": m.content})
        else:
            blocks = [_content_block_to_dict(b) for b in m.content]
            messages.append({"role": m.role, "content": blocks})
    try:
        title = await llm.generate_title(messages)
        return GenerateTitleResponse(title=title)
    except Exception as e:
        logger.exception("Failed to generate title")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-summary", response_model=GenerateSummaryResponse)
async def generate_summary(req: GenerateSummaryRequest):
    """Generate a conversation summary from message history.
    Called by Go backend for message-level and node-level summary generation.
    """
    messages = []
    for m in req.messages:
        if isinstance(m.content, str):
            messages.append({"role": m.role, "content": m.content})
        else:
            blocks = [_content_block_to_dict(b) for b in m.content]
            messages.append({"role": m.role, "content": blocks})

    try:
        summary = await llm.generate_summary(messages, req.previous_summary, req.summary_type)
        return GenerateSummaryResponse(summary=summary)
    except Exception as e:
        logger.exception("Failed to generate summary")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/completions")
async def stream_chat(request: Request, req: StreamChatRequest):
    """Stream chat completion tokens via SSE.
    Called by Go backend during POST /api/chat/messages and /api/chat/retry/message.

    Go backend is responsible for:
    - Building the message thread (traversing parent_id chain)
    - Saving messages to DB
    - Forwarding SSE events to the frontend

    This endpoint only handles LLM interaction.

    SSE events:
    - data: {"type": "token", "content": "..."} for each token
    - data: {"type": "complete"} when done
    - data: {"type": "error", "message": "..."} on failure
    """
    messages = []
    for m in req.messages:
        if isinstance(m.content, str):
            messages.append({"role": m.role, "content": m.content})
        else:
            blocks = [_content_block_to_dict(b) for b in m.content]
            messages.append({"role": m.role, "content": blocks})

    # Construct tool_context
    tool_context = None
    if req.tool_context:
        tool_context = ToolContext(
            user_id=req.tool_context.user_id,
            canvas_id=req.tool_context.canvas_id,
            chat_node_id=req.tool_context.chat_node_id,
            message_id=req.tool_context.message_id,
        )

    async def _monitor_disconnect():
        """Background coroutine: poll client connection status every second,
        set cancelled flag on disconnect."""
        while tool_context and not tool_context.cancelled:
            if await request.is_disconnected():
                tool_context.cancelled = True
                logger.info("Client disconnected, setting cancelled flag")
                return
            await asyncio.sleep(1)

    async def event_generator():
        # Start disconnect monitor only when tool_context exists
        watcher = None
        if tool_context:
            watcher = asyncio.create_task(_monitor_disconnect())
        try:
            usage: TokenUsage | None = None
            async for item in llm.stream_chat(messages, req.model, tool_context):
                if isinstance(item, ImagePartialEvent):
                    yield {
                        "data": json.dumps({
                            "type": "image_partial",
                            "data": {
                                "b64_image": item.b64_image,
                                "partial_index": item.partial_index,
                                "chat_node_id": item.chat_node_id,
                                "message_id": item.message_id,
                            },
                        }),
                    }
                elif isinstance(item, ResourceCreatedEvent):
                    yield {
                        "data": json.dumps({
                            "type": "resource_created",
                            "data": {
                                "file_id": item.file_id,
                                "node_id": item.node_id,
                                "edge_id": item.edge_id,
                                "filename": item.filename,
                                "content_type": item.content_type,
                                "chat_node_id": item.chat_node_id,
                                "message_id": item.message_id,
                                "position": item.position,
                                "file_url": item.file_url,
                            },
                        }),
                    }
                elif isinstance(item, TokenUsage):
                    usage = item
                elif isinstance(item, ToolCallEvent):
                    yield {
                        "data": json.dumps({"type": "tool_call", "content": item.content}),
                    }
                else:
                    yield {
                        "data": json.dumps({"type": "token", "content": item}),
                    }
            complete_event: dict = {"type": "complete"}
            if usage:
                complete_event["prompt_tokens"] = usage.prompt_tokens
                complete_event["completion_tokens"] = usage.completion_tokens
            yield {"data": json.dumps(complete_event)}
        except Exception as e:
            logger.exception("Stream chat error")
            yield {"data": json.dumps({"type": "error", "message": str(e)})}
        finally:
            if watcher:
                watcher.cancel()

    return EventSourceResponse(event_generator())
