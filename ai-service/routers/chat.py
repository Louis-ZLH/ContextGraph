from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

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
async def stream_chat(req: StreamChatRequest):
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

    async def event_generator():
        try:
            usage: TokenUsage | None = None
            async for item in llm.stream_chat(messages, req.model):
                if isinstance(item, TokenUsage):
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

    return EventSourceResponse(event_generator())
