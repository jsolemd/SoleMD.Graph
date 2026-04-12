-- ============================================================================
-- 070: Reverse MeSH/CUI and chemical ingredient-form bridges
--
-- Adds two lookup surfaces on top of the existing UMLS crosswalk views:
--
--   umls.cui_to_mesh                — reverse lookup for CUI → MeSH descriptor
--   umls.chemical_ingredient_bridge — salt/form CUI → curated ingredient CUI
--
-- The ingredient bridge is intentionally narrow. It only captures directed
-- UMLS relations that point from a clinically meaningful ingredient/base form
-- to a salt/modification/form concept. Downstream serving code still applies a
-- second precision gate against observed PubTator mention surfaces and curated
-- RxNorm-backed vocab terms before normalizing a live entity identity.
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS umls.cui_to_mesh AS
SELECT DISTINCT
    cui,
    mesh_id
FROM umls.mesh_to_cui;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cui_to_mesh_cui_mesh
    ON umls.cui_to_mesh (cui, mesh_id);

CREATE INDEX IF NOT EXISTS idx_cui_to_mesh_mesh
    ON umls.cui_to_mesh (mesh_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS umls.chemical_ingredient_bridge AS
SELECT
    r.cui2 AS form_cui,
    r.cui1 AS ingredient_cui,
    MIN(r.rela) AS relation_name
FROM umls.mrrel r
WHERE r.rela IN ('form_of', 'has_free_acid_or_base_form', 'is_modification_of')
  AND r.cui1 <> r.cui2
GROUP BY r.cui2, r.cui1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chemical_ingredient_bridge_form_ingredient
    ON umls.chemical_ingredient_bridge (form_cui, ingredient_cui);

CREATE INDEX IF NOT EXISTS idx_chemical_ingredient_bridge_ingredient
    ON umls.chemical_ingredient_bridge (ingredient_cui);
