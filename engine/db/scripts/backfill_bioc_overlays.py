"""Clear operator alias for bounded BioCXML backfill over corpus papers with PMID/PMC/DOI."""

from __future__ import annotations

import sys
from pathlib import Path

# Add engine/ to path so app imports work when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.rag_ingest.bioc_overlay_backfill import main


if __name__ == "__main__":
    raise SystemExit(main())
