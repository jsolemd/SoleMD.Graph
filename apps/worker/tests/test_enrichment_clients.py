from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.config import settings
from app.enrichment.models import (
    StartPubMedMetadataEnrichmentRequest,
    StartS2GraphEnrichmentRequest,
)
from app.enrichment.pubmed import (
    PubMedEfetchClient,
    effective_pubmed_request_rate,
    parse_pubmed_efetch_xml,
    pubmed_rate_window,
)
from app.enrichment.run_details import pubmed_run_detail, s2_graph_run_detail
from app.enrichment.s2_graph import (
    SemanticScholarGraphClient,
    effective_s2_graph_request_rate,
    parse_s2_graph_batch,
    semantic_scholar_lookup_id,
)


def test_parse_pubmed_efetch_metadata_fields() -> None:
    records = parse_pubmed_efetch_xml(
        b"""<?xml version="1.0"?>
        <PubmedArticleSet>
          <PubmedArticle>
            <MedlineCitation Status="MEDLINE">
              <PMID>123</PMID>
              <Article PubModel="Print">
                <ArticleTitle>Consult psychiatry bridge trial</ArticleTitle>
                <Abstract>
                  <AbstractText Label="Methods" NlmCategory="METHODS">Randomized methods.</AbstractText>
                  <AbstractText Label="Results" NlmCategory="RESULTS">Result text.</AbstractText>
                </Abstract>
                <Language>eng</Language>
                <PublicationTypeList>
                  <PublicationType>Randomized Controlled Trial</PublicationType>
                </PublicationTypeList>
                <GrantList><Grant><GrantID>R01</GrantID></Grant></GrantList>
              </Article>
              <MeshHeadingList>
                <MeshHeading>
                  <DescriptorName UI="D001523" MajorTopicYN="Y">Mental Disorders</DescriptorName>
                  <QualifierName UI="Q000628" MajorTopicYN="N">therapy</QualifierName>
                </MeshHeading>
              </MeshHeadingList>
              <CitationSubset>IM</CitationSubset>
              <KeywordList><Keyword>delirium</Keyword></KeywordList>
              <CommentsCorrectionsList>
                <CommentsCorrections RefType="ErratumIn"><PMID>456</PMID></CommentsCorrections>
              </CommentsCorrectionsList>
            </MedlineCitation>
            <PubmedData><PublicationStatus>ppublish</PublicationStatus></PubmedData>
          </PubmedArticle>
        </PubmedArticleSet>
        """
    )

    assert len(records) == 1
    record = records[0]
    assert record.pmid == 123
    assert record.publication_types == ("Randomized Controlled Trial",)
    assert record.mesh_major_terms == ("Mental Disorders",)
    assert record.citation_subsets == ("IM",)
    assert record.keywords == ("delirium",)
    assert record.grant_count == 1
    assert record.has_erratum is True
    assert record.structured_abstract[0]["nlm_category"] == "METHODS"


def test_parse_semantic_scholar_graph_batch_metadata_fields() -> None:
    records = parse_s2_graph_batch(
        b"""[
          {
            "paperId": "S2-1",
            "citationCount": 5,
            "influentialCitationCount": 2,
            "fieldsOfStudy": ["Medicine", "Psychology"],
            "publicationTypes": ["JournalArticle"],
            "s2FieldsOfStudy": [{"category": "Medicine", "source": "s2-fos-model"}],
            "openAccessPdf": {"status": "gold", "url": "https://example.test/p.pdf"},
            "publicationVenue": {"type": "journal", "name": "Example Journal"},
            "externalIds": {"PubMed": "123"},
            "journal": {"name": "Example Journal", "volume": "1"},
            "isOpenAccess": true,
            "year": 2025,
            "publicationDate": "2025-01-02"
          },
          null
        ]"""
    )

    assert len(records) == 1
    record = records[0]
    assert record.paper_id == "S2-1"
    assert record.citation_count == 5
    assert record.influential_citation_count == 2
    assert record.fields_of_study == ("medicine", "psychology")
    assert record.publication_types == ("journalarticle",)
    assert record.open_access_pdf_status == "gold"
    assert record.publication_venue_type == "journal"
    assert record.publication_date is not None
    assert record.publication_date.isoformat() == "2025-01-02"


def test_semantic_scholar_batch_preserves_local_corpus_id() -> None:
    records = parse_s2_graph_batch(
        b"""[
          {"paperId": "hash-from-provider", "citationCount": 1}
        ]""",
        paper_ids=("252463923",),
    )

    assert semantic_scholar_lookup_id("252463923") == "CorpusId:252463923"
    assert records[0].paper_id == "252463923"
    assert records[0].raw_detail["paperId"] == "hash-from-provider"


def test_pubmed_client_requires_real_ncbi_contact_email() -> None:
    runtime_settings = settings.model_copy(
        update={
            "ncbi_api_key": "key",
            "ncbi_api_email": "noreply@example.com",
            "pubmed_metadata_requests_per_second": 20.0,
        }
    )

    with pytest.raises(RuntimeError, match="NCBI_API_EMAIL"):
        PubMedEfetchClient(runtime_settings)

    configured = runtime_settings.model_copy(
        update={"ncbi_api_email": "ops@example.test"}
    )
    assert effective_pubmed_request_rate(
        configured,
        now=datetime(2026, 5, 9, 2, 0, tzinfo=UTC),
    ) == 9.0


def test_pubmed_rate_policy_uses_low_peak_rate_and_high_off_peak_rate() -> None:
    runtime_settings = settings.model_copy(
        update={
            "ncbi_api_key": "key",
            "ncbi_api_email": "ops@example.test",
            "pubmed_metadata_requests_per_second": 20.0,
            "pubmed_metadata_peak_requests_per_second": 1.0,
        }
    )
    peak_eastern_noon = datetime(2026, 5, 8, 16, 0, tzinfo=UTC)
    off_peak_friday_evening = datetime(2026, 5, 9, 2, 0, tzinfo=UTC)

    assert pubmed_rate_window(now=peak_eastern_noon) == "weekday_peak"
    assert effective_pubmed_request_rate(
        runtime_settings,
        now=peak_eastern_noon,
    ) == 1.0
    assert pubmed_rate_window(now=off_peak_friday_evening) == "off_peak"
    assert effective_pubmed_request_rate(
        runtime_settings,
        now=off_peak_friday_evening,
    ) == 9.0


def test_semantic_scholar_graph_client_requires_api_key_and_caps_rate() -> None:
    runtime_settings = settings.model_copy(
        update={
            "semantic_scholar_api_key": "",
            "s2_graph_requests_per_second": 5.0,
        }
    )

    with pytest.raises(RuntimeError, match="S2_API_KEY"):
        SemanticScholarGraphClient(runtime_settings)

    configured = runtime_settings.model_copy(update={"semantic_scholar_api_key": "key"})
    assert effective_s2_graph_request_rate(configured) == 1.0


def test_enrichment_run_details_record_rates_without_secrets() -> None:
    runtime_settings = settings.model_copy(
        update={
            "ncbi_api_key": "ncbi-secret",
            "ncbi_api_email": "ops@example.test",
            "semantic_scholar_api_key": "s2-secret",
            "pubmed_metadata_requests_per_second": 20.0,
            "pubmed_metadata_peak_requests_per_second": 20.0,
            "s2_graph_requests_per_second": 5.0,
        }
    )
    pubmed_detail = pubmed_run_detail(
        StartPubMedMetadataEnrichmentRequest(corpus_selection_run_id=uuid4()),
        runtime_settings,
    )
    s2_detail = s2_graph_run_detail(
        StartS2GraphEnrichmentRequest(corpus_selection_run_id=uuid4()),
        runtime_settings,
    )

    assert pubmed_detail["effective_requests_per_second"] == 9.0
    assert pubmed_detail["peak_requests_per_second"] == 20.0
    assert s2_detail["effective_requests_per_second"] == 1.0
    assert pubmed_detail["api_key_present"] is True
    assert s2_detail["api_key_present"] is True
    serialized = json.dumps({"pubmed": pubmed_detail, "s2": s2_detail})
    assert "ncbi-secret" not in serialized
    assert "s2-secret" not in serialized
