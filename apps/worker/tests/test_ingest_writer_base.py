from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.ingest.writers.base import iter_file_batches


@pytest.mark.asyncio
async def test_iter_file_batches_does_not_replay_batches_under_backpressure(
    tmp_path: Path,
) -> None:
    file_path = tmp_path / "sentinel.txt"
    file_path.write_text("sentinel")

    async def collect_rows() -> list[int]:
        seen: list[int] = []
        async for batch in iter_file_batches(
            file_path,
            row_iterator=lambda _path, _on_progress: iter(range(20)),
            batch_size=1,
            queue_depth=1,
        ):
            seen.extend(batch)
            await asyncio.sleep(0.2)
        return seen

    assert await collect_rows() == list(range(20))


@pytest.mark.asyncio
async def test_iter_file_batches_reports_input_progress_monotonically(
    tmp_path: Path,
) -> None:
    file_path = tmp_path / "sentinel.txt"
    file_path.write_text("sentinel")
    progress_samples: list[int] = []

    def row_iterator(_: Path, on_progress):
        for value in range(5):
            if on_progress is not None:
                on_progress((value + 1) * 10)
            yield value

    async for _batch in iter_file_batches(
        file_path,
        row_iterator=row_iterator,
        batch_size=2,
        on_input_progress=progress_samples.append,
    ):
        continue

    assert progress_samples == [10, 20, 30, 40, 50]


@pytest.mark.asyncio
async def test_iter_file_batches_stops_promptly_when_consumer_exits_early(
    tmp_path: Path,
) -> None:
    file_path = tmp_path / "dummy.txt"
    file_path.write_text("", encoding="utf-8")
    produced = 0

    def row_iterator(_: Path, _on_progress):
        nonlocal produced
        for value in range(1_000):
            produced += 1
            yield value

    async with asyncio.timeout(1):
        async for batch in iter_file_batches(
            file_path,
            row_iterator=row_iterator,
            batch_size=1,
            queue_depth=1,
        ):
            assert batch == [0]
            break

    assert produced < 1_000
