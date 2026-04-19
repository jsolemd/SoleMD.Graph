SET ROLE engine_warehouse_admin;

ALTER TABLE solemd.s2_paper_references_raw
    ADD COLUMN IF NOT EXISTS reference_checksum TEXT;

UPDATE solemd.s2_paper_references_raw
SET reference_checksum = encode(
        digest(
            concat_ws(
                E'\\x1f',
                citing_paper_id,
                coalesce(cited_paper_id, ''),
                is_influential::text,
                coalesce(intent_raw, '')
            ),
            'sha256'
        ),
        'hex'
    )
WHERE reference_checksum IS NULL;

DELETE FROM solemd.s2_paper_references_raw duplicates
USING (
    SELECT
        ctid,
        row_number() OVER (
            PARTITION BY source_release_id, reference_checksum
            ORDER BY ctid
        ) AS duplicate_rank
    FROM solemd.s2_paper_references_raw
) ranked
WHERE duplicates.ctid = ranked.ctid
  AND ranked.duplicate_rank > 1;

ALTER TABLE solemd.s2_paper_references_raw
    DROP CONSTRAINT IF EXISTS s2_paper_references_raw_pkey;

ALTER TABLE solemd.s2_paper_references_raw
    ALTER COLUMN cited_paper_id DROP NOT NULL,
    ALTER COLUMN reference_checksum SET NOT NULL;

ALTER TABLE solemd.s2_paper_references_raw
    ADD CONSTRAINT s2_paper_references_raw_pkey
        PRIMARY KEY (source_release_id, reference_checksum);

GRANT DELETE ON TABLE solemd.s2_papers_raw TO engine_ingest_write;

RESET ROLE;
