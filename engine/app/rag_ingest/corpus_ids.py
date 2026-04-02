"""Shared corpus-id IO helpers for ingest and runtime operator CLIs."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from pathlib import Path


def normalize_corpus_ids(corpus_ids: Iterable[int | str] | None) -> list[int]:
    if corpus_ids is None:
        return []
    return list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))


def unique_corpus_ids(corpus_ids: Iterable[int | str] | None) -> list[int]:
    return normalize_corpus_ids(corpus_ids)


def merge_corpus_ids(*groups: Iterable[int | str] | None) -> list[int]:
    merged: list[int | str] = []
    for group in groups:
        if group is None:
            continue
        merged.extend(group)
    return normalize_corpus_ids(merged)


def load_corpus_ids_file(path: Path) -> list[int]:
    values: list[str] = []
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        values.append(stripped)
    return normalize_corpus_ids(values)


def resolve_corpus_ids(
    *,
    corpus_ids: Sequence[int] | None = None,
    corpus_ids_file: Path | None = None,
) -> list[int]:
    return merge_corpus_ids(
        corpus_ids,
        load_corpus_ids_file(corpus_ids_file) if corpus_ids_file is not None else None,
    )


def write_corpus_ids_file(path: Path, *, corpus_ids: Sequence[int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized_ids = normalize_corpus_ids(corpus_ids)
    path.write_text("".join(f"{corpus_id}\n" for corpus_id in normalized_ids))
