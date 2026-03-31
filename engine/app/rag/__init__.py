"""Evidence and RAG service package."""

from app.rag.schemas import RagSearchRequest, RagSearchResponse

__all__ = [
    "RagSearchRequest",
    "RagSearchResponse",
    "RagService",
    "get_rag_service",
]


def __getattr__(name: str):
    if name in {"RagService", "get_rag_service"}:
        from app.rag.service import RagService, get_rag_service

        exports = {
            "RagService": RagService,
            "get_rag_service": get_rag_service,
        }
        return exports[name]
    raise AttributeError(name)
