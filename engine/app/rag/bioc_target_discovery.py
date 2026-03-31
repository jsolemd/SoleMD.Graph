"""Discover bounded BioC archive targets for live warehouse expansion."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Protocol

from pydantic import Field

from app import db
from app.config import settings
from app.rag.bioc_archive_scan import iter_bioc_archive_document_ids
from app.rag.corpus_resolution import PostgresBioCCorpusResolver
from app.rag.orchestrator_units import RagRefreshSourceKind
from app.rag.parse_contract import ParseContractModel
from app.rag.source_locator import RagSourceLocatorEntry


class RagBioCTargetCandidate(ParseContractModel):
    corpus_id: int
    document_id: str
    archive_name: str
    document_ordinal: int
    existing_document: bool = False
    existing_s2_source: bool = False
    existing_bioc_source: bool = False


class RagBioCTargetDiscoveryReport(ParseContractModel):
    archive_name: str
    limit: int | None = None
    max_documents: int | None = None
    scanned_documents: int = 0
    resolved_corpus_ids: list[int] = Field(default_factory=list)
    selected_corpus_ids: list[int] = Field(default_factory=list)
    candidates: list[RagBioCTargetCandidate] = Field(default_factory=list)


class WarehouseCoverageInspector(Protocol):
    def classify_corpus_ids(
        self,
        *,
        corpus_ids: list[int],
    ) -> tuple[set[int], set[int], set[int]]: ...


class PostgresWarehouseCoverageInspector:
    def __init__(self, connect=None):
        self._connect = connect or db.pooled

    def classify_corpus_ids(
        self,
        *,
        corpus_ids: list[int],
    ) -> tuple[set[int], set[int], set[int]]:
        normalized_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
        if not normalized_ids:
            return set(), set(), set()
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT corpus_id FROM solemd.paper_documents WHERE corpus_id = ANY(%s)",
                (normalized_ids,),
            )
            existing_documents = {int(row["corpus_id"]) for row in cur.fetchall()}
            cur.execute(
                """
                SELECT corpus_id
                FROM solemd.paper_document_sources
                WHERE corpus_id = ANY(%s)
                  AND source_system = 's2orc_v2'
                """,
                (normalized_ids,),
            )
            existing_s2 = {int(row["corpus_id"]) for row in cur.fetchall()}
            cur.execute(
                """
                SELECT corpus_id
                FROM solemd.paper_document_sources
                WHERE corpus_id = ANY(%s)
                  AND source_system = 'biocxml'
                """,
                (normalized_ids,),
            )
            existing_bioc = {int(row["corpus_id"]) for row in cur.fetchall()}
        return existing_documents, existing_s2, existing_bioc


def build_bioc_locator_entries(
    *,
    candidates: list[RagBioCTargetCandidate],
    source_revision: str | None = None,
) -> list[RagSourceLocatorEntry]:
    revision = source_revision or settings.pubtator_release_id
    return [
        RagSourceLocatorEntry(
            corpus_id=int(candidate.corpus_id),
            source_system="biocxml",
            source_revision=revision,
            source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
            unit_name=candidate.archive_name,
            unit_ordinal=int(candidate.document_ordinal),
            source_document_key=candidate.document_id,
        )
        for candidate in candidates
    ]


def discover_bioc_archive_targets(
    *,
    archive_name: str,
    limit: int | None = None,
    max_documents: int | None = None,
    skip_existing_documents: bool = True,
    skip_existing_bioc: bool = True,
    require_existing_documents: bool = False,
    require_existing_s2_source: bool = False,
    allowed_corpus_ids: list[int] | None = None,
    resolver: PostgresBioCCorpusResolver | None = None,
    coverage_inspector: WarehouseCoverageInspector | None = None,
) -> RagBioCTargetDiscoveryReport:
    archive_path = settings.pubtator_biocxml_dir_path / archive_name
    if not archive_path.exists():
        raise FileNotFoundError(f"BioC archive not found: {archive_path}")

    active_resolver = resolver or PostgresBioCCorpusResolver()
    active_coverage = coverage_inspector or PostgresWarehouseCoverageInspector()

    report = RagBioCTargetDiscoveryReport(
        archive_name=archive_name,
        limit=limit,
        max_documents=max_documents,
    )
    allowed_corpus_id_set = (
        {int(corpus_id) for corpus_id in allowed_corpus_ids}
        if allowed_corpus_ids
        else None
    )

    pending: list[tuple[str, int]] = []
    pending_metadata: dict[str, tuple[str, int]] = {}

    def flush_pending() -> bool:
        if not pending:
            return False
        document_ids = [document_id for document_id, _ in pending]
        resolved = active_resolver.resolve_document_ids(document_ids)
        resolved_ids = sorted({int(corpus_id) for corpus_id in resolved.values()})
        existing_documents, existing_s2, existing_bioc = active_coverage.classify_corpus_ids(
            corpus_ids=resolved_ids
        )
        resolved_snapshot = set(report.resolved_corpus_ids)
        resolved_snapshot.update(resolved_ids)
        report.resolved_corpus_ids = sorted(resolved_snapshot)
        for document_id, _ in pending:
            corpus_id = resolved.get(document_id)
            if corpus_id is None:
                continue
            archive_name_value, document_ordinal = pending_metadata[document_id]
            candidate = RagBioCTargetCandidate(
                corpus_id=int(corpus_id),
                document_id=document_id,
                archive_name=archive_name_value,
                document_ordinal=int(document_ordinal),
                existing_document=int(corpus_id) in existing_documents,
                existing_s2_source=int(corpus_id) in existing_s2,
                existing_bioc_source=int(corpus_id) in existing_bioc,
            )
            if allowed_corpus_id_set is not None and candidate.corpus_id not in allowed_corpus_id_set:
                continue
            if require_existing_documents and not candidate.existing_document:
                continue
            if require_existing_s2_source and not candidate.existing_s2_source:
                continue
            if skip_existing_documents and candidate.existing_document:
                continue
            if skip_existing_bioc and candidate.existing_bioc_source:
                continue
            if any(existing.corpus_id == candidate.corpus_id for existing in report.candidates):
                continue
            report.candidates.append(candidate)
            report.selected_corpus_ids = sorted({*report.selected_corpus_ids, candidate.corpus_id})
            if limit is not None and len(report.candidates) >= limit:
                return True
        pending.clear()
        pending_metadata.clear()
        return False

    for document_id, _member_name, document_ordinal in iter_bioc_archive_document_ids(archive_path):
        report.scanned_documents += 1
        if document_id:
            pending.append((document_id, document_ordinal))
            pending_metadata[document_id] = (archive_name, document_ordinal)
        if len(pending) >= 1000:
            if flush_pending():
                break
        if max_documents is not None and report.scanned_documents >= max_documents:
            break
    else:
        flush_pending()

    if pending and (limit is None or len(report.candidates) < limit):
        flush_pending()

    if limit is not None:
        report.candidates = report.candidates[:limit]
        report.selected_corpus_ids = sorted(candidate.corpus_id for candidate in report.candidates)

    return report


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Discover bounded BioC archive corpus-id targets for warehouse refresh."
    )
    parser.add_argument("--archive-name", required=True)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--max-documents", type=int, default=None)
    parser.add_argument("--include-existing-documents", action="store_true")
    parser.add_argument("--include-existing-bioc", action="store_true")
    parser.add_argument("--existing-documents-only", action="store_true")
    parser.add_argument("--existing-s2-only", action="store_true")
    parser.add_argument("--corpus-id", dest="corpus_ids", action="append", type=int, default=None)
    parser.add_argument("--corpus-ids-file", dest="corpus_ids_file", type=Path, default=None)
    parser.add_argument("--report-path", type=Path, default=None)
    parser.add_argument("--corpus-ids-path", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        report = discover_bioc_archive_targets(
            archive_name=args.archive_name,
            limit=args.limit,
            max_documents=args.max_documents,
            skip_existing_documents=not args.include_existing_documents,
            skip_existing_bioc=not args.include_existing_bioc,
            require_existing_documents=args.existing_documents_only,
            require_existing_s2_source=args.existing_s2_only,
            allowed_corpus_ids=[
                *([] if args.corpus_ids is None else [int(corpus_id) for corpus_id in args.corpus_ids]),
                *(
                    []
                    if args.corpus_ids_file is None
                    else [
                        int(line.strip())
                        for line in args.corpus_ids_file.read_text().splitlines()
                        if line.strip() and not line.strip().startswith("#")
                    ]
                ),
            ]
            or None,
        )
        if args.report_path is not None:
            args.report_path.parent.mkdir(parents=True, exist_ok=True)
            args.report_path.write_text(report.model_dump_json(indent=2))
        if args.corpus_ids_path is not None:
            args.corpus_ids_path.parent.mkdir(parents=True, exist_ok=True)
            args.corpus_ids_path.write_text(
                "".join(f"{corpus_id}\n" for corpus_id in report.selected_corpus_ids)
            )
        print(report.model_dump_json(indent=2))
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
