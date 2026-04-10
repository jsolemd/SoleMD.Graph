"""Wiki content service package."""

from app.wiki.schemas import WikiPageResponse, WikiSearchRequest, WikiSearchResponse

__all__ = [
    "WikiPageResponse",
    "WikiSearchRequest",
    "WikiSearchResponse",
    "WikiService",
    "get_wiki_service",
]


def __getattr__(name: str):
    if name in {"WikiService", "get_wiki_service"}:
        from app.wiki.service import WikiService, get_wiki_service

        exports = {
            "WikiService": WikiService,
            "get_wiki_service": get_wiki_service,
        }
        return exports[name]
    raise AttributeError(name)
