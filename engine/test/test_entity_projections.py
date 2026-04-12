from app.corpus import entity_projections


def test_entity_stage_sql_preserves_existing_embedding_and_created_at() -> None:
    sql = entity_projections._create_entities_stage_sql("solemd.entities_next")

    assert "LEFT JOIN solemd.entities current_entities" in sql
    assert "current_entities.embedding" in sql
    assert "COALESCE(current_entities.created_at, now()::TIMESTAMPTZ)" in sql


def test_entity_stage_sql_seeds_vocab_only_entities_without_duplicate_aggregates() -> None:
    sql = entity_projections._create_entities_stage_sql("solemd.entities_next")

    assert "FROM solemd.vocab_terms vt" in sql
    assert "raw_vocab_seed_candidates AS (" in sql
    assert "deduped_vocab_seed_candidates AS (" in sql
    assert "GROUP BY concept_id, entity_type" in sql
    assert "array_agg(DISTINCT candidate_name ORDER BY candidate_name) AS synonyms" in sql
    assert "LEFT JOIN aggregated_entities ae" in sql
    assert "LEFT JOIN solemd.entity_rule er" in sql
    assert "current_entities.canonical_name" in sql
    assert "WHERE ae.concept_id IS NULL" in sql


class _RecordingCursor:
    def __init__(self) -> None:
        self.statements: list[str] = []

    def execute(self, sql: str, params=None) -> None:
        self.statements.append(sql.strip())


def test_swap_entity_alias_projection_stages_renames_stage_tables_and_indexes() -> None:
    cur = _RecordingCursor()

    entity_projections._swap_entity_alias_projection_stages(cur)

    joined = "\n".join(cur.statements)
    assert (
        "ALTER TABLE IF EXISTS solemd.entity_runtime_aliases "
        "RENAME TO entity_runtime_aliases_old" in joined
    )
    assert "ALTER TABLE IF EXISTS solemd.entity_aliases RENAME TO entity_aliases_old" in joined
    assert "RENAME CONSTRAINT entity_aliases_pkey" in joined
    assert "RENAME CONSTRAINT entity_aliases_highlight_mode_check" in joined
    assert "ALTER INDEX IF EXISTS solemd.idx_entity_aliases_alias_key_all" in joined
    assert "RENAME CONSTRAINT entity_runtime_aliases_pkey" in joined
    assert "ALTER INDEX IF EXISTS solemd.idx_entity_runtime_aliases_alias_key" in joined
    assert (
        "ALTER INDEX IF EXISTS "
        "solemd.idx_entity_runtime_aliases_alias_key_entity_type" in joined
    )
    assert "ALTER TABLE solemd.entity_aliases_next RENAME TO entity_aliases" in joined
    assert (
        "ALTER TABLE solemd.entity_runtime_aliases_next "
        "RENAME TO entity_runtime_aliases" in joined
    )
    assert "ALTER INDEX solemd.idx_entity_aliases_next_alias_key_all" in joined
    assert "ALTER INDEX solemd.idx_entity_runtime_aliases_next_alias_key" in joined


def test_swap_entities_stage_only_swaps_entities_table() -> None:
    cur = _RecordingCursor()

    entity_projections._swap_entities_stage(cur)

    joined = "\n".join(cur.statements)
    assert "ALTER TABLE IF EXISTS solemd.entities RENAME TO entities_old" in joined
    assert "RENAME CONSTRAINT entities_pkey" in joined
    assert "ALTER INDEX IF EXISTS solemd.idx_entities_type" in joined
    assert "ALTER INDEX IF EXISTS solemd.idx_entities_paper_count" in joined
    assert "ALTER INDEX IF EXISTS solemd.idx_entities_canonical_name_trgm" in joined
    assert "ALTER TABLE solemd.entities_next RENAME TO entities" in joined
    assert "RENAME CONSTRAINT entities_next_pkey" in joined
    assert "ALTER INDEX solemd.idx_entities_next_type" in joined
    assert "ALTER INDEX solemd.idx_entities_next_paper_count" in joined
    assert "ALTER INDEX solemd.idx_entities_next_canonical_name_trgm" in joined
    assert "entity_runtime_aliases_old" not in joined
    assert "entity_aliases_old" not in joined
