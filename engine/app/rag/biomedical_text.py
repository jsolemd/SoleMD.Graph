"""Shared article-text shaping for biomedical retrieval and reranking."""

from __future__ import annotations


def _clean_fragment(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(text.split()).strip()


def article_parts(*, title: str | None, abstract: str | None) -> list[str]:
    """Return the canonical title/abstract pair shape used by biomedical models."""

    clean_title = _clean_fragment(title)
    clean_abstract = _clean_fragment(abstract)
    if clean_abstract:
        return [clean_title, clean_abstract]
    if clean_title:
        return [clean_title]
    return []


def article_text(*, title: str | None, abstract: str | None) -> str:
    """Flatten a paper into one stable title-first article string."""

    parts = article_parts(title=title, abstract=abstract)
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]}. {parts[1]}"
