from __future__ import annotations

from collections.abc import Sequence
from typing import Any
from uuid import UUID

import asyncpg


async def upsert_publication_venues(
    connection: asyncpg.Connection,
    batch: Sequence[dict[str, Any]],
) -> None:
    source_ids: list[str] = []
    issns: list[str | None] = []
    display_names: list[str] = []
    normalized_names: list[str] = []
    seen_source_ids: set[str] = set()
    seen_issns: set[str] = set()
    seen_normalized_names: set[str] = set()
    for row in batch:
        source_venue_id = row["source_venue_id"]
        issn = row["issn"]
        normalized_name = " ".join(str(row["display_name"]).strip().lower().split())
        if source_venue_id in seen_source_ids:
            continue
        if issn is not None and issn in seen_issns:
            continue
        if normalized_name in seen_normalized_names:
            continue
        seen_source_ids.add(source_venue_id)
        if issn is not None:
            seen_issns.add(issn)
        seen_normalized_names.add(normalized_name)
        source_ids.append(source_venue_id)
        issns.append(issn)
        display_names.append(row["display_name"])
        normalized_names.append(normalized_name)
    await connection.execute(
        """
        WITH input_rows AS (
            SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
                AS row(source_venue_id, issn, display_name, normalized_name)
        ),
        updated_by_source AS (
            UPDATE solemd.venues venues
            SET issn = COALESCE(venues.issn, input_rows.issn),
                display_name = input_rows.display_name
            FROM input_rows
            WHERE venues.source_venue_id = input_rows.source_venue_id
            RETURNING input_rows.source_venue_id
        ),
        updated_by_issn AS (
            UPDATE solemd.venues venues
            SET display_name = input_rows.display_name
            FROM input_rows
            WHERE input_rows.issn IS NOT NULL
              AND venues.issn = input_rows.issn
              AND NOT EXISTS (
                  SELECT 1
                  FROM updated_by_source updated
                  WHERE updated.source_venue_id = input_rows.source_venue_id
              )
            RETURNING input_rows.source_venue_id
        ),
        updated_by_normalized_name AS (
            UPDATE solemd.venues venues
            SET issn = COALESCE(venues.issn, input_rows.issn),
                source_venue_id = COALESCE(venues.source_venue_id, input_rows.source_venue_id),
                display_name = input_rows.display_name
            FROM input_rows
            WHERE venues.normalized_name = input_rows.normalized_name
              AND NOT EXISTS (
                  SELECT 1
                  FROM updated_by_source updated
                  WHERE updated.source_venue_id = input_rows.source_venue_id
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM updated_by_issn updated
                  WHERE updated.source_venue_id = input_rows.source_venue_id
              )
            RETURNING input_rows.source_venue_id
        )
        INSERT INTO solemd.venues (source_venue_id, issn, display_name)
        SELECT input_rows.source_venue_id, input_rows.issn, input_rows.display_name
        FROM input_rows
        WHERE NOT EXISTS (
                SELECT 1
                FROM updated_by_source updated
                WHERE updated.source_venue_id = input_rows.source_venue_id
            )
          AND NOT EXISTS (
                SELECT 1
                FROM updated_by_issn updated
                WHERE updated.source_venue_id = input_rows.source_venue_id
            )
          AND NOT EXISTS (
                SELECT 1
                FROM updated_by_normalized_name updated
                WHERE updated.source_venue_id = input_rows.source_venue_id
            )
        ON CONFLICT (source_venue_id)
        DO UPDATE SET
            issn = COALESCE(EXCLUDED.issn, solemd.venues.issn),
            display_name = EXCLUDED.display_name
        """,
        source_ids,
        issns,
        display_names,
        normalized_names,
    )


async def upsert_author_registry(
    connection: asyncpg.Connection,
    batch: Sequence[dict[str, Any]],
    *,
    source_release_id: int,
    ingest_run_id: UUID,
) -> None:
    await connection.execute(
        """
        INSERT INTO solemd.s2_authors_raw (
            source_release_id,
            source_author_id,
            orcid,
            display_name,
            last_seen_run_id
        )
        SELECT * FROM unnest($1::integer[], $2::text[], $3::text[], $4::text[], $5::uuid[])
        ON CONFLICT (source_release_id, source_author_id)
        DO UPDATE SET
            orcid = COALESCE(EXCLUDED.orcid, solemd.s2_authors_raw.orcid),
            display_name = EXCLUDED.display_name,
            last_seen_run_id = EXCLUDED.last_seen_run_id
        """,
        [source_release_id] * len(batch),
        [row["source_author_id"] for row in batch],
        [row["orcid"] for row in batch],
        [row["display_name"] for row in batch],
        [ingest_run_id] * len(batch),
    )
