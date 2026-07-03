from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import asyncpg

from app.pmc_fulltext.license import DOCUMENTS_LICENSE_PROVENANCE_SQL
from app.telemetry.pmc_fulltext_metrics import record_pmc_fulltext_promotion


@dataclass(frozen=True, slots=True)
class PromotionResult:
    applied: bool
    outcome: str
    passage_count: int = 0


async def promote_pmc_fulltext_document(
    connection: asyncpg.Connection,
    *,
    document_id: UUID,
) -> PromotionResult:
    row = await connection.fetchrow(
        f"""
        WITH document AS (
            SELECT
                documents.pmc_fulltext_document_id,
                documents.corpus_id,
                documents.pmcid,
                documents.status
            FROM solemd.pmc_fulltext_documents documents
            WHERE documents.pmc_fulltext_document_id = $1
        ),
        passage_rollup AS (
            SELECT
                passages.pmc_fulltext_document_id,
                count(*) FILTER (WHERE passages.is_retrievable)::INTEGER
                    AS retrievable_passage_count,
                count(*) FILTER (
                    WHERE passages.is_retrievable
                      AND passages.passage_role IN ('body', 'abstract')
                )::INTEGER AS body_abstract_passage_count
            FROM solemd.pmc_fulltext_passages passages
            WHERE passages.pmc_fulltext_document_id = $1
            GROUP BY passages.pmc_fulltext_document_id
        ),
        eligible AS (
            SELECT
                document.pmc_fulltext_document_id,
                document.corpus_id,
                passage_rollup.retrievable_passage_count
            FROM document
            JOIN passage_rollup
              ON passage_rollup.pmc_fulltext_document_id = document.pmc_fulltext_document_id
            JOIN solemd.papers papers
              ON papers.corpus_id = document.corpus_id
             AND document.pmcid = CASE
                    WHEN papers.pmc_id ~* '^PMC' THEN upper(papers.pmc_id)
                    ELSE 'PMC' || papers.pmc_id
                 END
            WHERE document.status = 'parsed'
              AND passage_rollup.body_abstract_passage_count > 0
              AND EXISTS (
                  SELECT 1
                  FROM solemd.pmc_fulltext_documents documents
                  WHERE documents.pmc_fulltext_document_id = document.pmc_fulltext_document_id
                    AND {DOCUMENTS_LICENSE_PROVENANCE_SQL}
              )
        )
        UPDATE solemd.paper_selection_summary summary
        SET content_status = 'fulltext_ready',
            rag_eligible = true,
            quality_warnings = (summary.quality_warnings - 'title_only' - 'title-only'),
            pmc_fulltext_document_id = eligible.pmc_fulltext_document_id,
            pmc_fulltext_passage_count = eligible.retrievable_passage_count,
            pmc_fulltext_promoted_at = now(),
            updated_at = now()
        FROM eligible
        WHERE summary.corpus_id = eligible.corpus_id
          AND summary.current_status = 'mapped'
        RETURNING eligible.retrievable_passage_count
        """,
        document_id,
    )
    if row is None:
        record_pmc_fulltext_promotion(outcome="skipped")
        return PromotionResult(applied=False, outcome="skipped")
    passage_count = int(row["retrievable_passage_count"])
    record_pmc_fulltext_promotion(outcome="applied")
    return PromotionResult(applied=True, outcome="applied", passage_count=passage_count)
