from __future__ import annotations

import asyncio
import base64
import logging
import re
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from io import BytesIO
from typing import Union

import httpx
import openai
from nanoid import generate as nanoid
from PIL import Image

from config import settings
from services import minio_client


# ── Dataclasses and type aliases for tool results ───────────────


@dataclass
class ToolContext:
    """Execution context passed from Go backend, used by create_image/create_file."""
    user_id: int
    canvas_id: int
    chat_node_id: str
    message_id: str  # assistant message ID, used to associate image_partial / resource_created with specific message
    cancelled: bool = False  # set by SSE handler on client disconnect, used for cooperative cancellation


@dataclass
class ImagePartialEvent:
    """Streaming image generation partial preview (used by create_image)."""
    b64_image: str       # base64-encoded JPEG q80 (compressed from original PNG)
    partial_index: int   # partial number (0, 1, ...)
    chat_node_id: str    # associated ChatNode ID
    message_id: str      # associated assistant message ID


@dataclass
class ResourceCreatedEvent:
    """File registration completed (used by create_image / create_file)."""
    file_id: str        # int64 snowflake ID, Go returns as string, full chain uses string
    node_id: str
    edge_id: str
    filename: str
    content_type: str
    chat_node_id: str
    message_id: str     # associated assistant message ID
    position: dict  # {"x": float, "y": float}
    file_url: str       # file access URL for all file types (e.g. "/api/file/xxx")


@dataclass
class ImageGenUsage:
    """GPT Image API token usage, for cost tracking."""
    input_tokens: int
    output_tokens: int


ToolSideEvent = Union[ImagePartialEvent, ResourceCreatedEvent]
ToolResult = tuple[str, list[ToolSideEvent]]

logger = logging.getLogger(__name__)

_TOOL_TIMEOUT = 15.0  # seconds per tool execution
_SEARCH_MAX_RESULTS = 5
_SEARCH_SNIPPET_MAX_CHARS = 1000
_URL_READER_MAX_CHARS = 15000

_ALLOWED_EXTENSIONS = {".svg", ".md", ".csv", ".json", ".txt"}

_CONTENT_TYPE_MAP = {
    ".svg": "image/svg+xml",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".txt": "text/plain",
}


# ── Internal HTTP client (reusable connection pool) ─────────────

_internal_http_client: httpx.AsyncClient | None = None


def _get_internal_client() -> httpx.AsyncClient:
    global _internal_http_client
    if _internal_http_client is None:
        _internal_http_client = httpx.AsyncClient(
            base_url=settings.go_backend_internal_url,
            headers={"X-Internal-Token": settings.internal_token},
            timeout=15.0,
        )
    return _internal_http_client


async def shutdown_internal_client() -> None:
    """Gracefully close the internal HTTP connection pool. Called on FastAPI shutdown."""
    global _internal_http_client
    if _internal_http_client is not None:
        await _internal_http_client.aclose()
        _internal_http_client = None


# ── Helper functions ────────────────────────────────────────────


def _sanitize_filename(filename: str) -> str:
    """Remove path separators and special characters, prevent path injection.
    Preserves spaces and Unicode characters (Chinese, etc.) for readability.
    """
    # Keep only the filename part, strip all directory paths
    filename = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    # Remove illegal characters, keep letters, digits, underscore, hyphen, dot, space
    # Note: \w in Python matches Unicode characters (Chinese, Japanese, etc.) by default
    filename = re.sub(r'[^\w\-. ]', '_', filename)
    # Collapse consecutive spaces
    filename = re.sub(r' +', ' ', filename).strip()
    return filename or "unnamed"


def _guess_content_type(filename: str) -> str:
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _CONTENT_TYPE_MAP.get(ext, "application/octet-stream")


def _parse_register_error(e: httpx.HTTPStatusError) -> str:
    """Extract user-friendly error message from Go backend response."""
    if e.response.status_code == 429:
        return "Daily file generation limit reached (10/10). Please try again tomorrow."
    if e.response.status_code == 507:
        return "Storage quota exceeded (200MB). Please delete some files and try again."
    return "Failed to register file. Please try again."


def _compress_preview(b64_png: str, quality: int = 80) -> str:
    """PNG base64 -> JPEG q80 base64, used for partial image preview compression.
    Original PNG 1-4MB -> compressed ~200-400KB.
    """
    img = Image.open(BytesIO(base64.b64decode(b64_png)))
    buf = BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode()


async def _cleanup_minio_file_with_retry(minio_path: str, max_retries: int = 2) -> None:
    """Delete an orphan file from MinIO. Async with exponential backoff retry.
    Called via asyncio.create_task() fire-and-forget, does not block user response.
    """
    for attempt in range(max_retries + 1):
        try:
            await asyncio.to_thread(minio_client.delete_file, minio_path)
            logger.info(f"Cleaned up orphan file: {minio_path}")
            return
        except Exception as e:
            if attempt < max_retries:
                delay = 2 ** attempt  # 1s, 2s
                logger.warning(
                    f"Failed to cleanup orphan file {minio_path} "
                    f"(attempt {attempt + 1}/{max_retries + 1}), retrying in {delay}s: {e}"
                )
                await asyncio.sleep(delay)
            else:
                logger.warning(
                    f"Failed to cleanup orphan file {minio_path} "
                    f"after {max_retries + 1} attempts, giving up: {e}"
                )


async def _register_ai_file(
    user_id: int, canvas_id: int, chat_node_id: str, message_id: str,
    minio_path: str, filename: str, file_size: int, content_type: str,
) -> dict:
    """Call Go backend POST /api/internal/ai/file, returns {file_id, node_id, edge_id, position, file_url}."""
    client = _get_internal_client()
    resp = await client.post(
        "/api/internal/ai/file",
        json={
            "user_id": user_id,
            "canvas_id": canvas_id,
            "chat_node_id": chat_node_id,
            "message_id": message_id,
            "minio_path": minio_path,
            "filename": filename,
            "file_size": file_size,
            "content_type": content_type,
        },
    )
    resp.raise_for_status()
    return resp.json()["data"]


async def _stream_producer(stream, queue: asyncio.Queue):
    """Consume OpenAI image stream into a queue (runs as independent task).

    This task is NOT affected by parent task cancellation, so the OpenAI
    HTTP connection stays alive even after the user aborts.
    """
    try:
        async for event in stream:
            await queue.put(("event", event))
        await queue.put(("done", None))
    except Exception as e:
        await queue.put(("error", e))


async def _drain_queue_and_report_usage(
    queue: asyncio.Queue, producer: asyncio.Task, message_id: str
):
    """Wait for remaining stream events via queue and report image usage."""
    try:
        while True:
            msg_type, payload = await asyncio.wait_for(queue.get(), timeout=120)
            if msg_type == "done":
                break
            if msg_type == "error":
                logger.warning("Stream error while draining for message %s: %s", message_id, payload)
                break
            if msg_type == "event" and payload.type == "image_generation.completed" and payload.usage:
                await report_abort_usage(
                    message_id, payload.usage.input_tokens, payload.usage.output_tokens
                )
                producer.cancel()
                return
        logger.info("Drained queue for message %s but no completed event found", message_id)
    except asyncio.TimeoutError:
        logger.warning("Timed out (120s) waiting for stream to complete for message %s", message_id)
    except Exception as e:
        logger.warning("Failed to drain queue for message %s: %s", message_id, e)
    finally:
        if not producer.done():
            producer.cancel()


async def report_abort_usage(message_id: str, prompt_tokens: int, completion_tokens: int) -> bool:
    """Report token usage for an aborted image generation to Go backend.

    Calls PATCH /api/internal/messages/{message_id}/usage.
    Retries once after 1s on failure, then logs warning and returns False.
    """
    client = _get_internal_client()
    payload = {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens}

    for attempt in range(2):
        try:
            resp = await client.patch(
                f"/api/internal/messages/{message_id}/usage",
                json=payload,
            )
            resp.raise_for_status()
            logger.info(
                "Reported abort usage for message %s: prompt=%d, completion=%d",
                message_id, prompt_tokens, completion_tokens,
            )
            return True
        except Exception as e:
            if attempt == 0:
                logger.warning(
                    "Failed to report abort usage for message %s (attempt 1/2), "
                    "retrying in 1s: %s", message_id, e,
                )
                await asyncio.sleep(1)
            else:
                logger.warning(
                    "Failed to report abort usage for message %s after 2 attempts, "
                    "giving up: %s", message_id, e,
                )
    return False


# ── Existing tools ──────────────────────────────────────────────


async def web_search(query: str) -> str:
    """Search the web using Tavily API and return formatted results."""
    try:
        async with httpx.AsyncClient(timeout=_TOOL_TIMEOUT) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": settings.tavily_api_key,
                    "query": query,
                    "search_depth": "basic",
                    "max_results": _SEARCH_MAX_RESULTS,
                    "include_answer": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        results = data.get("results", [])
        if not results:
            return f'Search results for: "{query}"\n\nNo results found.'

        lines = [f'Search results for: "{query}"\n']
        for i, r in enumerate(results, 1):
            title = r.get("title", "Untitled")
            url = r.get("url", "")
            content = r.get("content", "")
            if len(content) > _SEARCH_SNIPPET_MAX_CHARS:
                content = content[:_SEARCH_SNIPPET_MAX_CHARS] + "..."
            lines.append(f"{i}. [{title}]\n   URL: {url}\n   Content: {content}\n")
        lines.append(f"({len(results)} results)")
        return "\n".join(lines)
    except Exception as e:
        logger.exception("web_search failed for query=%s", query)
        return (
            f"Error: search request failed — {e}. "
            "Please try again or answer based on your knowledge."
        )


async def url_reader(url: str) -> str:
    """Read the content of a URL using Jina Reader API."""
    try:
        headers: dict[str, str] = {"Accept": "text/plain"}
        if settings.jina_api_key:
            headers["Authorization"] = f"Bearer {settings.jina_api_key}"

        async with httpx.AsyncClient(timeout=_TOOL_TIMEOUT) as client:
            resp = await client.get(
                f"https://r.jina.ai/{url}",
                headers=headers,
            )
            resp.raise_for_status()
            content = resp.text

        if len(content) > _URL_READER_MAX_CHARS:
            content = content[:_URL_READER_MAX_CHARS] + "\n\n[...content truncated]"
        return content
    except Exception as e:
        logger.exception("url_reader failed for url=%s", url)
        return (
            f"Error: failed to read URL {url} — {e}. "
            "Please try again or answer based on your knowledge."
        )


# ── File generation tools ───────────────────────────────────────


async def create_image_stream(
    arguments: dict, context: ToolContext
) -> AsyncGenerator[ImagePartialEvent | ResourceCreatedEvent | ImageGenUsage | str, None]:
    """Streaming image generation via GPT Image 1.

    Yields:
        ImagePartialEvent: partial preview (compressed JPEG q80)
        ResourceCreatedEvent: file registered in Go backend
        str: tool result text (fed back to LLM)
        ImageGenUsage: token usage for cost tracking
    """
    prompt = arguments["prompt"]
    filename = _sanitize_filename(arguments["filename"])

    minio_path = ""
    minio_written = False
    producer: asyncio.Task | None = None
    event_queue: asyncio.Queue | None = None

    try:
        # Lazy import to break circular dependency (llm.py imports tool_executor)
        from services.llm import _get_openai_client
        openai_client = _get_openai_client("openai")

        # 1. Stream GPT Image 1 API via producer task (survives cancellation)
        stream = await openai_client.images.generate(
            model="gpt-image-1",
            prompt=prompt,
            n=1,
            quality="medium",
            size="1024x1024",
            stream=True,
            partial_images=2,
            timeout=60,
        )
        event_queue = asyncio.Queue()
        producer = asyncio.create_task(_stream_producer(stream, event_queue))

        final_b64 = ""
        image_usage = None
        while True:
            # Cancel checkpoint 1: between events
            if context.cancelled:
                logger.info("create_image cancelled by client disconnect")
                if image_usage:
                    await report_abort_usage(context.message_id, image_usage.input_tokens, image_usage.output_tokens)
                    producer.cancel()
                else:
                    # Producer keeps running — drain remaining events in background
                    asyncio.create_task(
                        _drain_queue_and_report_usage(event_queue, producer, context.message_id)
                    )
                yield "Error: Image generation was cancelled."
                return

            msg_type, payload = await event_queue.get()
            if msg_type == "done":
                break
            if msg_type == "error":
                raise payload
            event = payload

            if event.type == "image_generation.partial_image":
                compressed_b64 = _compress_preview(event.b64_json, quality=80)
                yield ImagePartialEvent(
                    b64_image=compressed_b64,
                    partial_index=event.partial_image_index,
                    chat_node_id=context.chat_node_id,
                    message_id=context.message_id,
                )
            elif event.type == "image_generation.completed":
                final_b64 = event.b64_json
                image_usage = event.usage

        if not final_b64:
            yield "Error: Image generation failed — no final image received."
            return

        # Cancel checkpoint 2: before MinIO write
        if context.cancelled:
            logger.info("create_image cancelled before MinIO write")
            if image_usage:
                await report_abort_usage(context.message_id, image_usage.input_tokens, image_usage.output_tokens)
            yield "Error: Image generation was cancelled."
            return

        # 2. Write final image to MinIO (no compression)
        image_bytes = base64.b64decode(final_b64)
        safe_name = f"{nanoid()}_{filename}.png"
        minio_path = f"users/{context.user_id}/files/{safe_name}"
        await asyncio.to_thread(minio_client.write_file, minio_path, image_bytes, "image/png")
        minio_written = True

        # 3. Register with Go backend
        result = await _register_ai_file(
            user_id=context.user_id,
            canvas_id=context.canvas_id,
            chat_node_id=context.chat_node_id,
            message_id=context.message_id,
            minio_path=minio_path,
            filename=f"{filename}.png",
            file_size=len(image_bytes),
            content_type="image/png",
        )

        # 4. Yield final events
        yield ResourceCreatedEvent(
            file_id=result["file_id"],
            node_id=result["node_id"],
            edge_id=result["edge_id"],
            filename=f"{filename}.png",
            content_type="image/png",
            chat_node_id=context.chat_node_id,
            message_id=context.message_id,
            position=result["position"],
            file_url=result.get("file_url", ""),
        )

        # 5. Tool result text (fed back to LLM)
        yield (
            f"Image generated successfully.\n"
            f"- Filename: {filename}.png\n"
            f"- File ID: {result['file_id']}\n"
            f"The image has been displayed to the user on the canvas."
        )

        # 6. Token usage for cost tracking
        if image_usage:
            yield ImageGenUsage(
                input_tokens=image_usage.input_tokens,
                output_tokens=image_usage.output_tokens,
            )

    except openai.BadRequestError:
        yield "Error: The image could not be generated because the prompt violates content policy. Please revise your description and try again."

    except openai.APITimeoutError:
        yield "Error: Image generation timed out (60s). Please try again."

    except httpx.HTTPStatusError as e:
        if minio_written:
            asyncio.create_task(_cleanup_minio_file_with_retry(minio_path))
        error_msg = _parse_register_error(e)
        yield f"Error: {error_msg}"

    except asyncio.CancelledError:
        # Task cancelled (sse-starlette cancellation) — clean up MinIO if anything was written
        # Even if minio_written=False, to_thread may have completed internally
        if minio_path:
            asyncio.create_task(_cleanup_minio_file_with_retry(minio_path))
        if image_usage:
            asyncio.create_task(report_abort_usage(
                context.message_id, image_usage.input_tokens, image_usage.output_tokens
            ))
            if producer and not producer.done():
                producer.cancel()
        elif producer is not None and event_queue is not None:
            # Producer task is independent — drain remaining events for usage
            asyncio.create_task(
                _drain_queue_and_report_usage(event_queue, producer, context.message_id)
            )
        raise

    except Exception as e:
        if minio_written:
            asyncio.create_task(_cleanup_minio_file_with_retry(minio_path))
        logger.exception(f"create_image failed: {e}")
        yield "Error: Failed to generate image due to an internal error. Please try again."


async def create_file(arguments: dict, context: ToolContext) -> ToolResult:
    """Save LLM-generated text content as a file, write to MinIO, register with Go backend."""
    raw_filename = arguments["filename"]
    content = arguments["content"]

    # 1. Filename sanitization + whitelist check
    filename = _sanitize_filename(raw_filename)
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        return f"Error: File type '{ext}' is not supported. Allowed types: {', '.join(sorted(_ALLOWED_EXTENSIONS))}.", []

    content_bytes = content.encode("utf-8")

    # Defensive file size limit (11MB hard cap)
    _MAX_FILE_SIZE = 11 * 1024 * 1024
    if len(content_bytes) > _MAX_FILE_SIZE:
        return "Error: File content too large. Please request again.", []

    content_type = _guess_content_type(filename)

    safe_name = f"{nanoid()}_{filename}"
    minio_path = f"users/{context.user_id}/files/{safe_name}"
    minio_written = False

    try:
        await asyncio.to_thread(minio_client.write_file, minio_path, content_bytes, content_type)
        minio_written = True

        result = await _register_ai_file(
            user_id=context.user_id,
            canvas_id=context.canvas_id,
            chat_node_id=context.chat_node_id,
            message_id=context.message_id,
            minio_path=minio_path,
            filename=filename,
            file_size=len(content_bytes),
            content_type=content_type,
        )

        event = ResourceCreatedEvent(
            file_id=result["file_id"],
            node_id=result["node_id"],
            edge_id=result["edge_id"],
            filename=filename,
            content_type=content_type,
            chat_node_id=context.chat_node_id,
            message_id=context.message_id,
            position=result["position"],
            file_url=result.get("file_url", ""),
        )

        result_text = (
            f"File created successfully.\n"
            f"- Filename: {filename}\n"
            f"- File ID: {result['file_id']}\n"
            f"The file has been displayed to the user on the canvas."
        )

        return result_text, [event]

    except httpx.HTTPStatusError as e:
        if minio_written:
            asyncio.create_task(_cleanup_minio_file_with_retry(minio_path))
        error_msg = _parse_register_error(e)
        return f"Error: {error_msg}", []

    except asyncio.CancelledError:
        if minio_path:
            asyncio.create_task(_cleanup_minio_file_with_retry(minio_path))
        raise

    except Exception as e:
        if minio_written:
            asyncio.create_task(_cleanup_minio_file_with_retry(minio_path))
        logger.exception(f"create_file failed: {e}")
        return "Error: Failed to create file due to an internal error. Please try again.", []


# ── Tool dispatcher ─────────────────────────────────────────────


async def execute(name: str, arguments: dict, context: ToolContext | None = None) -> ToolResult:
    """Dispatch a non-streaming tool call. Returns (result_text, side_events)."""
    if name == "web_search":
        return await web_search(arguments.get("query", "")), []
    if name == "url_reader":
        return await url_reader(arguments.get("url", "")), []
    if name == "create_file":
        return await create_file(arguments, context)
    return f"Error: unknown tool '{name}'", []
