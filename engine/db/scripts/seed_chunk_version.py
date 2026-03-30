"""Seed the canonical default chunk-version row through the live write seam."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Protocol

# Add engine/ to path so app imports work when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pydantic import Field

from app.rag.chunk_seed import ChunkSeedResult, RagChunkSeeder
from app.rag.parse_contract import ParseContractModel


class ChunkSeedRunner(Protocol):
    def seed_default(
        self,
        *,
        source_revision_keys: list[str],
        parser_version: str,
        embedding_model: str | None = None,
    ) -> ChunkSeedResult: ...


class ChunkSeedExecutionReport(ParseContractModel):
    chunk_version_key: str
    source_revision_keys: list[str] = Field(default_factory=list)
    parser_version: str
    batch_total_rows: int
    written_rows: int
    deferred_stage_names: list[str] = Field(default_factory=list)
    executed: bool


def seed_default_chunk_version(
    *,
    source_revision_keys: list[str],
    parser_version: str,
    embedding_model: str | None = None,
    runner: ChunkSeedRunner | None = None,
) -> ChunkSeedExecutionReport:
    seeder = runner or RagChunkSeeder()
    result = seeder.seed_default(
        source_revision_keys=source_revision_keys,
        parser_version=parser_version,
        embedding_model=embedding_model,
    )
    return ChunkSeedExecutionReport(
        chunk_version_key=result.chunk_version_key,
        source_revision_keys=list(result.source_revision_keys),
        parser_version=parser_version,
        batch_total_rows=result.batch_total_rows,
        written_rows=result.written_rows,
        deferred_stage_names=list(result.deferred_stage_names),
        executed=result.written_rows > 0,
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed the canonical default chunk-version row.",
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
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    report = seed_default_chunk_version(
        source_revision_keys=args.source_revision_keys,
        parser_version=args.parser_version,
        embedding_model=args.embedding_model,
    )
    print(report.model_dump_json(indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
