from __future__ import annotations

from app.broker import configure_broker


broker = configure_broker(pool_names=("ingest_write",))

# Import after broker configuration so the ingest worker binds only the
# warehouse ingest pool for this process.
from app.actors import ingest as ingest_actors  # noqa: E402,F401
