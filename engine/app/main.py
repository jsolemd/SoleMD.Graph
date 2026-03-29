"""FastAPI application for SoleMD.Graph data engine."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import db
from app.api import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
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
    return {"status": "ok", "service": "solemd-graph-engine"}
