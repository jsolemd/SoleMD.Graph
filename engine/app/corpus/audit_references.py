"""Audit live S2 reference-yield before running the full reference sync."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict

from app import db
from app.corpus.references import REFERENCE_FIELDS
from app.corpus.s2_client import S2Client


def _reference_bucket(reference_count: int | None) -> str:
    value = int(reference_count or 0)
    if value < 20:
        return "<20"
    if value < 50:
        return "20-49"
    if value < 100:
        return "50-99"
    return "100+"


def _decade(year: int | None) -> str:
    if not year:
        return "unknown"
    return f"{int(year) // 10 * 10}s"


def _sample_papers(sample_size: int, min_reference_count: int) -> list[dict]:
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT p.corpus_id, p.year, p.reference_count
            FROM solemd.papers p
            JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
            WHERE c.corpus_tier = 'graph'
              AND COALESCE(p.reference_count, 0) >= %s
            ORDER BY random()
            LIMIT %s
            """,
            (min_reference_count, sample_size),
        )
        return list(cur.fetchall())


def run_reference_audit(sample_size: int = 500, min_reference_count: int = 20) -> dict:
    rows = _sample_papers(sample_size, min_reference_count)
    if not rows:
        return {"sampled": 0}

    stats_by_bucket: dict[str, dict[str, int]] = defaultdict(lambda: {"papers": 0, "with_refs": 0})
    stats_by_decade: dict[str, dict[str, int]] = defaultdict(lambda: {"papers": 0, "with_refs": 0})
    total_with_refs = 0

    with S2Client() as client:
        batch_size = 500
        for i in range(0, len(rows), batch_size):
            batch_rows = rows[i : i + batch_size]
            batch_ids = [int(row["corpus_id"]) for row in batch_rows]
            results = client.fetch_batch(batch_ids, REFERENCE_FIELDS)
            for row, result in zip(batch_rows, results, strict=False):
                refs = (result or {}).get("references") or []
                has_refs = len(refs) > 0
                if has_refs:
                    total_with_refs += 1
                bucket = _reference_bucket(row.get("reference_count"))
                decade = _decade(row.get("year"))
                stats_by_bucket[bucket]["papers"] += 1
                stats_by_bucket[bucket]["with_refs"] += int(has_refs)
                stats_by_decade[decade]["papers"] += 1
                stats_by_decade[decade]["with_refs"] += int(has_refs)

    return {
        "sampled": len(rows),
        "with_references": total_with_refs,
        "yield_rate": round(total_with_refs / len(rows), 4),
        "by_reference_count_bucket": stats_by_bucket,
        "by_decade": stats_by_decade,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit outgoing reference yield from the S2 batch API")
    parser.add_argument("--sample-size", type=int, default=500, help="Number of graph papers to sample")
    parser.add_argument("--min-reference-count", type=int, default=20, help="Minimum bulk reference_count")
    args = parser.parse_args()
    print(json.dumps(run_reference_audit(args.sample_size, args.min_reference_count), indent=2))


if __name__ == "__main__":
    main()
