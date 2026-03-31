"""Clear operator alias for the RAG source-locator refresh runner."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.rag.source_locator_refresh import main


if __name__ == "__main__":
    raise SystemExit(main())
