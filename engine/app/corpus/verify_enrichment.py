"""Verify release-scoped enrichment outputs and normalized table health."""

from __future__ import annotations

import argparse
import json
import logging

from app import db

logger = logging.getLogger(__name__)


def collect_enrichment_report(release_id: str) -> dict:
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                count(*) AS stamped,
                count(*) FILTER (WHERE s2_embedding_release_id = %s) AS embedding_release_stamped,
                count(*) FILTER (WHERE text_availability IS NOT NULL) AS text_availability_populated,
                count(*) FILTER (WHERE embedding IS NOT NULL) AS embeddings_populated,
                count(*) FILTER (WHERE tldr IS NOT NULL) AS tldrs_populated,
                count(*) FILTER (WHERE abstract IS NOT NULL) AS abstracts_populated
            FROM solemd.papers
            WHERE s2_full_release_id = %s
            """,
            (release_id, release_id),
        )
        papers = cur.fetchone()

        cur.execute(
            """
            SELECT
                text_availability,
                count(*) AS papers,
                count(*) FILTER (WHERE abstract IS NOT NULL) AS abstracts,
                count(*) FILTER (WHERE embedding IS NOT NULL) AS embeddings
            FROM solemd.papers
            WHERE s2_full_release_id = %s
            GROUP BY text_availability
            ORDER BY papers DESC
            """,
            (release_id,),
        )
        text_breakdown = list(cur.fetchall())

        cur.execute(
            """
            SELECT count(*) AS n
            FROM solemd.publication_venues
            WHERE last_seen_release_id = %s
            """,
            (release_id,),
        )
        venues = cur.fetchone()["n"]

        cur.execute(
            """
            SELECT count(*) AS n
            FROM solemd.authors
            WHERE last_seen_release_id = %s
            """,
            (release_id,),
        )
        authors = cur.fetchone()["n"]

        cur.execute(
            """
            SELECT count(*) AS n
            FROM solemd.paper_authors
            WHERE source_release_id = %s
            """,
            (release_id,),
        )
        paper_authors = cur.fetchone()["n"]

        cur.execute(
            """
            SELECT count(*) AS n
            FROM solemd.author_affiliations
            WHERE source_release_id = %s
            """,
            (release_id,),
        )
        affiliation_rows = cur.fetchone()["n"]

        cur.execute(
            """
            SELECT count(*) AS n
            FROM solemd.paper_assets
            WHERE asset_kind = 'open_access_pdf'
              AND source_release_id = %s
            """,
            (release_id,),
        )
        oa_assets = cur.fetchone()["n"]

        cur.execute(
            """
            SELECT count(*) AS n
            FROM solemd.paper_assets
            WHERE asset_kind = 'open_access_pdf'
              AND source_release_id = %s
              AND COALESCE(remote_url, '') = ''
            """,
            (release_id,),
        )
        oa_empty_urls = cur.fetchone()["n"]

    return {
        "release_id": release_id,
        "papers": papers,
        "text_availability_breakdown": text_breakdown,
        "publication_venues": venues,
        "authors": authors,
        "paper_authors": paper_authors,
        "author_affiliations": affiliation_rows,
        "open_access_pdf_assets": oa_assets,
        "open_access_pdf_assets_empty_url": oa_empty_urls,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify release-scoped S2 enrichment outputs")
    parser.add_argument("--release-id", required=True, help="Release id to audit")
    parser.add_argument("--json", action="store_true", help="Emit JSON only")
    args = parser.parse_args()

    report = collect_enrichment_report(args.release_id)
    if args.json:
        print(json.dumps(report, indent=2))
        return

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
    logger.info("Enrichment report for %s", args.release_id)
    logger.info(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
