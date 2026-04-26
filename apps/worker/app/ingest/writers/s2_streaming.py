from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.ingest.models import StartReleaseRequest
from app.ingest.sources import semantic_scholar
from app.ingest.writers.base import iter_file_batches


async def iter_s2_row_batches(
    file_path: Path,
    *,
    family_name: str,
    request: StartReleaseRequest,
    batch_size: int,
    on_input_progress: Callable[[int], None] | None = None,
) -> Any:
    async for row_batch in iter_file_batches(
        file_path,
        row_iterator=lambda path, on_progress: semantic_scholar.stream_family(
            family_name,
            path,
            max_records_per_file=request.max_records_per_file,
            on_progress=on_progress,
        ),
        batch_size=batch_size,
        on_input_progress=on_input_progress,
    ):
        yield row_batch
