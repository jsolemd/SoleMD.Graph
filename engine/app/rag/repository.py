"""Repository helpers for the current-table evidence baseline."""

from __future__ import annotations

from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Protocol

from app import db
from app.config import settings
from app.rag import queries
from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    GraphRelease,
    GraphSignal,
    PaperAssetRecord,
    PaperEvidenceHit,
    PaperReferenceRecord,
    PaperSpeciesProfile,
    RelationMatchedPaperHit,
)
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
    _dense_score_from_distance,
    _PinnedConnectionContext,
    _unique_stripped,
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

    def resolve_graph_release(self, graph_release_id: str) -> GraphRelease: ...

    def resolve_query_entity_terms(
        self,
        *,
        query_phrases: Sequence[str],
        limit: int = 5,
    ) -> tuple[list[str], set[str]]: ...

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
        use_title_similarity: bool = True,
        use_title_candidate_lookup: bool | None = None,
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
    ):
        self._connect_factory = connect or db.pooled
        self._chunk_version_key = chunk_version_key
        self._disable_session_jit = settings.rag_runtime_disable_jit
        self._graph_release_cache: dict[str, GraphRelease] = {}
        self._semantic_neighbor_index_ready: bool | None = None
        self._graph_scope_paper_counts: dict[str, int] = {}
        self._graph_scope_coverages: dict[str, float] = {}
        self._embedded_paper_count: int | None = None
        self._bound_connection: ContextVar[Any | None] = ContextVar(
            f"rag_repository_connection_{id(self)}",
            default=None,
        )

    def _connect(self):
        active_connection = self._bound_connection.get()
        if active_connection is not None:
            return _PinnedConnectionContext(active_connection)
        return self._connect_factory()

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
            try:
                yield
            finally:
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
            entity_score=float(row.get("entity_candidate_score") or 0.0),
            relation_score=float(row.get("relation_candidate_score") or 0.0),
            dense_score=_dense_score_from_distance(row.get("distance")),
            chunk_ordinal=row.get("chunk_ordinal"),
            chunk_snippet=row.get("chunk_snippet"),
        )

    def resolve_graph_release(self, graph_release_id: str) -> GraphRelease:
        release_key = graph_release_id.strip()
        cached = self._graph_release_cache.get(release_key)
        if cached is not None:
            return cached
        params = (release_key, release_key, release_key)

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.GRAPH_RELEASE_LOOKUP_SQL, params)
                row = cur.fetchone()

        if not row:
            raise LookupError(f"Unknown graph release: {graph_release_id}")

        release = GraphRelease(
            graph_release_id=row.get("bundle_checksum") or row["graph_run_id"],
            graph_run_id=row["graph_run_id"],
            bundle_checksum=row.get("bundle_checksum"),
            graph_name=row["graph_name"],
            is_current=bool(row.get("is_current")),
        )
        self._graph_release_cache[release_key] = release
        return release

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
        normalized_refs = _unique_stripped(graph_paper_refs)
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
