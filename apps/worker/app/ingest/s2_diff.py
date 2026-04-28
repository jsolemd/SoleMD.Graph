from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any
from uuid import UUID

import asyncpg

from app.config import Settings
from app.ingest.manifest_registry import SourceFamilySpec, family_specs_for_source
from app.ingest.models import IngestPlan
from app.ingest.s2_datasets_api import (
    S2DatasetDiffReport,
    SemanticScholarDatasetsClient,
)


S2_CURSOR_STATUS_BASE_LOADED = "base_loaded"
S2_CURSOR_STATUS_DIFF_PLANNED = "diff_planned"


@dataclass(frozen=True, slots=True)
class S2FamilyDiffPlan:
    family: str
    dataset: str
    diff_report: S2DatasetDiffReport

    def to_jsonable(self) -> dict[str, Any]:
        return {
            "family": self.family,
            "dataset": self.dataset,
            "diff_report": self.diff_report.to_jsonable(),
        }


@dataclass(frozen=True, slots=True)
class S2DiffPlanReport:
    start_release: str
    end_release: str
    families: tuple[S2FamilyDiffPlan, ...]

    def to_json(self) -> str:
        return json.dumps(
            {
                "start_release": self.start_release,
                "end_release": self.end_release,
                "families": [item.to_jsonable() for item in self.families],
            },
            indent=2,
            sort_keys=True,
        )


def plan_s2_diffs(
    runtime_settings: Settings,
    *,
    start_release: str,
    end_release: str,
    family_allowlist: tuple[str, ...] | None = None,
    client: SemanticScholarDatasetsClient | None = None,
) -> S2DiffPlanReport:
    allowed = set(family_allowlist or ())
    known_families = {spec.family for spec in family_specs_for_source("s2")}
    unknown_families = allowed - known_families
    if unknown_families:
        raise ValueError(f"unknown S2 families: {', '.join(sorted(unknown_families))}")
    specs = tuple(
        spec
        for spec in family_specs_for_source("s2")
        if (not allowed and spec.enabled_by_default) or spec.family in allowed
    )
    s2_client = client or SemanticScholarDatasetsClient.from_settings(runtime_settings)
    resolved_end_release = (
        s2_client.latest_release_id() if end_release == "latest" else end_release
    )
    if resolved_end_release == start_release:
        return S2DiffPlanReport(
            start_release=start_release,
            end_release=resolved_end_release,
            families=tuple(
                S2FamilyDiffPlan(
                    family=spec.family,
                    dataset=spec.datasets[0],
                    diff_report=S2DatasetDiffReport(
                        dataset=spec.datasets[0],
                        start_release=start_release,
                        end_release=resolved_end_release,
                        diffs=(),
                        api_url=s2_client.diff_url(
                            start_release_id=start_release,
                            end_release_id=resolved_end_release,
                            dataset_name=spec.datasets[0],
                        ),
                    ),
                )
                for spec in specs
            ),
        )
    family_plans = tuple(
        _plan_family_diff(
            s2_client,
            spec=spec,
            start_release=start_release,
            end_release=resolved_end_release,
        )
        for spec in specs
    )
    actual_end_release = family_plans[0].diff_report.end_release if family_plans else resolved_end_release
    mismatched_end_releases = {
        item.diff_report.end_release
        for item in family_plans
        if item.diff_report.end_release != actual_end_release
    }
    if mismatched_end_releases:
        raise ValueError(
            "S2 diff plan returned inconsistent end releases: "
            f"{', '.join(sorted({actual_end_release, *mismatched_end_releases}))}"
        )
    return S2DiffPlanReport(
        start_release=start_release,
        end_release=actual_end_release,
        families=family_plans,
    )


async def record_s2_diff_plan(
    connection: asyncpg.Connection,
    report: S2DiffPlanReport,
) -> None:
    async with connection.transaction():
        for family_plan in report.families:
            await _record_family_diff_plan(connection, family_plan)


async def mark_s2_family_base_loaded(
    connection: asyncpg.Connection,
    *,
    plan: IngestPlan,
    family_name: str,
    source_release_id: int,
) -> None:
    family_plan = next((item for item in plan.families if item.family == family_name), None)
    if family_plan is None:
        return
    for dataset in family_plan.source_datasets:
        await connection.execute(
            """
            INSERT INTO solemd.s2_dataset_cursors (
                dataset_name,
                family_name,
                base_release_key,
                current_release_key,
                current_source_release_id,
                cursor_status,
                diff_apply_enabled,
                hot_source_delete_safe_at,
                updated_at
            )
            VALUES ($1, $2, $3, $3, $4, $5, false, NULL, now())
            ON CONFLICT (dataset_name)
            DO UPDATE SET
                family_name = EXCLUDED.family_name,
                base_release_key = EXCLUDED.base_release_key,
                current_release_key = EXCLUDED.current_release_key,
                current_source_release_id = EXCLUDED.current_source_release_id,
                cursor_status = EXCLUDED.cursor_status,
                diff_apply_enabled = false,
                hot_source_delete_safe_at = NULL,
                updated_at = now()
            """,
            dataset,
            family_name,
            plan.release_tag,
            source_release_id,
            S2_CURSOR_STATUS_BASE_LOADED,
        )


def _plan_family_diff(
    client: SemanticScholarDatasetsClient,
    *,
    spec: SourceFamilySpec,
    start_release: str,
    end_release: str,
) -> S2FamilyDiffPlan:
    dataset = spec.datasets[0]
    diff_report = client.get_diffs(
        start_release_id=start_release,
        end_release_id=end_release,
        dataset_name=dataset,
    )
    return S2FamilyDiffPlan(
        family=spec.family,
        dataset=dataset,
        diff_report=diff_report,
    )


async def _record_family_diff_plan(
    connection: asyncpg.Connection,
    family_plan: S2FamilyDiffPlan,
) -> None:
    report = family_plan.diff_report
    if not report.diffs:
        status = await connection.execute(
            """
            UPDATE solemd.s2_dataset_cursors
            SET last_diff_checked_at = now(),
                last_diff_plan_checksum = $1,
                updated_at = now()
            WHERE dataset_name = $2
              AND current_release_key = $3
            """,
            report.payload_checksum,
            report.dataset,
            report.start_release,
        )
        if status.endswith(" 0"):
            raise RuntimeError(
                "cannot record S2 no-op diff plan without a matching base cursor for "
                f"{report.dataset}:{report.start_release}"
            )
        return
    for diff_ordinal, diff in enumerate(report.diffs):
        manifest_id = await connection.fetchval(
            """
            INSERT INTO solemd.s2_dataset_diff_manifests (
                dataset_name,
                family_name,
                start_release_key,
                end_release_key,
                from_release_key,
                to_release_key,
                diff_ordinal,
                update_file_count,
                delete_file_count,
                payload_checksum,
                api_url,
                fetched_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
            ON CONFLICT (
                dataset_name,
                start_release_key,
                end_release_key,
                diff_ordinal
            )
            DO UPDATE SET
                family_name = EXCLUDED.family_name,
                from_release_key = EXCLUDED.from_release_key,
                to_release_key = EXCLUDED.to_release_key,
                update_file_count = EXCLUDED.update_file_count,
                delete_file_count = EXCLUDED.delete_file_count,
                payload_checksum = EXCLUDED.payload_checksum,
                api_url = EXCLUDED.api_url,
                fetched_at = now()
            RETURNING s2_diff_manifest_id
            """,
            report.dataset,
            family_plan.family,
            report.start_release,
            report.end_release,
            diff.from_release,
            diff.to_release,
            diff_ordinal,
            len(diff.update_files),
            len(diff.delete_files),
            report.payload_checksum,
            report.api_url,
        )
        await _replace_diff_files(
            connection,
            manifest_id=manifest_id,
            operation="update",
            urls=diff.update_files,
        )
        await _replace_diff_files(
            connection,
            manifest_id=manifest_id,
            operation="delete",
            urls=diff.delete_files,
        )
    status = await connection.execute(
        """
        UPDATE solemd.s2_dataset_cursors
        SET cursor_status = $1,
            last_diff_checked_at = now(),
            last_diff_plan_checksum = $2,
            updated_at = now()
        WHERE dataset_name = $3
          AND current_release_key = $4
        """,
        S2_CURSOR_STATUS_DIFF_PLANNED,
        report.payload_checksum,
        report.dataset,
        report.start_release,
    )
    if status.endswith(" 0"):
        raise RuntimeError(
            "cannot record S2 diff plan without a matching base cursor for "
            f"{report.dataset}:{report.start_release}"
        )


async def _replace_diff_files(
    connection: asyncpg.Connection,
    *,
    manifest_id: UUID,
    operation: str,
    urls: tuple[str, ...],
) -> None:
    await connection.execute(
        """
        DELETE FROM solemd.s2_dataset_diff_files
        WHERE s2_diff_manifest_id = $1
          AND operation = $2
        """,
        manifest_id,
        operation,
    )
    if not urls:
        return
    await connection.execute(
        """
        INSERT INTO solemd.s2_dataset_diff_files (
            s2_diff_manifest_id,
            operation,
            file_ordinal,
            file_url
        )
        SELECT * FROM unnest($1::uuid[], $2::text[], $3::integer[], $4::text[])
        """,
        [manifest_id] * len(urls),
        [operation] * len(urls),
        list(range(len(urls))),
        list(urls),
    )
