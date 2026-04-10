"""API router assembly for SoleMD.Graph engine."""

from fastapi import APIRouter

from app.api.entities import router as entities_router
from app.api.graph import router as graph_router
from app.api.rag import router as rag_router
from app.api.wiki import router as wiki_router

api_router = APIRouter()
api_router.include_router(entities_router)
api_router.include_router(graph_router)
api_router.include_router(rag_router)
api_router.include_router(wiki_router)

__all__ = ["api_router", "entities_router", "graph_router", "rag_router", "wiki_router"]
