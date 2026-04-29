SET ROLE engine_warehouse_admin;

CREATE INDEX IF NOT EXISTS idx_paper_entity_signals_build_vocab_paper
    ON solemd.paper_entity_signals (
        s2_source_release_id,
        pt3_source_release_id,
        entity_signal_checksum,
        paper_id
    )
    WHERE term_id IS NOT NULL;

RESET ROLE;
