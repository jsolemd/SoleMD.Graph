"""PubTator3 API-driven BioCXML ingest into the RAG warehouse.

Resolves corpus_ids to PMIDs via ``solemd.corpus``, fetches BioCXML from the
PubTator3 REST API, parses through ``parse_biocxml_document()``, and writes
to the warehouse via the standard ``RagWarehouseWriter``.  Optionally runs
chunk backfill after warehouse write.

This is the targeted-ingest path for small paper sets (<1000).  For bulk
ingest (>1000), use the archive-based operators instead.
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Protocol

from langfuse import observe

logging.getLogger("langfuse").setLevel(logging.ERROR)

from pydantic import Field

from app import db
from app.config import settings
from app.rag.parse_contract import ParseContractModel
from app.rag.source_selection import parsed_source_has_warehouse_value
from app.rag_ingest.chunk_backfill_runtime import run_chunk_backfill
from app.rag_ingest.chunk_seed import RagChunkSeeder
from app.rag_ingest.corpus_ids import resolve_corpus_ids, unique_corpus_ids as _unique_ints
from app.rag_ingest.ingest_tracing import traced_parse_biocxml
from app.rag_ingest.pubtator_api import BioCXMLFetchResult, fetch_biocxml_documents
from app.rag_ingest.warehouse_writer import (
    RagWarehouseBulkIngestResult,
    RagWarehouseWriter,
)

_CORPUS_PMID_SQL = """
SELECT corpus_id, pmid
FROM solemd.corpus
WHERE corpus_id = ANY(%s)
  AND pmid IS NOT NULL
"""

_EXISTING_BIOCXML_SOURCE_SQL = """
SELECT DISTINCT corpus_id
FROM solemd.paper_document_sources
WHERE corpus_id = ANY(%s)
  AND source_system = 'biocxml'
"""


class CorpusPmidLoader(Protocol):
    def load_pmids(self, *, corpus_ids: list[int]) -> dict[int, int]:
        """Return mapping of corpus_id -> PMID for papers that have PMIDs."""
        ...


class ExistingSourceChecker(Protocol):
    def load_existing_biocxml(self, *, corpus_ids: list[int]) -> set[int]:
        """Return corpus_ids that already have BioCXML warehouse sources."""
        ...


class PostgresCorpusPmidLoader:
    def __init__(self, connect=None):
        self._connect = connect or db.pooled

    def load_pmids(self, *, corpus_ids: list[int]) -> dict[int, int]:
        if not corpus_ids:
            return {}
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(_CORPUS_PMID_SQL, (corpus_ids,))
                return {row["corpus_id"]: row["pmid"] for row in cur.fetchall()}


class PostgresExistingSourceChecker:
    def __init__(self, connect=None):
        self._connect = connect or db.pooled

    def load_existing_biocxml(self, *, corpus_ids: list[int]) -> set[int]:
        if not corpus_ids:
            return set()
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(_EXISTING_BIOCXML_SOURCE_SQL, (corpus_ids,))
                return {row["corpus_id"] for row in cur.fetchall()}


class BioCXMLApiFetcher(Protocol):
    def __call__(self, pmids: list[int], **kwargs) -> list[BioCXMLFetchResult]: ...


class BulkWarehouseWriter(Protocol):
    def ingest_source_groups(
        self,
        source_groups,
        *,
        source_citation_keys_by_corpus=None,
        chunk_version=None,
        replace_existing: bool = False,
    ) -> RagWarehouseBulkIngestResult: ...


class ChunkBackfillRunner(Protocol):
    def __call__(self, **kwargs) -> object: ...


class BioCXMLApiIngestPaperReport(ParseContractModel):
    corpus_id: int
    pmid: int
    document_id: str
    parsed: bool = False
    skipped_reason: str | None = None


class BioCXMLApiIngestReport(ParseContractModel):
    parser_version: str
    source_revision: str
    requested_corpus_ids: list[int] = Field(default_factory=list)
    resolved_pmids: int = 0
    skipped_existing: int = 0
    fetched_documents: int = 0
    parsed_documents: int = 0
    skipped_low_value: int = 0
    skipped_no_fetch: int = 0
    ingested_corpus_ids: list[int] = Field(default_factory=list)
    warehouse_result: dict[str, object] | None = None
    chunk_backfill_result: dict[str, object] | None = None
    papers: list[BioCXMLApiIngestPaperReport] = Field(default_factory=list)


def _source_revision_keys() -> list[str]:
    return [
        f"s2orc_v2:{settings.s2_release_id}",
        f"biocxml:{settings.pubtator_release_id}",
    ]


@observe(name="ingest.biocxmlApi")
def run_biocxml_api_ingest(
    *,
    corpus_ids: list[int],
    parser_version: str,
    source_revision: str | None = None,
    skip_existing: bool = True,
    backfill_chunks: bool = False,
    seed_chunk_version: bool = False,
    embedding_model: str | None = None,
    batch_size: int = 100,
    rate_limit: float = 3.0,
    replace_existing: bool = False,
    pmid_loader: CorpusPmidLoader | None = None,
    existing_checker: ExistingSourceChecker | None = None,
    api_fetcher: BioCXMLApiFetcher | None = None,
    warehouse_writer: BulkWarehouseWriter | None = None,
    chunk_backfill_runner: ChunkBackfillRunner | None = None,
    chunk_seeder: RagChunkSeeder | None = None,
) -> BioCXMLApiIngestReport:
    normalized_ids = _unique_ints(corpus_ids)
    effective_source_revision = source_revision or f"pubtator3-api:{settings.pubtator_release_id}"
    active_pmid_loader = pmid_loader or PostgresCorpusPmidLoader()
    active_existing_checker = existing_checker or PostgresExistingSourceChecker()
    active_fetcher = api_fetcher or fetch_biocxml_documents
    active_writer = warehouse_writer or RagWarehouseWriter()
    active_chunk_backfill = chunk_backfill_runner or run_chunk_backfill
    active_chunk_seeder = chunk_seeder or RagChunkSeeder()

    # Step 1: resolve corpus_id -> PMID
    pmid_map = active_pmid_loader.load_pmids(corpus_ids=normalized_ids)

    # Step 2: filter out papers that already have BioCXML sources
    candidate_ids = [cid for cid in normalized_ids if cid in pmid_map]
    skipped_existing_ids: set[int] = set()
    if skip_existing and candidate_ids:
        skipped_existing_ids = active_existing_checker.load_existing_biocxml(
            corpus_ids=candidate_ids
        )
        candidate_ids = [cid for cid in candidate_ids if cid not in skipped_existing_ids]

    # Step 3: fetch BioCXML from API
    pmids_to_fetch = [pmid_map[cid] for cid in candidate_ids]
    pmid_to_corpus: dict[int, int] = {pmid_map[cid]: cid for cid in candidate_ids}
    # document_id in PubTator BioCXML is the PMID as a string
    fetch_results = active_fetcher(
        pmids_to_fetch,
        batch_size=batch_size,
        rate_limit=rate_limit,
    )
    fetched_by_document_id: dict[str, BioCXMLFetchResult] = {
        result.document_id: result for result in fetch_results
    }

    # Step 4: parse and collect source groups
    source_groups = []
    paper_reports: list[BioCXMLApiIngestPaperReport] = []
    ingested_corpus_ids: list[int] = []
    skipped_low_value = 0
    skipped_no_fetch = 0

    for corpus_id in candidate_ids:
        pmid = pmid_map[corpus_id]
        document_id = str(pmid)
        fetch_result = fetched_by_document_id.get(document_id)

        if fetch_result is None:
            paper_reports.append(
                BioCXMLApiIngestPaperReport(
                    corpus_id=corpus_id,
                    pmid=pmid,
                    document_id=document_id,
                    skipped_reason="not_in_pubtator",
                )
            )
            skipped_no_fetch += 1
            continue

        parsed = traced_parse_biocxml(
            fetch_result.xml_text,
            source_revision=effective_source_revision,
            parser_version=parser_version,
            corpus_id=corpus_id,
        )

        if not parsed_source_has_warehouse_value(parsed):
            paper_reports.append(
                BioCXMLApiIngestPaperReport(
                    corpus_id=corpus_id,
                    pmid=pmid,
                    document_id=document_id,
                    skipped_reason="low_value",
                )
            )
            skipped_low_value += 1
            continue

        source_groups.append([parsed])
        ingested_corpus_ids.append(corpus_id)
        paper_reports.append(
            BioCXMLApiIngestPaperReport(
                corpus_id=corpus_id,
                pmid=pmid,
                document_id=document_id,
                parsed=True,
            )
        )

    # Step 5: write to warehouse
    warehouse_dump: dict[str, object] | None = None
    if source_groups:
        ingest_result = active_writer.ingest_source_groups(
            source_groups,
            replace_existing=replace_existing,
        )
        warehouse_dump = ingest_result.model_dump(mode="python")

    # Step 6: optional chunk seed + backfill
    chunk_backfill_dump: dict[str, object] | None = None
    if seed_chunk_version:
        active_chunk_seeder.seed_default(
            source_revision_keys=_source_revision_keys(),
            parser_version=parser_version,
            embedding_model=embedding_model,
        )

    if backfill_chunks and ingested_corpus_ids:
        chunk_result = active_chunk_backfill(
            corpus_ids=ingested_corpus_ids,
            source_revision_keys=_source_revision_keys(),
            parser_version=parser_version,
            embedding_model=embedding_model,
        )
        chunk_backfill_dump = chunk_result.model_dump(mode="python")

    report = BioCXMLApiIngestReport(
        parser_version=parser_version,
        source_revision=effective_source_revision,
        requested_corpus_ids=normalized_ids,
        resolved_pmids=len(pmid_map),
        skipped_existing=len(skipped_existing_ids),
        fetched_documents=len(fetch_results),
        parsed_documents=len(ingested_corpus_ids),
        skipped_low_value=skipped_low_value,
        skipped_no_fetch=skipped_no_fetch,
        ingested_corpus_ids=ingested_corpus_ids,
        warehouse_result=warehouse_dump,
        chunk_backfill_result=chunk_backfill_dump,
        papers=paper_reports,
    )

    try:
        from langfuse import get_client
        client = get_client()
        client.update_current_observation(
            input={
                "corpus_ids": normalized_ids,
                "parser_version": parser_version,
                "source_revision": effective_source_revision,
                "batch_size": batch_size,
            },
            output={
                "resolved_pmids": report.resolved_pmids,
                "fetched_documents": report.fetched_documents,
                "parsed_documents": report.parsed_documents,
                "skipped_existing": report.skipped_existing,
                "skipped_no_fetch": report.skipped_no_fetch,
                "skipped_low_value": report.skipped_low_value,
                "ingested_corpus_ids": report.ingested_corpus_ids,
                "papers": [
                    {"corpus_id": p.corpus_id, "pmid": p.pmid, "parsed": p.parsed, "skipped_reason": p.skipped_reason}
                    for p in report.papers
                ],
            },
        )
    except Exception:
        pass

    return report


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Ingest BioCXML documents from the PubTator3 API into the RAG warehouse. "
            "Resolves corpus_ids to PMIDs, fetches XML, parses, and writes."
        )
    )
    parser.add_argument(
        "--corpus-id",
        dest="corpus_ids",
        action="append",
        type=int,
        default=None,
    )
    parser.add_argument(
        "--corpus-ids-file",
        dest="corpus_ids_file",
        type=Path,
        default=None,
    )
    parser.add_argument("--parser-version", required=True)
    parser.add_argument("--source-revision", default=None)
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--rate-limit", type=float, default=3.0)
    parser.add_argument("--chunk-backfill", action="store_true")
    parser.add_argument("--seed-chunk-version", action="store_true")
    parser.add_argument("--embedding-model", default=None)
    parser.add_argument("--replace-existing", action="store_true")
    parser.add_argument("--no-skip-existing", action="store_true")
    parser.add_argument("--report-path", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    corpus_ids = resolve_corpus_ids(
        corpus_ids=args.corpus_ids,
        corpus_ids_file=args.corpus_ids_file,
    )
    if not corpus_ids:
        print("No corpus_ids provided.")
        return 1

    try:
        report = run_biocxml_api_ingest(
            corpus_ids=corpus_ids,
            parser_version=args.parser_version,
            source_revision=args.source_revision,
            skip_existing=not args.no_skip_existing,
            backfill_chunks=args.chunk_backfill,
            seed_chunk_version=args.seed_chunk_version,
            embedding_model=args.embedding_model,
            batch_size=args.batch_size,
            rate_limit=args.rate_limit,
            replace_existing=args.replace_existing,
        )
        output = report.model_dump_json(indent=2)
        if args.report_path is not None:
            args.report_path.parent.mkdir(parents=True, exist_ok=True)
            args.report_path.write_text(output)
        print(output)
        print(
            f"\nSummary: {report.parsed_documents} ingested, "
            f"{report.skipped_existing} skipped (existing), "
            f"{report.skipped_no_fetch} not in PubTator, "
            f"{report.skipped_low_value} low value"
        )
    finally:
        db.close_pool()
    return 0
