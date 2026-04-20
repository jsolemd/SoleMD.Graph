from __future__ import annotations

from app.config import settings
from app.broker import configure_broker
from app.telemetry.bootstrap import prepare_worker_metrics_environment


prepare_worker_metrics_environment(settings, scope="evidence")
broker = configure_broker(metrics_scope="evidence", pool_names=("ingest_write",))

# Import after broker configuration so this worker binds only the warehouse
# ingest pool for targeted paper-text refresh work.
from app.actors import evidence as evidence_actors  # noqa: E402,F401
