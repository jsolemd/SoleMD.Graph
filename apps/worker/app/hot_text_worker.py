from __future__ import annotations

from app.broker import configure_broker


broker = configure_broker(pool_names=("ingest_write",))

# Import after broker configuration so this worker binds only the warehouse
# ingest pool for targeted paper-text refresh work.
from app.actors import hot_text as hot_text_actors  # noqa: E402,F401
