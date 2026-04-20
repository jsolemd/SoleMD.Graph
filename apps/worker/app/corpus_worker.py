from __future__ import annotations

from app.config import settings
from app.broker import configure_broker
from app.telemetry.bootstrap import prepare_worker_metrics_environment


prepare_worker_metrics_environment(settings, scope="corpus")
broker = configure_broker(metrics_scope="corpus", pool_names=("ingest_write",))

# Import after broker configuration so this worker binds only the warehouse
# ingest pool needed by the corpus-selection and evidence-wave lanes.
from app.actors import corpus as corpus_actors  # noqa: E402,F401
