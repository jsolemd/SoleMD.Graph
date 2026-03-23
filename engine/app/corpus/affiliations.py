"""Normalize author affiliations via OpenAlex DOI hints and canonical ROR geo."""

from __future__ import annotations

import argparse
import logging
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import httpx
import psycopg

from app import db
from app.corpus._etl import log_etl_run
from app.corpus.openalex import OpenAlexAuthorship, OpenAlexClient
from app.corpus.ror import RORClient, RORMatch

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class AffiliationEnrichResult:
    """Summary of a single paper's affiliation normalization."""

    corpus_id: int
    total_authors: int
    openalex_matched: int
    ror_matched: int
    already_geocoded: int
    inserted_rows: int
    updated_rows: int
    errors: list[str]


def _normalize_affiliation_query(value: str) -> str:
    return " ".join(value.strip().split()).lower()


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _has_coordinates(row: dict[str, Any]) -> bool:
    return row.get("latitude") is not None and row.get("longitude") is not None


def _match_has_coordinates(match: RORMatch | None) -> bool:
    return bool(match and match.latitude is not None and match.longitude is not None)


def _build_affiliation_query(
    author: dict[str, Any],
    *,
    preferred_institution: str | None = None,
) -> str | None:
    raw_affiliations = author.get("raw_affiliations") or []
    raw_affiliation = max(raw_affiliations, key=len, default=None)
    parts = [
        _clean_text(preferred_institution),
        _clean_text(author.get("institution")),
        _clean_text(author.get("department")),
        _clean_text(author.get("city")),
        _clean_text(author.get("country")),
    ]

    seen: set[str] = set()
    ordered_parts: list[str] = []
    for part in parts:
        if not part:
            continue
        lowered = part.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        ordered_parts.append(part)

    structured = ", ".join(ordered_parts)
    if raw_affiliation and raw_affiliation.count(",") >= structured.count(","):
        return raw_affiliation
    return structured or raw_affiliation


def _load_candidate_papers(
    conn: psycopg.Connection,
    *,
    release_id: str,
    limit: int = 0,
) -> list[dict[str, Any]]:
    limit_sql = "LIMIT %s" if limit else ""
    params: list[Any] = [release_id]
    if limit:
        params.append(limit)

    query = f"""
        SELECT DISTINCT p.corpus_id, c.doi
        FROM solemd.papers p
        JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
        JOIN solemd.paper_authors pa ON pa.corpus_id = p.corpus_id
        LEFT JOIN solemd.author_affiliations aa ON aa.corpus_id = pa.corpus_id
                                          AND aa.author_position = pa.author_position
        WHERE p.s2_full_release_id = %s
          AND (
            aa.corpus_id IS NULL
            OR aa.latitude IS NULL
            OR aa.longitude IS NULL
          )
        ORDER BY p.corpus_id
        {limit_sql}
    """

    with conn.cursor() as cur:
        cur.execute(query, params)
        return list(cur.fetchall())


def _load_paper_author_state(conn: psycopg.Connection, corpus_id: int) -> dict[int, dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                pa.author_position,
                pa.name,
                pa.affiliations,
                aa.affiliation_index,
                aa.raw_affiliation,
                aa.institution,
                aa.department,
                aa.city,
                aa.region,
                aa.country,
                aa.country_code,
                aa.latitude,
                aa.longitude,
                aa.ror_id
            FROM solemd.paper_authors pa
            LEFT JOIN solemd.author_affiliations aa
              ON aa.corpus_id = pa.corpus_id
             AND aa.author_position = pa.author_position
            WHERE pa.corpus_id = %s
            ORDER BY pa.author_position, aa.affiliation_index
            """,
            (corpus_id,),
        )
        rows = cur.fetchall()

    authors: dict[int, dict[str, Any]] = {}
    for row in rows:
        position = int(row["author_position"])
        author = authors.setdefault(
            position,
            {
                "author_position": position,
                "name": row["name"],
                "raw_affiliations": list(row.get("affiliations") or []),
                "rows": [],
                "institution": None,
                "department": None,
                "city": None,
                "country": None,
            },
        )
        if row.get("affiliation_index") is not None:
            author["rows"].append(dict(row))
            author["institution"] = author["institution"] or row.get("institution")
            author["department"] = author["department"] or row.get("department")
            author["city"] = author["city"] or row.get("city")
            author["country"] = author["country"] or row.get("country")
    return authors


def _fetch_openalex_authorships(
    client: OpenAlexClient,
    http_client: httpx.Client,
    doi: str | None,
) -> dict[int, OpenAlexAuthorship]:
    if not doi:
        return {}
    authorships = client.fetch_work_authorships(http_client, doi)
    return {index + 1: authorship for index, authorship in enumerate(authorships)}


def _upsert_affiliation_row(
    conn: psycopg.Connection,
    *,
    corpus_id: int,
    author_position: int,
    affiliation_index: int,
    raw_affiliation: str,
    match: RORMatch,
    source: str,
    source_release_id: str,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO solemd.author_affiliations (
                corpus_id,
                author_position,
                affiliation_index,
                raw_affiliation,
                institution,
                city,
                region,
                country,
                country_code,
                latitude,
                longitude,
                ror_id,
                source,
                source_release_id,
                updated_at
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now()
            )
            ON CONFLICT (corpus_id, author_position, affiliation_index) DO UPDATE SET
                raw_affiliation = COALESCE(EXCLUDED.raw_affiliation, solemd.author_affiliations.raw_affiliation),
                institution = COALESCE(EXCLUDED.institution, solemd.author_affiliations.institution),
                city = COALESCE(EXCLUDED.city, solemd.author_affiliations.city),
                region = COALESCE(EXCLUDED.region, solemd.author_affiliations.region),
                country = COALESCE(EXCLUDED.country, solemd.author_affiliations.country),
                country_code = COALESCE(EXCLUDED.country_code, solemd.author_affiliations.country_code),
                latitude = COALESCE(EXCLUDED.latitude, solemd.author_affiliations.latitude),
                longitude = COALESCE(EXCLUDED.longitude, solemd.author_affiliations.longitude),
                ror_id = COALESCE(EXCLUDED.ror_id, solemd.author_affiliations.ror_id),
                source = EXCLUDED.source,
                source_release_id = EXCLUDED.source_release_id,
                updated_at = now()
            """,
            (
                corpus_id,
                author_position,
                affiliation_index,
                raw_affiliation,
                match.name,
                match.city,
                match.region,
                match.country_name,
                match.country_code,
                match.latitude,
                match.longitude,
                match.ror_id,
                source,
                source_release_id or None,
            ),
        )


def enrich_paper_affiliations(
    conn: psycopg.Connection,
    *,
    corpus_id: int,
    doi: str | None,
    openalex_client: OpenAlexClient,
    ror_client: RORClient,
    http_client: httpx.Client,
    release_id: str,
    institution_geo_cache: dict[str, RORMatch | None] | None = None,
    affiliation_match_cache: dict[str, RORMatch | None] | None = None,
) -> AffiliationEnrichResult:
    errors: list[str] = []
    geo_cache = institution_geo_cache if institution_geo_cache is not None else {}
    fuzzy_cache = affiliation_match_cache if affiliation_match_cache is not None else {}
    authors = _load_paper_author_state(conn, corpus_id)
    if not authors:
        return AffiliationEnrichResult(corpus_id, 0, 0, 0, 0, 0, 0, errors)

    openalex_by_position = _fetch_openalex_authorships(openalex_client, http_client, doi)
    openalex_matched = 0
    ror_matched = 0
    already_geocoded = 0
    inserted_rows = 0
    updated_rows = 0

    for position, author in authors.items():
        rows = author["rows"]
        if any(_has_coordinates(row) for row in rows):
            already_geocoded += 1
            continue

        openalex_match = openalex_by_position.get(position)
        if openalex_match and openalex_match.institution_ror:
            try:
                geo_match = geo_cache.get(openalex_match.institution_ror)
                if geo_match is None:
                    geo_match = ror_client.get_organization(http_client, openalex_match.institution_ror)
                    geo_cache[openalex_match.institution_ror] = geo_match
                if _match_has_coordinates(geo_match):
                    target_index = int(rows[0]["affiliation_index"]) if rows else 1
                    raw_affiliation = (
                        rows[0].get("raw_affiliation")
                        if rows
                        else openalex_match.institution_display_name or geo_match.name
                    )
                    _upsert_affiliation_row(
                        conn,
                        corpus_id=corpus_id,
                        author_position=position,
                        affiliation_index=target_index,
                        raw_affiliation=raw_affiliation,
                        match=geo_match,
                        source="openalex",
                        source_release_id=release_id,
                    )
                    openalex_matched += 1
                    if rows:
                        updated_rows += 1
                    else:
                        inserted_rows += 1
                    continue
            except httpx.HTTPError as exc:  # pragma: no cover - defensive logging
                errors.append(f"OpenAlex/ROR HTTP error for corpus_id={corpus_id} pos={position}: {exc}")
            except Exception as exc:  # pragma: no cover - unexpected failures
                logger.error(
                    "Unexpected error in OpenAlex/ROR lookup for corpus_id=%s pos=%s: %s",
                    corpus_id, position, exc, exc_info=True,
                )
                errors.append(f"OpenAlex/ROR unexpected error for corpus_id={corpus_id} pos={position}: {exc}")

        if not rows:
            continue

        preferred_institution = (
            openalex_match.institution_display_name
            if openalex_match and openalex_match.institution_display_name
            else None
        )
        query = _build_affiliation_query(author, preferred_institution=preferred_institution)
        if not query:
            continue

        cache_key = _normalize_affiliation_query(query)
        match = fuzzy_cache.get(cache_key)
        if match is None:
            try:
                match = ror_client.match_affiliation(http_client, query)
                fuzzy_cache[cache_key] = match
            except httpx.HTTPError as exc:  # pragma: no cover - defensive logging
                errors.append(f"ROR HTTP error for corpus_id={corpus_id} pos={position}: {exc}")
                continue
            except Exception as exc:  # pragma: no cover - unexpected failures
                logger.error(
                    "Unexpected error in ROR match for corpus_id=%s pos=%s: %s",
                    corpus_id, position, exc, exc_info=True,
                )
                errors.append(f"ROR unexpected error for corpus_id={corpus_id} pos={position}: {exc}")
                continue

        if not _match_has_coordinates(match):
            continue

        target_index = int(rows[0]["affiliation_index"])
        _upsert_affiliation_row(
            conn,
            corpus_id=corpus_id,
            author_position=position,
            affiliation_index=target_index,
            raw_affiliation=rows[0].get("raw_affiliation") or query,
            match=match,
            source="ror",
            source_release_id=release_id,
        )
        ror_matched += 1
        updated_rows += 1

    return AffiliationEnrichResult(
        corpus_id=corpus_id,
        total_authors=len(authors),
        openalex_matched=openalex_matched,
        ror_matched=ror_matched,
        already_geocoded=already_geocoded,
        inserted_rows=inserted_rows,
        updated_rows=updated_rows,
        errors=errors,
    )


def run_affiliation_enrich(
    *,
    release_id: str,
    limit: int = 0,
    dry_run: bool = False,
) -> dict[str, Any]:
    if not release_id:
        raise ValueError("release_id is required for affiliation enrichment")

    with db.connect() as conn:
        papers = _load_candidate_papers(conn, release_id=release_id, limit=limit)

    logger.info("%d papers need affiliation normalization for release %s", len(papers), release_id)
    if dry_run:
        return {"total": len(papers), "dry_run": True, "release_id": release_id}

    total_authors = 0
    openalex_matched = 0
    ror_matched = 0
    already_geocoded = 0
    inserted_rows = 0
    updated_rows = 0
    paper_errors = 0
    error_messages: list[str] = []
    geo_cache: dict[str, RORMatch | None] = {}
    fuzzy_cache: dict[str, RORMatch | None] = {}

    openalex_client = OpenAlexClient()
    ror_client = RORClient()

    with httpx.Client(timeout=httpx.Timeout(30.0, connect=10.0)) as http_client, db.connect() as conn:
        for paper in papers:
            result = enrich_paper_affiliations(
                conn,
                corpus_id=int(paper["corpus_id"]),
                doi=paper.get("doi"),
                openalex_client=openalex_client,
                ror_client=ror_client,
                http_client=http_client,
                release_id=release_id,
                institution_geo_cache=geo_cache,
                affiliation_match_cache=fuzzy_cache,
            )
            total_authors += result.total_authors
            openalex_matched += result.openalex_matched
            ror_matched += result.ror_matched
            already_geocoded += result.already_geocoded
            inserted_rows += result.inserted_rows
            updated_rows += result.updated_rows
            if result.errors:
                paper_errors += 1
                error_messages.extend(result.errors[:3])
        conn.commit()

    stats = {
        "release_id": release_id,
        "papers_considered": len(papers),
        "total_authors": total_authors,
        "openalex_matched": openalex_matched,
        "ror_matched": ror_matched,
        "already_geocoded": already_geocoded,
        "inserted_rows": inserted_rows,
        "updated_rows": updated_rows,
        "paper_errors": paper_errors,
        "sample_errors": error_messages[:10],
    }

    with db.connect() as conn:
        log_etl_run(
            conn,
            operation="enrich_author_affiliations",
            source="OpenAlex + ROR",
            rows_processed=len(papers),
            rows_loaded=inserted_rows + updated_rows,
            status="completed",
            metadata=stats,
        )

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize author affiliations via OpenAlex and ROR")
    parser.add_argument("--release-id", required=True, help="S2 full metadata release cohort to target")
    parser.add_argument("--limit", type=int, default=0, help="Max papers to process (0=unlimited)")
    parser.add_argument("--dry-run", action="store_true", help="Count only")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
    stats = run_affiliation_enrich(release_id=args.release_id, limit=args.limit, dry_run=args.dry_run)
    logger.info("Affiliation enrichment stats: %s", stats)


if __name__ == "__main__":
    main()
