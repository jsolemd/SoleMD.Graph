"""Operator alias for bounded BioC archive-member cache prewarm."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.rag_ingest.bioc_member_prewarm import main


if __name__ == "__main__":
    raise SystemExit(main())
