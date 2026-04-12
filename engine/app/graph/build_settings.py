"""Shared session tuning for replayable graph-serving rebuilds."""

from __future__ import annotations

BUILD_WORK_MEM = "512MB"
BUILD_MAX_PARALLEL_WORKERS_PER_GATHER = 6
BUILD_EFFECTIVE_IO_CONCURRENCY = 200
BUILD_RANDOM_PAGE_COST = "1.1"


def apply_build_session_settings(cur) -> None:
    cur.execute("SET LOCAL jit = off")
    cur.execute(f"SET LOCAL work_mem = '{BUILD_WORK_MEM}'")
    cur.execute(
        "SET LOCAL max_parallel_workers_per_gather = "
        f"{BUILD_MAX_PARALLEL_WORKERS_PER_GATHER}"
    )
    cur.execute(
        "SET LOCAL effective_io_concurrency = "
        f"{BUILD_EFFECTIVE_IO_CONCURRENCY}"
    )
    cur.execute(f"SET LOCAL random_page_cost = {BUILD_RANDOM_PAGE_COST}")
