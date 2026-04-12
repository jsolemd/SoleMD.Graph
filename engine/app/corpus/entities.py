"""Aggregate PubTator entities into solemd.entities and rebuild serving projections.

Builds the canonical entity lookup table by:
1. Grouping entity annotations by (entity_type, concept_id)
2. Picking the most-frequent mention form as canonical_name
3. Collecting all unique mention forms as synonyms
4. Counting distinct PMIDs as paper_count
5. Overriding canonical_name with hand-curated entity_rule values
6. Normalizing safe chemical salt/form entities onto curated clinical ingredients
7. Seeding vocab-only anatomy/network entities
8. Refreshing the broad query alias projection, the runtime alias subset, and
   the entity-to-corpus serving projection

Usage:
    cd /workspaces/SoleMD.Graph/engine
    uv run python -m app.corpus.entities
    uv run python -m app.corpus.entities --dry-run
"""

from __future__ import annotations

import argparse
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Literal
from uuid import uuid4

from app import db
from app.corpus._etl import log_etl_run
from app.corpus.entity_build_checkpoint import (
    CHECKPOINT_VERSION as ENTITY_BUILD_CHECKPOINT_VERSION,
)
from app.corpus.entity_build_checkpoint import (
    checkpoint_paths as entity_build_checkpoint_paths,
)
from app.corpus.entity_build_checkpoint import (
    load_checkpoint_state,
    reset_checkpoint_state,
    update_checkpoint_state,
)
from app.corpus.entity_projections import (
    build_entity_aliases_table,
    build_entity_catalog_table,
    build_entity_corpus_presence_table,
    build_entity_runtime_aliases_table,
    get_entity_projection_stage_state,
)

logger = logging.getLogger(__name__)

_DRY_RUN_SQL = """
SELECT
    entity_type,
    COUNT(DISTINCT concept_id) AS concept_count,
    COUNT(DISTINCT pmid) AS paper_count
FROM pubtator.entity_annotations
WHERE concept_id != ''
GROUP BY entity_type
ORDER BY concept_count DESC
"""

ENTITY_PIPELINE_OPERATION = "build_entities"
ENTITY_PIPELINE_SOURCE = "pubtator.entity_annotations + solemd.vocab_terms"
ENTITY_PIPELINE_STAGES = ("catalog", "aliases", "presence")
EntityPipelineStage = Literal["catalog", "aliases", "presence"]


@dataclass(frozen=True, slots=True)
class EntityPipelineExecutionPlan:
    stages: tuple[EntityPipelineStage, ...]
    reuse_stages: frozenset[EntityPipelineStage]
    reason: str


def _stages_from(start_stage: EntityPipelineStage) -> tuple[EntityPipelineStage, ...]:
    start_index = ENTITY_PIPELINE_STAGES.index(start_stage)
    return ENTITY_PIPELINE_STAGES[start_index:]


def _stage_state_key(stage: EntityPipelineStage) -> str:
    return {
        "catalog": "catalog_stage_ready",
        "aliases": "aliases_stage_ready",
        "presence": "presence_stage_ready",
    }[stage]


def _reuse_stages_for(
    stages: tuple[EntityPipelineStage, ...],
    stage_state: dict[str, bool],
) -> frozenset[EntityPipelineStage]:
    return frozenset(
        stage for stage in stages if stage_state.get(_stage_state_key(stage), False)
    )


def _resolve_execution_plan(
    *,
    from_step: EntityPipelineStage | None,
    resume: bool,
    stage_state: dict[str, bool],
    checkpoint_metadata: dict | None,
) -> EntityPipelineExecutionPlan:
    if from_step is not None:
        stages = _stages_from(from_step)
        return EntityPipelineExecutionPlan(
            stages=stages,
            reuse_stages=_reuse_stages_for(stages, stage_state),
            reason=f"explicit from-step={from_step}",
        )

    if resume:
        if stage_state["catalog_stage_ready"]:
            stages = _stages_from("catalog")
            return EntityPipelineExecutionPlan(
                stages=stages,
                reuse_stages=_reuse_stages_for(stages, stage_state),
                reason="reusing staged canonical entity catalog",
            )
        if stage_state["aliases_stage_ready"]:
            stages = _stages_from("aliases")
            return EntityPipelineExecutionPlan(
                stages=stages,
                reuse_stages=_reuse_stages_for(stages, stage_state),
                reason="reusing staged entity alias projections",
            )
        if stage_state["presence_stage_ready"]:
            stages = _stages_from("presence")
            return EntityPipelineExecutionPlan(
                stages=stages,
                reuse_stages=_reuse_stages_for(stages, stage_state),
                reason="reusing staged entity-to-corpus projection",
            )
        if checkpoint_metadata is not None:
            remaining_stages = tuple(
                stage
                for stage in checkpoint_metadata.get("remaining_stages", [])
                if stage in ENTITY_PIPELINE_STAGES
            )
            if remaining_stages:
                return EntityPipelineExecutionPlan(
                    stages=remaining_stages,
                    reuse_stages=_reuse_stages_for(remaining_stages, stage_state),
                    reason=(
                        "resuming from entity build checkpoint for run "
                        f"{checkpoint_metadata.get('run_id', 'unknown')}"
                    ),
                )

    return EntityPipelineExecutionPlan(
        stages=ENTITY_PIPELINE_STAGES,
        reuse_stages=frozenset(),
        reason="fresh rebuild",
    )


def _stage_rows_processed(result: dict) -> int:
    for key in ("inserted", "upserted"):
        if key in result:
            return int(result[key])
    return 0


def _stage_rows_loaded(result: dict) -> int:
    for key in (
        "total_entities",
        "total_aliases",
        "total_runtime_aliases",
        "total_entity_corpus_presence",
    ):
        if key in result:
            return int(result[key])
    return 0


def _log_pipeline_state(
    *,
    checkpoint,
    run_id: str,
    status: str,
    completed_stages: list[EntityPipelineStage],
    remaining_stages: list[EntityPipelineStage],
    plan: EntityPipelineExecutionPlan,
    stage: EntityPipelineStage | None = None,
    stage_result: dict | None = None,
    error_message: str | None = None,
    parallel_post_catalog: bool = False,
) -> None:
    rows_processed = _stage_rows_processed(stage_result or {})
    rows_loaded = _stage_rows_loaded(stage_result or {})
    metadata: dict[str, object] = {
        "checkpoint_version": ENTITY_BUILD_CHECKPOINT_VERSION,
        "run_id": run_id,
        "status": status,
        "current_stage": stage,
        "completed_stages": completed_stages,
        "remaining_stages": remaining_stages,
        "reused_stages": sorted(plan.reuse_stages),
        "plan_reason": plan.reason,
        "parallel_post_catalog": parallel_post_catalog,
    }
    if stage_result is not None:
        metadata["stage_result"] = stage_result
    if error_message is not None:
        metadata["error_message"] = error_message
    update_checkpoint_state(checkpoint, payload=metadata)
    with db.connect() as conn:
        log_etl_run(
            conn,
            operation=ENTITY_PIPELINE_OPERATION,
            source=ENTITY_PIPELINE_SOURCE,
            rows_processed=rows_processed,
            rows_loaded=rows_loaded,
            status=status,
            metadata=metadata,
        )


def _run_pipeline_stage(stage: EntityPipelineStage, *, reuse_stage: bool) -> dict:
    if stage == "catalog":
        return build_entity_catalog_table(log_history=True, reuse_stage=reuse_stage)
    if stage == "aliases":
        return build_entity_aliases_table(log_history=True, reuse_stage=reuse_stage)
    if stage == "presence":
        return build_entity_corpus_presence_table(log_history=True, reuse_stage=reuse_stage)
    raise ValueError(f"unknown entity pipeline stage: {stage}")


def build_entities_table(
    *,
    dry_run: bool = False,
    from_step: EntityPipelineStage | None = None,
    resume: bool = False,
    parallel_post_catalog: bool = False,
) -> dict:
    """Aggregate PubTator entities and refresh all entity-serving projections."""

    t_start = time.monotonic()

    if dry_run:
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute(_DRY_RUN_SQL)
            rows = cur.fetchall()
        total_concepts = sum(r["concept_count"] for r in rows)
        entity_corpus_presence_result = build_entity_corpus_presence_table(
            dry_run=True,
            log_history=False,
        )
        logger.info("Dry run — entity type breakdown:")
        for row in rows:
            logger.info(
                "  %-12s  %7d concepts  %9d papers",
                row["entity_type"],
                row["concept_count"],
                row["paper_count"],
            )
        logger.info("  Total: %d distinct concepts", total_concepts)
        logger.info(
            "  Projected entity-to-corpus rows: %d",
            entity_corpus_presence_result["total_entity_corpus_presence"],
        )
        return {
            "dry_run": True,
            "total_concepts": total_concepts,
            "total_entity_corpus_presence": entity_corpus_presence_result[
                "total_entity_corpus_presence"
            ],
            "by_type": rows,
        }

    checkpoint = entity_build_checkpoint_paths()
    checkpoint_metadata = load_checkpoint_state(checkpoint) if resume else None
    run_id = (
        checkpoint_metadata.get("run_id", str(uuid4()))
        if checkpoint_metadata
        else str(uuid4())
    )
    stage_state = get_entity_projection_stage_state() if resume or from_step else {
        "catalog_stage_ready": False,
        "aliases_stage_ready": False,
        "runtime_aliases_stage_ready": False,
        "presence_stage_ready": False,
    }
    plan = _resolve_execution_plan(
        from_step=from_step,
        resume=resume,
        stage_state=stage_state,
        checkpoint_metadata=checkpoint_metadata,
    )
    if not resume or from_step is not None:
        reset_checkpoint_state(checkpoint)
    update_checkpoint_state(
        checkpoint,
        payload={
            "checkpoint_version": ENTITY_BUILD_CHECKPOINT_VERSION,
            "run_id": run_id,
            "status": "running",
            "current_stage": None,
            "completed_stages": [],
            "remaining_stages": list(plan.stages),
            "reused_stages": sorted(plan.reuse_stages),
            "plan_reason": plan.reason,
            "parallel_post_catalog": parallel_post_catalog,
        },
    )

    logger.info(
        "Rebuilding entity-serving projections with plan %s (%s)%s",
        " -> ".join(plan.stages),
        plan.reason,
        " using parallel post-catalog execution" if parallel_post_catalog else "",
    )

    completed_stages: list[EntityPipelineStage] = []
    stage_results: dict[EntityPipelineStage, dict] = {}

    try:
        if "catalog" in plan.stages:
            entity_result = _run_pipeline_stage(
                "catalog",
                reuse_stage="catalog" in plan.reuse_stages,
            )
            stage_results["catalog"] = entity_result
            completed_stages.append("catalog")
            _log_pipeline_state(
                checkpoint=checkpoint,
                run_id=run_id,
                status="checkpoint",
                stage="catalog",
                stage_result=entity_result,
                completed_stages=completed_stages.copy(),
                remaining_stages=[stage for stage in plan.stages if stage not in completed_stages],
                plan=plan,
                parallel_post_catalog=parallel_post_catalog,
            )

        post_catalog_stages = tuple(
            stage for stage in plan.stages if stage in {"aliases", "presence"}
        )
        if parallel_post_catalog and len(post_catalog_stages) == 2:
            parallel_errors: dict[EntityPipelineStage, Exception] = {}
            with ThreadPoolExecutor(
                max_workers=2,
                thread_name_prefix="entity-projection",
            ) as executor:
                future_to_stage = {
                    executor.submit(
                        _run_pipeline_stage,
                        stage,
                        reuse_stage=stage in plan.reuse_stages,
                    ): stage
                    for stage in post_catalog_stages
                }
                for future in as_completed(future_to_stage):
                    stage = future_to_stage[future]
                    try:
                        result = future.result()
                    except Exception as exc:  # pragma: no cover - exercised via outer pipeline flow
                        parallel_errors[stage] = exc
                        continue
                    stage_results[stage] = result
                    completed_stages.append(stage)
                    _log_pipeline_state(
                        checkpoint=checkpoint,
                        run_id=run_id,
                        status="checkpoint",
                        stage=stage,
                        stage_result=result,
                        completed_stages=completed_stages.copy(),
                        remaining_stages=[
                            candidate
                            for candidate in plan.stages
                            if candidate not in completed_stages
                        ],
                        plan=plan,
                        parallel_post_catalog=parallel_post_catalog,
                    )
            if parallel_errors:
                failed_stage = next(iter(parallel_errors))
                raise parallel_errors[failed_stage]
        else:
            for stage in post_catalog_stages:
                result = _run_pipeline_stage(
                    stage,
                    reuse_stage=stage in plan.reuse_stages,
                )
                stage_results[stage] = result
                completed_stages.append(stage)
                _log_pipeline_state(
                    checkpoint=checkpoint,
                    run_id=run_id,
                    status="checkpoint",
                    stage=stage,
                    stage_result=result,
                    completed_stages=completed_stages.copy(),
                    remaining_stages=[
                        candidate for candidate in plan.stages if candidate not in completed_stages
                    ],
                    plan=plan,
                    parallel_post_catalog=parallel_post_catalog,
                )
    except Exception as exc:
        current_stage = next(
            (stage for stage in plan.stages if stage not in completed_stages),
            None,
        )
        _log_pipeline_state(
            checkpoint=checkpoint,
            run_id=run_id,
            status="failed",
            stage=current_stage,
            completed_stages=completed_stages.copy(),
            remaining_stages=[
                candidate for candidate in plan.stages if candidate not in completed_stages
            ],
            plan=plan,
            error_message=str(exc),
            parallel_post_catalog=parallel_post_catalog,
        )
        raise

    entity_result = stage_results.get("catalog", {})
    alias_result = stage_results.get("aliases", {})
    entity_corpus_presence_result = stage_results.get("presence", {})
    upserted = entity_result.get("inserted", 0)
    total = entity_result.get("total_entities", 0)
    reconciled = None
    vocab_seeded = None

    _log_pipeline_state(
        checkpoint=checkpoint,
        run_id=run_id,
        status="completed",
        stage=None,
        completed_stages=completed_stages.copy(),
        remaining_stages=[],
        plan=plan,
        stage_result={
            "upserted": upserted,
            "reconciled_from_entity_rule": reconciled,
            "vocab_seeded": vocab_seeded,
            "staged_rebuild": True,
            "total_entities": total,
            "entity_aliases_inserted": alias_result.get("inserted", 0),
            "total_entity_aliases": alias_result.get("total_aliases", 0),
            "entity_runtime_aliases_inserted": alias_result.get(
                "runtime_aliases_inserted",
                0,
            ),
            "total_entity_runtime_aliases": alias_result.get(
                "total_runtime_aliases",
                0,
            ),
            "entity_corpus_presence_inserted": entity_corpus_presence_result.get(
                "inserted",
                0,
            ),
            "total_entity_corpus_presence": entity_corpus_presence_result.get(
                "total_entity_corpus_presence",
                0,
            ),
        },
        parallel_post_catalog=parallel_post_catalog,
    )

    elapsed = time.monotonic() - t_start
    logger.info("=" * 60)
    logger.info(
        "Entity aggregation complete: %d entities in %.1fs (%.1f min)",
        total,
        elapsed,
        elapsed / 60,
    )
    logger.info("=" * 60)
    return {
        "upserted": upserted,
        "reconciled_from_entity_rule": reconciled,
        "vocab_seeded": vocab_seeded,
        "total_entities": total,
        "entity_aliases_inserted": alias_result.get("inserted", 0),
        "total_entity_aliases": alias_result.get("total_aliases", 0),
        "entity_runtime_aliases_inserted": alias_result.get(
            "runtime_aliases_inserted",
            0,
        ),
        "total_entity_runtime_aliases": alias_result.get("total_runtime_aliases", 0),
        "entity_corpus_presence_inserted": entity_corpus_presence_result.get(
            "inserted",
            0,
        ),
        "total_entity_corpus_presence": entity_corpus_presence_result.get(
            "total_entity_corpus_presence",
            0,
        ),
        "pipeline_run_id": run_id,
        "reused_stages": sorted(plan.reuse_stages),
        "plan_reason": plan.reason,
        "elapsed_seconds": round(elapsed, 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Aggregate PubTator entities into solemd.entities",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report counts only")
    parser.add_argument(
        "--aliases-only",
        action="store_true",
        help=(
            "Refresh the broad exact-query alias projection plus the runtime "
            "alias subset from solemd.entities"
        ),
    )
    parser.add_argument(
        "--presence-only",
        action="store_true",
        help="Refresh only the derived entity-to-corpus serving projection",
    )
    parser.add_argument(
        "--catalog-only",
        action="store_true",
        help="Refresh only the canonical entity catalog projection",
    )
    parser.add_argument(
        "--runtime-aliases-only",
        action="store_true",
        help="Refresh only the hot-path runtime entity alias serving table",
    )
    parser.add_argument(
        "--from-step",
        choices=ENTITY_PIPELINE_STAGES,
        help="Start the full entity rebuild at a specific stage: catalog, aliases, or presence.",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help=(
            "Resume from the latest reusable staged projection or the last "
            "entity-build checkpoint file."
        ),
    )
    parser.add_argument(
        "--parallel-post-catalog",
        action="store_true",
        help=(
            "Run the aliases/runtime-aliases projection rebuild and the "
            "entity-to-corpus projection rebuild in parallel after catalog completion."
        ),
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    if args.aliases_only:
        build_entity_aliases_table(
            dry_run=args.dry_run,
            reuse_stage=args.resume,
        )
        return

    if args.presence_only:
        build_entity_corpus_presence_table(
            dry_run=args.dry_run,
            reuse_stage=args.resume,
        )
        return

    if args.catalog_only:
        build_entity_catalog_table(
            dry_run=args.dry_run,
            reuse_stage=args.resume,
        )
        return

    if args.runtime_aliases_only:
        build_entity_runtime_aliases_table(
            dry_run=args.dry_run,
            reuse_stage=args.resume,
        )
        return

    build_entities_table(
        dry_run=args.dry_run,
        from_step=args.from_step,
        resume=args.resume,
        parallel_post_catalog=args.parallel_post_catalog,
    )


if __name__ == "__main__":
    main()
