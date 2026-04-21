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
            row_iterator=lambda _path: iter(range(20)),
            batch_size=1,
            queue_depth=1,
        ):
            seen.extend(batch)
            await asyncio.sleep(0.2)
        return seen

    assert await collect_rows() == list(range(20))
