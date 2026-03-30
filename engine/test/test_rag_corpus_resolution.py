from __future__ import annotations

from app.rag.corpus_resolution import (
    BioCDocumentIdKind,
    PostgresBioCCorpusResolver,
    normalize_bioc_document_id,
)


def test_normalize_bioc_document_id_handles_pmid_pmcid_and_other_values():
    assert normalize_bioc_document_id("12345") == (BioCDocumentIdKind.PMID, "12345")
    assert normalize_bioc_document_id("000123") == (BioCDocumentIdKind.PMID, "123")
    assert normalize_bioc_document_id("pmc12345") == (BioCDocumentIdKind.PMCID, "PMC12345")
    assert normalize_bioc_document_id("PMC12345.2") == (BioCDocumentIdKind.PMCID, "PMC12345")
    assert normalize_bioc_document_id("doi:10.1000/xyz") == (BioCDocumentIdKind.DOI, "10.1000/xyz")
    assert normalize_bioc_document_id("https://doi.org/10.1000/XYZ") == (
        BioCDocumentIdKind.DOI,
        "10.1000/xyz",
    )
    assert normalize_bioc_document_id("NIHMS123") == (BioCDocumentIdKind.MID, "NIHMS123")
    assert normalize_bioc_document_id("custom-doc-key") == (BioCDocumentIdKind.OTHER, "custom-doc-key")


def test_postgres_bioc_corpus_resolver_resolves_pmid_pmcid_and_doi_keys():
    class FakeCursor:
        def __init__(self):
            self.executed = []
            self.rows = []

        def execute(self, sql, params):
            self.executed.append((sql, params))
            if "WHERE pmid = ANY" in sql:
                self.rows = [{"corpus_id": 101, "pmid": 12345}]
            elif "WHERE pmc_id = ANY" in sql:
                self.rows = [{"corpus_id": 202, "pmc_id": "PMC999"}]
            else:
                self.rows = [{"corpus_id": 303, "doi": "10.1000/xyz"}]

        def fetchall(self):
            return self.rows

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeConnection:
        def __init__(self):
            self.cursor_obj = FakeCursor()

        def cursor(self):
            return self.cursor_obj

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    resolver = PostgresBioCCorpusResolver(connect=lambda: FakeConnection())
    resolved = resolver.resolve_document_ids(["12345", "pmc999", "doi:10.1000/XYZ", "NIHMS1"])

    assert resolved == {"12345": 101, "pmc999": 202, "doi:10.1000/XYZ": 303}
