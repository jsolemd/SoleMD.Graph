"""Repository helpers for the current-table evidence baseline."""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Callable, Sequence
from typing import Any, Protocol

from app import db
from app.rag import queries
from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    GraphRelease,
    GraphSignal,
    PaperAssetRecord,
    PaperEvidenceHit,
    PaperReferenceRecord,
    RelationMatchedPaperHit,
)
from app.rag.types import CitationDirection, GraphSignalKind, RetrievalChannel

ENTITY_FUZZY_SIMILARITY_THRESHOLD = 0.3
ENTITY_TOP_CONCEPTS_PER_TERM = 3


class RagRepository(Protocol):
    """Read-only repository contract used by the service."""

    def resolve_graph_release(self, graph_release_id: str) -> GraphRelease: ...

    def resolve_query_entity_terms(
        self,
        *,
        query_phrases: Sequence[str],
        limit: int = 5,
    ) -> list[str]: ...

    def resolve_selected_corpus_id(
        self,
        *,
        graph_run_id: str,
        selected_graph_paper_ref: str | None,
        selected_paper_id: str | None,
        selected_node_id: str | None,
    ) -> int | None: ...

    def resolve_scope_corpus_ids(
        self,
        *,
        graph_run_id: str,
        graph_paper_refs: Sequence[str],
    ) -> list[int]: ...

    def search_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def search_entity_papers(
        self,
        graph_run_id: str,
        *,
        entity_terms: Sequence[str],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def fetch_papers_by_corpus_ids(
        self,
        graph_run_id: str,
        corpus_ids: Sequence[int],
    ) -> list[PaperEvidenceHit]: ...

    def search_relation_papers(
        self,
        graph_run_id: str,
        *,
        relation_terms: Sequence[str],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def fetch_citation_contexts(
        self,
        corpus_ids: Sequence[int],
        *,
        query: str,
        limit_per_paper: int = 3,
    ) -> dict[int, list[CitationContextHit]]: ...

    def fetch_entity_matches(
        self,
        corpus_ids: Sequence[int],
        *,
        entity_terms: Sequence[str],
        limit_per_paper: int = 5,
    ) -> dict[int, list[EntityMatchedPaperHit]]: ...

    def fetch_relation_matches(
        self,
        corpus_ids: Sequence[int],
        *,
        relation_terms: Sequence[str],
        limit_per_paper: int = 5,
    ) -> dict[int, list[RelationMatchedPaperHit]]: ...

    def fetch_references(
        self,
        corpus_ids: Sequence[int],
        *,
        limit_per_paper: int = 3,
    ) -> dict[int, list[PaperReferenceRecord]]: ...

    def fetch_assets(
        self,
        corpus_ids: Sequence[int],
        *,
        limit_per_paper: int = 3,
    ) -> dict[int, list[PaperAssetRecord]]: ...

    def fetch_semantic_neighbors(
        self,
        *,
        graph_run_id: str,
        selected_corpus_id: int,
        limit: int = 6,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[GraphSignal]: ...


def _split_mentions(raw_mentions: str | None) -> list[str]:
    if not raw_mentions:
        return []
    return [part.strip() for part in raw_mentions.split("|") if part.strip()]


def _normalize_json_strings(raw_values: Any) -> list[str]:
    if raw_values is None:
        return []
    if isinstance(raw_values, str):
        text = raw_values.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return [text]
        return _normalize_json_strings(parsed)
    if not isinstance(raw_values, list):
        return []

    normalized: list[str] = []
    for value in raw_values:
        if isinstance(value, str):
            stripped = value.strip()
            if stripped:
                normalized.append(stripped)
            continue
        if isinstance(value, dict):
            text = value.get("text")
            if isinstance(text, str) and text.strip():
                normalized.append(text.strip())
    return normalized


def _score_text_match(haystacks: Sequence[str], needles: Sequence[str]) -> tuple[float, list[str]]:
    if not needles:
        return 0.0, []

    lowered_haystacks = [haystack.lower() for haystack in haystacks if haystack]
    matched_terms: list[str] = []
    best_score = 0.0
    for needle in needles:
        lowered = needle.lower()
        if not lowered:
            continue
        if any(lowered in haystack for haystack in lowered_haystacks):
            matched_terms.append(needle)
            best_score = max(best_score, min(1.0, max(0.25, len(lowered) / 24)))
    return best_score, matched_terms


class PostgresRagRepository:
    """Read-only PostgreSQL repository for the baseline evidence service."""

    def __init__(self, connect: Callable[..., object] | None = None):
        self._connect = connect or db.pooled

    def resolve_graph_release(self, graph_release_id: str) -> GraphRelease:
        release_key = graph_release_id.strip()
        params = (release_key, release_key, release_key)

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.GRAPH_RELEASE_LOOKUP_SQL, params)
                row = cur.fetchone()

        if not row:
            raise LookupError(f"Unknown graph release: {graph_release_id}")

        return GraphRelease(
            graph_release_id=row.get("bundle_checksum") or row["graph_run_id"],
            graph_run_id=row["graph_run_id"],
            bundle_checksum=row.get("bundle_checksum"),
            graph_name=row["graph_name"],
            is_current=bool(row.get("is_current")),
        )

    def resolve_query_entity_terms(
        self,
        *,
        query_phrases: Sequence[str],
        limit: int = 5,
    ) -> list[str]:
        normalized_phrases = list(
            dict.fromkeys(phrase.strip() for phrase in query_phrases if phrase and phrase.strip())
        )
        if not normalized_phrases:
            return []

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.QUERY_ENTITY_TERM_MATCH_SQL,
                    (normalized_phrases, limit),
                )
                rows = cur.fetchall()

        return [str(row["normalized_term"]) for row in rows if row.get("normalized_term")]

    def resolve_selected_corpus_id(
        self,
        *,
        graph_run_id: str,
        selected_graph_paper_ref: str | None,
        selected_paper_id: str | None,
        selected_node_id: str | None,
    ) -> int | None:
        selected_lookup_ref = selected_graph_paper_ref or selected_paper_id

        if selected_lookup_ref:
            for prefix in ("paper:", "corpus:"):
                if selected_lookup_ref.startswith(prefix):
                    suffix = selected_lookup_ref.split(":", 1)[1]
                    if suffix.isdigit():
                        return int(suffix)

        if selected_node_id:
            for prefix in ("paper:", "corpus:"):
                if selected_node_id.startswith(prefix):
                    suffix = selected_node_id.split(":", 1)[1]
                    if suffix.isdigit():
                        return int(suffix)

            if selected_node_id.isdigit():
                return int(selected_node_id)

        if not selected_lookup_ref:
            return None

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.SELECTED_CORPUS_LOOKUP_SQL,
                    (
                        graph_run_id,
                        selected_lookup_ref,
                        selected_lookup_ref,
                        selected_lookup_ref,
                        selected_lookup_ref,
                    ),
                )
                row = cur.fetchone()

        return int(row["corpus_id"]) if row else None

    def resolve_scope_corpus_ids(
        self,
        *,
        graph_run_id: str,
        graph_paper_refs: Sequence[str],
    ) -> list[int]:
        normalized_refs = list(
            dict.fromkeys(ref.strip() for ref in graph_paper_refs if ref and ref.strip())
        )
        if not normalized_refs:
            return []

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.SCOPE_CORPUS_LOOKUP_SQL,
                    (
                        graph_run_id,
                        normalized_refs,
                        normalized_refs,
                        normalized_refs,
                        normalized_refs,
                    ),
                )
                rows = cur.fetchall()

        return [int(row["corpus_id"]) for row in rows]

    def search_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        if scope_corpus_ids:
            unique_scope_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in scope_corpus_ids))
            sql = queries.PAPER_SEARCH_IN_SELECTION_SQL
            params = (
                query,
                query,
                unique_scope_ids,
                0.1,
                limit,
            )
        else:
            candidate_limit = max(limit * 20, 120)
            sql = queries.PAPER_SEARCH_SQL
            params = (graph_run_id, query, query, candidate_limit, limit)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        hits: list[PaperEvidenceHit] = []
        for row in rows:
            hits.append(
                PaperEvidenceHit(
                    corpus_id=int(row["corpus_id"]),
                    paper_id=row.get("paper_id"),
                    semantic_scholar_paper_id=row.get("semantic_scholar_paper_id")
                    or row.get("paper_id"),
                    title=row.get("title"),
                    journal_name=row.get("journal_name"),
                    year=row.get("year"),
                    doi=row.get("doi"),
                    pmid=row.get("pmid"),
                    pmcid=row.get("pmcid"),
                    abstract=row.get("abstract"),
                    tldr=row.get("tldr"),
                    text_availability=row.get("text_availability"),
                    is_open_access=row.get("is_open_access"),
                    citation_count=row.get("citation_count"),
                    reference_count=row.get("reference_count"),
                    lexical_score=float(row.get("lexical_score") or 0.0),
                    title_similarity=float(row.get("title_similarity") or 0.0),
                )
            )
        return hits

    def fetch_papers_by_corpus_ids(
        self,
        graph_run_id: str,
        corpus_ids: Sequence[int],
    ) -> list[PaperEvidenceHit]:
        if not corpus_ids:
            return []

        unique_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.PAPER_LOOKUP_SQL, (graph_run_id, unique_ids))
                rows = cur.fetchall()

        hits: list[PaperEvidenceHit] = []
        for row in rows:
            hits.append(
                PaperEvidenceHit(
                    corpus_id=int(row["corpus_id"]),
                    paper_id=row.get("paper_id"),
                    semantic_scholar_paper_id=row.get("semantic_scholar_paper_id")
                    or row.get("paper_id"),
                    title=row.get("title"),
                    journal_name=row.get("journal_name"),
                    year=row.get("year"),
                    doi=row.get("doi"),
                    pmid=row.get("pmid"),
                    pmcid=row.get("pmcid"),
                    abstract=row.get("abstract"),
                    tldr=row.get("tldr"),
                    text_availability=row.get("text_availability"),
                    is_open_access=row.get("is_open_access"),
                    citation_count=row.get("citation_count"),
                    reference_count=row.get("reference_count"),
                )
            )
        return hits

    def search_relation_papers(
        self,
        graph_run_id: str,
        *,
        relation_terms: Sequence[str],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        normalized_terms = list(
            dict.fromkeys(term.strip() for term in relation_terms if term and term.strip())
        )
        if not normalized_terms:
            return []

        if scope_corpus_ids:
            unique_scope_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in scope_corpus_ids))
            sql = queries.PAPER_RELATION_SEARCH_IN_SELECTION_SQL
            params = (
                normalized_terms,
                unique_scope_ids,
                limit,
            )
        else:
            sql = queries.PAPER_RELATION_SEARCH_SQL
            params = (
                graph_run_id,
                normalized_terms,
                limit,
            )

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        hits: list[PaperEvidenceHit] = []
        for row in rows:
            hits.append(
                PaperEvidenceHit(
                    corpus_id=int(row["corpus_id"]),
                    paper_id=row.get("paper_id"),
                    semantic_scholar_paper_id=row.get("semantic_scholar_paper_id")
                    or row.get("paper_id"),
                    title=row.get("title"),
                    journal_name=row.get("journal_name"),
                    year=row.get("year"),
                    doi=row.get("doi"),
                    pmid=row.get("pmid"),
                    pmcid=row.get("pmcid"),
                    abstract=row.get("abstract"),
                    tldr=row.get("tldr"),
                    text_availability=row.get("text_availability"),
                    is_open_access=row.get("is_open_access"),
                    citation_count=row.get("citation_count"),
                    reference_count=row.get("reference_count"),
                    relation_score=float(row.get("relation_candidate_score") or 0.0),
                )
            )
        return hits

    def search_entity_papers(
        self,
        graph_run_id: str,
        *,
        entity_terms: Sequence[str],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        normalized_terms = list(
            dict.fromkeys(term.strip() for term in entity_terms if term and term.strip())
        )
        if not normalized_terms:
            return []

        if scope_corpus_ids:
            unique_scope_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in scope_corpus_ids))
            sql = queries.PAPER_ENTITY_SEARCH_IN_SELECTION_SQL
            params = (
                normalized_terms,
                ENTITY_FUZZY_SIMILARITY_THRESHOLD,
                ENTITY_TOP_CONCEPTS_PER_TERM,
                unique_scope_ids,
                limit,
            )
        else:
            sql = queries.PAPER_ENTITY_SEARCH_SQL
            params = (
                normalized_terms,
                ENTITY_FUZZY_SIMILARITY_THRESHOLD,
                ENTITY_TOP_CONCEPTS_PER_TERM,
                graph_run_id,
                limit,
            )

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        hits: list[PaperEvidenceHit] = []
        for row in rows:
            hits.append(
                PaperEvidenceHit(
                    corpus_id=int(row["corpus_id"]),
                    paper_id=row.get("paper_id"),
                    semantic_scholar_paper_id=row.get("semantic_scholar_paper_id")
                    or row.get("paper_id"),
                    title=row.get("title"),
                    journal_name=row.get("journal_name"),
                    year=row.get("year"),
                    doi=row.get("doi"),
                    pmid=row.get("pmid"),
                    pmcid=row.get("pmcid"),
                    abstract=row.get("abstract"),
                    tldr=row.get("tldr"),
                    text_availability=row.get("text_availability"),
                    is_open_access=row.get("is_open_access"),
                    citation_count=row.get("citation_count"),
                    reference_count=row.get("reference_count"),
                    entity_score=float(row.get("entity_candidate_score") or 0.0),
                )
            )
        return hits

    def fetch_citation_contexts(
        self,
        corpus_ids: Sequence[int],
        *,
        query: str,
        limit_per_paper: int = 3,
    ) -> dict[int, list[CitationContextHit]]:
        if not corpus_ids:
            return {}

        grouped: dict[int, list[CitationContextHit]] = defaultdict(list)
        query_terms = [part for part in query.lower().split() if len(part) >= 4]
        candidate_ids = set(corpus_ids)

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.CITATION_CONTEXT_SQL, (list(corpus_ids), list(corpus_ids)))
                rows = cur.fetchall()

        for row in rows:
            citing_corpus_id = int(row["citing_corpus_id"])
            cited_corpus_id = int(row["cited_corpus_id"])
            citation_id = row.get("citation_id")
            contexts = _normalize_json_strings(row.get("contexts"))
            intents = _normalize_json_strings(row.get("intents"))
            for context_text in contexts:
                score = 0.1
                lowered_context = context_text.lower()
                if query_terms:
                    score = sum(1.0 for term in query_terms if term in lowered_context)
                if row.get("is_influential"):
                    score += 0.25

                if citing_corpus_id in candidate_ids:
                    grouped[citing_corpus_id].append(
                        CitationContextHit(
                            corpus_id=citing_corpus_id,
                            citation_id=int(citation_id) if citation_id is not None else None,
                            direction=CitationDirection.OUTGOING,
                            neighbor_corpus_id=cited_corpus_id,
                            neighbor_paper_id=row.get("cited_paper_id"),
                            context_text=context_text,
                            intents=intents,
                            score=score,
                        )
                    )
                if cited_corpus_id in candidate_ids:
                    grouped[cited_corpus_id].append(
                        CitationContextHit(
                            corpus_id=cited_corpus_id,
                            citation_id=int(citation_id) if citation_id is not None else None,
                            direction=CitationDirection.INCOMING,
                            neighbor_corpus_id=citing_corpus_id,
                            neighbor_paper_id=row.get("citing_paper_id"),
                            context_text=context_text,
                            intents=intents,
                            score=score,
                        )
                    )

        for corpus_id, hits in list(grouped.items()):
            grouped[corpus_id] = sorted(hits, key=lambda item: item.score, reverse=True)[
                :limit_per_paper
            ]
        return dict(grouped)

    def fetch_entity_matches(
        self,
        corpus_ids: Sequence[int],
        *,
        entity_terms: Sequence[str],
        limit_per_paper: int = 5,
    ) -> dict[int, list[EntityMatchedPaperHit]]:
        if not corpus_ids or not entity_terms:
            return {}

        grouped: dict[int, list[EntityMatchedPaperHit]] = defaultdict(list)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.ENTITY_MATCH_SQL, (list(corpus_ids),))
                rows = cur.fetchall()

        for row in rows:
            mentions = _split_mentions(row.get("mentions"))
            score, matched_terms = _score_text_match(
                [row.get("concept_id") or "", *mentions],
                entity_terms,
            )
            if not matched_terms:
                continue
            grouped[int(row["corpus_id"])].append(
                EntityMatchedPaperHit(
                    corpus_id=int(row["corpus_id"]),
                    entity_type=row.get("entity_type") or "unknown",
                    concept_id=row.get("concept_id") or "",
                    matched_terms=matched_terms,
                    score=score,
                )
            )

        for corpus_id, hits in list(grouped.items()):
            grouped[corpus_id] = sorted(hits, key=lambda item: item.score, reverse=True)[
                :limit_per_paper
            ]
        return dict(grouped)

    def fetch_relation_matches(
        self,
        corpus_ids: Sequence[int],
        *,
        relation_terms: Sequence[str],
        limit_per_paper: int = 5,
    ) -> dict[int, list[RelationMatchedPaperHit]]:
        if not corpus_ids or not relation_terms:
            return {}

        grouped: dict[int, list[RelationMatchedPaperHit]] = defaultdict(list)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.RELATION_MATCH_SQL, (list(corpus_ids),))
                rows = cur.fetchall()

        for row in rows:
            haystacks = [
                str(row.get("relation_type") or ""),
                str(row.get("subject_type") or ""),
                str(row.get("subject_id") or ""),
                str(row.get("object_type") or ""),
                str(row.get("object_id") or ""),
            ]
            score, matched_terms = _score_text_match(haystacks, relation_terms)
            if not matched_terms:
                continue
            grouped[int(row["corpus_id"])].append(
                RelationMatchedPaperHit(
                    corpus_id=int(row["corpus_id"]),
                    relation_type=str(row.get("relation_type") or "relation"),
                    subject_type=str(row.get("subject_type") or ""),
                    subject_id=str(row.get("subject_id") or ""),
                    object_type=str(row.get("object_type") or ""),
                    object_id=str(row.get("object_id") or ""),
                    score=score,
                )
            )

        for corpus_id, hits in list(grouped.items()):
            grouped[corpus_id] = sorted(hits, key=lambda item: item.score, reverse=True)[
                :limit_per_paper
            ]
        return dict(grouped)

    def fetch_references(
        self,
        corpus_ids: Sequence[int],
        *,
        limit_per_paper: int = 3,
    ) -> dict[int, list[PaperReferenceRecord]]:
        if not corpus_ids:
            return {}

        grouped: dict[int, list[PaperReferenceRecord]] = defaultdict(list)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.REFERENCE_LOOKUP_SQL, (list(corpus_ids),))
                rows = cur.fetchall()

        for row in rows:
            corpus_id = int(row["corpus_id"])
            if len(grouped[corpus_id]) >= limit_per_paper:
                continue
            grouped[corpus_id].append(
                PaperReferenceRecord(
                    corpus_id=corpus_id,
                    reference_id=int(row["reference_id"]),
                    reference_index=int(row["reference_index"]),
                    title=row.get("title"),
                    year=row.get("year"),
                    doi=row.get("doi"),
                    pmid=row.get("pmid"),
                    pmcid=row.get("pmcid"),
                    referenced_paper_id=row.get("referenced_paper_id"),
                    referenced_corpus_id=row.get("referenced_corpus_id"),
                )
            )
        return dict(grouped)

    def fetch_assets(
        self,
        corpus_ids: Sequence[int],
        *,
        limit_per_paper: int = 3,
    ) -> dict[int, list[PaperAssetRecord]]:
        if not corpus_ids:
            return {}

        grouped: dict[int, list[PaperAssetRecord]] = defaultdict(list)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.ASSET_LOOKUP_SQL, (list(corpus_ids),))
                rows = cur.fetchall()

        for row in rows:
            corpus_id = int(row["corpus_id"])
            if len(grouped[corpus_id]) >= limit_per_paper:
                continue
            grouped[corpus_id].append(
                PaperAssetRecord(
                    corpus_id=corpus_id,
                    asset_id=int(row["asset_id"]),
                    asset_kind=row.get("asset_kind") or "asset",
                    remote_url=row.get("remote_url"),
                    storage_path=row.get("storage_path"),
                    access_status=row.get("access_status"),
                    license=row.get("license"),
                    metadata=row.get("metadata") or {},
                )
            )
        return dict(grouped)

    def fetch_semantic_neighbors(
        self,
        *,
        graph_run_id: str,
        selected_corpus_id: int,
        limit: int = 6,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[GraphSignal]:
        if selected_corpus_id <= 0:
            return []

        if scope_corpus_ids:
            unique_scope_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in scope_corpus_ids))
            sql = queries.SEMANTIC_NEIGHBOR_IN_SELECTION_SQL
            params = (
                selected_corpus_id,
                unique_scope_ids,
                unique_scope_ids,
                limit,
            )
        else:
            sql = queries.SEMANTIC_NEIGHBOR_SQL
            params = (graph_run_id, selected_corpus_id, limit)

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        signals: list[GraphSignal] = []
        for index, row in enumerate(rows, start=1):
            distance = float(row.get("distance") or 0.0)
            signals.append(
                GraphSignal(
                    corpus_id=int(row["corpus_id"]),
                    paper_id=row.get("paper_id"),
                    signal_kind=GraphSignalKind.SEMANTIC_NEIGHBOR,
                    channel=RetrievalChannel.SEMANTIC_NEIGHBOR,
                    score=max(0.0, 1.0 - distance),
                    rank=index,
                    reason="Embedding proximity to the selected paper",
                )
            )
        return signals
