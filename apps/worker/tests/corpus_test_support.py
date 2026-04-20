from __future__ import annotations

from uuid import UUID

import asyncpg


async def seed_selection_fixture(admin_dsn: str) -> None:
    connection = await asyncpg.connect(admin_dsn)
    try:
        s2_release_id = await connection.fetchval(
            """
            INSERT INTO solemd.source_releases (
                source_name,
                source_release_key,
                release_status,
                manifest_uri,
                manifest_checksum,
                source_published_at
            )
            VALUES ('s2', 's2-2026-04-01', 'loaded', 's3://s2/release', 's2-checksum', now())
            RETURNING source_release_id
            """
        )
        pt3_release_id = await connection.fetchval(
            """
            INSERT INTO solemd.source_releases (
                source_name,
                source_release_key,
                release_status,
                manifest_uri,
                manifest_checksum,
                source_published_at
            )
            VALUES ('pt3', 'pt3-2026-04-01', 'loaded', 's3://pt3/release', 'pt3-checksum', now())
            RETURNING source_release_id
            """
        )

        await seed_raw_paper(
            connection,
            paper_id="S2-101",
            source_release_id=int(s2_release_id),
            pmid=50101,
            title="Amyloid beta in depression",
            venue_raw="Journal of affective disorders",
            year=2025,
            is_open_access=True,
            entity_annotations=(
                {
                    "entity_type": 1,
                    "mention_text": "amyloid beta",
                    "concept_id_raw": "C0078939",
                },
            ),
            pt3_source_release_id=int(pt3_release_id),
        )
        await seed_raw_paper(
            connection,
            paper_id="S2-102",
            source_release_id=int(s2_release_id),
            pmid=50102,
            title="Novel neuropharmacology survey",
            venue_raw="Frontiers in Neuropharmacology",
            year=2025,
            pt3_source_release_id=int(pt3_release_id),
        )
        await seed_raw_paper(
            connection,
            paper_id="S2-103",
            source_release_id=int(s2_release_id),
            pmid=50103,
            title="Amyloid beta in general medicine",
            venue_raw="General medicine",
            year=2025,
            entity_annotations=(
                {
                    "entity_type": 1,
                    "mention_text": "amyloid beta",
                    "concept_id_raw": "C0078939",
                },
            ),
            pt3_source_release_id=int(pt3_release_id),
        )
        await seed_raw_paper(
            connection,
            paper_id="S2-105",
            source_release_id=int(s2_release_id),
            pmid=50105,
            title="Delirium bridge paper",
            venue_raw="General medicine",
            year=2025,
            entity_annotations=(
                {
                    "entity_type": 2,
                    "mention_text": "amyloid beta",
                    "concept_id_raw": "MESH:D003693",
                },
            ),
            pt3_source_release_id=int(pt3_release_id),
        )
        await seed_raw_paper(
            connection,
            paper_id="S2-106",
            source_release_id=int(s2_release_id),
            pmid=50106,
            title="Drug toxicity bridge paper",
            venue_raw="General medicine",
            year=2025,
            entity_annotations=(
                {
                    "entity_type": 1,
                    "mention_text": "amyloid beta",
                    "concept_id_raw": "C0078939",
                },
            ),
            relations=(
                {
                    "relation_type": 4,
                    "subject_entity_id": "CHEM:fluoxetine",
                    "object_entity_id": "MESH:D015430",
                    "subject_type": 3,
                    "object_type": 2,
                },
            ),
            pt3_source_release_id=int(pt3_release_id),
        )
        await seed_raw_paper(
            connection,
            paper_id="S2-107",
            source_release_id=int(s2_release_id),
            pmid=50107,
            title="Old delirium bridge paper",
            venue_raw="General medicine",
            year=2008,
            entity_annotations=(
                {
                    "entity_type": 2,
                    "mention_text": "amyloid beta",
                    "concept_id_raw": "MESH:D003693",
                },
            ),
            pt3_source_release_id=int(pt3_release_id),
        )
        await seed_historical_selected_paper(
            connection,
            corpus_id=104,
            paper_id="S2-104",
            source_release_id=int(s2_release_id),
            pmid=50104,
            title="Unrelated paper",
            venue_raw="General medicine",
        )
    finally:
        await connection.close()


async def seed_raw_paper(
    connection: asyncpg.Connection,
    *,
    paper_id: str,
    source_release_id: int,
    pmid: int,
    title: str,
    venue_raw: str,
    year: int | None = 2025,
    is_open_access: bool = False,
    entity_annotations: tuple[dict[str, object], ...] = (),
    relations: tuple[dict[str, object], ...] = (),
    pt3_source_release_id: int,
) -> None:
    await connection.execute(
        """
        INSERT INTO solemd.s2_papers_raw (
            paper_id,
            source_release_id,
            corpus_id,
            pmid,
            title,
            abstract,
            venue_raw,
            year,
            is_open_access,
            payload_checksum
        )
        VALUES ($1, $2, NULL, $3, $4, 'abstract', $5, $6, $7, $8)
        """,
        paper_id,
        source_release_id,
        pmid,
        title,
        venue_raw,
        year,
        is_open_access,
        f"checksum-{paper_id}",
    )
    await connection.execute(
        """
        INSERT INTO solemd.s2_paper_authors_raw (
            paper_id,
            author_ordinal,
            source_author_id,
            name_raw,
            affiliation_raw
        )
        VALUES ($1, 0, $2, $3, 'Test affiliation')
        """,
        paper_id,
        f"author-{paper_id}",
        f"Author {paper_id}",
    )
    for annotation in entity_annotations:
        await connection.execute(
            """
            INSERT INTO pubtator.entity_annotations_stage (
                source_release_id,
                pmid,
                start_offset,
                end_offset,
                entity_type,
                mention_text,
                concept_id_raw,
                resource
            )
            VALUES ($1, $2, 0, 12, $3, $4, $5, 1)
            """,
            pt3_source_release_id,
            pmid,
            int(annotation["entity_type"]),
            str(annotation["mention_text"]),
            str(annotation["concept_id_raw"]),
        )
    for relation in relations:
        await connection.execute(
            """
            INSERT INTO pubtator.relations_stage (
                source_release_id,
                pmid,
                relation_type,
                subject_entity_id,
                object_entity_id,
                subject_type,
                object_type,
                relation_source
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
            """,
            pt3_source_release_id,
            pmid,
            int(relation["relation_type"]),
            str(relation["subject_entity_id"]),
            str(relation["object_entity_id"]),
            int(relation["subject_type"]),
            int(relation["object_type"]),
        )


async def seed_historical_selected_paper(
    connection: asyncpg.Connection,
    *,
    corpus_id: int,
    paper_id: str,
    source_release_id: int,
    pmid: int,
    title: str,
    venue_raw: str,
) -> None:
    await connection.execute(
        """
        INSERT INTO solemd.corpus (corpus_id, admission_reason, domain_status)
        VALUES ($1, 'legacy_selection', 'corpus')
        """,
        corpus_id,
    )
    await connection.execute(
        """
        INSERT INTO solemd.s2_papers_raw (
            paper_id,
            source_release_id,
            corpus_id,
            pmid,
            title,
            abstract,
            venue_raw,
            payload_checksum
        )
        VALUES ($1, $2, $3, $4, $5, 'abstract', $6, $7)
        """,
        paper_id,
        source_release_id,
        corpus_id,
        pmid,
        title,
        venue_raw,
        f"checksum-{paper_id}",
    )
    await connection.execute(
        """
        INSERT INTO solemd.s2_paper_authors_raw (
            paper_id,
            author_ordinal,
            source_author_id,
            name_raw,
            affiliation_raw
        )
        VALUES ($1, 0, $2, $3, 'Test affiliation')
        """,
        paper_id,
        f"author-{paper_id}",
        f"Author {paper_id}",
    )


async def seed_existing_paper_identity(
    admin_dsn: str,
    *,
    corpus_id: int,
    s2_paper_id: str,
    pmid: int,
    pmc_id: str,
) -> None:
    connection = await asyncpg.connect(admin_dsn)
    try:
        await connection.execute(
            """
            INSERT INTO solemd.corpus (corpus_id, admission_reason, domain_status)
            VALUES ($1, 'manual-dogfood', 'mapped')
            ON CONFLICT (corpus_id) DO NOTHING
            """,
            corpus_id,
        )
        await connection.execute(
            """
            INSERT INTO solemd.papers (
                corpus_id,
                pmid,
                pmc_id,
                s2_paper_id
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (corpus_id) DO UPDATE
            SET pmid = EXCLUDED.pmid,
                pmc_id = EXCLUDED.pmc_id,
                s2_paper_id = EXCLUDED.s2_paper_id,
                updated_at = now()
            """,
            corpus_id,
            pmid,
            pmc_id,
            s2_paper_id,
        )
    finally:
        await connection.close()


async def seed_stale_release_scope_corpus_assignment(
    admin_dsn: str,
    *,
    paper_id: str,
    stale_corpus_id: int,
) -> None:
    connection = await asyncpg.connect(admin_dsn)
    try:
        await connection.execute(
            """
            INSERT INTO solemd.corpus (corpus_id, admission_reason, domain_status)
            VALUES ($1, 'stale_release_scope', 'corpus')
            ON CONFLICT (corpus_id) DO NOTHING
            """,
            stale_corpus_id,
        )
        await connection.execute(
            """
            UPDATE solemd.s2_papers_raw
            SET corpus_id = $2
            WHERE paper_id = $1
            """,
            paper_id,
            stale_corpus_id,
        )
    finally:
        await connection.close()
async def latest_selection_run_id(admin_dsn: str) -> UUID:
    connection = await asyncpg.connect(admin_dsn)
    try:
        return await connection.fetchval(
            """
            SELECT corpus_selection_run_id
            FROM solemd.corpus_selection_runs
            ORDER BY started_at DESC
            LIMIT 1
            """
        )
    finally:
        await connection.close()


async def fetch_selection_run(admin_dsn: str, run_id: UUID) -> asyncpg.Record:
    connection = await asyncpg.connect(admin_dsn)
    try:
        row = await connection.fetchrow(
            """
            SELECT status, phases_completed
            FROM solemd.corpus_selection_runs
            WHERE corpus_selection_run_id = $1
            """,
            run_id,
        )
        assert row is not None
        return row
    finally:
        await connection.close()


async def summary_count(admin_dsn: str, run_id: UUID) -> int:
    connection = await asyncpg.connect(admin_dsn)
    try:
        return int(
            await connection.fetchval(
                """
                SELECT count(*)
                FROM solemd.paper_selection_summary
                WHERE corpus_selection_run_id = $1
                """,
                run_id,
            )
        )
    finally:
        await connection.close()


async def fetch_selection_summary_rows(
    admin_dsn: str,
    run_id: UUID,
) -> list[tuple[str, str, str]]:
    connection = await asyncpg.connect(admin_dsn)
    try:
        rows = await connection.fetch(
            """
            SELECT papers.s2_paper_id, summary.current_status, summary.primary_admission_reason
            FROM solemd.paper_selection_summary summary
            JOIN solemd.papers papers
              ON papers.corpus_id = summary.corpus_id
            WHERE summary.corpus_selection_run_id = $1
            ORDER BY papers.s2_paper_id
            """,
            run_id,
        )
        return [
            (
                str(row["s2_paper_id"]),
                str(row["current_status"]),
                str(row["primary_admission_reason"]),
            )
            for row in rows
        ]
    finally:
        await connection.close()


async def paper_ids_for_corpus_ids(
    admin_dsn: str,
    corpus_ids: list[int],
) -> dict[int, str]:
    if not corpus_ids:
        return {}
    connection = await asyncpg.connect(admin_dsn)
    try:
        rows = await connection.fetch(
            """
            SELECT corpus_id, s2_paper_id
            FROM solemd.papers
            WHERE corpus_id = ANY($1::BIGINT[])
            """,
            corpus_ids,
        )
        return {int(row["corpus_id"]): str(row["s2_paper_id"]) for row in rows}
    finally:
        await connection.close()


async def fetch_wave_members(
    admin_dsn: str,
    run_id: UUID,
) -> list[tuple[str, int, bool]]:
    connection = await asyncpg.connect(admin_dsn)
    try:
        rows = await connection.fetch(
            """
            SELECT papers.s2_paper_id, members.member_ordinal, members.enqueued_at IS NOT NULL AS is_enqueued
            FROM solemd.corpus_wave_members members
            JOIN solemd.papers papers
              ON papers.corpus_id = members.corpus_id
            WHERE members.corpus_wave_run_id = $1
            ORDER BY members.member_ordinal
            """,
            run_id,
        )
        return [
            (
                str(row["s2_paper_id"]),
                int(row["member_ordinal"]),
                bool(row["is_enqueued"]),
            )
            for row in rows
        ]
    finally:
        await connection.close()
