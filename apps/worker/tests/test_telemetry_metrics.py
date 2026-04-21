from __future__ import annotations

import asyncio

import pytest

from app.telemetry.metrics import (
    record_corpus_selection_materialized_rows,
    track_active_worker_run,
)
from telemetry_test_support import metric_sample_value


@pytest.mark.asyncio
async def test_active_run_tracker_exposes_and_clears_labels() -> None:
    labels = {
        "worker_scope": "ingest",
        "run_kind": "release_ingest",
        "run_label": "pt3:2026-03-21",
        "phase": "loading",
        "work_item": "biocxml",
        "source_code": "pt3",
        "release_tag": "2026-03-21",
        "selector_version": "",
        "wave_policy_key": "",
        "s2_release_tag": "",
        "pt3_release_tag": "",
    }
    progress_labels = {
        "worker_scope": "ingest",
        "run_kind": "release_ingest",
        "run_label": "pt3:2026-03-21",
        "progress_kind": "overall",
    }
    async with track_active_worker_run(
        worker_scope="ingest",
        run_kind="release_ingest",
        run_label="pt3:2026-03-21",
        source_code="pt3",
        release_tag="2026-03-21",
    ) as tracker:
        tracker.set_state(phase="loading", work_item="biocxml")
        tracker.set_progress(progress_kind="overall", completed_units=1, total_units=4)
        await asyncio.sleep(0.01)
        assert metric_sample_value("worker_active_run_info", labels) == 1
        assert metric_sample_value("worker_active_run_progress_ratio", progress_labels) == 0.25
        assert metric_sample_value(
            "worker_active_run_progress_units",
            {
                **progress_labels,
                "state": "completed",
            },
        ) == 1
    assert metric_sample_value("worker_active_run_info", labels) == 0
    assert metric_sample_value("worker_active_run_progress_ratio", progress_labels) == 0


@pytest.mark.asyncio
async def test_active_run_tracker_replaces_previous_phase_state() -> None:
    loading_labels = {
        "worker_scope": "ingest",
        "run_kind": "release_ingest",
        "run_label": "s2:2026-03-10",
        "phase": "loading",
        "work_item": "papers",
        "source_code": "s2",
        "release_tag": "2026-03-10",
        "selector_version": "",
        "wave_policy_key": "",
        "s2_release_tag": "",
        "pt3_release_tag": "",
    }
    indexing_labels = {
        "worker_scope": "ingest",
        "run_kind": "release_ingest",
        "run_label": "s2:2026-03-10",
        "phase": "indexing",
        "work_item": "",
        "source_code": "s2",
        "release_tag": "2026-03-10",
        "selector_version": "",
        "wave_policy_key": "",
        "s2_release_tag": "",
        "pt3_release_tag": "",
    }
    async with track_active_worker_run(
        worker_scope="ingest",
        run_kind="release_ingest",
        run_label="s2:2026-03-10",
        source_code="s2",
        release_tag="2026-03-10",
    ) as tracker:
        tracker.set_state(phase="loading", work_item="papers")
        assert metric_sample_value("worker_active_run_info", loading_labels) == 1
        tracker.set_state(phase="indexing")
        assert metric_sample_value("worker_active_run_info", loading_labels) == 0
        assert metric_sample_value("worker_active_run_info", indexing_labels) == 1


@pytest.mark.asyncio
async def test_active_run_tracker_clears_labels_when_body_raises() -> None:
    labels = {
        "worker_scope": "ingest",
        "run_kind": "release_ingest",
        "run_label": "s2:2026-04-21",
        "phase": "loading",
        "work_item": "citations",
        "source_code": "s2",
        "release_tag": "2026-04-21",
        "selector_version": "",
        "wave_policy_key": "",
        "s2_release_tag": "",
        "pt3_release_tag": "",
    }

    class SyntheticFailure(RuntimeError):
        pass

    with pytest.raises(SyntheticFailure):
        async with track_active_worker_run(
            worker_scope="ingest",
            run_kind="release_ingest",
            run_label="s2:2026-04-21",
            source_code="s2",
            release_tag="2026-04-21",
        ) as tracker:
            tracker.set_state(phase="loading", work_item="citations")
            assert metric_sample_value("worker_active_run_info", labels) == 1
            raise SyntheticFailure("boom")

    assert metric_sample_value("worker_active_run_info", labels) == 0


def test_corpus_selection_materialized_rows_counter_tracks_surface_labels() -> None:
    before_value = metric_sample_value(
        "corpus_selection_materialized_rows_total",
        {
            "selector_version": "selector-v1",
            "surface": "entity_annotations",
        },
    )
    record_corpus_selection_materialized_rows(
        selector_version="selector-v1",
        surface="entity_annotations",
        row_count=5,
    )
    assert metric_sample_value(
        "corpus_selection_materialized_rows_total",
        {
            "selector_version": "selector-v1",
            "surface": "entity_annotations",
        },
    ) == before_value + 5
