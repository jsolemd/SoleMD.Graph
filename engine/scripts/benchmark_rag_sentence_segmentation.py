"""Benchmark sentence segmentation backends over bounded warehouse prose samples."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from pydantic import Field

# Add engine/ to path so app imports work when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import db
from app.rag.parse_contract import PaperBlockKind, ParseContractModel
from app.rag_ingest.sentence_segmentation import (
    DeterministicSentenceSegmenter,
    SentenceSegmentationUnavailable,
    StanzaSentenceSegmenter,
    SyntokSentenceSegmenter,
)


class SampledBlock(ParseContractModel):
    corpus_id: int
    block_ordinal: int
    block_kind: PaperBlockKind
    text: str


class SegmenterBenchmarkResult(ParseContractModel):
    name: str
    available: bool = True
    unavailable_reason: str | None = None
    blocks_attempted: int = 0
    blocks_processed: int = 0
    sentences_emitted: int = 0
    elapsed_ms: float = 0.0
    avg_ms_per_block: float = 0.0
    avg_sentences_per_block: float = 0.0
    invalid_offset_count: int = 0
    text_mismatch_count: int = 0
    overlapping_sentence_count: int = 0
    non_monotonic_block_count: int = 0
    tiny_sentence_count: int = 0
    single_token_sentence_count: int = 0


class SentenceSegmentationBenchmarkReport(ParseContractModel):
    corpus_ids: list[int] = Field(default_factory=list)
    sampled_blocks: int = 0
    limit: int = 0
    block_kinds: list[str] = Field(default_factory=list)
    results: list[SegmenterBenchmarkResult] = Field(default_factory=list)


def _unique_ints(values: list[int]) -> list[int]:
    return sorted({int(value) for value in values})


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Benchmark sentence segmentation backends on canonical warehouse prose blocks."
    )
    parser.add_argument("--corpus-id", dest="corpus_ids", action="append", type=int, default=None)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument(
        "--report-path",
        type=Path,
        default=None,
        help="Optional path to write the JSON report.",
    )
    return parser.parse_args(argv)


def _sample_blocks(*, corpus_ids: list[int], limit: int) -> list[SampledBlock]:
    where_clauses = [
        "block_kind IN ('narrative_paragraph', 'figure_caption', 'table_caption', 'table_footnote')",
        "trim(text) <> ''",
    ]
    params: list[object] = []
    if corpus_ids:
        where_clauses.append("corpus_id = ANY(%s)")
        params.append(corpus_ids)
    params.append(limit)
    sql = f"""
    SELECT
        corpus_id,
        block_ordinal,
        block_kind,
        text
    FROM solemd.paper_blocks
    WHERE {' AND '.join(where_clauses)}
    ORDER BY corpus_id, block_ordinal
    LIMIT %s
    """
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(sql, tuple(params))
        return [
            SampledBlock(
                corpus_id=int(row["corpus_id"]),
                block_ordinal=int(row["block_ordinal"]),
                block_kind=PaperBlockKind(row["block_kind"]),
                text=str(row["text"]),
            )
            for row in cur.fetchall()
        ]


def _benchmark_segmenter(
    *,
    name: str,
    segmenter,
    blocks: list[SampledBlock],
) -> SegmenterBenchmarkResult:
    result = SegmenterBenchmarkResult(name=name, blocks_attempted=len(blocks))
    for block in blocks:
        started = time.perf_counter()
        try:
            spans = segmenter.segment(
                text=block.text,
                absolute_start=0,
                block_kind=block.block_kind,
            )
        except SentenceSegmentationUnavailable as exc:
            result.available = False
            result.unavailable_reason = str(exc)
            return result
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        result.elapsed_ms += elapsed_ms
        result.blocks_processed += 1
        result.sentences_emitted += len(spans)

        previous_end: int | None = None
        is_non_monotonic = False
        for span in spans:
            relative_start = span.source_start_offset
            relative_end = span.source_end_offset
            if (
                relative_start < 0
                or relative_end > len(block.text)
                or relative_start >= relative_end
            ):
                result.invalid_offset_count += 1
                continue
            if block.text[relative_start:relative_end] != span.text:
                result.text_mismatch_count += 1
            if previous_end is not None and span.source_start_offset < previous_end:
                result.overlapping_sentence_count += 1
                is_non_monotonic = True
            previous_end = span.source_end_offset
            token_count = len([token for token in span.text.split() if token])
            if token_count < 3:
                result.tiny_sentence_count += 1
            if token_count == 1:
                result.single_token_sentence_count += 1
        if is_non_monotonic:
            result.non_monotonic_block_count += 1

    if result.blocks_processed:
        result.avg_ms_per_block = round(result.elapsed_ms / result.blocks_processed, 3)
        result.avg_sentences_per_block = round(
            result.sentences_emitted / result.blocks_processed,
            3,
        )
    result.elapsed_ms = round(result.elapsed_ms, 3)
    return result


def benchmark_sentence_segmentation(
    *,
    corpus_ids: list[int],
    limit: int,
) -> SentenceSegmentationBenchmarkReport:
    normalized_ids = _unique_ints(corpus_ids)
    sampled_blocks = _sample_blocks(corpus_ids=normalized_ids, limit=limit)
    segmenters = [
        ("stanza_biomedical", StanzaSentenceSegmenter()),
        ("syntok", SyntokSentenceSegmenter()),
        ("deterministic_fallback", DeterministicSentenceSegmenter()),
    ]
    results = [
        _benchmark_segmenter(name=name, segmenter=segmenter, blocks=sampled_blocks)
        for name, segmenter in segmenters
    ]
    return SentenceSegmentationBenchmarkReport(
        corpus_ids=normalized_ids,
        sampled_blocks=len(sampled_blocks),
        limit=limit,
        block_kinds=[
            str(PaperBlockKind.NARRATIVE_PARAGRAPH),
            str(PaperBlockKind.FIGURE_CAPTION),
            str(PaperBlockKind.TABLE_CAPTION),
            str(PaperBlockKind.TABLE_FOOTNOTE),
        ],
        results=results,
    )


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    report = benchmark_sentence_segmentation(
        corpus_ids=args.corpus_ids or [],
        limit=args.limit,
    )
    report_json = report.model_dump_json(indent=2)
    if args.report_path is not None:
        args.report_path.parent.mkdir(parents=True, exist_ok=True)
        args.report_path.write_text(report_json)
    print(report_json)
    db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
