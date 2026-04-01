"""Population, cohort, and query-case builders for runtime evaluation."""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable, Sequence
from random import Random

from app import db
from app.rag.repository import PostgresRagRepository
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.runtime_eval_models import (
    RagRuntimeEvalCohortReport,
    RuntimeEvalCohortCandidate,
    RuntimeEvalPaperRecord,
    RuntimeEvalPopulationSummary,
    RuntimeEvalQueryCase,
    RuntimeEvalQueryFamily,
)

_EVAL_POPULATION_SQL = """
WITH requested_docs AS (
    SELECT DISTINCT
        d.corpus_id,
        d.title,
        d.primary_source_system
    FROM solemd.paper_documents d
    JOIN solemd.graph_points gp
      ON gp.corpus_id = d.corpus_id
    WHERE gp.graph_run_id = %s::UUID
      AND (
          %s::BIGINT[] IS NULL
          OR gp.corpus_id = ANY(%s)
      )
),
section_counts AS (
    SELECT corpus_id, COUNT(*)::BIGINT AS section_count
    FROM solemd.paper_sections
    WHERE corpus_id IN (SELECT corpus_id FROM requested_docs)
    GROUP BY corpus_id
),
block_counts AS (
    SELECT
        corpus_id,
        COUNT(*) FILTER (WHERE block_kind = 'table_body_text')::BIGINT AS table_block_count,
        COUNT(*) FILTER (WHERE block_kind = 'narrative_paragraph')::BIGINT AS narrative_block_count
    FROM solemd.paper_blocks
    WHERE corpus_id IN (SELECT corpus_id FROM requested_docs)
    GROUP BY corpus_id
),
chunk_counts AS (
    SELECT
        corpus_id,
        COUNT(*)::BIGINT AS chunk_count,
        AVG(token_count_estimate)::DOUBLE PRECISION AS avg_chunk_tokens
    FROM solemd.paper_chunks
    WHERE corpus_id IN (SELECT corpus_id FROM requested_docs)
      AND chunk_version_key = %s
    GROUP BY corpus_id
),
entity_counts AS (
    SELECT corpus_id, COUNT(*)::BIGINT AS entity_mention_count
    FROM solemd.paper_entity_mentions
    WHERE corpus_id IN (SELECT corpus_id FROM requested_docs)
    GROUP BY corpus_id
),
citation_counts AS (
    SELECT corpus_id, COUNT(*)::BIGINT AS citation_mention_count
    FROM solemd.paper_citation_mentions
    WHERE corpus_id IN (SELECT corpus_id FROM requested_docs)
    GROUP BY corpus_id
),
sentence_seeds AS (
    SELECT DISTINCT ON (s.corpus_id)
        s.corpus_id,
        COALESCE(sec.section_role, b.section_role) AS representative_section_role,
        trim(s.text) AS representative_sentence
    FROM solemd.paper_sentences s
    JOIN solemd.paper_blocks b
      ON b.corpus_id = s.corpus_id
     AND b.block_ordinal = s.block_ordinal
    LEFT JOIN solemd.paper_sections sec
      ON sec.corpus_id = s.corpus_id
     AND sec.section_ordinal = s.section_ordinal
    WHERE s.corpus_id IN (SELECT corpus_id FROM requested_docs)
      AND b.block_kind = 'narrative_paragraph'
      AND b.is_retrieval_default = true
      AND char_length(trim(s.text)) BETWEEN 60 AND 220
    ORDER BY
        s.corpus_id,
        CASE COALESCE(sec.section_role, b.section_role)
            WHEN 'abstract' THEN 0
            WHEN 'result' THEN 1
            WHEN 'discussion' THEN 2
            WHEN 'introduction' THEN 3
            WHEN 'conclusion' THEN 4
            ELSE 10
        END,
        char_length(trim(s.text)) DESC,
        s.block_ordinal,
        s.sentence_ordinal
)
SELECT
    d.corpus_id,
    d.title,
    d.primary_source_system,
    COALESCE(sc.section_count, 0) AS section_count,
    COALESCE(bc.table_block_count, 0) AS table_block_count,
    COALESCE(bc.narrative_block_count, 0) AS narrative_block_count,
    COALESCE(cc.chunk_count, 0) AS chunk_count,
    COALESCE(cc.avg_chunk_tokens, 0.0) AS avg_chunk_tokens,
    COALESCE(ec.entity_mention_count, 0) AS entity_mention_count,
    COALESCE(cic.citation_mention_count, 0) AS citation_mention_count,
    ss.representative_section_role,
    ss.representative_sentence
FROM requested_docs d
LEFT JOIN section_counts sc USING (corpus_id)
LEFT JOIN block_counts bc USING (corpus_id)
LEFT JOIN chunk_counts cc USING (corpus_id)
LEFT JOIN entity_counts ec USING (corpus_id)
LEFT JOIN citation_counts cic USING (corpus_id)
LEFT JOIN sentence_seeds ss USING (corpus_id)
ORDER BY d.corpus_id
"""

_RUNTIME_EVAL_COHORT_SQL = """
WITH candidates AS (
    SELECT
        gp.corpus_id,
        COALESCE(NULLIF(trim(p.title), ''), concat('Corpus ', gp.corpus_id)) AS title,
        p.paper_id,
        COALESCE(p.citation_count, 0)::INT AS citation_count,
        COALESCE(p.reference_count, 0)::INT AS reference_count,
        p.text_availability,
        c.pmid,
        c.pmc_id,
        c.doi,
        (d.corpus_id IS NULL) AS missing_document,
        CASE
            WHEN COALESCE(p.citation_count, 0) >= 100 THEN 'citations_100_plus'
            WHEN COALESCE(p.citation_count, 0) >= 20 THEN 'citations_20_99'
            WHEN COALESCE(p.citation_count, 0) >= 5 THEN 'citations_5_19'
            ELSE 'citations_lt5_or_null'
        END AS citation_bucket,
        CASE
            WHEN c.pmc_id IS NOT NULL THEN 'pmc_present'
            WHEN c.pmid IS NOT NULL THEN 'pmid_only'
            WHEN c.doi IS NOT NULL THEN 'doi_only'
            ELSE 'unresolved'
        END AS bioc_profile,
        CASE
            WHEN COALESCE(p.text_availability, '') = 'fulltext' THEN 'fulltext'
            WHEN COALESCE(p.text_availability, '') = 'abstract' THEN 'abstract'
            ELSE 'unknown'
        END AS text_profile
    FROM solemd.graph_points gp
    JOIN solemd.graph_runs gr
      ON gr.id = gp.graph_run_id
    LEFT JOIN solemd.paper_documents d
      ON d.corpus_id = gp.corpus_id
    LEFT JOIN solemd.papers p
      ON p.corpus_id = gp.corpus_id
    LEFT JOIN solemd.corpus c
      ON c.corpus_id = gp.corpus_id
    WHERE gr.id = %s::UUID
      AND (%s::BOOLEAN = false OR d.corpus_id IS NULL)
      AND p.title IS NOT NULL
      AND COALESCE(p.citation_count, 0) >= %s
      AND (
          p.paper_id IS NOT NULL
          OR c.pmid IS NOT NULL
          OR c.pmc_id IS NOT NULL
          OR c.doi IS NOT NULL
      )
),
strata AS (
    SELECT
        *,
        concat_ws('|', bioc_profile, text_profile, citation_bucket) AS stratum_key
    FROM candidates
    WHERE text_profile = ANY(%s::TEXT[])
),
stratum_counts AS (
    SELECT
        stratum_key,
        COUNT(*)::BIGINT AS stratum_population_count
    FROM strata
    GROUP BY stratum_key
),
stratum_targets AS (
    SELECT
        COUNT(*)::INT AS stratum_count,
        GREATEST(1, CEIL(%s::NUMERIC / GREATEST(COUNT(*), 1)))::INT AS per_stratum_target
    FROM stratum_counts
),
total_count AS (
    SELECT COUNT(*)::BIGINT AS candidate_population_size
    FROM strata
),
ranked AS (
    SELECT
        s.*,
        sc.stratum_population_count,
        tc.candidate_population_size,
        ROW_NUMBER() OVER (
            PARTITION BY s.stratum_key
            ORDER BY md5(%s::TEXT || ':' || s.corpus_id::TEXT), s.corpus_id
        ) AS stratum_rank
    FROM strata s
    JOIN stratum_counts sc USING (stratum_key)
    CROSS JOIN total_count tc
)
SELECT
    ranked.corpus_id,
    ranked.title,
    ranked.paper_id,
    ranked.citation_count,
    ranked.reference_count,
    ranked.text_availability,
    ranked.pmid,
    ranked.pmc_id,
    ranked.doi,
    ranked.missing_document,
    ranked.citation_bucket,
    ranked.bioc_profile,
    ranked.text_profile,
    ranked.stratum_key,
    ranked.stratum_population_count,
    ranked.candidate_population_size
FROM ranked
CROSS JOIN stratum_targets targets
WHERE ranked.stratum_rank <= LEAST(
    ranked.stratum_population_count,
    targets.per_stratum_target * 4
)
ORDER BY ranked.stratum_key, ranked.stratum_rank, ranked.corpus_id
LIMIT %s
"""

_TITLE_MAX_CHARS = 220
_SENTENCE_MAX_CHARS = 220
_SENTENCE_MAX_WORDS = 28


def _normalize_query_text(
    text: str,
    *,
    max_chars: int,
    max_words: int | None = None,
) -> str:
    normalized = " ".join(text.split()).strip()
    if max_words is not None:
        normalized = " ".join(normalized.split()[:max_words]).strip()
    if len(normalized) <= max_chars:
        return normalized
    truncated = normalized[:max_chars].rsplit(" ", 1)[0].strip()
    return truncated or normalized[:max_chars].strip()


def _table_profile(paper: RuntimeEvalPaperRecord) -> str:
    if paper.table_block_count >= 3:
        return "table_heavy"
    if paper.table_block_count >= 1:
        return "table_present"
    return "table_absent"


def _size_profile(paper: RuntimeEvalPaperRecord) -> str:
    if paper.chunk_count >= 16:
        return "long"
    if paper.chunk_count >= 6:
        return "medium"
    return "short"


def _entity_density_profile(paper: RuntimeEvalPaperRecord) -> str:
    if paper.entity_mention_count >= 20:
        return "entity_dense"
    if paper.entity_mention_count >= 5:
        return "entity_present"
    return "entity_sparse"


def _citation_density_profile(paper: RuntimeEvalPaperRecord) -> str:
    if paper.citation_mention_count >= 20:
        return "citation_dense"
    if paper.citation_mention_count >= 5:
        return "citation_present"
    return "citation_sparse"


def _sentence_seed_profile(paper: RuntimeEvalPaperRecord) -> str:
    if not paper.representative_sentence:
        return "sentence_unseeded"
    section_role = (paper.representative_section_role or "unknown").strip().lower() or "unknown"
    return f"sentence_seeded:{section_role}"


def runtime_eval_stratum_key(paper: RuntimeEvalPaperRecord) -> str:
    return "|".join(
        (
            paper.primary_source_system or "unknown",
            _table_profile(paper),
            _size_profile(paper),
            _entity_density_profile(paper),
            _citation_density_profile(paper),
            _sentence_seed_profile(paper),
        )
    )


def _stratified_round_robin_sample[T](
    rows: Sequence[T],
    *,
    sample_size: int,
    seed: int,
    stratum_key: Callable[[T], str],
    sort_key: Callable[[T], object],
) -> list[T]:
    if sample_size <= 0 or sample_size >= len(rows):
        return list(sorted(rows, key=sort_key))

    rng = Random(seed)
    grouped: dict[str, list[T]] = {}
    for row in rows:
        grouped.setdefault(stratum_key(row), []).append(row)
    for group in grouped.values():
        rng.shuffle(group)

    selected: list[T] = []
    ordered_keys = sorted(grouped)
    while len(selected) < sample_size and any(grouped.values()):
        for key in ordered_keys:
            group = grouped[key]
            if not group:
                continue
            selected.append(group.pop())
            if len(selected) >= sample_size:
                break
    return list(sorted(selected, key=sort_key))


def fetch_runtime_eval_population(
    *,
    graph_run_id: str,
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    corpus_ids: Sequence[int] | None = None,
    connect: Callable[..., object] | None = None,
) -> list[RuntimeEvalPaperRecord]:
    normalized_corpus_ids = (
        list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
        if corpus_ids
        else None
    )
    connect_fn = connect or db.pooled
    with connect_fn() as conn, conn.cursor() as cur:
        cur.execute(
            _EVAL_POPULATION_SQL,
            (graph_run_id, normalized_corpus_ids, normalized_corpus_ids, chunk_version_key),
        )
        return [RuntimeEvalPaperRecord.model_validate(dict(row)) for row in cur.fetchall()]


def select_stratified_sample(
    papers: Sequence[RuntimeEvalPaperRecord],
    *,
    sample_size: int,
    seed: int = 7,
) -> list[RuntimeEvalPaperRecord]:
    return _stratified_round_robin_sample(
        papers,
        sample_size=sample_size,
        seed=seed,
        stratum_key=runtime_eval_stratum_key,
        sort_key=lambda paper: paper.corpus_id,
    )


def build_runtime_eval_query_cases(
    papers: Sequence[RuntimeEvalPaperRecord],
    *,
    query_families: Sequence[RuntimeEvalQueryFamily] | None = None,
) -> list[RuntimeEvalQueryCase]:
    active_families = list(
        query_families
        or (
            RuntimeEvalQueryFamily.TITLE_GLOBAL,
            RuntimeEvalQueryFamily.TITLE_SELECTED,
            RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
        )
    )
    cases: list[RuntimeEvalQueryCase] = []
    for paper in papers:
        stratum_key = runtime_eval_stratum_key(paper)
        title_query = _normalize_query_text(paper.title, max_chars=_TITLE_MAX_CHARS)
        sentence_query = (
            _normalize_query_text(
                paper.representative_sentence,
                max_chars=_SENTENCE_MAX_CHARS,
                max_words=_SENTENCE_MAX_WORDS,
            )
            if paper.representative_sentence
            else ""
        )
        for family in active_families:
            if family == RuntimeEvalQueryFamily.TITLE_GLOBAL and title_query:
                cases.append(
                    RuntimeEvalQueryCase(
                        corpus_id=paper.corpus_id,
                        title=paper.title,
                        primary_source_system=paper.primary_source_system,
                        query_family=family,
                        query=title_query,
                        stratum_key=stratum_key,
                        representative_section_role=paper.representative_section_role,
                    )
                )
            elif family == RuntimeEvalQueryFamily.TITLE_SELECTED and title_query:
                cases.append(
                    RuntimeEvalQueryCase(
                        corpus_id=paper.corpus_id,
                        title=paper.title,
                        primary_source_system=paper.primary_source_system,
                        query_family=family,
                        query=title_query,
                        stratum_key=stratum_key,
                        representative_section_role=paper.representative_section_role,
                        selected_layer_key="paper",
                        selected_node_id=f"paper:{paper.corpus_id}",
                    )
                )
            elif family == RuntimeEvalQueryFamily.SENTENCE_GLOBAL and sentence_query:
                cases.append(
                    RuntimeEvalQueryCase(
                        corpus_id=paper.corpus_id,
                        title=paper.title,
                        primary_source_system=paper.primary_source_system,
                        query_family=family,
                        query=sentence_query,
                        stratum_key=stratum_key,
                        representative_section_role=paper.representative_section_role,
                    )
                )
    return cases


def population_summary(
    *,
    population: Sequence[RuntimeEvalPaperRecord],
    sample: Sequence[RuntimeEvalPaperRecord],
    requested_ids: Sequence[int] | None = None,
    missing_requested_ids: Sequence[int] | None = None,
) -> RuntimeEvalPopulationSummary:
    source_counts = Counter(paper.primary_source_system for paper in sample)
    stratum_counts = Counter(runtime_eval_stratum_key(paper) for paper in sample)
    sentence_seed_papers = sum(1 for paper in sample if paper.representative_sentence)
    return RuntimeEvalPopulationSummary(
        population_papers=len(population),
        sampled_papers=len(sample),
        sentence_seed_papers=sentence_seed_papers,
        requested_papers=len(requested_ids or []),
        missing_requested_corpus_ids=list(missing_requested_ids or []),
        sampled_by_source_system=dict(sorted(source_counts.items())),
        sampled_by_stratum=dict(sorted(stratum_counts.items())),
    )


def fetch_runtime_eval_cohort_candidates(
    *,
    graph_run_id: str,
    sample_size: int,
    seed: int,
    missing_documents_only: bool = True,
    min_citation_count: int = 5,
    allowed_text_profiles: Sequence[str] | None = None,
    connect: Callable[..., object] | None = None,
) -> list[RuntimeEvalCohortCandidate]:
    connect_fn = connect or db.pooled
    prefetch_limit = max(sample_size * 8, 64)
    allowed_profiles = list(allowed_text_profiles or ("fulltext", "abstract"))
    with connect_fn() as conn, conn.cursor() as cur:
        cur.execute(
            _RUNTIME_EVAL_COHORT_SQL,
            (
                graph_run_id,
                missing_documents_only,
                min_citation_count,
                allowed_profiles,
                sample_size,
                seed,
                prefetch_limit,
            ),
        )
        return [RuntimeEvalCohortCandidate.model_validate(dict(row)) for row in cur.fetchall()]


def prepare_runtime_eval_cohort(
    *,
    graph_release_id: str = "current",
    sample_size: int = 192,
    seed: int = 7,
    missing_documents_only: bool = True,
    min_citation_count: int = 5,
    allowed_text_profiles: Sequence[str] | None = None,
    connect: Callable[..., object] | None = None,
) -> RagRuntimeEvalCohortReport:
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(connect=connect_fn)
    release = repository.resolve_graph_release(graph_release_id)
    allowed_profiles = list(allowed_text_profiles or ("fulltext", "abstract"))
    candidate_rows = fetch_runtime_eval_cohort_candidates(
        graph_run_id=release.graph_run_id,
        sample_size=sample_size,
        seed=seed,
        missing_documents_only=missing_documents_only,
        min_citation_count=min_citation_count,
        allowed_text_profiles=allowed_profiles,
        connect=connect_fn,
    )
    selected_rows = _stratified_round_robin_sample(
        candidate_rows,
        sample_size=sample_size,
        seed=seed,
        stratum_key=lambda row: row.stratum_key,
        sort_key=lambda row: row.corpus_id,
    )
    selected_counts = Counter(row.stratum_key for row in selected_rows)
    population_counts: dict[str, int] = {}
    population_size = 0
    for row in candidate_rows:
        population_counts.setdefault(row.stratum_key, int(row.stratum_population_count))
        population_size = max(population_size, int(row.candidate_population_size))
    return RagRuntimeEvalCohortReport(
        graph_release_id=release.graph_release_id,
        graph_run_id=release.graph_run_id,
        bundle_checksum=release.bundle_checksum,
        graph_name=release.graph_name,
        requested_sample_size=sample_size,
        seed=seed,
        missing_documents_only=missing_documents_only,
        min_citation_count=min_citation_count,
        allowed_text_profiles=allowed_profiles,
        candidate_population_size=population_size,
        selected_count=len(selected_rows),
        selected_by_stratum=dict(sorted(selected_counts.items())),
        candidate_population_by_stratum=dict(sorted(population_counts.items())),
        candidates=selected_rows,
    )


def runtime_eval_cohort_stratum_key(candidate: RuntimeEvalCohortCandidate) -> str:
    return candidate.stratum_key


def select_runtime_eval_cohort_sample(
    candidates: Sequence[RuntimeEvalCohortCandidate],
    *,
    sample_size: int,
    seed: int = 7,
) -> list[RuntimeEvalCohortCandidate]:
    return _stratified_round_robin_sample(
        candidates,
        sample_size=sample_size,
        seed=seed,
        stratum_key=lambda candidate: candidate.stratum_key,
        sort_key=lambda candidate: candidate.corpus_id,
    )
