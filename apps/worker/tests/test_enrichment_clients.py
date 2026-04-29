from __future__ import annotations

from app.enrichment.pubmed import parse_pubmed_efetch_xml
from app.enrichment.s2_graph import parse_s2_graph_batch


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
