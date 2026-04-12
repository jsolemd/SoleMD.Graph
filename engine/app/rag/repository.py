"""Repository helpers for the current-table evidence baseline."""

from __future__ import annotations

from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Protocol

from app import db
from app.config import settings
from app.graph.repository import GraphRuntimeResolver, PostgresGraphRepository
from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    GraphSignal,
    PaperAssetRecord,
    PaperAuthorRecord,
    PaperEvidenceHit,
    PaperReferenceRecord,
    PaperSpeciesProfile,
    RelationMatchedPaperHit,
)
from app.rag.query_metadata import QueryMetadataHints
from app.rag.repository_evidence_lookup import _EvidenceLookupMixin
from app.rag.repository_paper_search import _PaperSearchMixin
from app.rag.repository_seed_search import _SeedSearchMixin
from app.rag.repository_support import (
    ENTITY_FUZZY_SIMILARITY_THRESHOLD as _ENTITY_FUZZY_SIMILARITY_THRESHOLD,
)
from app.rag.repository_support import (
    ENTITY_TOP_CONCEPTS_PER_TERM as _ENTITY_TOP_CONCEPTS_PER_TERM,
)
from app.rag.repository_support import (
    ResolvedEntityConcept,
    ResolvedQueryEntityTerms,
    _dense_score_from_distance,
    _PinnedConnectionContext,
)
from app.rag.repository_support import (
    _SqlSpec as _RepositorySqlSpec,
)
from app.rag.repository_vector_search import _VectorSearchMixin
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY

ENTITY_FUZZY_SIMILARITY_THRESHOLD = _ENTITY_FUZZY_SIMILARITY_THRESHOLD
ENTITY_TOP_CONCEPTS_PER_TERM = _ENTITY_TOP_CONCEPTS_PER_TERM
_SqlSpec = _RepositorySqlSpec


class RagRepository(Protocol):
    """Read-only repository contract used by the service."""

    def resolve_query_entity_terms(
        self,
        *,
        query_phrases: Sequence[str],
        limit: int = 5,
    ) -> ResolvedQueryEntityTerms: ...

    def search_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
        use_title_similarity: bool = True,
        use_title_candidate_lookup: bool | None = None,
        query_metadata_hints: QueryMetadataHints | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def search_exact_title_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def search_selected_title_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        selected_corpus_id: int,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def search_chunk_papers(
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
        resolved_concepts: Sequence[ResolvedEntityConcept] | None = None,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def fetch_papers_by_corpus_ids(
        self,
        graph_run_id: str,
        corpus_ids: Sequence[int],
    ) -> list[PaperEvidenceHit]: ...

    def search_query_embedding_papers(
        self,
        *,
        graph_run_id: str,
        query_embedding: Sequence[float],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def fetch_known_scoped_papers_by_corpus_ids(
        self,
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
        resolved_concepts: Sequence[ResolvedEntityConcept] | None = None,
        limit_per_paper: int = 5,
    ) -> dict[int, list[EntityMatchedPaperHit]]: ...

    def fetch_relation_matches(
        self,
        corpus_ids: Sequence[int],
        *,
        relation_terms: Sequence[str],
        limit_per_paper: int = 5,
    ) -> dict[int, list[RelationMatchedPaperHit]]: ...

    def fetch_species_profiles(
        self,
        corpus_ids: Sequence[int],
    ) -> dict[int, PaperSpeciesProfile]: ...

    def fetch_references(
        self,
        corpus_ids: Sequence[int],
        *,
        limit_per_paper: int = 3,
    ) -> dict[int, list[PaperReferenceRecord]]: ...

    def fetch_authors(
        self,
        corpus_ids: Sequence[int],
        *,
        limit_per_paper: int = 3,
    ) -> dict[int, list[PaperAuthorRecord]]: ...

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


class PostgresRagRepository(
    _PaperSearchMixin,
    _SeedSearchMixin,
    _EvidenceLookupMixin,
    _VectorSearchMixin,
):
    """Read-only PostgreSQL repository for the baseline evidence service."""

    def __init__(
        self,
        connect: Callable[..., object] | None = None,
        *,
        chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
        graph_repository: PostgresGraphRepository | None = None,
    ):
        self._connect_factory = connect or db.pooled
        self._chunk_version_key = chunk_version_key
        self._disable_session_jit = settings.rag_runtime_disable_jit
        self._graph_repository = graph_repository
        self._semantic_neighbor_index_ready: bool | None = None
        self._graph_scope_coverages: dict[str, float] = {}
        self._embedded_paper_count: int | None = None
        self._bound_connection: ContextVar[Any | None] = ContextVar(
            f"rag_repository_connection_{id(self)}",
            default=None,
        )
        self._resolved_entity_concepts_by_phrase: ContextVar[
            dict[str, tuple[ResolvedEntityConcept, ...]] | None
        ] = ContextVar(
            f"rag_repository_resolved_entities_{id(self)}",
            default=None,
        )
        if self._graph_repository is None:
            self._graph_repository = PostgresGraphRepository(connect=self._connect)

    def _connect(self):
        active_connection = self._bound_connection.get()
        if active_connection is not None:
            return _PinnedConnectionContext(active_connection)
        return self._connect_factory()

    @property
    def graph_repository(self) -> GraphRuntimeResolver:
        return self._graph_repository

    def _configure_search_session(self, cur: Any) -> None:
        if self._disable_session_jit:
            cur.execute("SET LOCAL jit = off")

    @contextmanager
    def search_session(self) -> Iterator[None]:
        active_connection = self._bound_connection.get()
        if active_connection is not None:
            yield
            return

        with self._connect_factory() as conn:
            with conn.cursor() as cur:
                self._configure_search_session(cur)
            token = self._bound_connection.set(conn)
            entity_token = self._resolved_entity_concepts_by_phrase.set({})
            try:
                yield
            finally:
                self._resolved_entity_concepts_by_phrase.reset(entity_token)
                self._bound_connection.reset(token)

    def _paper_hit_from_row(self, row: dict[str, Any]) -> PaperEvidenceHit:
        return PaperEvidenceHit(
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
            influential_citation_count=row.get("influential_citation_count"),
            reference_count=row.get("reference_count"),
            publication_types=list(row.get("publication_types") or []),
            fields_of_study=list(row.get("fields_of_study") or []),
            has_rule_evidence=bool(row.get("has_rule_evidence")),
            has_curated_journal_family=bool(row.get("has_curated_journal_family")),
            journal_family_type=row.get("journal_family_type"),
            entity_rule_families=int(row.get("entity_rule_families") or 0),
            entity_rule_count=int(row.get("entity_rule_count") or 0),
            entity_core_families=int(row.get("entity_core_families") or 0),
            lexical_score=float(row.get("lexical_score") or 0.0),
            chunk_lexical_score=float(row.get("chunk_lexical_score") or 0.0),
            title_similarity=float(row.get("title_similarity") or 0.0),
            metadata_score=float(row.get("metadata_score") or 0.0),
            entity_score=float(row.get("entity_candidate_score") or 0.0),
            relation_score=float(row.get("relation_candidate_score") or 0.0),
            dense_score=_dense_score_from_distance(row.get("distance")),
            chunk_ordinal=row.get("chunk_ordinal"),
            chunk_section_role=row.get("chunk_section_role"),
            chunk_primary_block_kind=row.get("chunk_primary_block_kind"),
            chunk_snippet=row.get("chunk_snippet"),
            metadata_match_fields=list(row.get("metadata_match_fields") or []),
        )
