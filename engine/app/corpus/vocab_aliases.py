"""Curated vocab alias loader and runtime alias catalog refresh.

The curated TSV remains the editorial source. The runtime authority lives in
`solemd.vocab_term_aliases`, refreshed during corpus ingestion so serving code
does not depend on file parsing.
"""

from __future__ import annotations

import argparse
import csv
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path

from app import db
from app.config import settings
from app.corpus._etl import log_etl_run
from app.entities.alias_keys import collapse_alias_whitespace, normalize_alias_key

logger = logging.getLogger(__name__)

_MIN_ALIAS_LEN = 4
_PARENTHETICAL_ACRONYM_PATTERN = re.compile(
    r"^(?P<lemma>.+?)\((?P<acronym>[A-Z][A-Z0-9/+:-]{1,7})\)\s*$"
)
_DASHED_ACRONYM_PATTERN = re.compile(
    r"^(?P<acronym>[A-Z][A-Z0-9/+:-]{1,7})\s*-\s*(?P<lemma>.+)$"
)

_TRUNCATE_VOCAB_TERM_ALIASES_SQL = "TRUNCATE TABLE solemd.vocab_term_aliases"
_COUNT_VOCAB_TERM_ALIASES_SQL = "SELECT COUNT(*) AS cnt FROM solemd.vocab_term_aliases"
_COPY_VOCAB_TERM_ALIASES_SQL = """
COPY solemd.vocab_term_aliases (
    term_id,
    alias_text,
    alias_key,
    alias_type,
    quality_score,
    is_preferred,
    umls_cui
) FROM STDIN
"""


@dataclass(frozen=True)
class VocabAliasRecord:
    term_id: str
    alias_text: str
    alias_key: str
    alias_type: str | None
    quality_score: int | None
    is_preferred: bool
    umls_cui: str | None


def _derived_acronym_aliases(alias_text: str) -> tuple[str, ...]:
    """Derive standalone acronym aliases from curated long-form surfaces."""

    candidates: list[str] = []
    for pattern in (
        _PARENTHETICAL_ACRONYM_PATTERN,
        _DASHED_ACRONYM_PATTERN,
    ):
        match = pattern.fullmatch(alias_text)
        if match is None:
            continue
        acronym = collapse_alias_whitespace(match.group("acronym") or "")
        if acronym:
            candidates.append(acronym)
    return tuple(dict.fromkeys(candidates))


def _parse_quality_score(value: str | None) -> int | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return int(cleaned)


def _parse_bool_flag(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "t", "true", "y", "yes"}


def _record_rank(record: VocabAliasRecord) -> tuple[int, int, int, str]:
    return (
        1 if record.is_preferred else 0,
        record.quality_score if record.quality_score is not None else -1,
        len(record.alias_text),
        record.alias_text,
    )


def load_vocab_alias_records(
    tsv_path: Path | str | None = None,
    *,
    min_alias_len: int = _MIN_ALIAS_LEN,
) -> list[VocabAliasRecord]:
    """Load and deduplicate curated vocab aliases from TSV."""
    if tsv_path is None:
        tsv_path = settings.vocab_aliases_path
    resolved_path = Path(tsv_path)

    deduped: dict[tuple[str, str], VocabAliasRecord] = {}
    with open(resolved_path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            term_id = (row.get("term_id") or "").strip()
            alias_text = collapse_alias_whitespace(row.get("alias") or "")
            if not term_id or not alias_text:
                continue
            alias_type = ((row.get("alias_type") or "").strip() or None)
            quality_score = _parse_quality_score(row.get("quality_score"))
            is_preferred = _parse_bool_flag(row.get("is_preferred"))
            umls_cui = ((row.get("umls_cui") or "").strip() or None)

            alias_variants: list[tuple[str, str | None]] = [(alias_text, alias_type)]
            alias_variants.extend(
                (derived_alias, "derived_acronym")
                for derived_alias in _derived_acronym_aliases(alias_text)
            )
            for variant_text, variant_type in alias_variants:
                alias_key = normalize_alias_key(variant_text)
                if not alias_key or len(alias_key) < min_alias_len:
                    continue

                record = VocabAliasRecord(
                    term_id=term_id,
                    alias_text=variant_text,
                    alias_key=alias_key,
                    alias_type=variant_type,
                    quality_score=quality_score,
                    is_preferred=is_preferred,
                    umls_cui=umls_cui,
                )
                dedupe_key = (record.term_id, record.alias_key)
                previous = deduped.get(dedupe_key)
                if previous is None or _record_rank(record) > _record_rank(previous):
                    deduped[dedupe_key] = record

    ordered_records = sorted(
        deduped.values(),
        key=lambda record: (record.term_id, record.alias_key, record.alias_text),
    )
    logger.info(
        "Loaded %d curated vocab alias records (len >= %d)",
        len(ordered_records),
        min_alias_len,
    )
    return ordered_records


def build_vocab_term_aliases_table(
    *,
    dry_run: bool = False,
    tsv_path: Path | str | None = None,
) -> dict[str, object]:
    """Refresh the Postgres-backed runtime vocab alias catalog from the TSV source."""
    t_start = time.monotonic()
    records = load_vocab_alias_records(tsv_path)
    distinct_terms = len({record.term_id for record in records})

    if dry_run:
        return {
            "dry_run": True,
            "total_aliases": len(records),
            "distinct_terms": distinct_terms,
            "elapsed_seconds": round(time.monotonic() - t_start, 1),
        }

    source_path = str(Path(tsv_path) if tsv_path is not None else settings.vocab_aliases_path)
    with db.connect() as conn:
        with conn.cursor() as cur:
            logger.info("Refreshing solemd.vocab_term_aliases from %s ...", source_path)
            cur.execute(_TRUNCATE_VOCAB_TERM_ALIASES_SQL)
            with cur.copy(_COPY_VOCAB_TERM_ALIASES_SQL) as copy:
                for record in records:
                    copy.write_row(
                        (
                            record.term_id,
                            record.alias_text,
                            record.alias_key,
                            record.alias_type,
                            record.quality_score,
                            record.is_preferred,
                            record.umls_cui,
                        )
                    )
            cur.execute(_COUNT_VOCAB_TERM_ALIASES_SQL)
            total_aliases = int(cur.fetchone()["cnt"])

        conn.commit()
        log_etl_run(
            conn,
            operation="build_vocab_term_aliases",
            source=source_path,
            rows_processed=len(records),
            rows_loaded=total_aliases,
            status="completed",
            metadata={
                "distinct_terms": distinct_terms,
                "min_alias_len": _MIN_ALIAS_LEN,
            },
        )

    elapsed = time.monotonic() - t_start
    logger.info(
        "Vocab alias refresh complete: %d aliases across %d terms in %.1fs",
        total_aliases,
        distinct_terms,
        elapsed,
    )
    return {
        "inserted": len(records),
        "total_aliases": total_aliases,
        "distinct_terms": distinct_terms,
        "elapsed_seconds": round(elapsed, 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Refresh solemd.vocab_term_aliases from data/vocab_aliases.tsv",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report counts only")
    parser.add_argument(
        "--tsv-path",
        default=None,
        help="Optional TSV override (defaults to settings.vocab_aliases_path)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )
    build_vocab_term_aliases_table(
        dry_run=args.dry_run,
        tsv_path=args.tsv_path,
    )


if __name__ == "__main__":
    main()
