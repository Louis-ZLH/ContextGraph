from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # MinIO
    minio_endpoint: str = "127.0.0.1:9000"
    minio_access_key: str = "admin"
    minio_secret_key: str = "password123"
    minio_use_ssl: bool = False
    minio_bucket: str = "context-graph"

    # LLM providers
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"

    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"

    gemini_api_key: str = ""

    claude_api_key: str = ""
    claude_base_url: str = "https://api.anthropic.com/v1"

    # Tool APIs
    tavily_api_key: str = ""
    jina_api_key: str = ""

    # Cheap & fast model for internal tasks (title generation, etc.)
    utility_model: dict[str, str] = {"provider": "deepseek", "model": "deepseek-chat"}

    # Large-context & cheap model for conversation summary generation
    summary_model: dict[str, str] = {"provider": "gemini", "model": "gemini-2.5-flash"}

    # Model mapping: Go backend sends model index 0-3
    # Each entry: provider (matches credential prefix above) + model API identifier
    model_map: dict[int, dict[str, str]] = {
        0: {"provider": "gemini", "model": "gemini-2.5-flash"},
        1: {"provider": "claude", "model": "claude-sonnet-4-5-20250929"},
        2: {"provider": "openai", "model": "gpt-5.2"},
        3: {"provider": "deepseek", "model": "deepseek-chat"},
    }

    # AI file generation — Go backend internal API (used in 15.2)
    go_backend_internal_url: str = ""   # e.g. "http://backend:8080"
    internal_token: str = ""             # X-Internal-Token header value

    # Redis
    redis_url: str = "redis://127.0.0.1:6379/0"

    # RabbitMQ
    rabbitmq_url: str = "amqp://guest:guest@127.0.0.1:5672/?heartbeat=300"

    # Server
    host: str = "0.0.0.0"
    port: int = 8001

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
