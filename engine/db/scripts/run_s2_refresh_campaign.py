"""Operator alias for sequential bounded source-driven S2 refresh campaigns."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.rag_ingest.s2_refresh_campaign import main


if __name__ == "__main__":
    raise SystemExit(main())
