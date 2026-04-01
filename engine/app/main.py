"""FastAPI application for SoleMD.Graph data engine."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import db
from app.api import api_router
from app.rag.query_embedding import get_query_embedder_status
from app.rag.service import get_rag_service

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    service = get_rag_service()
    warm_duration_ms = service.warm()
    status = get_query_embedder_status()
    if not status.get("ready", False):
        logger.warning(
            "dense_query_embedder_not_ready",
            extra={"status": status},
        )
    else:
        logger.info(
            "rag_runtime_warm_ready",
            extra={
                "warm_duration_ms": round(float(warm_duration_ms), 3),
                "dense_query": status,
            },
        )
    yield
    db.close_pool()


app = FastAPI(
    title="SoleMD.Graph Engine",
    description=(
        "Data engine for SoleMD.Graph. The evidence API is the canonical "
        "backend boundary for retrieval, bundle assembly, and future RAG serving."
    ),
    version="0.1.0",
    lifespan=lifespan,
)
app.include_router(api_router)


@app.get("/health")
async def health():
    """Lightweight health probe for local development and routing checks."""
    return {
        "status": "ok",
        "service": "solemd-graph-engine",
        "dense_query": get_query_embedder_status(),
    }
