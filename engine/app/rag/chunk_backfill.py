"""Runtime backfill writer contract for derived chunk rows."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from pydantic import Field

from app.rag.rag_schema_contract import PaperBlockRow, PaperSentenceRow
from app.rag.parse_contract import ParseContractModel
from app.rag.serving_contract import PaperChunkVersionRecord
from app.rag.write_batch_builder import build_chunk_write_batch_from_rows
from app.rag.write_contract import RagWarehouseWriteBatch
from app.rag.write_repository import PostgresRagWriteRepository, RagWriteExecutionResult


class ChunkBackfillBatchWriter(Protocol):
    def apply_write_batch(self, batch: RagWarehouseWriteBatch) -> RagWriteExecutionResult: ...


class ChunkBackfillRowGroup(ParseContractModel):
    corpus_id: int
    blocks: list[PaperBlockRow] = Field(default_factory=list)
    sentences: list[PaperSentenceRow] = Field(default_factory=list)


class ChunkBackfillPaperResult(ParseContractModel):
    corpus_id: int
    chunk_rows: int
    chunk_member_rows: int


class ChunkBackfillResult(ParseContractModel):
    chunk_version_key: str
    chunk_rows: int
    chunk_member_rows: int
    batch_total_rows: int
    written_rows: int
    papers: list[ChunkBackfillPaperResult] = Field(default_factory=list)
    deferred_stage_names: list[str] = Field(default_factory=list)


class RagChunkBackfillWriter:
    """Backfill derived chunk rows from canonical block and sentence rows."""

    def __init__(self, repository: ChunkBackfillBatchWriter | None = None):
        self._repository = repository or PostgresRagWriteRepository()

    def backfill_rows(
        self,
        *,
        chunk_version: PaperChunkVersionRecord,
        blocks: Sequence[PaperBlockRow],
        sentences: Sequence[PaperSentenceRow],
    ) -> ChunkBackfillResult:
        corpus_ids = {
            int(row.corpus_id)
            for row in [*blocks, *sentences]
        }
        if not corpus_ids:
            return ChunkBackfillResult(
                chunk_version_key=chunk_version.chunk_version_key,
                chunk_rows=0,
                chunk_member_rows=0,
                batch_total_rows=0,
                written_rows=0,
                papers=[],
                deferred_stage_names=[],
            )
        if len(corpus_ids) > 1:
            raise ValueError("chunk backfill batches must contain rows for exactly one corpus_id")
        corpus_id = next(iter(corpus_ids))
        return self.backfill_row_groups(
            chunk_version=chunk_version,
            row_groups=[
                ChunkBackfillRowGroup(
                    corpus_id=corpus_id,
                    blocks=list(blocks),
                    sentences=list(sentences),
                )
            ],
        )

    def backfill_row_groups(
        self,
        *,
        chunk_version: PaperChunkVersionRecord,
        row_groups: Sequence[ChunkBackfillRowGroup],
    ) -> ChunkBackfillResult:
        if not row_groups:
            return ChunkBackfillResult(
                chunk_version_key=chunk_version.chunk_version_key,
                chunk_rows=0,
                chunk_member_rows=0,
                batch_total_rows=0,
                written_rows=0,
                papers=[],
                deferred_stage_names=[],
            )

        batch = RagWarehouseWriteBatch()
        paper_results: list[ChunkBackfillPaperResult] = []
        seen_corpus_ids: set[int] = set()

        for row_group in row_groups:
            if row_group.corpus_id in seen_corpus_ids:
                raise ValueError("chunk backfill row groups must have unique corpus_ids")
            seen_corpus_ids.add(row_group.corpus_id)

            chunk_batch = build_chunk_write_batch_from_rows(
                chunk_version=chunk_version,
                blocks=row_group.blocks,
                sentences=row_group.sentences,
                include_chunk_version_row=False,
            )
            batch.chunks.extend(chunk_batch.chunks)
            batch.chunk_members.extend(chunk_batch.chunk_members)
            paper_results.append(
                ChunkBackfillPaperResult(
                    corpus_id=row_group.corpus_id,
                    chunk_rows=len(chunk_batch.chunks),
                    chunk_member_rows=len(chunk_batch.chunk_members),
                )
            )

        execution = self._repository.apply_write_batch(batch)
        return ChunkBackfillResult(
            chunk_version_key=chunk_version.chunk_version_key,
            chunk_rows=len(batch.chunks),
            chunk_member_rows=len(batch.chunk_members),
            batch_total_rows=execution.total_rows,
            written_rows=execution.written_rows,
            papers=paper_results,
            deferred_stage_names=[
                stage.stage for stage in execution.stages if stage.status == "deferred"
            ],
        )
