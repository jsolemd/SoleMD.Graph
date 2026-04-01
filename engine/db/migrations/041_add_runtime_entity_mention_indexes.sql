CREATE INDEX IF NOT EXISTS idx_paper_entity_mentions_runtime_type_concept
    ON solemd.paper_entity_mentions (entity_type, concept_id, corpus_id)
    WHERE concept_id IS NOT NULL;

COMMENT ON INDEX solemd.idx_paper_entity_mentions_runtime_type_concept IS
    'Runtime RAG entity retrieval index keyed by entity_type + concept_id + corpus_id.';
