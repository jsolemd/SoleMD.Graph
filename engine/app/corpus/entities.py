"""Aggregate pubtator.entity_annotations into solemd.entities.

Builds a canonical entity lookup table by:
1. Grouping entity annotations by (entity_type, concept_id)
2. Picking the most-frequent mention form as canonical_name
3. Collecting all unique mention forms as synonyms
4. Counting distinct PMIDs as paper_count
5. Overriding canonical_name with hand-curated entity_rule values

Usage:
    cd /workspaces/SoleMD.Graph/engine
    uv run python -m app.corpus.entities              # full build
    uv run python -m app.corpus.entities --dry-run    # report counts only
"""

from __future__ import annotations

import argparse
import logging
import time

from app import db
from app.corpus._etl import log_etl_run

logger = logging.getLogger(__name__)


_AGGREGATE_SQL = """
INSERT INTO solemd.entities (concept_id, entity_type, canonical_name, synonyms, paper_count)
SELECT
    concept_id,
    entity_type,
    mode() WITHIN GROUP (ORDER BY mention) AS canonical_name,
    array_agg(DISTINCT mention ORDER BY mention) AS synonyms,
    COUNT(DISTINCT pmid) AS paper_count
FROM pubtator.entity_annotations,
     unnest(string_to_array(mentions, '|')) AS mention
WHERE concept_id != ''
  AND mentions != ''
GROUP BY entity_type, concept_id
ON CONFLICT (concept_id, entity_type) DO UPDATE SET
    canonical_name = EXCLUDED.canonical_name,
    synonyms = EXCLUDED.synonyms,
    paper_count = EXCLUDED.paper_count
"""

_RECONCILE_ENTITY_RULE_SQL = """
UPDATE solemd.entities e
SET canonical_name = er.canonical_name
FROM solemd.entity_rule er
WHERE e.concept_id = er.concept_id
  AND e.entity_type = er.entity_type
"""

_COUNT_SQL = "SELECT COUNT(*) AS cnt FROM solemd.entities"

_DRY_RUN_SQL = """
SELECT
    entity_type,
    COUNT(DISTINCT concept_id) AS concept_count,
    COUNT(DISTINCT pmid) AS paper_count
FROM pubtator.entity_annotations
WHERE concept_id != ''
GROUP BY entity_type
ORDER BY concept_count DESC
"""


def build_entities_table(*, dry_run: bool = False) -> dict:
    """Aggregate pubtator.entity_annotations into solemd.entities.

    Args:
        dry_run: If True, only report expected counts without writing.

    Returns:
        Dict with aggregation statistics.
    """
    t_start = time.monotonic()

    if dry_run:
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute(_DRY_RUN_SQL)
            rows = cur.fetchall()
            total_concepts = sum(r["concept_count"] for r in rows)
            logger.info("Dry run — entity type breakdown:")
            for r in rows:
                logger.info(
                    "  %-12s  %7d concepts  %9d papers",
                    r["entity_type"], r["concept_count"], r["paper_count"],
                )
            logger.info("  Total: %d distinct concepts", total_concepts)
            return {"dry_run": True, "total_concepts": total_concepts, "by_type": rows}

    with db.connect() as conn:
        with conn.cursor() as cur:
            # Aggregate mentions into entities
            logger.info("Aggregating pubtator.entity_annotations into solemd.entities ...")
            cur.execute(_AGGREGATE_SQL)
            upserted = cur.rowcount
            logger.info("Upserted %d entity records", upserted)

            # Override with hand-curated entity_rule canonical names
            cur.execute(_RECONCILE_ENTITY_RULE_SQL)
            reconciled = cur.rowcount
            if reconciled:
                logger.info("Reconciled %d canonical names from entity_rule", reconciled)

            # Final count
            cur.execute(_COUNT_SQL)
            total = cur.fetchone()["cnt"]

        conn.commit()

        # Log to ETL history
        log_etl_run(
            conn,
            operation="build_entities",
            source="pubtator.entity_annotations",
            rows_processed=upserted,
            rows_loaded=total,
            status="completed",
            metadata={
                "upserted": upserted,
                "reconciled_from_entity_rule": reconciled,
                "total_entities": total,
            },
        )

    elapsed = time.monotonic() - t_start
    logger.info("=" * 60)
    logger.info(
        "Entity aggregation complete: %d entities in %.1fs (%.1f min)",
        total, elapsed, elapsed / 60,
    )
    logger.info("=" * 60)

    return {
        "upserted": upserted,
        "reconciled_from_entity_rule": reconciled,
        "total_entities": total,
        "elapsed_seconds": round(elapsed, 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Aggregate PubTator entities into solemd.entities",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report counts only")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    build_entities_table(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
