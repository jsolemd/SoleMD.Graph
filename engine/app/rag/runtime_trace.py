"""Internal runtime tracing helpers for RAG service evaluation."""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from time import perf_counter
from typing import TypeVar

T = TypeVar("T")


class RuntimeTraceCollector:
    """Collect lightweight stage timings and counts for internal evaluation."""

    def __init__(self, *, enabled: bool = False):
        self._enabled = enabled
        self._stage_durations_ms: dict[str, float] = {}
        self._stage_call_counts: dict[str, int] = {}
        self._candidate_counts: dict[str, int] = {}
        self._session_flags: dict[str, object] = {}

    @property
    def enabled(self) -> bool:
        return self._enabled

    @contextmanager
    def stage(self, name: str) -> Iterator[None]:
        if not self._enabled:
            yield
            return
        started = perf_counter()
        try:
            yield
        finally:
            elapsed_ms = (perf_counter() - started) * 1000
            self._stage_durations_ms[name] = round(
                self._stage_durations_ms.get(name, 0.0) + elapsed_ms,
                3,
            )
            self._stage_call_counts[name] = self._stage_call_counts.get(name, 0) + 1

    def call(self, stage_name: str, func: Callable[..., T], /, *args, **kwargs) -> T:
        with self.stage(stage_name):
            return func(*args, **kwargs)

    def record_count(self, name: str, value: int) -> None:
        if not self._enabled:
            return
        self._candidate_counts[name] = int(value)

    def record_counts(self, values: Mapping[str, int]) -> None:
        if not self._enabled:
            return
        for key, value in values.items():
            self._candidate_counts[key] = int(value)

    def record_flag(self, name: str, value: object) -> None:
        if not self._enabled:
            return
        self._session_flags[name] = value

    def record_flags(self, values: Mapping[str, object]) -> None:
        if not self._enabled:
            return
        self._session_flags.update(values)

    def as_debug_trace(self) -> dict[str, object]:
        if not self._enabled:
            return {}
        return {
            "stage_durations_ms": dict(self._stage_durations_ms),
            "stage_call_counts": dict(self._stage_call_counts),
            "candidate_counts": dict(self._candidate_counts),
            "session_flags": dict(self._session_flags),
        }
