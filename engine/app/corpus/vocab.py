"""Vocabulary alias loading and PubTator3 streaming match.

Loads curated vocab aliases from the shared TSV export and
streams the PubTator3 entity dump to find PMIDs whose entities mention
any domain-relevant term. This produces the "vocab signal" used by
filter.py alongside the venue signal.

Usage:
    cd /workspaces/SoleMD.Graph/engine
    uv run python -m app.corpus.vocab           # build vocab_pmids set + report
    uv run python -m app.corpus.vocab --quick   # first 1M lines only
"""

from __future__ import annotations

import csv
import gzip
import logging
import time
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

# PubTator3 entity types relevant for domain matching.
# Species/Variant/CellLine are too noisy for corpus inclusion.
_MATCH_TYPES = frozenset({"Disease", "Chemical", "Gene"})

# Minimum alias length — short aliases like "AD", "5HT", "MAO" produce
# excessive false positives against general biomedical text. Set to 4
# (>= 4) to include GABA, PTSD, ADHD, APOE, MAOI, SNRI, fMRI, MMSE, etc.
# PubTator3's NER + entity type filter (Disease/Chemical/Gene) already
# gates noise from common English words at this length.
_MIN_ALIAS_LEN = 4


def load_vocab_aliases(tsv_path: Path | str | None = None) -> set[str]:
    """Load curated aliases from vocab_aliases.tsv as a lowercased set.

    Filters to aliases with length >= _MIN_ALIAS_LEN to avoid short-form
    ambiguity (e.g., "AD" matching Alzheimer's Disease but also
    "advertisement" mentions in general text).

    Returns:
        Set of ~28K lowercased alias strings.
    """
    if tsv_path is None:
        tsv_path = settings.vocab_aliases_path
    tsv_path = Path(tsv_path)

    aliases: set[str] = set()
    with open(tsv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            alias = row["alias"].strip().lower()
            if len(alias) >= _MIN_ALIAS_LEN:
                aliases.add(alias)

    logger.info("Loaded %d vocab aliases (filtered len >= %d)", len(aliases), _MIN_ALIAS_LEN)
    return aliases


def stream_pubtator_matches(
    pubtator_path: Path | str | None = None,
    aliases: set[str] | None = None,
    *,
    max_lines: int = 0,
) -> set[int]:
    """Stream PubTator3 entity dump and return PMIDs with domain mentions.

    Scans bioconcepts2pubtator3.gz line by line. For Disease, Chemical,
    and Gene entities, checks if any mention text (lowercased) appears
    in the alias set. Returns the set of matched PMIDs.

    Format: PMID<TAB>Type<TAB>ConceptID<TAB>Mentions<TAB>Resource
    Mentions are pipe-delimited (e.g., "dopamine|DA|3,4-dihydroxyphenethylamine").

    Args:
        pubtator_path: Path to bioconcepts2pubtator3.gz.
        aliases: Pre-loaded alias set (calls load_vocab_aliases if None).
        max_lines: Stop after N lines (0 = unlimited). For testing.

    Returns:
        Set of integer PMIDs (~18M expected for full run, ~150 MB in memory).
    """
    if pubtator_path is None:
        pubtator_path = settings.pubtator_entities_path
    pubtator_path = Path(pubtator_path)

    if aliases is None:
        aliases = load_vocab_aliases()

    matched_pmids: set[int] = set()
    lines_read = 0
    matches = 0
    errors = 0
    t0 = time.monotonic()

    logger.info("Streaming PubTator3 entities from %s ...", pubtator_path.name)

    with gzip.open(pubtator_path, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            lines_read += 1

            if max_lines and lines_read > max_lines:
                break

            if lines_read % 10_000_000 == 0:
                elapsed = time.monotonic() - t0
                rate = lines_read / elapsed if elapsed > 0 else 0
                logger.info(
                    "  %dM lines | %d matched PMIDs | %.0f lines/sec",
                    lines_read // 1_000_000,
                    len(matched_pmids),
                    rate,
                )

            # Tab-delimited: PMID \t Type \t ConceptID \t Mentions \t Resource
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 4:
                errors += 1
                continue

            entity_type = parts[1]

            # Only match Disease, Chemical, Gene — these carry domain signal.
            if entity_type not in _MATCH_TYPES:
                continue

            mentions = parts[3]

            # Check each mention (pipe-separated) against alias set.
            # One match per line is sufficient — break early.
            for mention in mentions.split("|"):
                mention_lower = mention.strip().lower()
                if mention_lower in aliases:
                    try:
                        matched_pmids.add(int(parts[0]))
                        matches += 1
                    except ValueError:
                        errors += 1
                    break

    elapsed = time.monotonic() - t0
    logger.info(
        "PubTator3 scan complete: %d lines, %d matches, %d unique PMIDs, %d errors, %.1fs",
        lines_read,
        matches,
        len(matched_pmids),
        errors,
        elapsed,
    )
    return matched_pmids


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Build vocab PMID set from PubTator3")
    parser.add_argument("--quick", action="store_true", help="First 1M lines only")
    args = parser.parse_args()

    alias_set = load_vocab_aliases()
    print(f"Loaded {len(alias_set):,} aliases")
    print(f"Sample: {sorted(list(alias_set))[:10]}")

    pmids = stream_pubtator_matches(aliases=alias_set, max_lines=1_000_000 if args.quick else 0)
    print(f"\nMatched {len(pmids):,} unique PMIDs")
