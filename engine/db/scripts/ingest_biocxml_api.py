"""CLI operator for PubTator3 API-driven BioCXML ingest."""

from __future__ import annotations

import sys
from pathlib import Path

# Add engine/ to path so app imports work when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.rag_ingest.biocxml_api_ingest import main


if __name__ == "__main__":
    raise SystemExit(main())
