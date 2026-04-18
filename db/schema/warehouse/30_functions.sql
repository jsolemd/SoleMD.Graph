SET ROLE engine_warehouse_admin;

CREATE OR REPLACE FUNCTION solemd.normalize_lookup_key(input_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
    SELECT NULLIF(
        regexp_replace(lower(btrim(input_text)), '[[:space:]]+', ' ', 'g'),
        ''
    );
$$;

RESET ROLE;

REVOKE ALL ON FUNCTION solemd.normalize_lookup_key(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION solemd.normalize_lookup_key(TEXT) TO engine_warehouse_admin;
GRANT EXECUTE ON FUNCTION solemd.normalize_lookup_key(TEXT) TO engine_ingest_write;
GRANT EXECUTE ON FUNCTION solemd.normalize_lookup_key(TEXT) TO engine_warehouse_read;
GRANT EXECUTE ON FUNCTION solemd.normalize_lookup_key(TEXT) TO warehouse_grounding_reader;
