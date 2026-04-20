from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import textwrap

from app.config import Settings
from app.telemetry.bootstrap import prepare_worker_metrics_environment
from app.telemetry.dramatiq_prometheus import ScopedPrometheus


def test_scoped_prometheus_uses_scope_specific_fork_runner() -> None:
    settings = Settings(
        REDIS_URL="redis://127.0.0.1:57379/0",
        WORKER_METRICS_PORT="",
    )

    middleware = ScopedPrometheus(scope="ingest", runtime_settings=settings)

    assert middleware.forks[0].__name__ == "_run_ingest_metrics_server"


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
