"""Populate the BioCXML archive manifest index (SQLite sidecar, no PostgreSQL).

Data flow context — three layers, each feeds the next:

  1. ARCHIVE MANIFEST (this script)
     SQLite sidecar: releases/<rev>/manifests/biocxml.archive_manifest.sqlite
     Maps document_id (PMID) → archive/member identity
     (archive_name, ordinal, member).
     Built by scanning tar archives. Zero PostgreSQL dependency.

  2. SOURCE LOCATOR (refresh_rag_source_locator.py)
     SQLite sidecar: releases/<rev>/manifests/biocxml.corpus_locator.sqlite
     Maps corpus_id → source location. Consumes the archive manifest to avoid
     re-scanning 190GB of tar archives. Requires PostgreSQL for corpus resolution.

  3. WAREHOUSE (refresh_rag_warehouse.py / backfill_bioc_overlays.py)
     PostgreSQL: solemd.paper_documents, paper_sections, paper_blocks, ...
     Fetches actual BioCXML documents using source locator positions and parses
     them into the warehouse schema.

This script handles layer 1 only. Run it once per PubTator release, then
source_locator_refresh and overlay backfill can use the manifest to bound work
to the correct archive and member family.

Usage:
    # Single archive:
    uv run python scripts/populate_bioc_archive_manifest.py \
        --archive-name BioCXML.3.tar.gz

    # All 10 archives sequentially:
    uv run python scripts/populate_bioc_archive_manifest.py --all-archives

    # Parallel across all archives (~7 min total):
    for i in $(seq 0 9); do
      uv run python scripts/populate_bioc_archive_manifest.py \
        --archive-name "BioCXML.${i}.tar.gz" &
    done
    wait
"""

from __future__ import annotations

import argparse
import time

from app.config import settings
from app.rag_ingest.bioc_archive_manifest import (
    RagBioCArchiveManifestEntry,
    SidecarBioCArchiveManifestRepository,
)
from app.rag_ingest.bioc_archive_scan import iter_bioc_archive_document_ids


def populate_archive_manifest(
    *,
    archive_name: str,
    batch_size: int = 5000,
    resume: bool = True,
    source_revision: str | None = None,
) -> dict[str, object]:
    """Populate manifest entries for a single BioCXML archive.

    Returns a plain dict report with scan/write counts.
    """
    resolved_revision = source_revision or settings.pubtator_release_id
    archive_path = settings.pubtator_biocxml_dir_path / archive_name
    if not archive_path.exists():
        raise FileNotFoundError(f"BioC archive not found: {archive_path}")

    manifest = SidecarBioCArchiveManifestRepository()

    existing_max = 0
    if resume:
        existing_max = manifest.max_document_ordinal(
            source_revision=resolved_revision,
            archive_name=archive_name,
        )
    start_document_ordinal = existing_max + 1 if existing_max > 0 else 1

    print(
        f"[{archive_name}] indexing per-document archive manifest"
        f" (existing_max_ordinal={existing_max},"
        f" start_document_ordinal={start_document_ordinal},"
        f" batch_size={batch_size})"
    )

    total_scanned = 0
    total_written = 0
    pending: list[RagBioCArchiveManifestEntry] = []
    batch_start = time.monotonic()

    for document_id, member_name, document_ordinal in iter_bioc_archive_document_ids(
        archive_path,
        start_document_ordinal=start_document_ordinal,
    ):
        total_scanned += 1
        pending.append(
            RagBioCArchiveManifestEntry(
                source_revision=resolved_revision,
                archive_name=archive_name,
                document_ordinal=document_ordinal,
                member_name=member_name,
                document_id=document_id,
            )
        )
        if len(pending) >= batch_size:
            total_written += manifest.upsert_entries(pending)
            elapsed = time.monotonic() - batch_start
            rate = batch_size / elapsed if elapsed > 0 else 0
            print(
                f"[{archive_name}] ordinal={document_ordinal}"
                f"  scanned={total_scanned}"
                f"  written={total_written}"
                f"  rate={rate:.0f}/s"
            )
            pending.clear()
            batch_start = time.monotonic()

    if pending:
        total_written += manifest.upsert_entries(pending)

    last_document_ordinal = existing_max + total_scanned
    print(
        f"[{archive_name}] done:"
        f" scanned={total_scanned}"
        f" written={total_written}"
        f" last_ordinal={last_document_ordinal}"
    )
    return {
        "archive_name": archive_name,
        "source_revision": resolved_revision,
        "start_document_ordinal": start_document_ordinal,
        "total_scanned": total_scanned,
        "total_written": total_written,
        "last_document_ordinal": last_document_ordinal,
    }


def populate_all_archives(
    *,
    batch_size: int = 5000,
    resume: bool = True,
    source_revision: str | None = None,
) -> list[dict[str, object]]:
    """Populate manifest entries for all BioCXML archives in the release directory."""
    archive_paths = sorted(
        settings.pubtator_biocxml_dir_path.glob("BioCXML.*.tar.gz")
    )
    if not archive_paths:
        print(f"No BioCXML archives found in {settings.pubtator_biocxml_dir_path}")
        return []

    print(f"Found {len(archive_paths)} archives")
    reports: list[dict[str, object]] = []
    for archive_path in archive_paths:
        report = populate_archive_manifest(
            archive_name=archive_path.name,
            batch_size=batch_size,
            resume=resume,
            source_revision=source_revision,
        )
        reports.append(report)
    return reports


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Populate BioCXML archive manifest index. "
            "Writes to SQLite sidecar at releases/<rev>/manifests/biocxml.archive_manifest.sqlite. "
            "No PostgreSQL connection required."
        ),
        epilog=(
            "After indexing, run source_locator_refresh to build the corpus_id→archive mapping, "
            "then backfill_bioc_overlays to ingest documents into the PostgreSQL warehouse."
        ),
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--archive-name",
        help="Single archive filename, e.g. BioCXML.3.tar.gz",
    )
    group.add_argument(
        "--all-archives",
        action="store_true",
        help="Process all BioCXML.*.tar.gz archives in release directory",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=5000,
        help="Entries per SQLite batch commit (default: 5000)",
    )
    parser.add_argument(
        "--no-resume",
        action="store_true",
        help="Start from ordinal 1 instead of resuming from max indexed ordinal",
    )
    parser.add_argument(
        "--source-revision",
        default=None,
        help="Override PUBTATOR_RELEASE_ID",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    resolved_revision = args.source_revision or settings.pubtator_release_id
    resume = not args.no_resume

    if args.all_archives:
        reports = populate_all_archives(
            batch_size=args.batch_size,
            resume=resume,
            source_revision=resolved_revision,
        )
        for report in reports:
            print(
                f"  {report['archive_name']}:"
                f" scanned={report['total_scanned']}"
                f" written={report['total_written']}"
            )
    else:
        populate_archive_manifest(
            archive_name=args.archive_name,
            batch_size=args.batch_size,
            resume=resume,
            source_revision=resolved_revision,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
