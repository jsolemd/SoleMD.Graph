"""Backfill derived chunk rows from canonical block and sentence tables."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Protocol

# Add engine/ to path so app imports work when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pydantic import Field

from app import db
from app.rag.chunk_backfill import (
    ChunkBackfillResult,
    ChunkBackfillRowGroup,
    RagChunkBackfillWriter,
)
from app.rag.chunk_policy import build_default_chunk_version
from app.rag.parse_contract import ParseContractModel
from app.rag.rag_schema_contract import PaperBlockRow, PaperSentenceRow
from app.rag.write_repository import PostgresRagWriteRepository
from db.scripts.chunk_backfill_checkpoint import (
    checkpoint_paths as chunk_backfill_checkpoint_paths,
    load_checkpoint_state,
    reset_checkpoint_state,
    save_checkpoint_state,
)

_BLOCK_ROWS_SQL = """
SELECT
    corpus_id,
    block_ordinal,
    section_ordinal,
    section_role,
    block_kind,
    text,
    is_retrieval_default,
    linked_asset_ref
FROM solemd.paper_blocks
WHERE corpus_id = ANY(%s)
ORDER BY corpus_id, block_ordinal
"""

_SENTENCE_ROWS_SQL = """
SELECT
    corpus_id,
    block_ordinal,
    sentence_ordinal,
    section_ordinal,
    segmentation_source,
    text
FROM solemd.paper_sentences
WHERE corpus_id = ANY(%s)
ORDER BY corpus_id, block_ordinal, sentence_ordinal
"""


class CanonicalChunkRows(ParseContractModel):
    corpus_id: int
    blocks: list[PaperBlockRow] = Field(default_factory=list)
    sentences: list[PaperSentenceRow] = Field(default_factory=list)


class CanonicalChunkLoader(Protocol):
    def load_rows(
        self,
        *,
        corpus_ids: list[int],
    ) -> dict[int, CanonicalChunkRows]: ...


class ChunkBackfillRunner(Protocol):
    def backfill_row_groups(
        self,
        *,
        chunk_version,
        row_groups,
    ) -> ChunkBackfillResult: ...


class ChunkBackfillPaperReport(ParseContractModel):
    corpus_id: int
    block_rows: int = 0
    sentence_rows: int = 0
    chunk_rows: int = 0
    chunk_member_rows: int = 0
    batch_total_rows: int = 0
    written_rows: int = 0
    deferred_stage_names: list[str] = Field(default_factory=list)
    executed: bool = False
    skipped_reason: str | None = None


class ChunkBackfillExecutionReport(ParseContractModel):
    chunk_version_key: str
    source_revision_keys: list[str] = Field(default_factory=list)
    parser_version: str
    corpus_ids: list[int] = Field(default_factory=list)
    papers: list[ChunkBackfillPaperReport] = Field(default_factory=list)
    total_block_rows: int = 0
    total_sentence_rows: int = 0
    total_chunk_rows: int = 0
    total_chunk_member_rows: int = 0
    total_batch_rows: int = 0
    total_written_rows: int = 0
    deferred_stage_names: list[str] = Field(default_factory=list)
    missing_corpus_ids: list[int] = Field(default_factory=list)
    executed: bool = False
    checkpoint_run_id: str | None = None
    checkpoint_dir: str | None = None
    resumed_from_checkpoint: bool = False


class PostgresCanonicalChunkLoader:
    """Load canonical block and sentence rows for chunk backfill."""

    def __init__(self, connect=None):
        self._connect = connect or db.pooled

    def load_rows(
        self,
        *,
        corpus_ids: list[int],
    ) -> dict[int, CanonicalChunkRows]:
        normalized = _normalize_corpus_ids(corpus_ids)
        if not normalized:
            return {}

        by_corpus: dict[int, CanonicalChunkRows] = {
            corpus_id: CanonicalChunkRows(corpus_id=corpus_id) for corpus_id in normalized
        }
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(_BLOCK_ROWS_SQL, (normalized,))
            for row in cur.fetchall():
                block = PaperBlockRow.model_validate(row)
                by_corpus.setdefault(
                    int(block.corpus_id),
                    CanonicalChunkRows(corpus_id=int(block.corpus_id)),
                ).blocks.append(block)

            cur.execute(_SENTENCE_ROWS_SQL, (normalized,))
            for row in cur.fetchall():
                sentence = PaperSentenceRow.model_validate(row)
                by_corpus.setdefault(
                    int(sentence.corpus_id),
                    CanonicalChunkRows(corpus_id=int(sentence.corpus_id)),
                ).sentences.append(sentence)
        return by_corpus


def _normalize_corpus_ids(corpus_ids: list[int] | tuple[int, ...]) -> list[int]:
    return list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))


def _is_terminal_paper_report(report: ChunkBackfillPaperReport) -> bool:
    return report.executed or report.skipped_reason is not None


def _merge_paper_reports(
    existing: list[ChunkBackfillPaperReport],
    additions: list[ChunkBackfillPaperReport],
    *,
    requested_corpus_ids: list[int],
) -> list[ChunkBackfillPaperReport]:
    merged_by_corpus = {report.corpus_id: report for report in existing}
    for report in additions:
        merged_by_corpus[report.corpus_id] = report
    return [
        merged_by_corpus[corpus_id]
        for corpus_id in requested_corpus_ids
        if corpus_id in merged_by_corpus
    ]


def _build_execution_report(
    *,
    chunk_version_key: str,
    source_revision_keys: list[str],
    parser_version: str,
    corpus_ids: list[int],
    papers: list[ChunkBackfillPaperReport],
    checkpoint_run_id: str | None = None,
    checkpoint_dir: str | None = None,
    resumed_from_checkpoint: bool = False,
) -> ChunkBackfillExecutionReport:
    deferred_stage_names = sorted(
        {
            stage_name
            for paper in papers
            for stage_name in paper.deferred_stage_names
        }
    )
    missing_corpus_ids = [
        paper.corpus_id for paper in papers if paper.skipped_reason == "no_block_rows"
    ]
    return ChunkBackfillExecutionReport(
        chunk_version_key=chunk_version_key,
        source_revision_keys=source_revision_keys,
        parser_version=parser_version,
        corpus_ids=corpus_ids,
        papers=papers,
        total_block_rows=sum(paper.block_rows for paper in papers),
        total_sentence_rows=sum(paper.sentence_rows for paper in papers),
        total_chunk_rows=sum(paper.chunk_rows for paper in papers),
        total_chunk_member_rows=sum(paper.chunk_member_rows for paper in papers),
        total_batch_rows=sum(paper.batch_total_rows for paper in papers),
        total_written_rows=sum(paper.written_rows for paper in papers),
        deferred_stage_names=deferred_stage_names,
        missing_corpus_ids=missing_corpus_ids,
        executed=any(paper.executed for paper in papers),
        checkpoint_run_id=checkpoint_run_id,
        checkpoint_dir=checkpoint_dir,
        resumed_from_checkpoint=resumed_from_checkpoint,
    )


def backfill_default_chunks(
    *,
    corpus_ids: list[int] | tuple[int, ...],
    source_revision_keys: list[str],
    parser_version: str,
    embedding_model: str | None = None,
    batch_size: int = 250,
    loader: CanonicalChunkLoader | None = None,
    runner: ChunkBackfillRunner | None = None,
) -> ChunkBackfillExecutionReport:
    normalized_corpus_ids = _normalize_corpus_ids(corpus_ids)
    normalized_source_revision_keys = list(dict.fromkeys(source_revision_keys))
    chunk_version = build_default_chunk_version(
        source_revision_keys=normalized_source_revision_keys,
        parser_version=parser_version,
        embedding_model=embedding_model,
    )
    row_loader = loader or PostgresCanonicalChunkLoader()
    backfill_runner = runner or RagChunkBackfillWriter(
        repository=PostgresRagWriteRepository(connect=db.connect)
    )
    loaded_rows = row_loader.load_rows(corpus_ids=normalized_corpus_ids)

    eligible_groups: list[ChunkBackfillRowGroup] = []
    paper_reports_by_corpus: dict[int, ChunkBackfillPaperReport] = {}

    for corpus_id in normalized_corpus_ids:
        rows = loaded_rows.get(corpus_id) or CanonicalChunkRows(corpus_id=corpus_id)
        block_rows = len(rows.blocks)
        sentence_rows = len(rows.sentences)

        if block_rows == 0:
            paper_reports_by_corpus[corpus_id] = ChunkBackfillPaperReport(
                corpus_id=corpus_id,
                block_rows=0,
                sentence_rows=sentence_rows,
                skipped_reason="no_block_rows",
            )
            continue

        eligible_groups.append(
            ChunkBackfillRowGroup(
                corpus_id=corpus_id,
                blocks=rows.blocks,
                sentences=rows.sentences,
            )
        )
        paper_reports_by_corpus[corpus_id] = ChunkBackfillPaperReport(
            corpus_id=corpus_id,
            block_rows=block_rows,
            sentence_rows=sentence_rows,
        )

    if batch_size <= 0:
        raise ValueError("batch_size must be positive")

    for start in range(0, len(eligible_groups), batch_size):
        group_batch = eligible_groups[start : start + batch_size]
        result = backfill_runner.backfill_row_groups(
            chunk_version=chunk_version,
            row_groups=group_batch,
        )

        paper_result_map = {paper.corpus_id: paper for paper in result.papers}
        for group in group_batch:
            paper_report = paper_reports_by_corpus[group.corpus_id]
            paper_result = paper_result_map.get(group.corpus_id)
            if paper_result is not None:
                paper_report.chunk_rows = paper_result.chunk_rows
                paper_report.chunk_member_rows = paper_result.chunk_member_rows
            paper_report.batch_total_rows = (
                paper_report.chunk_rows + paper_report.chunk_member_rows
            )
            paper_report.written_rows = (
                paper_report.batch_total_rows if result.written_rows > 0 else 0
            )
            paper_report.deferred_stage_names = list(result.deferred_stage_names)
            paper_report.executed = result.written_rows > 0

    return _build_execution_report(
        chunk_version_key=chunk_version.chunk_version_key,
        source_revision_keys=list(chunk_version.source_revision_keys),
        parser_version=parser_version,
        corpus_ids=normalized_corpus_ids,
        papers=[paper_reports_by_corpus[corpus_id] for corpus_id in normalized_corpus_ids],
    )


def run_chunk_backfill(
    *,
    corpus_ids: list[int] | tuple[int, ...],
    source_revision_keys: list[str],
    parser_version: str,
    embedding_model: str | None = None,
    batch_size: int = 250,
    run_id: str | None = None,
    reset_run: bool = False,
    checkpoint_root: Path | None = None,
    loader: CanonicalChunkLoader | None = None,
    runner: ChunkBackfillRunner | None = None,
) -> ChunkBackfillExecutionReport:
    normalized_corpus_ids = _normalize_corpus_ids(corpus_ids)
    normalized_source_revision_keys = list(dict.fromkeys(source_revision_keys))
    if not run_id:
        return backfill_default_chunks(
            corpus_ids=normalized_corpus_ids,
            source_revision_keys=normalized_source_revision_keys,
            parser_version=parser_version,
            embedding_model=embedding_model,
            batch_size=batch_size,
            loader=loader,
            runner=runner,
        )

    checkpoint_paths = chunk_backfill_checkpoint_paths(
        run_id,
        root=checkpoint_root,
    )
    if reset_run:
        reset_checkpoint_state(checkpoint_paths)

    checkpoint_state = load_checkpoint_state(checkpoint_paths)
    prior_report = (
        ChunkBackfillExecutionReport.model_validate(checkpoint_state.report_json)
        if checkpoint_state is not None
        else None
    )
    if prior_report is not None:
        if prior_report.parser_version != parser_version:
            raise ValueError("checkpoint run parser_version does not match requested parser_version")
        if list(prior_report.source_revision_keys) != normalized_source_revision_keys:
            raise ValueError(
                "checkpoint run source_revision_keys do not match requested source_revision_keys"
            )
        if list(prior_report.corpus_ids) != normalized_corpus_ids:
            raise ValueError("checkpoint run corpus_ids do not match requested corpus_ids")
    resumed_from_checkpoint = checkpoint_state is not None
    completed_or_skipped = {
        paper.corpus_id
        for paper in (prior_report.papers if prior_report is not None else [])
        if _is_terminal_paper_report(paper)
    }
    pending_corpus_ids = [
        corpus_id
        for corpus_id in normalized_corpus_ids
        if corpus_id not in completed_or_skipped
    ]

    merged_report = prior_report or _build_execution_report(
        chunk_version_key=build_default_chunk_version(
            source_revision_keys=normalized_source_revision_keys,
            parser_version=parser_version,
            embedding_model=embedding_model,
        ).chunk_version_key,
        source_revision_keys=normalized_source_revision_keys,
        parser_version=parser_version,
        corpus_ids=normalized_corpus_ids,
        papers=[],
        checkpoint_run_id=run_id,
        checkpoint_dir=str(checkpoint_paths.root),
        resumed_from_checkpoint=resumed_from_checkpoint,
    )
    merged_report.checkpoint_run_id = run_id
    merged_report.checkpoint_dir = str(checkpoint_paths.root)
    merged_report.resumed_from_checkpoint = resumed_from_checkpoint

    if not pending_corpus_ids:
        save_checkpoint_state(
            checkpoint_paths,
            run_id=run_id,
            report_json=merged_report.model_dump(mode="python"),
        )
        return merged_report

    if batch_size <= 0:
        raise ValueError("batch_size must be positive")

    for start in range(0, len(pending_corpus_ids), batch_size):
        batch_ids = pending_corpus_ids[start : start + batch_size]
        batch_report = backfill_default_chunks(
            corpus_ids=batch_ids,
            source_revision_keys=normalized_source_revision_keys,
            parser_version=parser_version,
            embedding_model=embedding_model,
            batch_size=len(batch_ids),
            loader=loader,
            runner=runner,
        )
        merged_papers = _merge_paper_reports(
            merged_report.papers,
            batch_report.papers,
            requested_corpus_ids=normalized_corpus_ids,
        )
        merged_report = _build_execution_report(
            chunk_version_key=batch_report.chunk_version_key,
            source_revision_keys=list(batch_report.source_revision_keys),
            parser_version=parser_version,
            corpus_ids=normalized_corpus_ids,
            papers=merged_papers,
            checkpoint_run_id=run_id,
            checkpoint_dir=str(checkpoint_paths.root),
            resumed_from_checkpoint=resumed_from_checkpoint,
        )
        save_checkpoint_state(
            checkpoint_paths,
            run_id=run_id,
            report_json=merged_report.model_dump(mode="python"),
        )

    return merged_report


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill default structural chunks from canonical block/sentence rows.",
    )
    parser.add_argument(
        "--corpus-id",
        dest="corpus_ids",
        action="append",
        type=int,
        required=True,
        help="Corpus ID to backfill. Repeat for multiple papers.",
    )
    parser.add_argument(
        "--source-revision-key",
        dest="source_revision_keys",
        action="append",
        required=True,
        help="Source revision key, e.g. s2orc_v2:2026-03-10",
    )
    parser.add_argument(
        "--parser-version",
        required=True,
        help="Parser version used for the canonical span parse.",
    )
    parser.add_argument(
        "--embedding-model",
        default=None,
        help="Optional embedding model to record on the chunk version row.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=250,
        help="Number of corpus IDs to backfill per staged write batch.",
    )
    parser.add_argument(
        "--run-id",
        default=None,
        help="Optional checkpoint run id for resumable chunk backfill.",
    )
    parser.add_argument(
        "--reset-run",
        action="store_true",
        help="Reset any existing checkpoint metadata for --run-id before backfilling.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        report = run_chunk_backfill(
            corpus_ids=args.corpus_ids,
            source_revision_keys=args.source_revision_keys,
            parser_version=args.parser_version,
            embedding_model=args.embedding_model,
            batch_size=args.batch_size,
            run_id=args.run_id,
            reset_run=args.reset_run,
        )
        print(report.model_dump_json(indent=2))
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
