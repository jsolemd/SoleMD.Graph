"""FastAPI routes for evidence and RAG search."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.http import run_api

from app.rag.schemas import RagSearchRequest, RagSearchResponse
from app.rag.service import RagService, get_rag_service

router = APIRouter(prefix="/api/v1/evidence", tags=["evidence"])


@router.post("/search")
def search_evidence(
    request: RagSearchRequest,
    service: RagService = Depends(get_rag_service),
) -> RagSearchResponse:
    """Run the baseline evidence search over current PostgreSQL tables."""
    from langfuse import propagate_attributes

    with propagate_attributes(
        user_id="api",
        session_id=f"release:{request.graph_release_id}",
        tags=["production"],
    ):
        return run_api(lambda: service.search(request))
