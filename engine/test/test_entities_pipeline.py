from app.corpus import entities


def test_resolve_execution_plan_prefers_reusable_catalog_stage() -> None:
    plan = entities._resolve_execution_plan(
        from_step=None,
        resume=True,
        stage_state={
            "catalog_stage_ready": True,
            "aliases_stage_ready": False,
            "runtime_aliases_stage_ready": False,
            "presence_stage_ready": False,
        },
        checkpoint_metadata=None,
    )

    assert plan.stages == ("catalog", "aliases", "presence")
    assert plan.reuse_stages == frozenset({"catalog"})


def test_resolve_execution_plan_uses_checkpoint_remaining_stages() -> None:
    plan = entities._resolve_execution_plan(
        from_step=None,
        resume=True,
        stage_state={
            "catalog_stage_ready": False,
            "aliases_stage_ready": False,
            "runtime_aliases_stage_ready": False,
            "presence_stage_ready": False,
        },
        checkpoint_metadata={
            "checkpoint_version": entities.ENTITY_BUILD_CHECKPOINT_VERSION,
            "run_id": "resume-run",
            "remaining_stages": ["aliases", "presence"],
        },
    )

    assert plan.stages == ("aliases", "presence")
    assert plan.reuse_stages == frozenset()
    assert "resume-run" in plan.reason


def test_resolve_execution_plan_explicit_from_step_overrides_resume_inputs() -> None:
    plan = entities._resolve_execution_plan(
        from_step="presence",
        resume=True,
        stage_state={
            "catalog_stage_ready": True,
            "aliases_stage_ready": True,
            "runtime_aliases_stage_ready": True,
            "presence_stage_ready": True,
        },
        checkpoint_metadata={
            "checkpoint_version": entities.ENTITY_BUILD_CHECKPOINT_VERSION,
            "run_id": "stale-run",
            "remaining_stages": ["catalog", "aliases", "presence"],
        },
    )

    assert plan.stages == ("presence",)
    assert plan.reuse_stages == frozenset({"presence"})
    assert plan.reason == "explicit from-step=presence"
