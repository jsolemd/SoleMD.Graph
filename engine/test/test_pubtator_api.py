"""Tests for PubTator3 API client and API-driven ingest pipeline."""

from __future__ import annotations

from app.rag_ingest.biocxml_api_ingest import run_biocxml_api_ingest
from app.rag_ingest.target_corpus import RagTargetCorpusRow
from app.rag_ingest.source_parsers import (
    BioCXMLDocumentPayload,
    split_biocxml_collection,
)


def _make_collection_xml(pmid: int, title: str, abstract: str) -> str:
    return f"""\
<collection>
  <source>PubTator</source>
  <date>2026-04-04</date>
  <document>
    <id>{pmid}</id>
    <passage>
      <infon key="type">title</infon>
      <offset>0</offset>
      <text>{title}</text>
    </passage>
    <passage>
      <infon key="type">abstract</infon>
      <offset>{len(title) + 1}</offset>
      <text>{abstract}</text>
    </passage>
  </document>
</collection>
"""


class FakePmidLoader:
    def __init__(self, mapping: dict[int, int]):
        self._mapping = mapping

    def load_pmids(self, *, corpus_ids: list[int]) -> dict[int, int]:
        return {cid: self._mapping[cid] for cid in corpus_ids if cid in self._mapping}


class FakeExistingChecker:
    def __init__(self, existing: set[int] | None = None):
        self._existing = existing or set()

    def load_existing_biocxml(self, *, corpus_ids: list[int]) -> set[int]:
        return {cid for cid in corpus_ids if cid in self._existing}


class FakeApiFetcher:
    def __init__(self, responses: dict[int, str]):
        self._responses = responses
        self.called_pmids: list[int] = []

    def __call__(self, pmids: list[int], **kwargs) -> list[BioCXMLDocumentPayload]:
        self.called_pmids.extend(pmids)
        results: list[BioCXMLDocumentPayload] = []
        for pmid in pmids:
            if pmid in self._responses:
                results.extend(split_biocxml_collection(self._responses[pmid]))
        return results


class FakeWarehouseWriter:
    def __init__(self):
        self.source_groups = []

    def ingest_source_groups(self, source_groups, **kwargs):
        self.source_groups.extend(source_groups)

        from app.rag_ingest.warehouse_writer import (
            RagWarehouseBulkIngestResult,
            RagWarehouseBulkIngestPaperResult,
        )

        return RagWarehouseBulkIngestResult(
            papers=[
                RagWarehouseBulkIngestPaperResult(
                    corpus_id=group[0].document.corpus_id,
                    primary_source_system="biocxml",
                    primary_reason="api_ingest",
                )
                for group in source_groups
            ],
            batch_total_rows=len(source_groups) * 5,
            written_rows=len(source_groups) * 5,
        )


class FakeTargetLoader:
    def __init__(self, rows: dict[int, object]):
        self._rows = rows

    def load(self, *, corpus_ids, limit):
        assert limit is None
        loaded = []
        for corpus_id in corpus_ids:
            row = self._rows.get(corpus_id)
            if row is None:
                continue
            if isinstance(row, RagTargetCorpusRow):
                loaded.append(row)
                continue
            loaded.append(
                RagTargetCorpusRow(
                    corpus_id=corpus_id,
                    paper_title=str(row),
                )
            )
        return loaded


def test_api_ingest_end_to_end():
    pmid_loader = FakePmidLoader({100: 11111, 200: 22222})
    fetcher = FakeApiFetcher(
        {
            11111: _make_collection_xml(11111, "Paper A Title", "Paper A abstract text."),
            22222: _make_collection_xml(22222, "Paper B Title", "Paper B abstract text."),
        }
    )
    writer = FakeWarehouseWriter()

    report = run_biocxml_api_ingest(
        corpus_ids=[100, 200],
        parser_version="parser-v4",
        pmid_loader=pmid_loader,
        existing_checker=FakeExistingChecker(),
        api_fetcher=fetcher,
        warehouse_writer=writer,
        chunk_backfill_runner=lambda **kwargs: type(
            "R", (), {"model_dump": lambda self, **kw: {}}
        )(),
    )

    assert report.resolved_pmids == 2
    assert report.fetched_documents == 2
    assert report.parsed_documents == 2
    assert report.skipped_existing == 0
    assert sorted(report.ingested_corpus_ids) == [100, 200]
    assert len(writer.source_groups) == 2
    assert fetcher.called_pmids == [11111, 22222]


def test_api_ingest_skips_existing():
    pmid_loader = FakePmidLoader({100: 11111, 200: 22222})
    existing_checker = FakeExistingChecker(existing={100})
    fetcher = FakeApiFetcher(
        {22222: _make_collection_xml(22222, "Paper B", "Abstract B.")}
    )
    writer = FakeWarehouseWriter()

    report = run_biocxml_api_ingest(
        corpus_ids=[100, 200],
        parser_version="parser-v4",
        pmid_loader=pmid_loader,
        existing_checker=existing_checker,
        api_fetcher=fetcher,
        warehouse_writer=writer,
    )

    assert report.skipped_existing == 1
    assert report.parsed_documents == 1
    assert report.ingested_corpus_ids == [200]
    assert 11111 not in fetcher.called_pmids


def test_api_ingest_handles_no_pmid():
    pmid_loader = FakePmidLoader({100: 11111})  # 200 has no PMID
    fetcher = FakeApiFetcher(
        {11111: _make_collection_xml(11111, "Title", "Abstract.")}
    )
    writer = FakeWarehouseWriter()

    report = run_biocxml_api_ingest(
        corpus_ids=[100, 200],
        parser_version="parser-v4",
        pmid_loader=pmid_loader,
        existing_checker=FakeExistingChecker(),
        api_fetcher=fetcher,
        warehouse_writer=writer,
    )

    assert report.resolved_pmids == 1
    assert report.parsed_documents == 1


def test_api_ingest_handles_not_in_pubtator():
    pmid_loader = FakePmidLoader({100: 11111, 200: 22222})
    fetcher = FakeApiFetcher(
        {11111: _make_collection_xml(11111, "Title", "Abstract.")}
    )  # 22222 not returned by API
    writer = FakeWarehouseWriter()

    report = run_biocxml_api_ingest(
        corpus_ids=[100, 200],
        parser_version="parser-v4",
        pmid_loader=pmid_loader,
        existing_checker=FakeExistingChecker(),
        api_fetcher=fetcher,
        warehouse_writer=writer,
    )

    assert report.skipped_no_fetch == 1
    assert report.parsed_documents == 1
    not_found = [p for p in report.papers if p.skipped_reason == "not_in_pubtator"]
    assert len(not_found) == 1
    assert not_found[0].corpus_id == 200


def test_api_ingest_applies_canonical_target_title():
    pmid_loader = FakePmidLoader({100: 11111})
    fetcher = FakeApiFetcher(
        {
            11111: _make_collection_xml(
                11111,
                "TO THE EDITOR",
                "Abstract text for the paper.",
            )
        }
    )
    writer = FakeWarehouseWriter()

    report = run_biocxml_api_ingest(
        corpus_ids=[100],
        parser_version="parser-v4",
        pmid_loader=pmid_loader,
        existing_checker=FakeExistingChecker(),
        target_loader=FakeTargetLoader({100: "Canonical paper title"}),
        api_fetcher=fetcher,
        warehouse_writer=writer,
    )

    assert report.parsed_documents == 1
    assert writer.source_groups[0][0].document.title == "Canonical paper title"
    assert writer.source_groups[0][0].document.raw_attrs_json == {
        "source_selected_title": "TO THE EDITOR",
        "corpus_metadata_title": "Canonical paper title",
    }


def test_api_ingest_matches_pmcid_document_id_to_requested_corpus():
    pmid_loader = FakePmidLoader({100: 11111})
    fetcher = FakeApiFetcher(
        {
            11111: """
            <collection>
              <document>
                <id>2962292</id>
                <passage>
                  <infon key="type">title</infon>
                  <offset>0</offset>
                  <text>Case Report</text>
                </passage>
                <passage>
                  <infon key="type">abstract</infon>
                  <offset>12</offset>
                  <text>PubTator returned a PMCID-shaped document identifier.</text>
                </passage>
              </document>
            </collection>
            """
        }
    )
    writer = FakeWarehouseWriter()

    report = run_biocxml_api_ingest(
        corpus_ids=[100],
        parser_version="parser-v4",
        pmid_loader=pmid_loader,
        existing_checker=FakeExistingChecker(),
        target_loader=FakeTargetLoader(
            {
                100: RagTargetCorpusRow(
                    corpus_id=100,
                    pmid=11111,
                    pmc_id="PMC2962292",
                    paper_title="Canonical PMCID-backed Title",
                )
            }
        ),
        api_fetcher=fetcher,
        warehouse_writer=writer,
    )

    assert report.parsed_documents == 1
    assert report.skipped_no_fetch == 0
    assert report.ingested_corpus_ids == [100]
    assert writer.source_groups[0][0].document.title == "Canonical PMCID-backed Title"
