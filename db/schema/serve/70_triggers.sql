SET ROLE engine_admin;

DROP TRIGGER IF EXISTS trg_freeze_published_serving_run
    ON solemd.serving_runs;
CREATE TRIGGER trg_freeze_published_serving_run
    BEFORE UPDATE ON solemd.serving_runs
    FOR EACH ROW
    EXECUTE FUNCTION solemd.freeze_published_serving_run();

DROP TRIGGER IF EXISTS trg_validate_active_runtime_pointer
    ON solemd.active_runtime_pointer;
CREATE TRIGGER trg_validate_active_runtime_pointer
    BEFORE INSERT OR UPDATE ON solemd.active_runtime_pointer
    FOR EACH ROW
    EXECUTE FUNCTION solemd.validate_active_runtime_pointer();

RESET ROLE;
