"""NLM-classified journal list for domain corpus filtering.

Uses the National Library of Medicine's Broad Subject Term classifications
to identify journals in Psychiatry, Neurology, Behavioral Sciences,
Substance-Related Disorders, and Psychology. This is an authoritative,
librarian-curated classification — no heuristic pattern matching.

Source: NLM Catalog via E-utilities (esearch + efetch on nlmcatalog DB).
Full journal records saved to: data/nlm_neuro_psych_journals.json
Filtered to English-language journals only (661 total, 120 non-English excluded).

The pipeline is designed to start small and expand:
  Phase A (current): NLM journal classification → ~2.2M papers
  Phase B (future):  solemd.vocab term matching in general journals (JAMA, etc.)
  Phase C (future):  Citation neighbors (1st-order expansion)
"""

import json
import re
import unicodedata
from functools import lru_cache

from app.config import settings


def _clean_venue(name: str) -> str:
    """Normalize a journal/venue name for matching.

    Lowercases, strips accents, removes leading "the", trailing dots,
    subtitles after ":", and parenthetical notes. Used on both NLM titles
    and S2 venue values.
    """
    s = (
        unicodedata.normalize("NFKD", name)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
        .strip()
        .rstrip(".")
    )
    s = re.sub(r"^the\s+", "", s)
    s = re.sub(r"\s*[:]\s+.*$", "", s)
    s = re.sub(r"\s*\(.*?\)\s*$", "", s)
    return s.strip()


@lru_cache(maxsize=1)
def load_nlm_venues() -> set[str]:
    """Load the NLM journal set as cleaned venue lookup keys.

    Returns a set of normalized journal names (both full titles and
    MEDLINE abbreviations). A paper's venue matches if its cleaned
    name is in this set.
    """
    with open(settings.nlm_journals_path) as f:
        journals = json.load(f)

    names: set[str] = set()
    for j in journals:
        for name in [j.get("title"), j.get("medline_abbr")]:
            if name:
                c = _clean_venue(name)
                if len(c) > 2:  # skip very short abbreviations
                    names.add(c)
    return names


def is_domain_venue(venue: str) -> bool:
    """Check if an S2 venue name matches the NLM journal list."""
    return _clean_venue(venue) in load_nlm_venues()


_VALID_TABLE_NAME = re.compile(r"^[a-z_][a-z0-9_]*$")


def register_duckdb_helpers(con, table_name: str = "nlm_venues") -> None:
    """Register the clean_venue macro and NLM lookup table in a DuckDB connection.

    Sets up everything needed for venue-based filtering in DuckDB:
    1. clean_venue() SQL macro — mirrors _clean_venue() logic in pure SQL
    2. nlm_venues temp table — 1,237 cleaned journal names for JOIN

    Usage in filter.py:
        register_duckdb_helpers(con)
        con.execute('''
            SELECT p.* FROM read_json(...) p
            JOIN nlm_venues v ON clean_venue(p.venue) = v.name
            WHERE json_extract_string(p.externalids, '$.PubMed') IS NOT NULL
        ''')

    Raises:
        ValueError: If table_name contains invalid characters.
    """
    if not _VALID_TABLE_NAME.match(table_name):
        raise ValueError(
            f"Invalid table_name '{table_name}': must match [a-z_][a-z0-9_]*"
        )

    # SQL macro equivalent of _clean_venue()
    con.execute(r"""
        CREATE OR REPLACE MACRO clean_venue(v) AS
            trim(regexp_replace(
                regexp_replace(
                    regexp_replace(
                        regexp_replace(
                            lower(strip_accents(trim(v))),
                            '\.$', ''
                        ),
                        '^\s*the\s+', ''
                    ),
                    '\s*:\s+.*$', ''
                ),
                '\s*\(.*?\)\s*$', ''
            ))
    """)

    # Lookup table of NLM journal names
    venues = load_nlm_venues()
    con.execute(f"CREATE OR REPLACE TEMPORARY TABLE {table_name} (name VARCHAR)")
    con.executemany(
        f"INSERT INTO {table_name} VALUES (?)",
        [(v,) for v in venues],
    )
