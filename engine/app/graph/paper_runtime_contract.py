"""Shared paper-runtime hydration contract for serving-layer reads.

This keeps graph/wiki/RAG paper-card metadata aligned on the canonical
``solemd.graph_paper_summary`` serving surface instead of rebuilding the
display/runtime shape ad hoc from raw paper tables in each query family.
"""

from __future__ import annotations

PAPER_RUNTIME_SELECT_COLUMNS = """
    p.corpus_id,
    COALESCE(gps.paper_id, p.paper_id) AS paper_id,
    COALESCE(gps.paper_id, p.paper_id) AS semantic_scholar_paper_id,
    COALESCE(NULLIF(gps.title, ''), p.title) AS title,
    p.abstract,
    p.tldr,
    COALESCE(NULLIF(gps.journal_name, ''), p.journal_name, p.venue) AS journal_name,
    COALESCE(gps.year, p.year) AS year,
    c.doi,
    COALESCE(gps.pmid, c.pmid) AS pmid,
    c.pmc_id AS pmcid,
    p.text_availability,
    p.is_open_access,
    COALESCE(gps.citation_count, p.citation_count, 0) AS citation_count,
    COALESCE(p.influential_citation_count, 0) AS influential_citation_count,
    COALESCE(gps.reference_count, p.reference_count, 0) AS reference_count,
    COALESCE(p.publication_types, ARRAY[]::text[]) AS publication_types,
    COALESCE(p.fields_of_study, ARRAY[]::text[]) AS fields_of_study,
    COALESCE(pes.has_rule_evidence, false) AS has_rule_evidence,
    COALESCE(pes.has_curated_journal_family, false) AS has_curated_journal_family,
    pes.journal_family_type,
    COALESCE(pes.entity_rule_families, 0) AS entity_rule_families,
    COALESCE(pes.entity_rule_count, 0) AS entity_rule_count,
    COALESCE(pes.entity_core_families, 0) AS entity_core_families
"""

RANKED_PAPER_RUNTIME_SELECT_COLUMNS = """
    rp.corpus_id,
    rp.paper_id,
    rp.semantic_scholar_paper_id,
    rp.title,
    rp.abstract,
    rp.tldr,
    rp.journal_name,
    rp.year,
    rp.doi,
    rp.pmid,
    rp.pmcid,
    rp.text_availability,
    rp.is_open_access,
    rp.citation_count,
    rp.influential_citation_count,
    rp.reference_count,
    rp.publication_types,
    rp.fields_of_study,
    rp.has_rule_evidence,
    rp.has_curated_journal_family,
    rp.journal_family_type,
    rp.entity_rule_families,
    rp.entity_rule_count,
    rp.entity_core_families
"""

PAPER_RUNTIME_JOINS = """
JOIN solemd.corpus c
  ON c.corpus_id = p.corpus_id
JOIN solemd.graph_paper_summary gps
  ON gps.corpus_id = p.corpus_id
LEFT JOIN solemd.paper_evidence_summary pes
  ON pes.corpus_id = p.corpus_id
"""
