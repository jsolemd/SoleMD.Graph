from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import os
from time import perf_counter

from prometheus_client import (
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    REGISTRY,
    generate_latest,
)


_LOCK_HEARTBEAT_SECONDS = 1.0


INGEST_PHASE_DURATION_SECONDS = Histogram(
    "ingest_phase_duration_seconds",
    "Per-phase wall-clock duration for release ingest runs.",
    ["source_code", "release_tag", "phase"],
    buckets=(0.01, 0.1, 1, 5, 10, 30, 60, 300, 900, 1800, 3600, 21600, float("inf")),
)
INGEST_RUNS_TOTAL = Counter(
    "ingest_runs_total",
    "Terminal ingest run outcomes.",
    ["source_code", "outcome"],
)
INGEST_FAMILY_ROWS_TOTAL = Counter(
    "ingest_family_rows_total",
    "Rows loaded per ingest family.",
    ["source_code", "family"],
)
INGEST_FAMILY_FILES_TOTAL = Counter(
    "ingest_family_files_total",
    "Files loaded per ingest family.",
    ["source_code", "family"],
)
INGEST_FAILURES_TOTAL = Counter(
    "ingest_failures_total",
    "Ingest failures by phase and exception class.",
    ["source_code", "phase", "failure_class"],
)
INGEST_ACTIVE_LOCK_AGE_SECONDS = Gauge(
    "ingest_active_lock_age_seconds",
    "Elapsed seconds since the current ingest advisory lock was acquired.",
    ["source_code", "release_tag"],
    multiprocess_mode="livemostrecent",
)

CORPUS_SELECTION_PHASE_DURATION_SECONDS = Histogram(
    "corpus_selection_phase_duration_seconds",
    "Per-phase wall-clock duration for corpus-selection runs.",
    ["selector_version", "phase"],
    buckets=(0.01, 0.1, 1, 5, 10, 30, 60, 300, 900, 1800, float("inf")),
)
CORPUS_SELECTION_RUNS_TOTAL = Counter(
    "corpus_selection_runs_total",
    "Terminal outcomes for corpus-selection runs.",
    ["selector_version", "outcome"],
)
CORPUS_SELECTION_SIGNALS_TOTAL = Counter(
    "corpus_selection_signals_total",
    "Selection signal rows written by phase.",
    ["selector_version", "phase"],
)
CORPUS_SELECTION_MATERIALIZED_PAPERS_TOTAL = Counter(
    "corpus_selection_materialized_papers_total",
    "Canonical papers materialized during corpus selection.",
    ["selector_version"],
)
CORPUS_SELECTION_SUMMARY_ROWS_TOTAL = Counter(
    "corpus_selection_summary_rows_total",
    "Selection summary rows refreshed during corpus selection.",
    ["selector_version"],
)
CORPUS_SELECTION_FAILURES_TOTAL = Counter(
    "corpus_selection_failures_total",
    "Corpus-selection failures by phase and exception class.",
    ["selector_version", "phase", "failure_class"],
)
CORPUS_SELECTION_ACTIVE_LOCK_AGE_SECONDS = Gauge(
    "corpus_selection_active_lock_age_seconds",
    "Elapsed seconds since the current corpus-selection advisory lock was acquired.",
    ["selector_version", "s2_release_tag", "pt3_release_tag"],
    multiprocess_mode="livemostrecent",
)

CORPUS_WAVE_PHASE_DURATION_SECONDS = Histogram(
    "corpus_wave_phase_duration_seconds",
    "Per-phase wall-clock duration for evidence-wave runs.",
    ["wave_policy_key", "selector_version", "phase"],
    buckets=(0.01, 0.1, 1, 5, 10, 30, 60, 300, 900, float("inf")),
)
CORPUS_WAVE_RUNS_TOTAL = Counter(
    "corpus_wave_runs_total",
    "Terminal outcomes for evidence-wave runs.",
    ["wave_policy_key", "selector_version", "outcome"],
)
CORPUS_WAVE_MEMBERS_SELECTED_TOTAL = Counter(
    "corpus_wave_members_selected_total",
    "Mapped papers selected into evidence waves.",
    ["wave_policy_key", "selector_version"],
)
CORPUS_WAVE_ENQUEUED_TOTAL = Counter(
    "corpus_wave_enqueued_total",
    "Mapped papers enqueued from evidence waves.",
    ["wave_policy_key", "selector_version"],
)
CORPUS_WAVE_FAILURES_TOTAL = Counter(
    "corpus_wave_failures_total",
    "Evidence-wave failures by phase and exception class.",
    ["wave_policy_key", "selector_version", "phase", "failure_class"],
)
CORPUS_WAVE_ACTIVE_LOCK_AGE_SECONDS = Gauge(
    "corpus_wave_active_lock_age_seconds",
    "Elapsed seconds since the current evidence-wave advisory lock was acquired.",
    ["wave_policy_key", "selector_version"],
    multiprocess_mode="livemostrecent",
)

PAPER_TEXT_ACQUISITIONS_TOTAL = Counter(
    "paper_text_acquisitions_total",
    "Paper-text acquisition outcomes.",
    ["outcome", "locator_kind", "resolver_kind"],
)
PAPER_TEXT_ACQUISITION_DURATION_SECONDS = Histogram(
    "paper_text_acquisition_duration_seconds",
    "End-to-end wall-clock duration for paper-text acquisition.",
    ["outcome", "locator_kind", "resolver_kind"],
    buckets=(0.01, 0.1, 1, 5, 10, 30, 60, 300, 900, float("inf")),
)
PAPER_TEXT_DOCUMENT_ROWS_TOTAL = Counter(
    "paper_text_document_rows_total",
    "Canonical document-spine rows written by paper-text acquisition.",
    ["structure_kind"],
)
PAPER_TEXT_FAILURES_TOTAL = Counter(
    "paper_text_failures_total",
    "Paper-text acquisition failures by exception class.",
    ["failure_class"],
)
PAPER_TEXT_INPROGRESS = Gauge(
    "paper_text_inprogress",
    "Paper-text acquisitions currently in progress.",
    multiprocess_mode="livesum",
)


def observe_ingest_phase(
    *,
    source_code: str,
    release_tag: str,
    phase: str,
    duration_seconds: float,
) -> None:
    INGEST_PHASE_DURATION_SECONDS.labels(source_code, release_tag, phase).observe(duration_seconds)


def record_ingest_run(*, source_code: str, outcome: str) -> None:
    INGEST_RUNS_TOTAL.labels(source_code, outcome).inc()


def record_ingest_family_load(
    *,
    source_code: str,
    family_name: str,
    row_count: int,
    file_count: int,
) -> None:
    INGEST_FAMILY_ROWS_TOTAL.labels(source_code, family_name).inc(row_count)
    INGEST_FAMILY_FILES_TOTAL.labels(source_code, family_name).inc(file_count)


def record_ingest_failure(
    *,
    source_code: str,
    phase: str,
    failure_class: str,
) -> None:
    INGEST_FAILURES_TOTAL.labels(source_code, phase, failure_class).inc()


def observe_corpus_selection_phase(
    *,
    selector_version: str,
    phase: str,
    duration_seconds: float,
) -> None:
    CORPUS_SELECTION_PHASE_DURATION_SECONDS.labels(selector_version, phase).observe(duration_seconds)


def record_corpus_selection_run(*, selector_version: str, outcome: str) -> None:
    CORPUS_SELECTION_RUNS_TOTAL.labels(selector_version, outcome).inc()


def record_corpus_selection_signals(
    *,
    selector_version: str,
    phase: str,
    signal_count: int,
) -> None:
    CORPUS_SELECTION_SIGNALS_TOTAL.labels(selector_version, phase).inc(signal_count)


def record_corpus_selection_materialized_papers(
    *,
    selector_version: str,
    paper_count: int,
) -> None:
    CORPUS_SELECTION_MATERIALIZED_PAPERS_TOTAL.labels(selector_version).inc(paper_count)


def record_corpus_selection_summary_rows(
    *,
    selector_version: str,
    row_count: int,
) -> None:
    CORPUS_SELECTION_SUMMARY_ROWS_TOTAL.labels(selector_version).inc(row_count)


def record_corpus_selection_failure(
    *,
    selector_version: str,
    phase: str,
    failure_class: str,
) -> None:
    CORPUS_SELECTION_FAILURES_TOTAL.labels(selector_version, phase, failure_class).inc()


def observe_corpus_wave_phase(
    *,
    wave_policy_key: str,
    selector_version: str,
    phase: str,
    duration_seconds: float,
) -> None:
    CORPUS_WAVE_PHASE_DURATION_SECONDS.labels(
        wave_policy_key,
        selector_version,
        phase,
    ).observe(duration_seconds)


def record_corpus_wave_run(
    *,
    wave_policy_key: str,
    selector_version: str,
    outcome: str,
) -> None:
    CORPUS_WAVE_RUNS_TOTAL.labels(wave_policy_key, selector_version, outcome).inc()


def record_corpus_wave_member_count(
    *,
    wave_policy_key: str,
    selector_version: str,
    member_count: int,
) -> None:
    CORPUS_WAVE_MEMBERS_SELECTED_TOTAL.labels(wave_policy_key, selector_version).inc(member_count)


def record_corpus_wave_enqueue_count(
    *,
    wave_policy_key: str,
    selector_version: str,
    enqueue_count: int,
) -> None:
    CORPUS_WAVE_ENQUEUED_TOTAL.labels(wave_policy_key, selector_version).inc(enqueue_count)


def record_corpus_wave_failure(
    *,
    wave_policy_key: str,
    selector_version: str,
    phase: str,
    failure_class: str,
) -> None:
    CORPUS_WAVE_FAILURES_TOTAL.labels(
        wave_policy_key,
        selector_version,
        phase,
        failure_class,
    ).inc()


def observe_hot_text_acquisition(
    *,
    outcome: str,
    locator_kind: str | None,
    resolver_kind: str | None,
    duration_seconds: float,
) -> None:
    PAPER_TEXT_ACQUISITION_DURATION_SECONDS.labels(
        outcome,
        locator_kind or "unknown",
        resolver_kind or "unknown",
    ).observe(duration_seconds)


def record_hot_text_run(
    *,
    outcome: str,
    locator_kind: str | None,
    resolver_kind: str | None,
) -> None:
    PAPER_TEXT_ACQUISITIONS_TOTAL.labels(
        outcome,
        locator_kind or "unknown",
        resolver_kind or "unknown",
    ).inc()


def record_hot_text_document_rows(
    *,
    section_count: int,
    block_count: int,
    sentence_count: int,
) -> None:
    PAPER_TEXT_DOCUMENT_ROWS_TOTAL.labels("documents").inc()
    PAPER_TEXT_DOCUMENT_ROWS_TOTAL.labels("sections").inc(section_count)
    PAPER_TEXT_DOCUMENT_ROWS_TOTAL.labels("blocks").inc(block_count)
    PAPER_TEXT_DOCUMENT_ROWS_TOTAL.labels("sentences").inc(sentence_count)


def record_hot_text_failure(*, failure_class: str) -> None:
    PAPER_TEXT_FAILURES_TOTAL.labels(failure_class).inc()


@asynccontextmanager
async def track_ingest_lock_age(
    *,
    source_code: str,
    release_tag: str,
) -> AsyncIterator[None]:
    async with _track_elapsed_gauge(
        INGEST_ACTIVE_LOCK_AGE_SECONDS.labels(source_code, release_tag)
    ):
        yield


@asynccontextmanager
async def track_corpus_selection_lock_age(
    *,
    selector_version: str,
    s2_release_tag: str,
    pt3_release_tag: str,
) -> AsyncIterator[None]:
    async with _track_elapsed_gauge(
        CORPUS_SELECTION_ACTIVE_LOCK_AGE_SECONDS.labels(
            selector_version,
            s2_release_tag,
            pt3_release_tag,
        )
    ):
        yield


@asynccontextmanager
async def track_corpus_wave_lock_age(
    *,
    wave_policy_key: str,
    selector_version: str,
) -> AsyncIterator[None]:
    async with _track_elapsed_gauge(
        CORPUS_WAVE_ACTIVE_LOCK_AGE_SECONDS.labels(
            wave_policy_key,
            selector_version,
        )
    ):
        yield


@asynccontextmanager
async def track_hot_text_inprogress() -> AsyncIterator[None]:
    PAPER_TEXT_INPROGRESS.inc()
    try:
        yield
    finally:
        PAPER_TEXT_INPROGRESS.dec()


def collect_metrics_text() -> str:
    multiproc_dir = os.environ.get("PROMETHEUS_MULTIPROC_DIR")
    if multiproc_dir:
        registry = CollectorRegistry(support_collectors_without_names=True)
        from prometheus_client import multiprocess

        multiprocess.MultiProcessCollector(registry, path=multiproc_dir)
        return generate_latest(registry).decode("utf-8")
    return generate_latest(REGISTRY).decode("utf-8")


@asynccontextmanager
async def _track_elapsed_gauge(gauge) -> AsyncIterator[None]:
    started = perf_counter()
    stop_event = asyncio.Event()
    task = asyncio.create_task(_update_elapsed_gauge(gauge, started, stop_event))
    try:
        yield
    finally:
        stop_event.set()
        await asyncio.gather(task, return_exceptions=True)
        gauge.set(0)


async def _update_elapsed_gauge(gauge, started: float, stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        gauge.set(perf_counter() - started)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=_LOCK_HEARTBEAT_SECONDS)
        except TimeoutError:
            continue
