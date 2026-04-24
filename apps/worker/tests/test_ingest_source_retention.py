from __future__ import annotations

from pathlib import Path

from app.config import settings
from app.ingest.manifest_registry import release_manifest_checksum
from app.ingest.runtime import (
    INGEST_STATUS_ABORTED,
    INGEST_STATUS_LOADING,
    INGEST_STATUS_PUBLISHED,
)
from app.ingest.source_retention import (
    SourceRetentionRunState,
    apply_source_retention_report,
    build_source_retention_report,
)
from helpers import write_jsonl_gz, write_manifest


def test_s2_retention_keeps_unloaded_citations_and_marks_optional_source_deleteable(tmp_path: Path) -> None:
    release_dir = _write_s2_release(tmp_path)
    run_state = _run_state(
        release_dir,
        release_status="ingesting",
        ingest_status=INGEST_STATUS_ABORTED,
        families_loaded=("publication_venues", "authors", "papers", "abstracts"),
    )
    report = build_source_retention_report(
        _settings_for(tmp_path),
        source_code="s2",
        release_tag="2026-03-10",
        run_state=run_state,
        dry_run=True,
    )
    items = {item.dataset: item for item in report.items}

    assert not report.execution_blocked
    assert items["citations"].action == "keep"
    assert not items["citations"].safe_to_delete
    assert items["papers"].action == "archive_candidate"
    assert items["papers"].safe_to_archive
    assert not items["papers"].safe_to_delete
    assert items["s2orc_v2"].action == "delete_candidate"
    assert items["s2orc_v2"].safe_to_delete
    assert items["tldrs"].action == "delete_candidate"
    assert items["manifests"].action == "keep"
    assert items["paper-ids"].action == "manual_review"


def test_s2_retention_delete_applies_only_delete_safe_candidates(tmp_path: Path) -> None:
    release_dir = _write_s2_release(tmp_path)
    run_state = _run_state(
        release_dir,
        release_status="ingesting",
        ingest_status=INGEST_STATUS_ABORTED,
        families_loaded=("publication_venues", "authors", "papers", "abstracts"),
    )
    report = build_source_retention_report(
        _settings_for(tmp_path),
        source_code="s2",
        release_tag="2026-03-10",
        run_state=run_state,
        dry_run=False,
    )

    changed = apply_source_retention_report(
        report,
        action="delete",
        provenance_ok=True,
    )

    assert str(release_dir / "s2orc_v2") in changed
    assert str(release_dir / "tldrs") in changed
    assert not (release_dir / "s2orc_v2").exists()
    assert not (release_dir / "tldrs").exists()
    assert (release_dir / "papers").exists()
    assert (release_dir / "abstracts").exists()
    assert (release_dir / "citations").exists()
    assert (release_dir / "manifests").exists()


def test_s2_retention_blocks_active_runs(tmp_path: Path) -> None:
    release_dir = _write_s2_release(tmp_path)
    run_state = _run_state(
        release_dir,
        release_status="ingesting",
        ingest_status=INGEST_STATUS_LOADING,
        families_loaded=("publication_venues",),
        has_active_run=True,
    )

    report = build_source_retention_report(
        _settings_for(tmp_path),
        source_code="s2",
        release_tag="2026-03-10",
        run_state=run_state,
        dry_run=True,
    )

    assert report.execution_blocked
    assert "release has an active ingest run or pending requested_status" in report.blockers
    assert {item.action for item in report.items} == {"blocked"}


def test_s2_retention_allows_loaded_family_delete_after_release_published(tmp_path: Path) -> None:
    release_dir = _write_s2_release(tmp_path)
    run_state = _run_state(
        release_dir,
        release_status="loaded",
        ingest_status=INGEST_STATUS_PUBLISHED,
        families_loaded=("publication_venues", "authors", "papers", "abstracts", "citations"),
    )

    report = build_source_retention_report(
        _settings_for(tmp_path),
        source_code="s2",
        release_tag="2026-03-10",
        run_state=run_state,
        dry_run=True,
    )
    items = {item.dataset: item for item in report.items}

    assert items["papers"].action == "archive_candidate"
    assert items["papers"].safe_to_delete
    assert items["citations"].safe_to_delete


def _settings_for(tmp_path: Path):
    return settings.model_copy(
        update={
            "semantic_scholar_dir": str(tmp_path / "semantic-scholar"),
            "warehouse_dsn_ingest": "postgresql://unused/warehouse",
        }
    )


def _run_state(
    release_dir: Path,
    *,
    release_status: str,
    ingest_status: int,
    families_loaded: tuple[str, ...],
    has_active_run: bool = False,
) -> SourceRetentionRunState:
    return SourceRetentionRunState(
        source_release_id=1,
        release_status=release_status,
        manifest_checksum=release_manifest_checksum(release_dir),
        ingest_run_id="019dbd7f-0000-7000-8000-000000000001",
        ingest_status=ingest_status,
        requested_status=None,
        families_loaded=families_loaded,
        has_active_run=has_active_run,
    )


def _write_s2_release(tmp_path: Path) -> Path:
    release_tag = "2026-03-10"
    release_dir = tmp_path / "semantic-scholar" / "releases" / release_tag
    datasets = (
        "publication-venues",
        "authors",
        "papers",
        "abstracts",
        "tldrs",
        "citations",
        "s2orc_v2",
    )
    for dataset in datasets:
        dataset_dir = release_dir / dataset
        file_path = dataset_dir / f"{dataset}-0000.jsonl.gz"
        write_jsonl_gz(file_path, [{"id": dataset}])
        write_manifest(
            release_dir / "manifests" / f"{dataset}.manifest.json",
            dataset=dataset,
            release_tag=release_tag,
            output_dir=dataset_dir,
            file_names=[file_path.name],
        )
    paper_ids_dir = release_dir / "paper-ids"
    paper_ids_dir.mkdir(parents=True)
    (paper_ids_dir / "paper-ids-0000.txt").write_text("1\n")
    return release_dir
