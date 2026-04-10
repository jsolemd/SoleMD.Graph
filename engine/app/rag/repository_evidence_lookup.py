"""Evidence lookup mixins for the PostgreSQL RAG repository."""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Sequence

from app.rag import queries
from app.rag.clinical_priors import COMMON_MODEL_SPECIES_IDS, HUMAN_SPECIES_ID
from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    PaperAssetRecord,
    PaperAuthorRecord,
    PaperReferenceRecord,
    PaperSpeciesProfile,
    RelationMatchedPaperHit,
)
from app.rag.query_enrichment import normalize_query_text
from app.rag.repository_support import (
    _normalize_json_strings,
    _resolved_entity_concept_arrays,
    _SqlSpec,
    _unique_int_ids,
    _unique_stripped,
)
from app.rag.types import CitationDirection

MAX_CITATION_CONTEXT_QUERY_TERMS = 8
_CITATION_CONTEXT_TERM_TRIM_RE = re.compile(r"^\W+|\W+$")


def _citation_query_terms(query: str) -> list[str]:
    """Return a bounded, high-information term set for citation-context lookup."""

    ordered_terms: list[tuple[int, str]] = []
    seen: set[str] = set()
    for index, raw_term in enumerate(normalize_query_text(query).split()):
        term = _CITATION_CONTEXT_TERM_TRIM_RE.sub("", raw_term)
        if len(term) < 4 or term in seen:
            continue
        seen.add(term)
        ordered_terms.append((index, term))

    if len(ordered_terms) <= MAX_CITATION_CONTEXT_QUERY_TERMS:
        return [term for _, term in ordered_terms]

    selected_terms = {
        term
        for _, term in sorted(
            ordered_terms,
            key=lambda item: (-len(item[1]), item[0]),
        )[:MAX_CITATION_CONTEXT_QUERY_TERMS]
    }
    return [term for _, term in ordered_terms if term in selected_terms]


class _EvidenceLookupMixin:
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
        sql_spec = self._citation_context_sql_spec(
            corpus_ids=corpus_ids,
            query=query,
            limit_per_paper=limit_per_paper,
        )

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql_spec.sql, sql_spec.params)
                rows = cur.fetchall()

        for row in rows:
            direction = (
                CitationDirection.OUTGOING
                if row.get("direction") == "outgoing"
                else CitationDirection.INCOMING
            )
            citation_id = row.get("citation_id")
            grouped[int(row["corpus_id"])].append(
                CitationContextHit(
                    corpus_id=int(row["corpus_id"]),
                    citation_id=int(citation_id) if citation_id is not None else None,
                    direction=direction,
                    neighbor_corpus_id=(
                        int(row["neighbor_corpus_id"])
                        if row.get("neighbor_corpus_id") is not None
                        else None
                    ),
                    neighbor_paper_id=row.get("neighbor_paper_id"),
                    context_text=row.get("context_text") or "",
                    intents=_normalize_json_strings(row.get("intents")),
                    score=float(row.get("score") or 0.0),
                )
            )
        return dict(grouped)

    def _citation_context_sql_spec(
        self,
        *,
        corpus_ids: Sequence[int],
        query: str,
        limit_per_paper: int,
    ) -> _SqlSpec:
        normalized_corpus_ids = _unique_int_ids(corpus_ids)
        query_terms = _citation_query_terms(query)
        return _SqlSpec(
            route_name="citation_context_lookup",
            sql=queries.CITATION_CONTEXT_SQL,
            params=(
                query_terms,
                normalized_corpus_ids,
                normalized_corpus_ids,
                normalized_corpus_ids,
                normalized_corpus_ids,
                limit_per_paper,
            ),
            metadata={"limit_per_paper": limit_per_paper},
        )

    def fetch_entity_matches(
        self,
        corpus_ids: Sequence[int],
        *,
        entity_terms: Sequence[str],
        limit_per_paper: int = 5,
    ) -> dict[int, list[EntityMatchedPaperHit]]:
        unique_corpus_ids = _unique_int_ids(corpus_ids)
        normalized_terms = _unique_stripped(entity_terms)
        if not unique_corpus_ids or not normalized_terms:
            return {}

        resolved_concepts = self._resolve_query_entity_concepts(
            query_phrases=normalized_terms,
            limit=len(normalized_terms),
        )
        (
            raw_terms,
            entity_types,
            concept_namespaces,
            concept_ids,
        ) = _resolved_entity_concept_arrays(resolved_concepts)
        if not raw_terms:
            return {}

        grouped: dict[int, list[EntityMatchedPaperHit]] = defaultdict(list)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.ENTITY_MATCH_SQL,
                    (
                        raw_terms,
                        entity_types,
                        concept_namespaces,
                        concept_ids,
                        unique_corpus_ids,
                        unique_corpus_ids,
                        limit_per_paper,
                    ),
                )
                rows = cur.fetchall()

        for row in rows:
            grouped[int(row["corpus_id"])].append(
                EntityMatchedPaperHit(
                    corpus_id=int(row["corpus_id"]),
                    entity_type=row.get("entity_type") or "unknown",
                    concept_id=row.get("concept_id") or "",
                    matched_terms=list(row.get("matched_terms") or []),
                    mention_count=int(row.get("mention_count") or 0),
                    structural_span_count=int(row.get("structural_span_count") or 0),
                    retrieval_default_mention_count=int(
                        row.get("retrieval_default_mention_count") or 0
                    ),
                    score=float(row.get("score") or 0.0),
                )
            )
        return dict(grouped)

    def fetch_species_profiles(
        self,
        corpus_ids: Sequence[int],
    ) -> dict[int, PaperSpeciesProfile]:
        unique_corpus_ids = _unique_int_ids(corpus_ids)
        if not unique_corpus_ids:
            return {}

        grouped: dict[int, PaperSpeciesProfile] = {}
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.SPECIES_PROFILE_SQL,
                    (
                        HUMAN_SPECIES_ID,
                        HUMAN_SPECIES_ID,
                        list(COMMON_MODEL_SPECIES_IDS),
                        unique_corpus_ids,
                    ),
                )
                rows = cur.fetchall()

        for row in rows:
            corpus_id = int(row["corpus_id"])
            grouped[corpus_id] = PaperSpeciesProfile(
                corpus_id=corpus_id,
                human_mentions=int(row.get("human_mentions") or 0),
                nonhuman_mentions=int(row.get("nonhuman_mentions") or 0),
                common_model_mentions=int(row.get("common_model_mentions") or 0),
            )
        return grouped

    def fetch_relation_matches(
        self,
        corpus_ids: Sequence[int],
        *,
        relation_terms: Sequence[str],
        limit_per_paper: int = 5,
    ) -> dict[int, list[RelationMatchedPaperHit]]:
        unique_corpus_ids = _unique_int_ids(corpus_ids)
        normalized_terms = _unique_stripped(relation_terms)
        if not unique_corpus_ids or not normalized_terms:
            return {}

        grouped: dict[int, list[RelationMatchedPaperHit]] = defaultdict(list)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.RELATION_MATCH_SQL,
                    (
                        normalized_terms,
                        unique_corpus_ids,
                        limit_per_paper,
                    ),
                )
                rows = cur.fetchall()

        for row in rows:
            grouped[int(row["corpus_id"])].append(
                RelationMatchedPaperHit(
                    corpus_id=int(row["corpus_id"]),
                    relation_type=str(row.get("relation_type") or "relation"),
                    subject_type=str(row.get("subject_type") or ""),
                    subject_id=str(row.get("subject_id") or ""),
                    object_type=str(row.get("object_type") or ""),
                    object_id=str(row.get("object_id") or ""),
                    score=float(row.get("score") or 0.0),
                )
            )
        return dict(grouped)

    def fetch_references(
        self,
        corpus_ids: Sequence[int],
        *,
        limit_per_paper: int = 3,
    ) -> dict[int, list[PaperReferenceRecord]]:
        unique_corpus_ids = _unique_int_ids(corpus_ids)
        if not unique_corpus_ids:
            return {}

        grouped: dict[int, list[PaperReferenceRecord]] = defaultdict(list)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.REFERENCE_LOOKUP_SQL, (unique_corpus_ids,))
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

    def fetch_authors(
        self,
        corpus_ids: Sequence[int],
        *,
        limit_per_paper: int = 3,
    ) -> dict[int, list[PaperAuthorRecord]]:
        unique_corpus_ids = _unique_int_ids(corpus_ids)
        if not unique_corpus_ids:
            return {}

        grouped: dict[int, list[PaperAuthorRecord]] = defaultdict(list)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.AUTHOR_LOOKUP_SQL,
                    (unique_corpus_ids, max(limit_per_paper, 1)),
                )
                rows = cur.fetchall()

        for row in rows:
            corpus_id = int(row["corpus_id"])
            grouped[corpus_id].append(
                PaperAuthorRecord(
                    corpus_id=corpus_id,
                    author_position=int(row["author_position"]),
                    author_id=row.get("author_id"),
                    name=row.get("name"),
                )
            )
        return dict(grouped)

    def fetch_assets(
        self,
        corpus_ids: Sequence[int],
        *,
        limit_per_paper: int = 3,
    ) -> dict[int, list[PaperAssetRecord]]:
        unique_corpus_ids = _unique_int_ids(corpus_ids)
        if not unique_corpus_ids:
            return {}

        grouped: dict[int, list[PaperAssetRecord]] = defaultdict(list)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.ASSET_LOOKUP_SQL, (unique_corpus_ids,))
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
