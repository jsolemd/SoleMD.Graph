BEGIN;

SET ROLE engine_warehouse_admin;

ALTER TABLE solemd.corpus_wave_members
    ALTER COLUMN actor_name SET DEFAULT 'evidence.acquire_for_paper';

UPDATE solemd.corpus_wave_members
SET actor_name = 'evidence.acquire_for_paper'
WHERE actor_name = 'hot_text.acquire_for_paper';

COMMENT ON COLUMN solemd.corpus_wave_members.actor_name IS
    'Downstream actor target for the wave member; initial slice dispatches to evidence.acquire_for_paper.';

RESET ROLE;

COMMIT;
