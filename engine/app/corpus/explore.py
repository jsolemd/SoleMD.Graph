"""Explore S2 papers dataset with DuckDB to understand domain coverage.

Answers key questions before defining the domain filter:
1. How many papers by field of study (Medicine, Biology, Psychology)?
2. How many have PMIDs (needed for PubTator3 cross-reference)?
3. What's the overlap between fields?
4. Year distribution for domain-relevant papers
5. Publication types and venue distribution

Usage:
    cd /workspaces/SoleMD.Graph/engine

    # Quick exploration (single shard, ~1-2 minutes)
    uv run python -m app.corpus.explore

    # Full exploration (all 60 shards — creates temp Parquet first)
    uv run python -m app.corpus.explore --full
"""

import argparse
import time

import duckdb

from app.config import settings
from app.corpus._etl import read_expr as _shared_read_expr

S2_DIR = settings.semantic_scholar_raw_papers_dir_path

# Only the columns we need for exploration — much faster than parsing every field
COLUMNS = {
    "corpusid": "BIGINT",
    "externalids": "JSON",
    "year": "INTEGER",
    "venue": "VARCHAR",
    "citationcount": "INTEGER",
    "isopenaccess": "BOOLEAN",
    "s2fieldsofstudy": "JSON",
    "publicationtypes": "VARCHAR[]",
}


def get_source(quick: bool) -> str:
    """Return a file glob for one shard (quick) or all shards (full)."""
    if quick:
        first = sorted(S2_DIR.glob("papers-*.jsonl.gz"))[0]
        return str(first)
    return str(S2_DIR / "papers-*.jsonl.gz")


def read_expr(source: str) -> str:
    """Build the DuckDB read_json expression for the S2 papers source."""
    return _shared_read_expr(source, COLUMNS)


def print_header(title: str) -> None:
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


def run_exploration(quick: bool = True) -> None:
    source = get_source(quick)
    mode = "QUICK (1 shard)" if quick else "FULL (60 shards)"
    src = read_expr(source)

    print(f"\n{'=' * 60}")
    print(f"  S2 Papers Exploration — {mode}")
    print(f"  Source: {source}")
    print(f"{'=' * 60}")

    con = duckdb.connect()
    try:
        con.execute("SET memory_limit = '8GB'")
        con.execute("SET threads TO 4")

        t_start = time.time()

        # ── Q1: Total papers + basic coverage ──────────────────────
        print_header("Q1: Total papers and basic coverage")
        t0 = time.time()

        row = con.execute(f"""
            SELECT
                COUNT(*)                                                       AS total,
                COUNT(*) FILTER (WHERE externalids->>'PubMed' IS NOT NULL)     AS has_pmid,
                COUNT(*) FILTER (WHERE year IS NOT NULL)                        AS has_year,
                COUNT(*) FILTER (WHERE s2fieldsofstudy IS NOT NULL
                                 AND json_array_length(s2fieldsofstudy) > 0)   AS has_fos,
                COUNT(*) FILTER (WHERE isopenaccess = true)                    AS open_access,
                MIN(year) FILTER (WHERE year > 1500)                           AS min_year,
                MAX(year)                                                      AS max_year
            FROM {src}
        """).fetchone()

        total = row[0]

        def pct(n: int) -> str:
            return f"{n / total * 100:.1f}%" if total else "N/A"

        print(f"  Total papers:        {total:>14,}")
        print(f"  With PMID:           {row[1]:>14,}  ({pct(row[1])})")
        print(f"  With year:           {row[2]:>14,}  ({pct(row[2])})")
        print(f"  With field-of-study: {row[3]:>14,}  ({pct(row[3])})")
        print(f"  Open access:         {row[4]:>14,}  ({pct(row[4])})")
        print(f"  Year range:          {row[5]} — {row[6]}")
        print(f"  ({time.time() - t0:.1f}s)")

        # ── Q2: Field-of-study distribution ────────────────────────
        print_header("Q2: Field-of-study distribution")
        t0 = time.time()

        # DuckDB: unnest JSON array of structs
        rows = con.execute(f"""
            WITH exploded AS (
                SELECT json_extract_string(fos, '$.category') AS category
                FROM {src} t,
                     LATERAL unnest(
                         CAST(t.s2fieldsofstudy AS JSON[])
                     ) AS s(fos)
                WHERE t.s2fieldsofstudy IS NOT NULL
            )
            SELECT category, COUNT(*) AS n
            FROM exploded
            GROUP BY category
            ORDER BY n DESC
        """).fetchall()

        print(f"  {'Category':<30} {'Papers':>12}  {'% total':>8}")
        print(f"  {'—' * 30} {'—' * 12}  {'—' * 8}")
        for r in rows:
            print(f"  {r[0]:<30} {r[1]:>12,}  {r[1] / total * 100:>7.1f}%")
        print(f"  ({time.time() - t0:.1f}s)")

        # ── Q3: Domain papers (Medicine | Biology | Psychology) ────
        print_header("Q3: Domain papers — Medicine | Biology | Psychology")
        t0 = time.time()

        row = con.execute(f"""
            WITH cats AS (
                SELECT
                    corpusid,
                    externalids->>'PubMed' AS pmid,
                    year,
                    list_distinct([
                        json_extract_string(fos, '$.category')
                        FOR fos IN CAST(COALESCE(s2fieldsofstudy, '[]'::JSON) AS JSON[])
                    ]) AS categories
                FROM {src}
            ),
            flagged AS (
                SELECT
                    *,
                    list_contains(categories, 'Medicine')   AS is_med,
                    list_contains(categories, 'Biology')    AS is_bio,
                    list_contains(categories, 'Psychology')  AS is_psy
                FROM cats
            )
            SELECT
                COUNT(*) FILTER (WHERE is_med OR is_bio OR is_psy)              AS domain_total,
                COUNT(*) FILTER (WHERE (is_med OR is_bio OR is_psy)
                                       AND pmid IS NOT NULL)                    AS domain_pmid,
                COUNT(*) FILTER (WHERE is_med)                                  AS medicine,
                COUNT(*) FILTER (WHERE is_bio)                                  AS biology,
                COUNT(*) FILTER (WHERE is_psy)                                  AS psychology,
                COUNT(*) FILTER (WHERE is_med AND is_bio)                       AS med_bio,
                COUNT(*) FILTER (WHERE is_med AND is_psy)                       AS med_psy,
                COUNT(*) FILTER (WHERE is_bio AND is_psy)                       AS bio_psy,
                COUNT(*) FILTER (WHERE is_med AND is_bio AND is_psy)            AS all_three,
                COUNT(*) FILTER (WHERE is_med AND pmid IS NOT NULL)             AS med_pmid,
                COUNT(*) FILTER (WHERE is_bio AND pmid IS NOT NULL)             AS bio_pmid,
                COUNT(*) FILTER (WHERE is_psy AND pmid IS NOT NULL)             AS psy_pmid
            FROM flagged
        """).fetchone()

        d = row[0]
        dp = row[1]
        print(f"  Domain total:          {d:>12,}  ({d / total * 100:.1f}% of all)")
        print(f"  Domain + PMID:         {dp:>12,}  ({dp / d * 100:.1f}% of domain)")
        print()
        print(f"  Medicine:              {row[2]:>12,}   (w/PMID: {row[9]:>10,})")
        print(f"  Biology:               {row[3]:>12,}   (w/PMID: {row[10]:>10,})")
        print(f"  Psychology:            {row[4]:>12,}   (w/PMID: {row[11]:>10,})")
        print()
        print(f"  Medicine ∩ Biology:    {row[5]:>12,}")
        print(f"  Medicine ∩ Psychology: {row[6]:>12,}")
        print(f"  Biology ∩ Psychology:  {row[7]:>12,}")
        print(f"  All three:             {row[8]:>12,}")
        print(f"  ({time.time() - t0:.1f}s)")

        # ── Q4: Year distribution (domain papers with PMIDs) ───────
        print_header("Q4: Year distribution — domain papers with PMIDs")
        t0 = time.time()

        rows = con.execute(f"""
            WITH cats AS (
                SELECT
                    year,
                    list_distinct([
                        json_extract_string(fos, '$.category')
                        FOR fos IN CAST(COALESCE(s2fieldsofstudy, '[]'::JSON) AS JSON[])
                    ]) AS categories
                FROM {src}
                WHERE externalids->>'PubMed' IS NOT NULL
                  AND year IS NOT NULL AND year >= 1950
            )
            SELECT
                (year / 10) * 10 AS decade,
                COUNT(*) AS n
            FROM cats
            WHERE list_contains(categories, 'Medicine')
               OR list_contains(categories, 'Biology')
               OR list_contains(categories, 'Psychology')
            GROUP BY decade
            ORDER BY decade
        """).fetchall()

        max_n = max(r[1] for r in rows) if rows else 1
        print(f"  {'Decade':<10} {'Papers':>12}  Distribution")
        print(f"  {'—' * 10} {'—' * 12}  {'—' * 36}")
        for r in rows:
            bar = "█" * int(r[1] / max_n * 36)
            print(f"  {r[0]}s     {r[1]:>12,}  {bar}")
        print(f"  ({time.time() - t0:.1f}s)")

        # ── Q5: Publication types (domain + PMID) ──────────────────
        print_header("Q5: Publication types — domain papers with PMIDs")
        t0 = time.time()

        rows = con.execute(f"""
            WITH cats AS (
                SELECT
                    publicationtypes,
                    list_distinct([
                        json_extract_string(fos, '$.category')
                        FOR fos IN CAST(COALESCE(s2fieldsofstudy, '[]'::JSON) AS JSON[])
                    ]) AS categories
                FROM {src}
                WHERE externalids->>'PubMed' IS NOT NULL
                  AND publicationtypes IS NOT NULL
            )
            SELECT pt, COUNT(*) AS n
            FROM cats, UNNEST(publicationtypes) AS t(pt)
            WHERE list_contains(categories, 'Medicine')
               OR list_contains(categories, 'Biology')
               OR list_contains(categories, 'Psychology')
            GROUP BY pt
            ORDER BY n DESC
        """).fetchall()

        print(f"  {'Type':<30} {'Papers':>12}")
        print(f"  {'—' * 30} {'—' * 12}")
        for r in rows:
            print(f"  {r[0]:<30} {r[1]:>12,}")
        print(f"  ({time.time() - t0:.1f}s)")

        # ── Q6: Top venues (domain + PMID) ─────────────────────────
        print_header("Q6: Top 25 venues — domain papers with PMIDs")
        t0 = time.time()

        rows = con.execute(f"""
            WITH cats AS (
                SELECT
                    venue,
                    list_distinct([
                        json_extract_string(fos, '$.category')
                        FOR fos IN CAST(COALESCE(s2fieldsofstudy, '[]'::JSON) AS JSON[])
                    ]) AS categories
                FROM {src}
                WHERE externalids->>'PubMed' IS NOT NULL
                  AND venue IS NOT NULL AND venue != ''
            )
            SELECT venue, COUNT(*) AS n
            FROM cats
            WHERE list_contains(categories, 'Medicine')
               OR list_contains(categories, 'Biology')
               OR list_contains(categories, 'Psychology')
            GROUP BY venue
            ORDER BY n DESC
            LIMIT 25
        """).fetchall()

        print(f"  {'Venue':<50} {'Papers':>10}")
        print(f"  {'—' * 50} {'—' * 10}")
        for r in rows:
            name = r[0][:50] if r[0] else "(empty)"
            print(f"  {name:<50} {r[1]:>10,}")
        print(f"  ({time.time() - t0:.1f}s)")

        # ── Summary ────────────────────────────────────────────────
        elapsed = time.time() - t_start
        print(f"\n{'=' * 60}")
        print(f"  Completed in {elapsed:.1f}s")
        if quick:
            print(f"\n  NOTE: These numbers are from 1 of 60 shards ({total:,} papers).")
            print("  Multiply by ~60 for estimated full-dataset totals.")
            print("  Run with --full for exact numbers (takes ~20-30 min).")
        print(f"{'=' * 60}\n")
    finally:
        con.close()


def main():
    parser = argparse.ArgumentParser(description="Explore S2 papers dataset with DuckDB")
    parser.add_argument(
        "--full", action="store_true", help="Analyze all 60 shards (slow, ~20-30 min)"
    )
    args = parser.parse_args()
    run_exploration(quick=not args.full)


if __name__ == "__main__":
    main()
