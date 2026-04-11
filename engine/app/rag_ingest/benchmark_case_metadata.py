"""Shared helpers for benchmark case coverage metadata."""

from __future__ import annotations

from collections.abc import Callable, Sequence

from app import db
from app.rag.parse_contract import ParseContractModel
from app.rag.query_enrichment import normalize_title_key
from app.rag_ingest.runtime_eval_models import RuntimeEvalPaperRecord


class BenchmarkCaseMetadata(ParseContractModel):
    normalized_title_key: str | None = None
    has_chunks: bool = False
    has_entities: bool = False
    has_sentence_seed: bool = False
    coverage_bucket: str | None = None
    warehouse_depth: str | None = None


class LiveBenchmarkCaseCoverage(BenchmarkCaseMetadata):
    corpus_id: int
    title: str | None = None
    primary_source_system: str | None = None
    text_availability: str | None = None
    has_abstract: bool = False
    pmid: int | None = None
    pmc_id: str | None = None
    doi: str | None = None


def derive_warehouse_depth(
    *,
    has_chunks: bool,
    has_entities: bool,
    has_sentence_seed: bool,
) -> str:
    if has_chunks and has_entities and has_sentence_seed:
        return "chunks_entities_sentence"
    if has_chunks and has_entities:
        return "chunks_entities"
    if has_chunks:
        return "chunks_only"
    if has_entities:
        return "entities_only"
    return "sparse"


def derive_coverage_bucket(*, warehouse_depth: str) -> str:
    if warehouse_depth == "chunks_entities_sentence":
        return "covered"
    return "partial"


def derive_benchmark_case_metadata(
    title: str | None,
    *,
    has_chunks: bool,
    has_entities: bool,
    has_sentence_seed: bool,
) -> BenchmarkCaseMetadata:
    warehouse_depth = derive_warehouse_depth(
        has_chunks=has_chunks,
        has_entities=has_entities,
        has_sentence_seed=has_sentence_seed,
    )
    return BenchmarkCaseMetadata(
        normalized_title_key=normalize_title_key(title) if title else None,
        has_chunks=has_chunks,
        has_entities=has_entities,
        has_sentence_seed=has_sentence_seed,
        coverage_bucket=derive_coverage_bucket(warehouse_depth=warehouse_depth),
        warehouse_depth=warehouse_depth,
    )


def derive_benchmark_case_metadata_from_counts(
    title: str,
    *,
    chunk_count: int,
    entity_mention_count: int,
    has_sentence_seed: bool,
) -> BenchmarkCaseMetadata:
    return derive_benchmark_case_metadata(
        title,
        has_chunks=chunk_count > 0,
        has_entities=entity_mention_count > 0,
        has_sentence_seed=has_sentence_seed,
    )


def derive_benchmark_case_metadata_from_paper(
    paper: RuntimeEvalPaperRecord,
) -> BenchmarkCaseMetadata:
    return derive_benchmark_case_metadata_from_counts(
        paper.title,
        chunk_count=paper.chunk_count,
        entity_mention_count=paper.entity_mention_count,
        has_sentence_seed=bool(paper.representative_sentence),
    )


_LIVE_BENCHMARK_CASE_COVERAGE_SQL = """
WITH target_ids AS (
    SELECT unnest(%s::BIGINT[]) AS corpus_id
),
paper_rows AS (
    SELECT
        p.corpus_id,
        p.title,
        p.text_availability,
        CASE
            WHEN COALESCE(NULLIF(btrim(p.abstract), ''), '') <> '' THEN TRUE
            ELSE FALSE
        END AS has_abstract
    FROM solemd.papers p
    JOIN target_ids t USING (corpus_id)
),
document_rows AS (
    SELECT
        pd.corpus_id,
        pd.primary_source_system
    FROM solemd.paper_documents pd
    WHERE pd.corpus_id = ANY(%s::BIGINT[])
),
corpus_rows AS (
    SELECT
        c.corpus_id,
        c.pmid,
        c.pmc_id,
        c.doi
    FROM solemd.corpus c
    WHERE c.corpus_id = ANY(%s::BIGINT[])
),
chunk_counts AS (
    SELECT
        pc.corpus_id,
        COUNT(*)::INT AS chunk_count
    FROM solemd.paper_chunks pc
    WHERE pc.corpus_id = ANY(%s::BIGINT[])
      AND pc.chunk_version_key = %s
    GROUP BY pc.corpus_id
),
entity_counts AS (
    SELECT
        pem.corpus_id,
        COUNT(*)::INT AS entity_mention_count
    FROM solemd.paper_entity_mentions pem
    WHERE pem.corpus_id = ANY(%s::BIGINT[])
    GROUP BY pem.corpus_id
),
sentence_seed_rows AS (
    SELECT DISTINCT s.corpus_id
    FROM solemd.paper_sentences s
    JOIN solemd.paper_blocks b
      ON b.corpus_id = s.corpus_id
     AND b.block_ordinal = s.block_ordinal
    LEFT JOIN solemd.paper_sections sec
      ON sec.corpus_id = s.corpus_id
     AND sec.section_ordinal = s.section_ordinal
    WHERE s.corpus_id = ANY(%s::BIGINT[])
      AND b.block_kind = 'narrative_paragraph'
      AND b.is_retrieval_default = TRUE
      AND char_length(trim(s.text)) BETWEEN 60 AND 220
)
SELECT
    t.corpus_id,
    p.title,
    dr.primary_source_system,
    p.text_availability,
    COALESCE(p.has_abstract, FALSE) AS has_abstract,
    cr.pmid,
    cr.pmc_id,
    cr.doi,
    COALESCE(cc.chunk_count, 0) AS chunk_count,
    COALESCE(ec.entity_mention_count, 0) AS entity_mention_count,
    EXISTS(
        SELECT 1
        FROM sentence_seed_rows ss
        WHERE ss.corpus_id = t.corpus_id
    ) AS has_sentence_seed
FROM target_ids t
LEFT JOIN paper_rows p USING (corpus_id)
LEFT JOIN document_rows dr USING (corpus_id)
LEFT JOIN corpus_rows cr USING (corpus_id)
LEFT JOIN chunk_counts cc USING (corpus_id)
LEFT JOIN entity_counts ec USING (corpus_id)
ORDER BY t.corpus_id
"""


def load_live_benchmark_case_coverage(
    *,
    corpus_ids: Sequence[int],
    chunk_version_key: str,
    connect: Callable[..., object] | None = None,
) -> dict[int, LiveBenchmarkCaseCoverage]:
    normalized_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
    if not normalized_ids:
        return {}

    connect_fn = connect or db.pooled
    with connect_fn() as conn, conn.cursor() as cur:
        cur.execute(
            _LIVE_BENCHMARK_CASE_COVERAGE_SQL,
            (
                normalized_ids,
                normalized_ids,
                normalized_ids,
                normalized_ids,
                chunk_version_key,
                normalized_ids,
                normalized_ids,
            ),
        )
        rows = cur.fetchall()

    coverage_by_corpus_id: dict[int, LiveBenchmarkCaseCoverage] = {}
    for row in rows:
        metadata = derive_benchmark_case_metadata_from_counts(
            row["title"],
            chunk_count=int(row["chunk_count"] or 0),
            entity_mention_count=int(row["entity_mention_count"] or 0),
            has_sentence_seed=bool(row["has_sentence_seed"]),
        )
        coverage = LiveBenchmarkCaseCoverage(
            corpus_id=int(row["corpus_id"]),
            title=row["title"],
            primary_source_system=row["primary_source_system"],
            text_availability=row["text_availability"],
            has_abstract=bool(row["has_abstract"]),
            pmid=row["pmid"],
            pmc_id=row["pmc_id"],
            doi=row["doi"],
            **metadata.model_dump(),
        )
        coverage_by_corpus_id[coverage.corpus_id] = coverage
    return coverage_by_corpus_id
