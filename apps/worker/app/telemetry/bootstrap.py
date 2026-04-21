from __future__ import annotations

import os
from pathlib import Path
import shutil

from app.config import Settings, settings


_PREPARED_FLAG = "SOLEMD_GRAPH_METRICS_PREPARED"

_SCOPE_PORT_OFFSETS = {
    "ingest": 0,
    "corpus": 1,
    "evidence": 2,
    "cli": 3,
}


def prepare_worker_metrics_environment(
    runtime_settings: Settings = settings,
    *,
    scope: str,
    clean_on_boot: bool | None = None,
) -> Path | None:
    if not runtime_settings.worker_metrics_enabled:
        return None

    metrics_root = runtime_settings.resolve_project_path(
        runtime_settings.worker_metrics_multiproc_dir
    )
    metrics_dir = metrics_root / scope
    metrics_dir.mkdir(parents=True, exist_ok=True)

    should_clean = (
        runtime_settings.worker_metrics_clean_on_boot
        if clean_on_boot is None
        else clean_on_boot
    )

    http_port = runtime_settings.worker_metrics_port
    if http_port is None:
        http_port = (
            runtime_settings.worker_metrics_port_base
            + _SCOPE_PORT_OFFSETS.get(scope, 0)
        )

    metrics_dir_value = str(metrics_dir)
    already_prepared_for_scope = (
        os.environ.get(_PREPARED_FLAG) == "1"
        and os.environ.get("PROMETHEUS_MULTIPROC_DIR") == metrics_dir_value
        and os.environ.get("prometheus_multiproc_dir") == metrics_dir_value
        and os.environ.get("dramatiq_prom_db") == metrics_dir_value
        and os.environ.get("dramatiq_prom_host") == runtime_settings.worker_metrics_host
        and os.environ.get("dramatiq_prom_port") == str(http_port)
    )
    if should_clean and not already_prepared_for_scope:
        _clear_directory(metrics_dir)

    os.environ["PROMETHEUS_MULTIPROC_DIR"] = metrics_dir_value
    os.environ["prometheus_multiproc_dir"] = metrics_dir_value
    os.environ["dramatiq_prom_db"] = metrics_dir_value
    os.environ["dramatiq_prom_host"] = runtime_settings.worker_metrics_host
    os.environ["dramatiq_prom_port"] = str(http_port)
    os.environ[_PREPARED_FLAG] = "1"
    return metrics_dir


def _clear_directory(directory: Path) -> None:
    for entry in directory.iterdir():
        if entry.is_dir():
            shutil.rmtree(entry, ignore_errors=True)
            continue
        try:
            entry.unlink()
        except FileNotFoundError:
            continue
