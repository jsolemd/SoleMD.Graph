from __future__ import annotations

from collections.abc import Callable

from dramatiq.middleware import Middleware

from app.config import Settings, settings
from app.telemetry.bootstrap import prepare_worker_metrics_environment


def _run_ingest_metrics_server() -> int:
    return _run_scope_metrics_server("ingest")


def _run_corpus_metrics_server() -> int:
    return _run_scope_metrics_server("corpus")


def _run_evidence_metrics_server() -> int:
    return _run_scope_metrics_server("evidence")


def _run_cli_metrics_server() -> int:
    return _run_scope_metrics_server("cli")


_SCOPE_FORK_RUNNERS: dict[str, Callable[[], int]] = {
    "ingest": _run_ingest_metrics_server,
    "corpus": _run_corpus_metrics_server,
    "evidence": _run_evidence_metrics_server,
    "cli": _run_cli_metrics_server,
}


def _run_scope_metrics_server(scope: str) -> int:
    prepare_worker_metrics_environment(settings, scope=scope, clean_on_boot=False)
    from dramatiq.middleware.prometheus import _run_exposition_server

    return _run_exposition_server()


class ScopedPrometheus(Middleware):
    def __init__(
        self,
        *,
        scope: str,
        runtime_settings: Settings = settings,
    ) -> None:
        if scope not in _SCOPE_FORK_RUNNERS:
            raise ValueError(f"unsupported metrics scope: {scope}")

        from dramatiq.middleware.prometheus import Prometheus as DramatiqPrometheus

        self._scope = scope
        self._runtime_settings = runtime_settings
        self._delegate = DramatiqPrometheus()

    @property
    def forks(self) -> list[Callable[[], int]]:
        return [_SCOPE_FORK_RUNNERS[self._scope]]

    def after_process_boot(self, broker) -> None:
        prepare_worker_metrics_environment(
            self._runtime_settings,
            scope=self._scope,
            clean_on_boot=False,
        )
        self._delegate.after_process_boot(broker)

    def after_worker_shutdown(self, broker, worker) -> None:
        self._delegate.after_worker_shutdown(broker, worker)

    def after_nack(self, broker, message) -> None:
        self._delegate.after_nack(broker, message)

    def after_enqueue(self, broker, message, delay) -> None:
        self._delegate.after_enqueue(broker, message, delay)

    def before_delay_message(self, broker, message) -> None:
        self._delegate.before_delay_message(broker, message)

    def before_process_message(self, broker, message) -> None:
        self._delegate.before_process_message(broker, message)

    def after_process_message(self, broker, message, *, result=None, exception=None) -> None:
        self._delegate.after_process_message(
            broker,
            message,
            result=result,
            exception=exception,
        )

    def after_skip_message(self, broker, message) -> None:
        self._delegate.after_skip_message(broker, message)

    def __getattr__(self, name: str):
        return getattr(self._delegate, name)
