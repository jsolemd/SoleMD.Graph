"""Apply the expanded highlight policy to all existing entity aliases.

Usage:
    cd /workspaces/SoleMD.Graph/engine
    uv run python scripts/backfill_highlight_policy.py           # apply
    uv run python scripts/backfill_highlight_policy.py --dry-run # preview
"""

from __future__ import annotations

import argparse
import logging

from app import db
from app.entities.highlight_policy import (
    AMBIGUOUS_CANONICAL_ALIAS_KEYS,
    HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT,
    HIGHLIGHT_MODE_DISABLED,
    HIGHLIGHT_MODE_EXACT,
    HIGHLIGHT_MODE_SEARCH_ONLY,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

_UPDATE_SQL = """
UPDATE solemd.entity_aliases ea
SET highlight_mode = CASE
    WHEN NOT ea.is_canonical THEN %s
    WHEN ea.alias_key = ANY(%s::text[]) THEN %s
    WHEN ea.alias_text = upper(ea.alias_text) AND length(ea.alias_text) <= 6 THEN %s
    ELSE %s
END
"""

_PREVIEW_SQL = """
SELECT
    highlight_mode,
    count(*) AS cnt
FROM solemd.entity_aliases
GROUP BY highlight_mode
ORDER BY cnt DESC
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill highlight_mode policy")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    logger.info("Ambiguous canonical alias keys: %d", len(AMBIGUOUS_CANONICAL_ALIAS_KEYS))

    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(_PREVIEW_SQL)
        logger.info("Current distribution:")
        for row in cur.fetchall():
            logger.info("  %s: %s", row["highlight_mode"], row["cnt"])

        if args.dry_run:
            logger.info("Dry run — no changes applied")
            return

        cur.execute(
            _UPDATE_SQL,
            (
                HIGHLIGHT_MODE_SEARCH_ONLY,
                sorted(AMBIGUOUS_CANONICAL_ALIAS_KEYS),
                HIGHLIGHT_MODE_DISABLED,
                HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT,
                HIGHLIGHT_MODE_EXACT,
            ),
        )
        updated = cur.rowcount
        conn.commit()
        logger.info("Updated %d rows", updated)

        cur.execute(_PREVIEW_SQL)
        logger.info("New distribution:")
        for row in cur.fetchall():
            logger.info("  %s: %s", row["highlight_mode"], row["cnt"])


if __name__ == "__main__":
    main()
