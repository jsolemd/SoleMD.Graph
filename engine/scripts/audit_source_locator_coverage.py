"""Audit S2 + BioCXML source locator coverage against the corpus table.

Read-only. Reports how many corpus papers have source locator entries
for each source system, and identifies coverage gaps.

Usage:
    cd engine
    uv run python scripts/audit_source_locator_coverage.py
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from app import db
from app.config import settings
from app.rag_ingest.source_locator import locator_sidecar_path
from app.rag.parse_contract import ParseSourceSystem


def _count_locator_corpus_ids(path: Path) -> set[int]:
    """Return the set of corpus_ids indexed in a source locator sidecar."""
    if not path.exists():
        return set()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT DISTINCT corpus_id FROM source_locator").fetchall()
    conn.close()
    return {int(row["corpus_id"]) for row in rows}


def main() -> int:
    s2_revision = settings.s2_release_id
    pubtator_revision = settings.pubtator_release_id

    print(f"S2 release:      {s2_revision or '(not set)'}")
    print(f"PubTator release: {pubtator_revision or '(not set)'}")
    print()

    # Fetch all corpus papers with PMIDs
    try:
        with db.pooled() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT corpus_id FROM solemd.corpus WHERE pmid IS NOT NULL"
            )
            corpus_ids = {int(row["corpus_id"]) for row in cur.fetchall()}
    finally:
        db.close_pool()

    print(f"Corpus papers with PMIDs: {len(corpus_ids)}")

    # S2 source locator coverage
    s2_ids: set[int] = set()
    if s2_revision:
        s2_path = locator_sidecar_path(
            source_system=ParseSourceSystem.S2ORC_V2,
            source_revision=s2_revision,
        )
        print(f"S2 locator path:  {s2_path}")
        s2_ids = _count_locator_corpus_ids(s2_path) & corpus_ids
    else:
        print("S2 locator path:  (skipped — S2_RELEASE_ID not set)")

    # BioCXML source locator coverage
    bioc_ids: set[int] = set()
    if pubtator_revision:
        bioc_path = locator_sidecar_path(
            source_system=ParseSourceSystem.BIOCXML,
            source_revision=pubtator_revision,
        )
        print(f"BioCXML locator:  {bioc_path}")
        bioc_ids = _count_locator_corpus_ids(bioc_path) & corpus_ids
    else:
        print("BioCXML locator:  (skipped — PUBTATOR_RELEASE_ID not set)")

    print()

    total = len(corpus_ids)
    both = s2_ids & bioc_ids
    either = s2_ids | bioc_ids
    neither = corpus_ids - either

    def pct(n: int) -> str:
        return f"{n / total * 100:.1f}%" if total > 0 else "N/A"

    print(f"S2 locator entries:      {len(s2_ids):>8}  ({pct(len(s2_ids))})")
    print(f"BioCXML locator entries: {len(bioc_ids):>8}  ({pct(len(bioc_ids))})")
    print(f"Both sources:            {len(both):>8}  ({pct(len(both))})")
    print(f"Either source:           {len(either):>8}  ({pct(len(either))})")
    print(f"Neither source:          {len(neither):>8}  ({pct(len(neither))})")

    if neither:
        print()
        print("Gap analysis: papers with neither S2 nor BioCXML locator entries")
        print("  Run source_locator_refresh to populate:")
        print(f"    uv run python db/scripts/refresh_rag_source_locator.py \\")
        print(f"      --run-id locator-audit-fill")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
