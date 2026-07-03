from __future__ import annotations

from app.broker import configure_broker
from app.config import settings
from app.telemetry.bootstrap import prepare_worker_metrics_environment


prepare_worker_metrics_environment(settings, scope="enrichment_s2")
broker = configure_broker(metrics_scope="enrichment_s2", pool_names=("ingest_write",))

# Import after broker configuration so this worker binds the enrichment actors.
from app.actors import enrichment as enrichment_actors  # noqa: E402,F401
