"""FastAPI application for SoleMD.Graph data engine."""

from contextlib import asynccontextmanager

from fastapi import FastAPI


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    # TODO: Initialize database connection pool
    # TODO: Initialize DuckDB for Parquet queries
    yield
    # TODO: Close connections


app = FastAPI(
    title="SoleMD.Graph Engine",
    description="Data engine for biomedical knowledge graph — ingestion, embedding, graph building, search",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "solemd-graph-engine"}
