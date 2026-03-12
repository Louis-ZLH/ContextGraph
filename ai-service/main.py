import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from config import settings
from routers import chat
from services import rabbitmq, redis_client
from services.file_convert_consumer import file_convert_callback

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    await redis_client.connect()
    await rabbitmq.connect()
    await rabbitmq.start_file_convert_consumer(file_convert_callback)
    yield
    # shutdown
    from services.tool_executor import shutdown_internal_client
    await shutdown_internal_client()
    await rabbitmq.disconnect()
    await redis_client.disconnect()


app = FastAPI(title="ContextGraph AI Service", version="0.1.0", lifespan=lifespan)

app.include_router(chat.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
