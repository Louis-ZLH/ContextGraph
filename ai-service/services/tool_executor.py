from __future__ import annotations

import logging

import httpx

from config import settings

logger = logging.getLogger(__name__)

_TOOL_TIMEOUT = 15.0  # seconds per tool execution
_SEARCH_MAX_RESULTS = 5
_SEARCH_SNIPPET_MAX_CHARS = 1000
_URL_READER_MAX_CHARS = 15000


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


async def execute(name: str, arguments: dict) -> str:
    """Dispatch a tool call by name and return the result text."""
    if name == "web_search":
        return await web_search(arguments.get("query", ""))
    if name == "url_reader":
        return await url_reader(arguments.get("url", ""))
    return f"Error: unknown tool '{name}'"
