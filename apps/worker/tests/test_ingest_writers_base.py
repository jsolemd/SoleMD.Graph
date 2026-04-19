from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.ingest.writers.base import iter_file_batches


@pytest.mark.asyncio
async def test_iter_file_batches_stops_promptly_when_consumer_exits_early(
    tmp_path: Path,
) -> None:
    file_path = tmp_path / "dummy.txt"
    file_path.write_text("", encoding="utf-8")
    produced = 0

    def row_iterator(_: Path):
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
