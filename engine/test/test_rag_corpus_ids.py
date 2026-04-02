from __future__ import annotations

from pathlib import Path

from app.rag_ingest.corpus_ids import (
    load_corpus_ids_file,
    resolve_corpus_ids,
    write_corpus_ids_file,
)


def test_load_corpus_ids_file_skips_comments_and_preserves_order(tmp_path: Path):
    path = tmp_path / "corpus_ids.txt"
    path.write_text("# comment\n10\n20\n10\n\n30\n")

    assert load_corpus_ids_file(path) == [10, 20, 30]


def test_resolve_corpus_ids_merges_inline_and_file_values(tmp_path: Path):
    path = tmp_path / "cohort.txt"
    path.write_text("30\n20\n")

    assert resolve_corpus_ids(corpus_ids=[10, 20, 10], corpus_ids_file=path) == [10, 20, 30]


def test_write_corpus_ids_file_normalizes_values(tmp_path: Path):
    path = tmp_path / "nested" / "ids.txt"

    write_corpus_ids_file(path, corpus_ids=[7, 5, 7, 3])

    assert path.read_text() == "7\n5\n3\n"
