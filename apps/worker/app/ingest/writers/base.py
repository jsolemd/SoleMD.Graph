from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable, Iterable, Iterator, Sequence
from concurrent.futures import CancelledError as FutureCancelledError
from concurrent.futures import TimeoutError as FutureTimeoutError
from dataclasses import dataclass, field
from pathlib import Path
import threading
from typing import Generic, TypeVar, cast

import asyncpg


T = TypeVar("T")
S = TypeVar("S")


@dataclass(slots=True)
class _ThreadedBatchFailure:
    error: BaseException


_THREAD_STREAM_DONE = object()


async def copy_records(
    connection: asyncpg.Connection,
    *,
    table_name: str,
    schema_name: str,
    columns: Sequence[str],
    records: Sequence[tuple],
) -> int:
    if not records:
        return 0
    await connection.copy_records_to_table(
        table_name,
        schema_name=schema_name,
        columns=columns,
        records=records,
    )
    return len(records)


@dataclass(slots=True)
class BatchCopyBuffer(Generic[T]):
    batch_size: int
    rows: list[T] = field(default_factory=list)

    def add(self, row: T) -> list[T] | None:
        self.rows.append(row)
        if len(self.rows) >= self.batch_size:
            return self.flush()
        return None

    def flush(self) -> list[T]:
        batch = self.rows
        self.rows = []
        return batch

    def extend(self, rows: Iterable[T]) -> list[list[T]]:
        flushed: list[list[T]] = []
        for row in rows:
            batch = self.add(row)
            if batch:
                flushed.append(batch)
        return flushed


async def copy_files_concurrently(
    pool: asyncpg.Pool,
    file_paths: Sequence[Path],
    *,
    row_iterator: Callable[[Path], Iterator[S]],
    row_to_tuple: Callable[[S], tuple],
    on_file_completed: Callable[[Path, int], None] | None = None,
    on_rows_written: Callable[[Path, int], None] | None = None,
    table_name: str,
    schema_name: str,
    columns: Sequence[str],
    batch_size: int,
    concurrency: int,
) -> int:
    """Stream rows from each file in parallel and COPY them into one table.

    Shared COPY pipeline used by every family loader that has the same shape:
    per-file streaming → buffered tuples → asyncpg.copy_records_to_table. Each
    batch runs inside a connection-local transaction so a partial COPY cannot
    leave the destination half-written.
    """

    if not file_paths:
        return 0

    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def worker(file_path: Path) -> int:
        async with semaphore, pool.acquire() as connection:
            written = 0
            async for row_batch in iter_file_batches(
                file_path,
                row_iterator=row_iterator,
                batch_size=batch_size,
            ):
                batch = [row_to_tuple(row) for row in row_batch]
                async with connection.transaction():
                    batch_written = await copy_records(
                        connection,
                        table_name=table_name,
                        schema_name=schema_name,
                        columns=columns,
                        records=batch,
                    )
                    written += batch_written
                if on_rows_written is not None and batch_written:
                    on_rows_written(file_path, batch_written)
            if on_file_completed is not None:
                on_file_completed(file_path, written)
            return written

    async with asyncio.TaskGroup() as group:
        tasks = [group.create_task(worker(file_path)) for file_path in file_paths]
    return sum(task.result() for task in tasks)


async def iter_file_batches(
    file_path: Path,
    *,
    row_iterator: Callable[[Path], Iterator[T]],
    batch_size: int,
    queue_depth: int = 2,
) -> AsyncIterator[list[T]]:
    """Batch a blocking row iterator in a background thread.

    The producer side performs gzip/XML/JSON parsing away from the event loop and
    ships row batches back through an asyncio queue. Consumers can COPY the
    batches as they arrive without waiting for an entire file parse to finish.
    """

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[object] = asyncio.Queue(maxsize=max(1, queue_depth))
    stop_event = threading.Event()

    def push(item: object) -> bool:
        future = asyncio.run_coroutine_threadsafe(queue.put(item), loop)
        while True:
            if stop_event.is_set():
                future.cancel()
                return False
            try:
                future.result(timeout=0.1)
                return True
            except FutureTimeoutError:
                continue
            except FutureCancelledError:
                return False
            except RuntimeError:
                future.cancel()
                return False

    def produce() -> None:
        buffer = BatchCopyBuffer[T](batch_size=batch_size)
        try:
            for row in row_iterator(file_path):
                if stop_event.is_set():
                    return
                batch = buffer.add(row)
                if batch and not push(batch):
                    return
            if buffer.rows and not stop_event.is_set():
                push(buffer.flush())
        except BaseException as error:
            if not stop_event.is_set():
                push(_ThreadedBatchFailure(error))
        finally:
            if not stop_event.is_set():
                push(_THREAD_STREAM_DONE)

    producer = asyncio.create_task(asyncio.to_thread(produce))
    try:
        while True:
            item = await queue.get()
            if item is _THREAD_STREAM_DONE:
                break
            if isinstance(item, _ThreadedBatchFailure):
                raise item.error
            yield cast(list[T], item)
    finally:
        stop_event.set()
        await producer
