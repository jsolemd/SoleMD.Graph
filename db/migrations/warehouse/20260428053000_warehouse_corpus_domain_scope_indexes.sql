SET ROLE engine_warehouse_admin;

CREATE INDEX IF NOT EXISTS idx_corpus_corpus_scope
    ON solemd.corpus (corpus_id)
    WHERE domain_status = 'corpus';

CREATE INDEX IF NOT EXISTS idx_corpus_mapped_scope
    ON solemd.corpus (corpus_id)
    WHERE domain_status = 'mapped';

CREATE INDEX IF NOT EXISTS idx_corpus_active_scope
    ON solemd.corpus (corpus_id)
    WHERE domain_status IN ('corpus', 'mapped');

COMMENT ON INDEX solemd.idx_corpus_corpus_scope IS
    'Supports selection promotion joins over corpus-only membership without sorting the full corpus table.';

COMMENT ON INDEX solemd.idx_corpus_mapped_scope IS
    'Supports mapped-only materialization and evidence wave membership joins.';

COMMENT ON INDEX solemd.idx_corpus_active_scope IS
    'Supports baseline materialization joins over active corpus or mapped membership.';

RESET ROLE;
