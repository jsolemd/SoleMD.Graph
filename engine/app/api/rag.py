"""FastAPI routes for evidence and RAG search."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.rag.schemas import RagSearchRequest, RagSearchResponse
from app.rag.service import RagService, get_rag_service

router = APIRouter(prefix="/api/v1/evidence", tags=["evidence"])


@router.post("/search", response_model=RagSearchResponse)
def search_evidence(
    request: RagSearchRequest,
    service: RagService = Depends(get_rag_service),
) -> RagSearchResponse:
    """Run the baseline evidence search over current PostgreSQL tables."""
    from langfuse import propagate_attributes

    try:
        with propagate_attributes(
            user_id="api",
            session_id=f"release:{request.graph_release_id}",
            tags=["production"],
        ):
            return service.search(request)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
