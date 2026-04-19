SET ROLE engine_warehouse_admin;

GRANT INSERT ON TABLE
    solemd.paper_documents,
    solemd.paper_sections,
    solemd.paper_blocks,
    solemd.paper_sentences,
    solemd.paper_chunks,
    solemd.paper_chunk_members,
    solemd.paper_evidence_units,
    solemd.chunk_runs,
    solemd.chunk_assembly_errors
TO engine_ingest_write;

GRANT UPDATE ON TABLE
    solemd.paper_documents,
    solemd.paper_sections,
    solemd.paper_blocks,
    solemd.paper_sentences,
    solemd.chunk_runs,
    solemd.chunk_assembly_errors
TO engine_ingest_write;

GRANT DELETE ON TABLE
    solemd.paper_documents,
    solemd.paper_sections,
    solemd.paper_blocks,
    solemd.paper_sentences
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.paper_chunk_versions,
    solemd.paper_documents,
    solemd.paper_sections,
    solemd.paper_blocks,
    solemd.paper_sentences,
    solemd.paper_chunks,
    solemd.paper_chunk_members,
    solemd.paper_evidence_units,
    solemd.chunk_runs,
    solemd.chunk_assembly_errors,
    solemd.s2_papers_raw,
    solemd.s2_paper_authors_raw,
    solemd.s2_paper_references_raw,
    solemd.s2_paper_assets_raw,
    pubtator.entity_annotations_stage,
    pubtator.entity_annotations,
    pubtator.relations_stage,
    pubtator.relations
TO engine_ingest_write;

GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE
    pubtator.entity_annotations_stage,
    pubtator.entity_annotations,
    pubtator.relations_stage,
    pubtator.relations
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.paper_documents,
    solemd.paper_sections,
    solemd.paper_blocks,
    solemd.paper_sentences,
    solemd.paper_chunks,
    solemd.paper_chunk_members,
    solemd.paper_evidence_units,
    solemd.chunk_runs,
    solemd.chunk_assembly_errors,
    pubtator.entity_annotations,
    pubtator.relations
TO engine_warehouse_read;

RESET ROLE;
