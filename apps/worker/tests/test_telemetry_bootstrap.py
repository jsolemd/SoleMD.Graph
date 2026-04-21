from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import textwrap

from app.config import Settings
from app.telemetry.bootstrap import _clear_directory, prepare_worker_metrics_environment
from app.telemetry.dramatiq_prometheus import ScopedPrometheus


class _FakeDelegate:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[object, ...], dict[str, object]]] = []

    def _record(self, name: str, *args: object, **kwargs: object) -> None:
        self.calls.append((name, args, kwargs))

    def after_worker_shutdown(self, *args: object, **kwargs: object) -> None:
        self._record("after_worker_shutdown", *args, **kwargs)

    def after_nack(self, *args: object, **kwargs: object) -> None:
        self._record("after_nack", *args, **kwargs)

    def after_enqueue(self, *args: object, **kwargs: object) -> None:
        self._record("after_enqueue", *args, **kwargs)

    def before_delay_message(self, *args: object, **kwargs: object) -> None:
        self._record("before_delay_message", *args, **kwargs)

    def before_process_message(self, *args: object, **kwargs: object) -> None:
        self._record("before_process_message", *args, **kwargs)

    def after_process_message(self, *args: object, **kwargs: object) -> None:
        self._record("after_process_message", *args, **kwargs)

    def after_skip_message(self, *args: object, **kwargs: object) -> None:
        self._record("after_skip_message", *args, **kwargs)


def test_scoped_prometheus_uses_scope_specific_fork_runner() -> None:
    settings = Settings(
        REDIS_URL="redis://127.0.0.1:57379/0",
        WORKER_METRICS_PORT="",
    )

    middleware = ScopedPrometheus(scope="ingest", runtime_settings=settings)

    assert middleware.forks[0].__name__ == "_run_ingest_metrics_server"


def test_scoped_prometheus_delegates_dramatiq_hooks() -> None:
    settings = Settings(
        REDIS_URL="redis://127.0.0.1:57379/0",
        WORKER_METRICS_PORT="",
    )
    middleware = ScopedPrometheus(scope="ingest", runtime_settings=settings)
    fake_delegate = _FakeDelegate()
    middleware._delegate = fake_delegate

    broker = object()
    worker = object()
    message = object()

    middleware.after_worker_shutdown(broker, worker)
    middleware.after_nack(broker, message)
    middleware.after_enqueue(broker, message, 1000)
    middleware.before_delay_message(broker, message)
    middleware.before_process_message(broker, message)
    middleware.after_process_message(broker, message, result="ok", exception=None)
    middleware.after_skip_message(broker, message)

    assert [name for name, _, _ in fake_delegate.calls] == [
        "after_worker_shutdown",
        "after_nack",
        "after_enqueue",
        "before_delay_message",
        "before_process_message",
        "after_process_message",
        "after_skip_message",
    ]


def test_prepare_worker_metrics_environment_restores_runtime_env(tmp_path: Path) -> None:
    script = textwrap.dedent(
        """
        import os
        from app.config import Settings
        from app.telemetry.bootstrap import prepare_worker_metrics_environment

        settings = Settings(
            REDIS_URL="redis://127.0.0.1:57379/0",
            WORKER_METRICS_PORT="",
            WORKER_METRICS_MULTIPROC_DIR=os.environ["TEST_METRICS_ROOT"],
        )
        os.environ["SOLEMD_GRAPH_METRICS_PREPARED"] = "1"
        for name in (
            "PROMETHEUS_MULTIPROC_DIR",
            "prometheus_multiproc_dir",
            "dramatiq_prom_db",
            "dramatiq_prom_host",
            "dramatiq_prom_port",
        ):
            os.environ.pop(name, None)

        metrics_dir = prepare_worker_metrics_environment(
            settings,
            scope="ingest",
            clean_on_boot=False,
        )

        assert os.environ["PROMETHEUS_MULTIPROC_DIR"] == str(metrics_dir)
        assert os.environ["prometheus_multiproc_dir"] == str(metrics_dir)
        assert os.environ["dramatiq_prom_db"] == str(metrics_dir)
        assert os.environ["dramatiq_prom_host"] == "0.0.0.0"
        assert os.environ["dramatiq_prom_port"] == "9464"
        """
    )
    env = os.environ.copy()
    env["TEST_METRICS_ROOT"] = str(tmp_path)
    subprocess.run([sys.executable, "-c", script], check=True, env=env)


def test_clear_directory_ignores_missing_file_races(tmp_path: Path, monkeypatch) -> None:
    file_path = tmp_path / "counter.db"
    file_path.write_text("metric shard")

    original_unlink = Path.unlink

    def fake_unlink(self: Path, missing_ok: bool = False) -> None:
        raise FileNotFoundError(self)

    monkeypatch.setattr(Path, "unlink", fake_unlink)
    try:
        _clear_directory(tmp_path)
    finally:
        monkeypatch.setattr(Path, "unlink", original_unlink)
