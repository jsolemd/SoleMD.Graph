SET ROLE engine_warehouse_admin;

ALTER TABLE solemd.pmc_fulltext_sections
    ADD COLUMN IF NOT EXISTS section_type TEXT,
    ADD COLUMN IF NOT EXISTS section_role_codes TEXT[] NOT NULL DEFAULT ARRAY['unknown']::TEXT[],
    ADD COLUMN IF NOT EXISTS section_role_confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.000,
    ADD COLUMN IF NOT EXISTS section_role_source TEXT NOT NULL DEFAULT 'unknown';

UPDATE solemd.pmc_fulltext_sections
SET section_role_codes = ARRAY[section_role]::TEXT[]
WHERE section_role_codes = ARRAY['unknown']::TEXT[]
  AND section_role <> 'unknown';

ALTER TABLE solemd.pmc_fulltext_sections
    DROP CONSTRAINT IF EXISTS ck_pmc_fulltext_sections_role,
    DROP CONSTRAINT IF EXISTS ck_pmc_fulltext_sections_role_codes,
    DROP CONSTRAINT IF EXISTS ck_pmc_fulltext_sections_role_confidence,
    DROP CONSTRAINT IF EXISTS ck_pmc_fulltext_sections_role_source;

ALTER TABLE solemd.pmc_fulltext_sections
    ADD CONSTRAINT ck_pmc_fulltext_sections_role
        CHECK (
            section_role IN (
                'unknown',
                'abstract',
                'introduction',
                'methods',
                'materials',
                'subjects_population',
                'results',
                'discussion',
                'conclusion',
                'limitations',
                'case_report',
                'data_availability',
                'ethics',
                'funding',
                'conflict_of_interest',
                'acknowledgments',
                'author_contributions',
                'supplement',
                'references',
                'other'
            )
        ),
    ADD CONSTRAINT ck_pmc_fulltext_sections_role_codes
        CHECK (
            cardinality(section_role_codes) >= 1
            AND section_role_codes <@ ARRAY[
                'unknown',
                'abstract',
                'introduction',
                'methods',
                'materials',
                'subjects_population',
                'results',
                'discussion',
                'conclusion',
                'limitations',
                'case_report',
                'data_availability',
                'ethics',
                'funding',
                'conflict_of_interest',
                'acknowledgments',
                'author_contributions',
                'supplement',
                'references',
                'other'
            ]::TEXT[]
        ),
    ADD CONSTRAINT ck_pmc_fulltext_sections_role_confidence
        CHECK (section_role_confidence >= 0.000 AND section_role_confidence <= 1.000),
    ADD CONSTRAINT ck_pmc_fulltext_sections_role_source
        CHECK (btrim(section_role_source) <> '');

COMMENT ON COLUMN solemd.pmc_fulltext_sections.section_type IS
    'Raw BioC/JATS section type label, when available; stored before SoleMD role normalization.';
COMMENT ON COLUMN solemd.pmc_fulltext_sections.section_role_codes IS
    'All normalized role candidates assigned to this section; compound sections preserve multiple roles.';
COMMENT ON COLUMN solemd.pmc_fulltext_sections.section_role_confidence IS
    'Deterministic section-role confidence from 0.000 to 1.000 based on exact section type, title, or parent propagation.';
COMMENT ON COLUMN solemd.pmc_fulltext_sections.section_role_source IS
    'Mapper evidence source such as section_type_exact, title_exact, title_phrase, section_type_and_title, parent_propagation, or unknown.';
COMMENT ON COLUMN solemd.pmc_fulltext_sections.source_type IS
    'Raw BioC passage type that introduced the section, such as title_1 or abstract_title_1.';

RESET ROLE;
