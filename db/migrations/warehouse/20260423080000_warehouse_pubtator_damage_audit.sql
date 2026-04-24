-- Damage audit: PubTator ingest before 2026-04-23 wrote two classes of
-- suspect rows. This migration isolates them via read-only views so a
-- future backfill (or manual investigation) can target them precisely.
-- It mutates nothing; it only defines visibility.
--
-- Class A — line-number-as-offset corruption in
--   ``pubtator.entity_annotations_stage`` (resource = 2, "bioconcepts"):
--   ``_stream_bioconcepts`` wrote ``start_offset = line_index`` and
--   ``end_offset = line_index + 1`` instead of a constant sentinel,
--   because ``bioconcepts2pubtator3.gz`` is a document-level aggregated
--   feed and has no character offsets at all (5-column TSV:
--   PMID, Type, ConceptID, Mentions, Resource). The stage unique key
--   ``(source_release_id, pmid, start_offset, end_offset, concept_id_raw,
--   resource)`` therefore admitted near-duplicates that differ only by
--   line position, silently inflating row counts and fragmenting the
--   per-paper concept set. Fixed in ``apps/worker/app/ingest/sources/pubtator.py``
--   (``_stream_bioconcepts``) by emitting ``start_offset = 0,
--   end_offset = 0`` for this resource. Post-fix: fresh ingest runs produce
--   zero-offset rows that the ``ON CONFLICT`` clause collapses into one
--   row per (pmid, concept_id_raw, resource).
--
-- Class B — subject/object orientation between the BioCXML and TSV
--   relation paths in ``pubtator.relations_stage``: audited and confirmed
--   ALIGNED in the live data (TSV column 3 == BioCXML ``role1`` ==
--   subject; TSV column 4 == BioCXML ``role2`` == object). The contract
--   is now documented inline in ``_stream_relations`` and
--   ``_relation_row_from_biocxml`` and locked in by
--   ``tests/test_pubtator_parse.py``. The audit view below remains a
--   convenience surface for parity queries; it does not assert corruption.

SET ROLE engine_warehouse_admin;

-- -------------------------------------------------------------------------
-- Class A: suspect bioconcepts entity rows with synthesized offsets.
-- -------------------------------------------------------------------------
CREATE OR REPLACE VIEW pubtator.v_entity_annotations_pre_offset_fix AS
SELECT
    stage.source_release_id,
    stage.pmid,
    stage.start_offset,
    stage.end_offset,
    stage.entity_type,
    stage.mention_text,
    stage.concept_id_raw,
    stage.resource,
    stage.corpus_id,
    stage.last_seen_run_id
FROM pubtator.entity_annotations_stage AS stage
WHERE stage.resource = 2  -- bioconcepts; biocxml (resource = 1) carries real spans.
  AND (stage.start_offset <> 0 OR stage.end_offset <> 0);

COMMENT ON VIEW pubtator.v_entity_annotations_pre_offset_fix IS
    'Damage-audit view (created 2026-04-23): bioconcepts entity rows whose '
    '(start_offset, end_offset) encode a line index rather than the post-fix '
    '(0, 0) sentinel. A backfill should DELETE-and-re-ingest these rows per '
    'release_id so the stage unique key collapses to one row per '
    '(pmid, entity_type, concept_id_raw, resource). The view is intentionally '
    'shape-based rather than date-based so late old-image rows are still visible. See '
    'db/migrations/warehouse/20260423080000_warehouse_pubtator_damage_audit.sql '
    'for context.';

-- -------------------------------------------------------------------------
-- Class B: relations ingested before the orientation contract was
-- documented. This view is a convenience surface for per-release
-- re-verification; it does not assert corruption.
-- -------------------------------------------------------------------------
CREATE OR REPLACE VIEW pubtator.v_relations_pre_orientation_fix AS
SELECT
    stage.source_release_id,
    stage.pmid,
    stage.relation_type,
    stage.subject_entity_id,
    stage.object_entity_id,
    stage.subject_type,
    stage.object_type,
    stage.relation_source,
    stage.corpus_id,
    stage.last_seen_run_id
FROM pubtator.relations_stage AS stage
WHERE stage.last_seen_run_id IN (
        SELECT ir.ingest_run_id
        FROM solemd.ingest_runs AS ir
        JOIN solemd.source_releases AS sr
          ON sr.source_release_id = ir.source_release_id
        WHERE sr.source_name IN ('pt3', 'pubtator')
  );

COMMENT ON VIEW pubtator.v_relations_pre_orientation_fix IS
    'Damage-audit view (created 2026-04-23): all relations rows from '
    'PubTator ingest runs, exposed as a reusable parity-check surface after '
    'the BioCXML/TSV orientation audit. Live data verification showed no '
    'inversion between the BioCXML and TSV paths, but the view exists so '
    'operators can run release-level checks (e.g. LEFT JOIN against the same '
    'rows with relation_source swapped) without hard-coding source filters in '
    'ad-hoc queries. See '
    'db/migrations/warehouse/20260423080000_warehouse_pubtator_damage_audit.sql '
    'for context.';

-- Read access for the standard warehouse read role so dashboards /
-- investigation tools can query the views without elevation.
GRANT SELECT ON pubtator.v_entity_annotations_pre_offset_fix TO engine_warehouse_read;
GRANT SELECT ON pubtator.v_relations_pre_orientation_fix TO engine_warehouse_read;

RESET ROLE;
