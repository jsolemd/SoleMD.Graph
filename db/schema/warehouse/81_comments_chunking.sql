SET ROLE engine_warehouse_admin;

COMMENT ON TABLE solemd.paper_documents IS
    'Canonical document-source registry for chunking and grounding inputs.';
COMMENT ON TABLE solemd.paper_sections IS
    'Canonical section inventory used by chunk assembly and evidence-key derivation.';
COMMENT ON TABLE solemd.paper_blocks IS
    'Canonical block-level text spine partitioned by corpus_id for chunk assembly.';
COMMENT ON TABLE solemd.paper_sentences IS
    'Canonical sentence segmentation output partitioned by corpus_id.';
COMMENT ON TABLE solemd.paper_chunks IS
    'Canonical chunk text output partitioned by corpus_id.';
COMMENT ON TABLE solemd.paper_chunk_members IS
    'Chunk-to-sentence membership rows partitioned by corpus_id.';
COMMENT ON TABLE solemd.paper_evidence_units IS
    'Round-trippable evidence-key surface for retrieval grounding back to canonical coordinates; intentionally unpartitioned for the initial small fully grounded hot cohort.';
COMMENT ON TABLE solemd.chunk_runs IS
    'Chunk-assembly dispatcher ledger keyed by ingest_run_id and chunk_version_key.';
COMMENT ON TABLE solemd.chunk_assembly_errors IS
    'Sidecar operator surface for chunk-assembly failures that should not block ingest publish.';

COMMENT ON COLUMN solemd.paper_documents.document_source_kind IS
    'Document-source code from db/schema/enum-codes.yaml.document_source_kind.';
COMMENT ON COLUMN solemd.paper_sections.section_role IS
    'Section-role code from db/schema/enum-codes.yaml.section_role.';
COMMENT ON COLUMN solemd.paper_blocks.block_kind IS
    'Block-kind code from db/schema/enum-codes.yaml.block_kind.';
COMMENT ON COLUMN solemd.paper_blocks.section_role IS
    'Denormalized section-role code from db/schema/enum-codes.yaml.section_role.';
COMMENT ON COLUMN solemd.paper_sentences.segmentation_source IS
    'Sentence-segmentation source code from db/schema/enum-codes.yaml.segmentation_source.';
COMMENT ON COLUMN solemd.paper_evidence_units.evidence_kind IS
    'Evidence-unit code from db/schema/enum-codes.yaml.evidence_kind.';
COMMENT ON COLUMN solemd.paper_evidence_units.evidence_key IS
    'Deterministic UUIDv5 grounding key; no DEFAULT by design because the writer derives it from canonical coordinates and chunk_version_key.';
COMMENT ON COLUMN solemd.paper_evidence_units.section_role IS
    'Denormalized section-role code from db/schema/enum-codes.yaml.section_role.';
COMMENT ON COLUMN solemd.chunk_runs.status IS
    'Chunk-run lifecycle code from db/schema/enum-codes.yaml.chunk_run_status.';

RESET ROLE;
