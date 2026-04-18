from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime

import uvicorn
from fastapi import FastAPI

from app.config import settings
from app.routes.health import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Slice 1 owns the permanent app bootstrap. Later slices extend this
    # lifespan with asyncpg pools instead of replacing the entrypoint.
    app.state.settings = settings
    app.state.started_at = datetime.now(UTC)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.service_name,
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.include_router(health_router)
    return app


def main() -> None:
    uvicorn.run(
        "app.main:create_app",
        factory=True,
        host=settings.api_host,
        port=settings.api_port,
    )


if __name__ == "__main__":
    main()
