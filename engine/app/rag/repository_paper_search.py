"""Paper and chunk search mixins for the PostgreSQL RAG repository."""

from __future__ import annotations

from collections.abc import Sequence

from app.rag import queries
from app.rag.models import PaperEvidenceHit
from app.rag.query_enrichment import (
    normalize_entity_query_text,
    normalize_title_key,
)
from app.rag.query_metadata import QueryMetadataHints
from app.rag.repository_support import _SqlSpec, _unique_int_ids
from app.rag.title_anchor import compute_title_anchor_score, prefix_range_upper_bound


class _PaperSearchMixin:
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
    ) -> list[PaperEvidenceHit]:
        normalized_title_query = normalize_title_key(query)
        metadata_hints = query_metadata_hints or QueryMetadataHints()
        use_metadata_search = metadata_hints.has_searchable_metadata_filters
        if use_title_candidate_lookup is None:
            use_title_candidate_lookup = use_title_similarity
        use_exact_graph_search = (
            self._should_use_exact_graph_search(graph_run_id)
            if not scope_corpus_ids
            else False
        )
        should_probe_global_title_candidates = (
            not use_metadata_search
            and
            use_title_candidate_lookup
            and not scope_corpus_ids
            and (not use_exact_graph_search or not use_title_similarity)
        )
        if should_probe_global_title_candidates:
            exact_title_hits = self._search_title_lookup_candidate_papers(
                graph_run_id=graph_run_id,
                query=query,
                normalized_title_query=normalized_title_query,
                limit=limit,
                prefix=False,
            )
            if exact_title_hits:
                return exact_title_hits
            candidate_limit = self._title_prefix_candidate_limit(limit)
            prefix_title_hits = self._search_title_lookup_candidate_papers(
                graph_run_id=graph_run_id,
                query=query,
                normalized_title_query=normalized_title_query,
                limit=candidate_limit,
                prefix=True,
            )
            if prefix_title_hits:
                return prefix_title_hits[:limit]
            if not use_title_similarity:
                phrase_title_hits = self._search_title_lookup_candidate_papers(
                    graph_run_id=graph_run_id,
                    query=query,
                    normalized_title_query=normalized_title_query,
                    limit=self._title_similarity_candidate_limit(limit),
                    prefix=False,
                    fts_phrase=True,
                )
                if phrase_title_hits:
                    return phrase_title_hits[:limit]
        sql_spec = self._paper_search_sql_spec(
            graph_run_id=graph_run_id,
            query=query,
            normalized_title_query=normalized_title_query,
            limit=limit,
            scope_corpus_ids=scope_corpus_ids,
            use_title_similarity=use_title_similarity,
            use_exact_graph_search=use_exact_graph_search,
            query_metadata_hints=metadata_hints,
        )
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql_spec.sql, sql_spec.params)
                rows = cur.fetchall()

        return [self._paper_hit_from_row(row) for row in rows]

    def _title_prefix_candidate_limit(self, limit: int) -> int:
        return max(limit * 40, 200)

    def _title_similarity_candidate_limit(self, limit: int) -> int:
        return max(limit * 20, 120)

    def _paper_search_sql_spec(
        self,
        *,
        graph_run_id: str,
        query: str,
        normalized_title_query: str,
        limit: int,
        scope_corpus_ids: Sequence[int] | None,
        use_title_similarity: bool,
        use_exact_graph_search: bool,
        query_metadata_hints: QueryMetadataHints,
    ) -> _SqlSpec:
        if query_metadata_hints.has_searchable_metadata_filters:
            return self._paper_metadata_search_sql_spec(
                graph_run_id=graph_run_id,
                query=query,
                limit=limit,
                scope_corpus_ids=scope_corpus_ids,
                query_metadata_hints=query_metadata_hints,
            )
        if scope_corpus_ids:
            unique_scope_ids = _unique_int_ids(scope_corpus_ids)
            return _SqlSpec(
                route_name="paper_search_in_selection",
                sql=queries.PAPER_SEARCH_IN_SELECTION_SQL,
                params=(
                    query,
                    query,
                    query,
                    normalized_title_query,
                    use_title_similarity,
                    unique_scope_ids,
                    limit,
                    unique_scope_ids,
                    limit,
                ),
            )
        if use_title_similarity and use_exact_graph_search:
            prefix_limit = self._title_prefix_candidate_limit(limit)
            similarity_limit = self._title_similarity_candidate_limit(limit)
            return _SqlSpec(
                route_name="paper_title_lookup_in_graph",
                sql=queries.PAPER_TITLE_LOOKUP_IN_GRAPH_SQL,
                params=(
                    query,
                    normalized_title_query,
                    graph_run_id,
                    limit,
                    prefix_limit,
                    similarity_limit,
                ),
            )
        if not use_title_similarity and use_exact_graph_search:
            return _SqlSpec(
                route_name="paper_search_in_graph",
                sql=queries.PAPER_SEARCH_IN_GRAPH_SQL,
                params=(
                    query,
                    query,
                    query,
                    normalized_title_query,
                    use_title_similarity,
                    graph_run_id,
                    limit,
                    limit,
                ),
            )
        if not use_title_similarity:
            candidate_limit = self._title_similarity_candidate_limit(limit)
            return _SqlSpec(
                route_name="paper_search_global_fts_only",
                sql=queries.PAPER_SEARCH_SQL_NO_TITLE_SIMILARITY,
                params=(
                    query,
                    query,
                    query,
                    normalized_title_query,
                    graph_run_id,
                    limit,
                    candidate_limit,
                    limit,
                ),
            )
        candidate_limit = self._title_similarity_candidate_limit(limit)
        return _SqlSpec(
            route_name="paper_search_global",
            sql=queries.PAPER_SEARCH_SQL,
            params=(
                query,
                query,
                query,
                normalized_title_query,
                graph_run_id,
                limit,
                candidate_limit,
                limit,
            ),
        )

    def describe_paper_search_route(
        self,
        *,
        graph_run_id: str,
        query: str,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
        use_title_similarity: bool = True,
        use_title_candidate_lookup: bool | None = None,
        query_metadata_hints: QueryMetadataHints | None = None,
    ) -> str:
        normalized_title_query = normalize_title_key(query)
        if use_title_candidate_lookup is None:
            use_title_candidate_lookup = use_title_similarity
        use_exact_graph_search = (
            self._should_use_exact_graph_search(graph_run_id)
            if not scope_corpus_ids
            else False
        )
        return self._paper_search_sql_spec(
            graph_run_id=graph_run_id,
            query=query,
            normalized_title_query=normalized_title_query,
            limit=limit,
            scope_corpus_ids=scope_corpus_ids,
            use_title_similarity=use_title_similarity,
            use_exact_graph_search=use_exact_graph_search,
            query_metadata_hints=query_metadata_hints or QueryMetadataHints(),
        ).route_name

    def _paper_metadata_search_sql_spec(
        self,
        *,
        graph_run_id: str,
        query: str,
        limit: int,
        scope_corpus_ids: Sequence[int] | None,
        query_metadata_hints: QueryMetadataHints,
    ) -> _SqlSpec:
        topic_query = (query_metadata_hints.topic_query or query).strip()
        normalized_topic_query = normalize_title_key(topic_query) or topic_query
        author_hint = query_metadata_hints.author_hint or ""
        journal_hint = query_metadata_hints.journal_hint or ""
        publication_type_hints = list(query_metadata_hints.requested_publication_types)
        author_year_only_query = (
            bool(author_hint)
            and query_metadata_hints.year_hint is not None
            and not journal_hint
            and not publication_type_hints
        )
        journal_year_only_query = (
            bool(journal_hint)
            and query_metadata_hints.year_hint is not None
            and not author_hint
            and not publication_type_hints
        )
        publication_type_only_query = (
            bool(publication_type_hints)
            and query_metadata_hints.year_hint is None
            and not author_hint
            and not journal_hint
        )
        graph_scope_route, unique_scope_ids = self._graph_repository.resolve_query_scope(
            graph_run_id=graph_run_id,
            scope_corpus_ids=scope_corpus_ids,
        )
        if graph_scope_route == "selection":
            if author_year_only_query:
                candidate_limit = max(limit * 24, 120)
                return _SqlSpec(
                    route_name="paper_search_author_year_in_selection",
                    sql=queries.PAPER_AUTHOR_YEAR_SEARCH_IN_SELECTION_SQL,
                    params=(
                        topic_query,
                        topic_query,
                        topic_query,
                        normalized_topic_query,
                        normalized_topic_query,
                        normalized_topic_query,
                        author_hint,
                        author_hint,
                        author_hint,
                        "",
                        "",
                        "",
                        query_metadata_hints.year_hint,
                        publication_type_hints,
                        unique_scope_ids,
                        unique_scope_ids,
                        candidate_limit,
                        candidate_limit,
                        candidate_limit,
                        candidate_limit,
                        limit,
                    ),
                )
            if journal_year_only_query:
                candidate_limit = max(limit * 24, 120)
                return _SqlSpec(
                    route_name="paper_search_journal_year_in_selection",
                    sql=queries.PAPER_JOURNAL_YEAR_SEARCH_IN_SELECTION_SQL,
                    params=(
                        topic_query,
                        topic_query,
                        topic_query,
                        normalized_topic_query,
                        normalized_topic_query,
                        normalized_topic_query,
                        author_hint,
                        author_hint,
                        author_hint,
                        journal_hint,
                        journal_hint,
                        journal_hint,
                        query_metadata_hints.year_hint,
                        publication_type_hints,
                        unique_scope_ids,
                        unique_scope_ids,
                        candidate_limit,
                        candidate_limit,
                        candidate_limit,
                        limit,
                    ),
                )
            if publication_type_only_query:
                candidate_limit = max(limit * 24, 120)
                return _SqlSpec(
                    route_name="paper_search_publication_type_in_selection",
                    sql=queries.PAPER_PUBLICATION_TYPE_TOPIC_SEARCH_IN_SELECTION_SQL,
                    params=(
                        topic_query,
                        topic_query,
                        topic_query,
                        normalized_topic_query,
                        normalized_topic_query,
                        normalized_topic_query,
                        author_hint,
                        author_hint,
                        author_hint,
                        journal_hint,
                        journal_hint,
                        journal_hint,
                        query_metadata_hints.year_hint,
                        publication_type_hints,
                        unique_scope_ids,
                        candidate_limit,
                        limit,
                    ),
                )
            return _SqlSpec(
                route_name="paper_search_metadata_in_selection",
                sql=queries.PAPER_METADATA_SEARCH_IN_SELECTION_SQL,
                params=(
                    topic_query,
                    topic_query,
                    topic_query,
                    normalized_topic_query,
                    normalized_topic_query,
                    normalized_topic_query,
                    author_hint,
                    author_hint,
                    author_hint,
                    journal_hint,
                    journal_hint,
                    journal_hint,
                    query_metadata_hints.year_hint,
                    publication_type_hints,
                    unique_scope_ids,
                    unique_scope_ids,
                    unique_scope_ids,
                    unique_scope_ids,
                    limit,
                    limit,
                ),
            )
        if graph_scope_route == "current_map":
            candidate_limit = max(limit * 24, 120)
            if author_year_only_query:
                return _SqlSpec(
                    route_name="paper_search_author_year_current_map",
                    sql=queries.PAPER_AUTHOR_YEAR_SEARCH_CURRENT_MAP_SQL,
                    params=(
                        topic_query,
                        topic_query,
                        topic_query,
                        normalized_topic_query,
                        normalized_topic_query,
                        normalized_topic_query,
                        author_hint,
                        author_hint,
                        author_hint,
                        "",
                        "",
                        "",
                        query_metadata_hints.year_hint,
                        publication_type_hints,
                        candidate_limit,
                        candidate_limit,
                        candidate_limit,
                        candidate_limit,
                        limit,
                    ),
                )
            if journal_year_only_query:
                return _SqlSpec(
                    route_name="paper_search_journal_year_current_map",
                    sql=queries.PAPER_JOURNAL_YEAR_SEARCH_CURRENT_MAP_SQL,
                    params=(
                        topic_query,
                        topic_query,
                        topic_query,
                        normalized_topic_query,
                        normalized_topic_query,
                        normalized_topic_query,
                        author_hint,
                        author_hint,
                        author_hint,
                        journal_hint,
                        journal_hint,
                        journal_hint,
                        query_metadata_hints.year_hint,
                        publication_type_hints,
                        candidate_limit,
                        candidate_limit,
                        candidate_limit,
                        limit,
                    ),
                )
            if publication_type_only_query:
                return _SqlSpec(
                    route_name="paper_search_publication_type_current_map",
                    sql=queries.PAPER_PUBLICATION_TYPE_TOPIC_SEARCH_CURRENT_MAP_SQL,
                    params=(
                        topic_query,
                        topic_query,
                        topic_query,
                        normalized_topic_query,
                        normalized_topic_query,
                        normalized_topic_query,
                        author_hint,
                        author_hint,
                        author_hint,
                        journal_hint,
                        journal_hint,
                        journal_hint,
                        query_metadata_hints.year_hint,
                        publication_type_hints,
                        candidate_limit,
                        limit,
                    ),
                )
            return _SqlSpec(
                route_name="paper_search_metadata_current_map",
                sql=queries.PAPER_METADATA_SEARCH_CURRENT_MAP_SQL,
                params=(
                    topic_query,
                    topic_query,
                    topic_query,
                    normalized_topic_query,
                    normalized_topic_query,
                    normalized_topic_query,
                    author_hint,
                    author_hint,
                    author_hint,
                    journal_hint,
                    journal_hint,
                    journal_hint,
                    query_metadata_hints.year_hint,
                    publication_type_hints,
                    candidate_limit,
                    limit,
                ),
            )
        candidate_limit = max(limit * 24, 120)
        if author_year_only_query:
            return _SqlSpec(
                route_name="paper_search_author_year_global",
                sql=queries.PAPER_AUTHOR_YEAR_SEARCH_SQL,
                params=(
                    topic_query,
                    topic_query,
                    topic_query,
                    normalized_topic_query,
                    normalized_topic_query,
                    normalized_topic_query,
                    author_hint,
                    author_hint,
                    author_hint,
                    "",
                    "",
                    "",
                    query_metadata_hints.year_hint,
                    publication_type_hints,
                    graph_run_id,
                    candidate_limit,
                    candidate_limit,
                    candidate_limit,
                    candidate_limit,
                    limit,
                ),
            )
        if journal_year_only_query:
            return _SqlSpec(
                route_name="paper_search_journal_year_global",
                sql=queries.PAPER_JOURNAL_YEAR_SEARCH_SQL,
                params=(
                    topic_query,
                    topic_query,
                    topic_query,
                    normalized_topic_query,
                    normalized_topic_query,
                    normalized_topic_query,
                    author_hint,
                    author_hint,
                    author_hint,
                    journal_hint,
                    journal_hint,
                    journal_hint,
                    query_metadata_hints.year_hint,
                    publication_type_hints,
                    graph_run_id,
                    candidate_limit,
                    candidate_limit,
                    candidate_limit,
                    limit,
                ),
            )
        if publication_type_only_query:
            return _SqlSpec(
                route_name="paper_search_publication_type_global",
                sql=queries.PAPER_PUBLICATION_TYPE_TOPIC_SEARCH_SQL,
                params=(
                    topic_query,
                    topic_query,
                    topic_query,
                    normalized_topic_query,
                    normalized_topic_query,
                    normalized_topic_query,
                    author_hint,
                    author_hint,
                    author_hint,
                    journal_hint,
                    journal_hint,
                    journal_hint,
                    query_metadata_hints.year_hint,
                    publication_type_hints,
                    graph_run_id,
                    candidate_limit,
                    limit,
                ),
            )
        return _SqlSpec(
            route_name="paper_search_metadata_global",
            sql=queries.PAPER_METADATA_SEARCH_SQL,
                params=(
                    topic_query,
                    topic_query,
                    topic_query,
                    normalized_topic_query,
                    normalized_topic_query,
                    normalized_topic_query,
                author_hint,
                author_hint,
                author_hint,
                journal_hint,
                journal_hint,
                journal_hint,
                    query_metadata_hints.year_hint,
                    publication_type_hints,
                    graph_run_id,
                    candidate_limit,
                    limit,
                ),
        )

    def _search_title_lookup_candidate_papers(
        self,
        *,
        graph_run_id: str,
        query: str,
        normalized_title_query: str,
        limit: int,
        prefix: bool,
        fts_phrase: bool = False,
    ) -> list[PaperEvidenceHit]:
        candidate_corpus_ids = self._title_lookup_candidate_corpus_ids(
            query=query,
            normalized_title_query=normalized_title_query,
            limit=limit,
            prefix=prefix,
            fts_phrase=fts_phrase,
        )
        if not candidate_corpus_ids:
            return []

        scoped_hits = self.fetch_papers_by_corpus_ids(graph_run_id, candidate_corpus_ids)
        if not scoped_hits:
            return []

        hits_by_corpus_id = {hit.corpus_id: hit for hit in scoped_hits}
        ordered_hits = [
            hits_by_corpus_id[corpus_id]
            for corpus_id in candidate_corpus_ids
            if corpus_id in hits_by_corpus_id
        ]
        if not ordered_hits:
            return []

        for hit in ordered_hits:
            if prefix:
                hit.lexical_score = max(hit.lexical_score, 1.7)
                hit.title_similarity = max(
                    hit.title_similarity,
                    compute_title_anchor_score(
                        query_text=query,
                        title_text=hit.title,
                    ),
                )
            elif fts_phrase:
                hit.lexical_score = max(hit.lexical_score, 1.8)
            else:
                hit.lexical_score = max(hit.lexical_score, 2.0)
                hit.title_similarity = 1.0
        return ordered_hits

    def _title_lookup_candidate_corpus_ids(
        self,
        *,
        query: str,
        normalized_title_query: str,
        limit: int,
        prefix: bool,
        fts_phrase: bool = False,
    ) -> list[int]:
        title_query = query.lower()
        normalized_prefix_upper = prefix_range_upper_bound(normalized_title_query)
        title_prefix_upper = prefix_range_upper_bound(title_query)
        if fts_phrase:
            sql_specs = ((queries.PAPER_TITLE_FTS_CANDIDATE_SQL, (query, query, limit)),)
        elif prefix:
            sql_specs = (
                (
                    queries.PAPER_TITLE_TEXT_PREFIX_CANDIDATE_SQL,
                    (title_query, title_query, title_prefix_upper, limit),
                ),
                (
                    queries.PAPER_TITLE_NORMALIZED_PREFIX_CANDIDATE_SQL,
                    (
                        normalized_title_query,
                        normalized_title_query,
                        normalized_prefix_upper,
                        limit,
                    ),
                ),
            )
        else:
            sql_specs = (
                (
                    queries.PAPER_TITLE_TEXT_EXACT_CANDIDATE_SQL,
                    (title_query, title_query, title_query, limit),
                ),
                (
                    queries.PAPER_TITLE_NORMALIZED_EXACT_CANDIDATE_SQL,
                    (
                        normalized_title_query,
                        normalized_title_query,
                        normalized_title_query,
                        limit,
                    ),
                ),
            )

        candidate_scores: dict[int, tuple[int, int]] = {}
        with self._connect() as conn:
            with conn.cursor() as cur:
                for sql, params in sql_specs:
                    cur.execute(sql, params)
                    for row in cur.fetchall():
                        corpus_id = int(row["corpus_id"])
                        citation_count = int(row.get("citation_count") or 0)
                        best = candidate_scores.get(corpus_id)
                        score = (citation_count, corpus_id)
                        if best is None or score > best:
                            candidate_scores[corpus_id] = score

        return [
            corpus_id
            for corpus_id, _score in sorted(
                candidate_scores.items(),
                key=lambda item: item[1],
                reverse=True,
            )
        ][:limit]

    def search_exact_title_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        normalized_query = query.strip()
        if not normalized_query:
            return []
        normalized_title_query = normalize_title_key(normalized_query)

        if scope_corpus_ids:
            scope_set = set(_unique_int_ids(scope_corpus_ids))
            candidate_corpus_ids = [
                corpus_id
                for corpus_id in self._title_lookup_candidate_corpus_ids(
                    query=normalized_query,
                    normalized_title_query=normalized_title_query,
                    limit=limit,
                    prefix=False,
                )
                if corpus_id in scope_set
            ][:limit]
            if not candidate_corpus_ids:
                return []
            scoped_hits = self.fetch_known_scoped_papers_by_corpus_ids(candidate_corpus_ids)
            hits_by_corpus_id = {hit.corpus_id: hit for hit in scoped_hits}
            ordered_hits = [
                hits_by_corpus_id[corpus_id]
                for corpus_id in candidate_corpus_ids
                if corpus_id in hits_by_corpus_id
            ]
        else:
            candidate_corpus_ids = self._title_lookup_candidate_corpus_ids(
                query=normalized_query,
                normalized_title_query=normalized_title_query,
                limit=limit,
                prefix=False,
            )
            if not candidate_corpus_ids:
                return []
            scoped_hits = self.fetch_papers_by_corpus_ids(graph_run_id, candidate_corpus_ids)
            hits_by_corpus_id = {hit.corpus_id: hit for hit in scoped_hits}
            ordered_hits = [
                hits_by_corpus_id[corpus_id]
                for corpus_id in candidate_corpus_ids
                if corpus_id in hits_by_corpus_id
            ]

        for hit in ordered_hits:
            hit.lexical_score = max(hit.lexical_score, 2.0)
            hit.title_similarity = max(hit.title_similarity, 1.0)

        return ordered_hits[:limit]

    def search_selected_title_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        selected_corpus_id: int,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        if limit <= 0:
            return []

        if scope_corpus_ids is not None:
            if selected_corpus_id not in set(_unique_int_ids(scope_corpus_ids)):
                return []
            selected_hits = self.fetch_known_scoped_papers_by_corpus_ids([selected_corpus_id])
        else:
            selected_hits = self.fetch_papers_by_corpus_ids(graph_run_id, [selected_corpus_id])
        if not selected_hits:
            return []

        selected_hit = selected_hits[0]
        title_anchor_score = compute_title_anchor_score(
            query_text=query,
            title_text=selected_hit.title,
        )
        if title_anchor_score <= 0:
            return []

        selected_hit.lexical_score = max(
            selected_hit.lexical_score,
            2.0 if title_anchor_score >= 1.0 else 1.85,
        )
        selected_hit.title_similarity = max(
            selected_hit.title_similarity,
            title_anchor_score,
        )
        return [selected_hit]

    def search_chunk_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        normalized_query = query.strip()
        if not normalized_query:
            return []
        normalized_exact_query = normalize_entity_query_text(normalized_query)
        sql_spec = self._chunk_search_sql_spec(
            graph_run_id=graph_run_id,
            normalized_query=normalized_query,
            normalized_exact_query=normalized_exact_query,
            limit=limit,
            scope_corpus_ids=scope_corpus_ids,
        )
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql_spec.sql, sql_spec.params)
                rows = cur.fetchall()

        return [self._paper_hit_from_row(row) for row in rows]

    def _chunk_search_sql_spec(
        self,
        *,
        graph_run_id: str,
        normalized_query: str,
        normalized_exact_query: str,
        limit: int,
        scope_corpus_ids: Sequence[int] | None,
    ) -> _SqlSpec:
        if scope_corpus_ids:
            unique_scope_ids = _unique_int_ids(scope_corpus_ids)
            return _SqlSpec(
                route_name="chunk_search_in_selection",
                sql=queries.CHUNK_SEARCH_IN_SELECTION_SQL,
                params=(
                    normalized_query,
                    normalized_query,
                    normalized_query,
                    normalized_exact_query,
                    self._chunk_version_key,
                    unique_scope_ids,
                    limit,
                ),
            )
        candidate_limit = max(limit * 24, 120)
        return _SqlSpec(
            route_name="chunk_search_global",
            sql=queries.CHUNK_SEARCH_SQL,
            params=(
                normalized_query,
                normalized_query,
                normalized_query,
                normalized_exact_query,
                graph_run_id,
                self._chunk_version_key,
                candidate_limit,
                limit,
            ),
        )

    def describe_chunk_search_route(
        self,
        *,
        graph_run_id: str,
        query: str,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> str:
        normalized_query = query.strip()
        normalized_exact_query = normalize_entity_query_text(normalized_query)
        return self._chunk_search_sql_spec(
            graph_run_id=graph_run_id,
            normalized_query=normalized_query,
            normalized_exact_query=normalized_exact_query,
            limit=limit,
            scope_corpus_ids=scope_corpus_ids,
        ).route_name

    def fetch_papers_by_corpus_ids(
        self,
        graph_run_id: str,
        corpus_ids: Sequence[int],
    ) -> list[PaperEvidenceHit]:
        if not corpus_ids:
            return []

        unique_ids = _unique_int_ids(corpus_ids)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.PAPER_LOOKUP_SQL, (graph_run_id, unique_ids))
                rows = cur.fetchall()

        return [self._paper_hit_from_row(row) for row in rows]

    def fetch_known_scoped_papers_by_corpus_ids(
        self,
        corpus_ids: Sequence[int],
    ) -> list[PaperEvidenceHit]:
        if not corpus_ids:
            return []

        unique_ids = _unique_int_ids(corpus_ids)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.PAPER_LOOKUP_DIRECT_SQL, (unique_ids,))
                rows = cur.fetchall()

        return [self._paper_hit_from_row(row) for row in rows]
