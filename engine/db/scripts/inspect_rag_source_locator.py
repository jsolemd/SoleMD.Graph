"""Inspect release-sidecar source locator coverage for targeted RAG refreshes."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add engine/ to path so app imports work when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.config import settings
from app.rag.orchestrator import _load_corpus_ids_file, _unique_ints
from app.rag.parse_contract import ParseSourceSystem
from app.rag.source_locator import SidecarRagSourceLocatorRepository, locator_sidecar_path


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect S2/BioC sidecar locator coverage for explicit corpus ids."
    )
    parser.add_argument("--corpus-id", dest="corpus_ids", action="append", type=int, default=None)
    parser.add_argument("--corpus-ids-file", dest="corpus_ids_file", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    corpus_ids = _unique_ints(
        (args.corpus_ids or [])
        + (_load_corpus_ids_file(args.corpus_ids_file) if args.corpus_ids_file else [])
    )
    if not corpus_ids:
        raise SystemExit("at least one --corpus-id or --corpus-ids-file is required")

    repository = SidecarRagSourceLocatorRepository()
    s2_lookup = repository.fetch_entries(
        corpus_ids=corpus_ids,
        source_system=ParseSourceSystem.S2ORC_V2,
        source_revision=settings.s2_release_id,
    )
    bioc_lookup = repository.fetch_entries(
        corpus_ids=corpus_ids,
        source_system=ParseSourceSystem.BIOCXML,
        source_revision=settings.pubtator_release_id,
    )

    payload = {
        "requested_corpus_ids": corpus_ids,
        "s2": {
            "locator_path": str(
                locator_sidecar_path(
                    source_system=ParseSourceSystem.S2ORC_V2,
                    source_revision=settings.s2_release_id,
                )
            ),
            "covered_corpus_ids": s2_lookup.covered_corpus_ids,
            "missing_corpus_ids": s2_lookup.missing_corpus_ids(corpus_ids),
            "entries": [entry.model_dump(mode="python") for entry in s2_lookup.entries],
        },
        "bioc": {
            "locator_path": str(
                locator_sidecar_path(
                    source_system=ParseSourceSystem.BIOCXML,
                    source_revision=settings.pubtator_release_id,
                )
            ),
            "covered_corpus_ids": bioc_lookup.covered_corpus_ids,
            "missing_corpus_ids": bioc_lookup.missing_corpus_ids(corpus_ids),
            "entries": [entry.model_dump(mode="python") for entry in bioc_lookup.entries],
        },
    }
    print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
