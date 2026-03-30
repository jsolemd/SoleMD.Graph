"""API router assembly for SoleMD.Graph engine."""

from fastapi import APIRouter

from app.api.graph import router as graph_router
from app.api.rag import router as rag_router

api_router = APIRouter()
api_router.include_router(graph_router)
api_router.include_router(rag_router)

__all__ = ["api_router", "graph_router", "rag_router"]
