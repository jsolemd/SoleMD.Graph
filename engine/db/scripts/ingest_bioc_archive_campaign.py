"""Operator alias for sequential bounded BioC archive-window campaigns."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.rag_ingest.bioc_archive_campaign import main


if __name__ == "__main__":
    raise SystemExit(main())
