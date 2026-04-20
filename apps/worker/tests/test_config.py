from __future__ import annotations

from app.config import Settings


def test_blank_worker_metrics_port_is_treated_as_none() -> None:
    settings = Settings(
        REDIS_URL="redis://127.0.0.1:57379/0",
        WORKER_METRICS_PORT="",
    )

    assert settings.worker_metrics_port is None
