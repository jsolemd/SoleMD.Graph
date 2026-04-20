from __future__ import annotations

from uuid import UUID

import asyncpg

from app.corpus.models import CorpusPlan


PHASE_NAME = "corpus_admission"


async def refresh_corpus_admission(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
) -> None:
    await connection.execute(
        """
        DELETE FROM solemd.corpus_selection_signals
        WHERE corpus_selection_run_id = $1
          AND phase_name = $2
        """,
        corpus_selection_run_id,
        PHASE_NAME,
    )
    await _ensure_release_scope_corpus_ids(
        connection,
        s2_source_release_id=plan.s2_source_release_id,
        pt3_source_release_id=plan.pt3_source_release_id,
    )
    await _insert_journal_match_signals(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        s2_source_release_id=plan.s2_source_release_id,
    )
    await _insert_pattern_match_signals(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        s2_source_release_id=plan.s2_source_release_id,
    )
    await _insert_vocab_entity_match_signals(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        s2_source_release_id=plan.s2_source_release_id,
        pt3_source_release_id=plan.pt3_source_release_id,
    )
    await _apply_corpus_status(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        s2_source_release_id=plan.s2_source_release_id,
    )


async def _ensure_release_scope_corpus_ids(
    connection: asyncpg.Connection,
    *,
    s2_source_release_id: int,
    pt3_source_release_id: int,
) -> None:
    await connection.execute(
        """
        WITH corpus_hits AS (
            SELECT DISTINCT raw.paper_id
            FROM solemd.s2_papers_raw raw
            JOIN pg_temp.selector_journal_names journals
              ON journals.normalized_venue = coalesce(solemd.clean_venue(raw.venue_raw), '')
            WHERE raw.source_release_id = $1

            UNION

            SELECT DISTINCT raw.paper_id
            FROM solemd.s2_papers_raw raw
            JOIN pg_temp.selector_journal_patterns patterns
              ON coalesce(solemd.clean_venue(raw.venue_raw), '') LIKE patterns.like_pattern
            WHERE raw.source_release_id = $1

            UNION

            SELECT DISTINCT raw.paper_id
            FROM solemd.s2_papers_raw raw
            JOIN pubtator.entity_annotations_stage annotations
              ON annotations.source_release_id = $2
             AND annotations.pmid = raw.pmid
            JOIN solemd.vocab_term_aliases aliases
              ON aliases.normalized_alias = solemd.normalize_lookup_key(annotations.mention_text)
            WHERE raw.source_release_id = $1
              AND raw.pmid IS NOT NULL
        ),
        resolved_existing AS (
            SELECT
                raw.paper_id,
                coalesce(
                    papers_by_s2.corpus_id,
                    papers_by_pmid.corpus_id,
                    papers_by_doi.corpus_id,
                    papers_by_pmc.corpus_id,
                    raw.corpus_id
                ) AS corpus_id
            FROM solemd.s2_papers_raw raw
            JOIN corpus_hits hits
              ON hits.paper_id = raw.paper_id
            LEFT JOIN solemd.papers papers_by_s2
              ON papers_by_s2.s2_paper_id = raw.paper_id
            LEFT JOIN solemd.papers papers_by_pmid
              ON raw.pmid IS NOT NULL
             AND papers_by_pmid.pmid = raw.pmid
            LEFT JOIN solemd.papers papers_by_doi
              ON raw.doi_norm IS NOT NULL
             AND papers_by_doi.doi_norm = raw.doi_norm
            LEFT JOIN solemd.papers papers_by_pmc
              ON raw.pmc_id IS NOT NULL
             AND papers_by_pmc.pmc_id = CASE
                    WHEN raw.pmc_id ~* '^PMC' THEN raw.pmc_id
                    ELSE 'PMC' || raw.pmc_id
                END
            WHERE raw.source_release_id = $1
        ),
        missing AS (
            SELECT resolved_existing.paper_id
            FROM resolved_existing
            WHERE resolved_existing.corpus_id IS NULL
            ORDER BY resolved_existing.paper_id
        ),
        allocated AS (
            SELECT
                missing.paper_id,
                nextval(pg_get_serial_sequence('solemd.corpus', 'corpus_id'))::BIGINT AS corpus_id
            FROM missing
        ),
        inserted AS (
            INSERT INTO solemd.corpus (
                corpus_id,
                admission_reason,
                domain_status
            )
            SELECT
                allocated.corpus_id,
                'corpus_pending',
                'corpus'
            FROM allocated
        ),
        resolved AS (
            SELECT
                resolved_existing.paper_id,
                coalesce(resolved_existing.corpus_id, allocated.corpus_id) AS corpus_id
            FROM resolved_existing
            LEFT JOIN allocated
              ON allocated.paper_id = resolved_existing.paper_id
        )
        UPDATE solemd.s2_papers_raw raw
        SET corpus_id = resolved.corpus_id
        FROM resolved
        WHERE raw.source_release_id = $1
          AND raw.paper_id = resolved.paper_id
          AND raw.corpus_id IS DISTINCT FROM resolved.corpus_id
        """,
        s2_source_release_id,
        pt3_source_release_id,
    )


async def _insert_journal_match_signals(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    s2_source_release_id: int,
) -> None:
    await connection.execute(
        """
        WITH release_scope AS (
            SELECT
                raw.corpus_id,
                raw.venue_raw,
                coalesce(solemd.clean_venue(raw.venue_raw), '') AS normalized_venue
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $2
              AND raw.corpus_id IS NOT NULL
        )
        INSERT INTO solemd.corpus_selection_signals (
            corpus_selection_run_id,
            corpus_id,
            phase_name,
            signal_kind,
            family_key,
            match_key,
            match_value,
            signal_count,
            contributes_to_corpus,
            detail
        )
        SELECT
            $1,
            release_scope.corpus_id,
            'corpus_admission',
            'journal_match',
            'journal_inventory',
            'normalized_venue',
            release_scope.normalized_venue,
            1,
            true,
            jsonb_build_object(
                'normalized_venue', release_scope.normalized_venue,
                'venue_raw', release_scope.venue_raw
            )
        FROM release_scope
        JOIN pg_temp.selector_journal_names journals
          ON journals.normalized_venue = release_scope.normalized_venue
        """,
        corpus_selection_run_id,
        s2_source_release_id,
    )


async def _insert_pattern_match_signals(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    s2_source_release_id: int,
) -> None:
    await connection.execute(
        """
        WITH release_scope AS (
            SELECT
                raw.corpus_id,
                raw.venue_raw,
                coalesce(solemd.clean_venue(raw.venue_raw), '') AS normalized_venue
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $2
              AND raw.corpus_id IS NOT NULL
        )
        INSERT INTO solemd.corpus_selection_signals (
            corpus_selection_run_id,
            corpus_id,
            phase_name,
            signal_kind,
            family_key,
            match_key,
            match_value,
            signal_count,
            contributes_to_corpus,
            detail
        )
        SELECT
            $1,
            release_scope.corpus_id,
            'corpus_admission',
            'pattern_match',
            patterns.pattern_key,
            'like_pattern',
            patterns.like_pattern,
            1,
            true,
            jsonb_build_object(
                'normalized_venue', release_scope.normalized_venue,
                'venue_raw', release_scope.venue_raw
            )
        FROM release_scope
        JOIN pg_temp.selector_journal_patterns patterns
          ON release_scope.normalized_venue LIKE patterns.like_pattern
        """,
        corpus_selection_run_id,
        s2_source_release_id,
    )


async def _insert_vocab_entity_match_signals(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    s2_source_release_id: int,
    pt3_source_release_id: int,
) -> None:
    await connection.execute(
        """
        WITH alias_hits AS (
            SELECT
                raw.corpus_id,
                terms.term_id,
                terms.canonical_name,
                terms.category,
                coalesce(
                    min(aliases.alias) FILTER (WHERE aliases.is_preferred),
                    min(aliases.alias)
                ) AS matched_alias,
                count(*)::INTEGER AS signal_count
            FROM pubtator.entity_annotations_stage annotations
            JOIN solemd.s2_papers_raw raw
              ON raw.source_release_id = $3
             AND raw.pmid = annotations.pmid
             AND raw.corpus_id IS NOT NULL
            JOIN solemd.vocab_term_aliases aliases
              ON aliases.normalized_alias = solemd.normalize_lookup_key(annotations.mention_text)
            JOIN solemd.vocab_terms terms
              ON terms.term_id = aliases.term_id
            WHERE annotations.source_release_id = $2
            GROUP BY raw.corpus_id, terms.term_id, terms.canonical_name, terms.category
        )
        INSERT INTO solemd.corpus_selection_signals (
            corpus_selection_run_id,
            corpus_id,
            phase_name,
            signal_kind,
            family_key,
            match_key,
            match_value,
            signal_count,
            contributes_to_corpus,
            detail
        )
        SELECT
            $1,
            alias_hits.corpus_id,
            'corpus_admission',
            'vocab_entity_match',
            'vocab_alias',
            'term_id',
            alias_hits.term_id::TEXT,
            alias_hits.signal_count,
            true,
            jsonb_build_object(
                'term_id', alias_hits.term_id,
                'canonical_name', alias_hits.canonical_name,
                'category', alias_hits.category,
                'matched_alias', alias_hits.matched_alias
            )
        FROM alias_hits
        """,
        corpus_selection_run_id,
        pt3_source_release_id,
        s2_source_release_id,
    )


async def _apply_corpus_status(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    s2_source_release_id: int,
) -> None:
    await connection.execute(
        """
        WITH release_scope AS (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $2
              AND raw.corpus_id IS NOT NULL
        ),
        signal_rollup AS (
            SELECT
                signals.corpus_id,
                bool_or(signals.signal_kind = 'journal_match') AS has_journal_match,
                bool_or(signals.signal_kind = 'pattern_match') AS has_pattern_match,
                bool_or(signals.signal_kind = 'vocab_entity_match') AS has_vocab_entity_match
            FROM solemd.corpus_selection_signals signals
            WHERE signals.corpus_selection_run_id = $1
              AND signals.phase_name = 'corpus_admission'
            GROUP BY signals.corpus_id
        ),
        resolved AS (
            SELECT
                release_scope.corpus_id,
                CASE
                    WHEN coalesce(signal_rollup.has_journal_match, false)
                      OR coalesce(signal_rollup.has_pattern_match, false)
                      OR coalesce(signal_rollup.has_vocab_entity_match, false)
                    THEN 'corpus'
                    ELSE 'retired'
                END AS domain_status,
                CASE
                    WHEN coalesce(signal_rollup.has_journal_match, false)
                     AND coalesce(signal_rollup.has_vocab_entity_match, false)
                    THEN 'journal_and_vocab'
                    WHEN coalesce(signal_rollup.has_journal_match, false)
                    THEN 'journal_match'
                    WHEN coalesce(signal_rollup.has_pattern_match, false)
                    THEN 'pattern_match'
                    WHEN coalesce(signal_rollup.has_vocab_entity_match, false)
                    THEN 'vocab_entity_match'
                    ELSE 'selection_retired'
                END AS admission_reason
            FROM release_scope
            LEFT JOIN signal_rollup
              ON signal_rollup.corpus_id = release_scope.corpus_id
        )
        UPDATE solemd.corpus corpus
        SET domain_status = resolved.domain_status,
            admission_reason = resolved.admission_reason,
            last_seen_at = now()
        FROM resolved
        WHERE corpus.corpus_id = resolved.corpus_id
        """,
        corpus_selection_run_id,
        s2_source_release_id,
    )
