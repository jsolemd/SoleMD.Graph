"""Tests for bulk citations ingest helpers."""

from __future__ import annotations

import pytest

from app.corpus._etl import sql_string_literal
from app.corpus.citations import _chunked_paths
from app.corpus.citations import _citation_scan_expr
from app.corpus.citations import run_citation_ingest


def test_sql_string_literal_escapes_quotes():
    assert sql_string_literal("a'b") == "'a''b'"


def test_citation_scan_expr_uses_explicit_schema(tmp_path):
    shard = tmp_path / "citations-0000.jsonl.gz"
    shard.write_text("")

    expr = _citation_scan_expr([shard])

    assert "read_json([" in expr
    assert "contexts: 'VARCHAR[]'" in expr
    assert "intents: 'VARCHAR[][]'" in expr


def test_chunked_paths_splits_batches(tmp_path):
    shards = [tmp_path / f"citations-{index:04d}.jsonl.gz" for index in range(5)]
    assert _chunked_paths(shards, 2) == [shards[:2], shards[2:4], shards[4:5]]


def test_partial_load_requires_dry_run():
    with pytest.raises(ValueError, match="partial shard loads"):
        run_citation_ingest(release_id="2026-03-10", dry_run=False, limit_shards=1)


def test_shards_per_batch_must_be_positive():
    with pytest.raises(ValueError, match="shards_per_batch must be positive"):
        run_citation_ingest(release_id="2026-03-10", dry_run=True, shards_per_batch=0)
