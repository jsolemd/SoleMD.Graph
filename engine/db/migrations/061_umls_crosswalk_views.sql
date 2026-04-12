-- ============================================================================
-- 061: UMLS crosswalk materialized views
--
-- Builds lookup surfaces on top of the umls.mrconso and umls.mrrel tables
-- (migrated from legacy Supabase container). These views enable pure-SQL
-- entity alias enrichment — no API calls, no caches, complete coverage.
--
-- Views:
--   umls.mesh_to_cui        — MeSH descriptor → UMLS CUI
--   umls.gene_to_cui        — NCBI Gene ID → UMLS CUI
--   umls.cui_aliases        — CUI → filtered English aliases with quality scores
--   umls.tradename_bridge   — ingredient CUI ↔ brand-name CUI (via MRREL)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. MeSH → CUI crosswalk (primary CUI only)
--    PubTator diseases/chemicals use MeSH descriptor IDs (e.g. D006220).
--    This view maps them to UMLS CUIs for alias resolution.
--
--    IMPORTANT: Uses tty = 'MH' (Main Heading) to select exactly one CUI per
--    MeSH descriptor.  Without this filter the view returns ~62K rows because
--    multiple CUIs reference the same descriptor via non-MH atoms, causing
--    alias pollution (clinically distinct concepts get merged).
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS umls.mesh_to_cui AS
SELECT DISTINCT ON (sdui)
    sdui AS mesh_id,
    cui
FROM umls.mrconso
WHERE sab = 'MSH'
  AND sdui LIKE 'D%'
  AND lat = 'ENG'
  AND suppress = 'N'
  AND tty = 'MH'
ORDER BY sdui, cui;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mesh_to_cui_mesh
    ON umls.mesh_to_cui (mesh_id);
CREATE INDEX IF NOT EXISTS idx_mesh_to_cui_cui
    ON umls.mesh_to_cui (cui);

-- ---------------------------------------------------------------------------
-- 2. Gene → CUI crosswalk (via HGNC approved symbols)
--    PubTator genes use NCBI Gene IDs (numeric, e.g. 3356 for HTR2A).
--    We match the PubTator canonical gene symbol against HGNC approved
--    symbols (tty='ACR') in UMLS.
--
--    WARNING: Do NOT use sab='NCBI' — that is NCBI Taxonomy (organisms),
--    not NCBI Gene.  Using it maps gene IDs to organism CUIs (e.g. p53
--    would get aliases like "mosquito").
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS umls.gene_to_cui AS
SELECT DISTINCT ON (e.concept_id)
    e.concept_id AS gene_id,
    h.cui
FROM solemd.entities e
JOIN umls.mrconso h ON lower(h.str) = lower(e.canonical_name)
    AND h.sab = 'HGNC'
    AND h.tty IN ('ACR', 'SYN')
    AND h.suppress = 'N'
    AND h.lat = 'ENG'
WHERE e.entity_type = 'gene'
ORDER BY e.concept_id,
    CASE h.tty WHEN 'ACR' THEN 0 ELSE 1 END,
    h.cui;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gene_to_cui_gene
    ON umls.gene_to_cui (gene_id);
CREATE INDEX IF NOT EXISTS idx_gene_to_cui_cui
    ON umls.gene_to_cui (cui);

-- ---------------------------------------------------------------------------
-- 3. CUI → aliases (filtered, quality-scored)
--    Useful English atoms from all UMLS sources, filtered by term type.
--    Quality scores reflect term-type reliability for highlighting.
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS umls.cui_aliases AS
SELECT
    cui,
    str AS alias_text,
    lower(str) AS alias_key,
    tty,
    sab,
    CASE tty
        WHEN 'PT' THEN 90   -- Preferred term
        WHEN 'MH' THEN 90   -- MeSH main heading
        WHEN 'BN' THEN 85   -- Brand name
        WHEN 'EP' THEN 80   -- Entry term (MeSH)
        WHEN 'PEP' THEN 80  -- Preferred entry term (MeSH)
        WHEN 'ET' THEN 80   -- Entry term
        WHEN 'SY' THEN 75   -- Synonym
        WHEN 'AA' THEN 70   -- Attribute type abbreviation
        WHEN 'AB' THEN 70   -- Abbreviation
        WHEN 'ACR' THEN 70  -- Acronym
        ELSE 60
    END AS quality_score
FROM umls.mrconso
WHERE lat = 'ENG'
  AND suppress = 'N'
  AND tty IN ('PT', 'MH', 'SY', 'BN', 'EP', 'PEP', 'ET', 'AA', 'AB', 'ACR')
  AND length(str) >= 2
  AND length(str) <= 200
  AND str !~ '^\d+$'
  AND NOT (str LIKE '[%]' AND str LIKE '%]');

CREATE INDEX IF NOT EXISTS idx_cui_aliases_cui
    ON umls.cui_aliases (cui);
CREATE INDEX IF NOT EXISTS idx_cui_aliases_key
    ON umls.cui_aliases (alias_key);

-- ---------------------------------------------------------------------------
-- 4. Brand name → ingredient CUI bridge (via MRREL tradename_of)
--    Enables "Haldol" (C0591585) → haloperidol (C0018546) resolution.
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS umls.tradename_bridge AS
SELECT DISTINCT
    r.cui1 AS ingredient_cui,
    r.cui2 AS tradename_cui
FROM umls.mrrel r
WHERE r.rela = 'tradename_of'
  AND r.rel IN ('RN', 'SY');

CREATE INDEX IF NOT EXISTS idx_tradename_ingredient
    ON umls.tradename_bridge (ingredient_cui);
CREATE INDEX IF NOT EXISTS idx_tradename_brand
    ON umls.tradename_bridge (tradename_cui);
