"""Merge vocab_term_aliases into entity_aliases and re-apply highlight policy.

Inserts UMLS-sourced aliases (brand names, preferred synonyms) from
vocab_term_aliases into entity_aliases so they are available for entity
matching and highlighting.  Existing aliases are preserved (ON CONFLICT skip).

Usage:
    cd /workspaces/SoleMD.Graph/engine
    uv run python scripts/backfill_vocab_aliases.py           # apply
    uv run python scripts/backfill_vocab_aliases.py --dry-run # preview
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

_INSERT_VOCAB_ALIASES_SQL = r"""
WITH vocab_candidates AS (
    SELECT
        'MESH:' || vt.mesh_id AS concept_id,
        lower(vt.pubtator_entity_type) AS entity_type,
        regexp_replace(trim(vta.alias_text), '\s+', ' ', 'g') AS alias_text,
        lower(regexp_replace(trim(vta.alias_text), '\s+', ' ', 'g')) AS alias_key,
        vta.is_preferred AS is_canonical,
        COALESCE(
            (SELECT COALESCE(NULLIF(trim(e.canonical_name), ''), e.concept_id)
             FROM solemd.entities e
             WHERE e.concept_id = 'MESH:' || vt.mesh_id
               AND lower(e.entity_type) = lower(vt.pubtator_entity_type)
             LIMIT 1),
            vt.canonical_name
        ) AS canonical_name,
        COALESCE(
            (SELECT e.paper_count
             FROM solemd.entities e
             WHERE e.concept_id = 'MESH:' || vt.mesh_id
               AND lower(e.entity_type) = lower(vt.pubtator_entity_type)
             LIMIT 1),
            0
        ) AS paper_count,
        ROW_NUMBER() OVER (
            PARTITION BY lower(vt.pubtator_entity_type),
                         'MESH:' || vt.mesh_id,
                         lower(regexp_replace(trim(vta.alias_text), '\s+', ' ', 'g'))
            ORDER BY vta.is_preferred DESC, vta.alias_text
        ) AS rn
    FROM solemd.vocab_term_aliases vta
    JOIN solemd.vocab_terms vt ON vt.id = vta.term_id
    WHERE vt.mesh_id IS NOT NULL
      AND vt.pubtator_entity_type IS NOT NULL
      AND NULLIF(trim(vta.alias_text), '') IS NOT NULL
)
INSERT INTO solemd.entity_aliases (
    concept_id, entity_type, alias_text, alias_key,
    is_canonical, alias_source, canonical_name, paper_count
)
SELECT concept_id, entity_type, alias_text, alias_key,
       is_canonical, 'vocab', canonical_name, paper_count
FROM vocab_candidates
WHERE rn = 1
ON CONFLICT (entity_type, concept_id, alias_key)
DO UPDATE SET alias_source = 'vocab'
WHERE solemd.entity_aliases.alias_source != 'canonical_name'
"""

_PREVIEW_SQL = """
SELECT alias_source, highlight_mode, count(*) AS cnt
FROM solemd.entity_aliases
GROUP BY alias_source, highlight_mode
ORDER BY alias_source, cnt DESC
"""

_APPLY_HIGHLIGHT_POLICY_SQL = """
UPDATE solemd.entity_aliases ea
SET highlight_mode = CASE
    WHEN ea.alias_key = ANY(%s::text[]) THEN %s
    WHEN ea.alias_source = 'vocab' THEN
        CASE
            WHEN ea.alias_text = upper(ea.alias_text) AND length(ea.alias_text) <= 6 THEN %s
            ELSE %s
        END
    WHEN NOT ea.is_canonical THEN %s
    WHEN ea.alias_text = upper(ea.alias_text) AND length(ea.alias_text) <= 6 THEN %s
    ELSE %s
END
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge vocab aliases into entity_aliases")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with db.connect() as conn, conn.cursor() as cur:
        # Preview current state
        cur.execute(_PREVIEW_SQL)
        logger.info("Current distribution:")
        for row in cur.fetchall():
            logger.info("  %s / %s: %s", row["alias_source"], row["highlight_mode"], row["cnt"])

        if args.dry_run:
            logger.info("Dry run — no changes applied")
            return

        # Insert vocab aliases (skip existing)
        cur.execute(_INSERT_VOCAB_ALIASES_SQL)
        inserted = cur.rowcount
        logger.info("Inserted %d vocab aliases", inserted)

        # Re-apply highlight policy to all rows
        cur.execute(
            _APPLY_HIGHLIGHT_POLICY_SQL,
            (
                sorted(AMBIGUOUS_CANONICAL_ALIAS_KEYS),
                HIGHLIGHT_MODE_DISABLED,
                HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT,
                HIGHLIGHT_MODE_EXACT,
                HIGHLIGHT_MODE_SEARCH_ONLY,
                HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT,
                HIGHLIGHT_MODE_EXACT,
            ),
        )
        policy_updated = cur.rowcount
        logger.info("Re-applied highlight policy to %d aliases", policy_updated)

        conn.commit()

        # Show result
        cur.execute(_PREVIEW_SQL)
        logger.info("New distribution:")
        for row in cur.fetchall():
            logger.info("  %s / %s: %s", row["alias_source"], row["highlight_mode"], row["cnt"])


if __name__ == "__main__":
    main()
