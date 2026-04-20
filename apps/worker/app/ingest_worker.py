from __future__ import annotations

from app.config import settings
from app.broker import configure_broker
from app.telemetry.bootstrap import prepare_worker_metrics_environment


prepare_worker_metrics_environment(settings, scope="ingest")
broker = configure_broker(metrics_scope="ingest", pool_names=("ingest_write",))

# Import after broker configuration so the ingest worker binds only the
# warehouse ingest pool for this process.
from app.actors import ingest as ingest_actors  # noqa: E402,F401
