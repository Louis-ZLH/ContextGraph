from __future__ import annotations

from pydantic import BaseModel


# --- Requests (from Go backend) ---


class GenerateTitleRequest(BaseModel):
    messages: list[ChatMessage]  # Full chatMessages (including multimodal content)


class ImageUrl(BaseModel):
    url: str  # "data:image/jpeg;base64,..."


class ContentBlock(BaseModel):
    type: str  # "text" | "image_url"
    text: str | None = None  # type=text
    image_url: ImageUrl | None = None  # type=image_url


class ChatMessage(BaseModel):
    role: str  # "system" | "user" | "assistant"
    content: str | list[ContentBlock]  # str for plain text, list for multimodal


class ToolContextSchema(BaseModel):
    user_id: int
    canvas_id: int   # Go sends as JSON integer (int64), backend internal communication — no string encoding
    chat_node_id: str
    message_id: str  # assistant message ID


class StreamChatRequest(BaseModel):
    messages: list[ChatMessage]  # Full message thread built by Go backend
    model: int = 0  # Model index 0-3
    tool_context: ToolContextSchema | None = None  # Optional, Go doesn't send in 15.1


class GenerateSummaryRequest(BaseModel):
    messages: list[ChatMessage]  # Raw conversation messages to summarize
    previous_summary: str | None = None  # Previous summary to extend (if any)
    summary_type: str = "message"  # "message" (message-level) | "node" (node-level)


# --- Responses ---


class GenerateTitleResponse(BaseModel):
    title: str


class GenerateSummaryResponse(BaseModel):
    summary: str
