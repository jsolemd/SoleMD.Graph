from __future__ import annotations

from uuid import UUID

import asyncpg

from app.pmc_fulltext.models import PmcFullTextCandidate, PmcFullTextSelector


async def select_pmc_fulltext_candidates(
    connection: asyncpg.Connection,
    *,
    selector_version: PmcFullTextSelector,
    limit: int,
) -> tuple[PmcFullTextCandidate, ...]:
    if selector_version == "metadata-only-pmcid":
        content_filter = "AND summary.content_status = 'metadata_only'"
    elif selector_version == "mapped-pmcid":
        content_filter = ""
    else:
        raise ValueError(f"unknown PMC full-text selector: {selector_version}")

    rows = await connection.fetch(
        f"""
        SELECT
            summary.corpus_id,
            CASE
                WHEN papers.pmc_id ~* '^PMC' THEN upper(papers.pmc_id)
                ELSE 'PMC' || papers.pmc_id
            END AS pmcid,
            summary.content_status
        FROM solemd.paper_selection_summary summary
        JOIN solemd.papers papers
          ON papers.corpus_id = summary.corpus_id
        WHERE summary.current_status = 'mapped'
          AND summary.has_pmc_id
          AND NULLIF(btrim(papers.pmc_id), '') IS NOT NULL
          AND (
              CASE
                  WHEN papers.pmc_id ~* '^PMC' THEN upper(papers.pmc_id)
                  ELSE 'PMC' || papers.pmc_id
              END
          ) ~ '^PMC[0-9]+$'
          {content_filter}
        ORDER BY
            summary.evidence_priority_score DESC,
            summary.mapped_priority_score DESC,
            summary.corpus_id
        LIMIT $1
        """,
        limit,
    )
    return tuple(
        PmcFullTextCandidate(
            corpus_id=int(row["corpus_id"]),
            pmcid=str(row["pmcid"]),
            content_status=str(row["content_status"]),
            selector_version=selector_version,
        )
        for row in rows
    )


async def select_retry_candidates(
    connection: asyncpg.Connection,
    *,
    run_id: UUID,
    limit: int | None,
) -> tuple[PmcFullTextCandidate, ...]:
    rows = await connection.fetch(
        """
        SELECT DISTINCT ON (summary.corpus_id)
            summary.corpus_id,
            documents.pmcid,
            summary.content_status
        FROM solemd.pmc_fulltext_documents documents
        JOIN solemd.paper_selection_summary summary
          ON summary.corpus_id = documents.corpus_id
        JOIN solemd.papers papers
          ON papers.corpus_id = summary.corpus_id
        WHERE documents.pmc_fulltext_fetch_run_id = $1
          AND documents.status IN ('unavailable', 'fetch_failed', 'parse_failed')
          AND summary.current_status = 'mapped'
          AND summary.has_pmc_id
          AND documents.pmcid = CASE
                WHEN papers.pmc_id ~* '^PMC' THEN upper(papers.pmc_id)
                ELSE 'PMC' || papers.pmc_id
              END
        ORDER BY
            summary.corpus_id,
            documents.updated_at DESC
        LIMIT COALESCE($2, 2147483647)
        """,
        run_id,
        limit,
    )
    return tuple(
        PmcFullTextCandidate(
            corpus_id=int(row["corpus_id"]),
            pmcid=str(row["pmcid"]),
            content_status=str(row["content_status"]),
            selector_version=f"retry:{run_id}",
        )
        for row in rows
    )
