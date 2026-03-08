from __future__ import annotations

import io

from minio import Minio

from config import settings

_client: Minio | None = None


def get_minio_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_use_ssl,
        )
    return _client


def read_file(object_name: str) -> bytes:
    """Read a file from MinIO and return its content as bytes."""
    client = get_minio_client()
    response = client.get_object(settings.minio_bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def read_file_as_text(object_name: str, encoding: str = "utf-8") -> str:
    """Read a file from MinIO and return its content as text."""
    return read_file(object_name).decode(encoding)


def write_file(object_name: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    """Write bytes to MinIO."""
    client = get_minio_client()
    client.put_object(
        settings.minio_bucket,
        object_name,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )


def write_text_file(object_name: str, text: str) -> None:
    """Write a text string to MinIO as UTF-8."""
    write_file(object_name, text.encode("utf-8"), content_type="text/plain; charset=utf-8")
