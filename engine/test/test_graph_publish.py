from __future__ import annotations

from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.graph.build_publish import publish_existing_graph_run
from app.graph.export import bundle_contract, expected_bundle_tables


def _mock_db_connection() -> tuple[MagicMock, MagicMock]:
    conn = MagicMock()
    cur = MagicMock()
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False
    return conn, cur


def test_publish_existing_graph_run_validates_exported_bundle_contract(monkeypatch):
    conn, cur = _mock_db_connection()
    cur.fetchone.side_effect = [
        {
            "parameters": {
                "layout": {"backend": "cpu"},
                "clusters": {"backend": "cpu"},
            },
            "qa_summary": {},
        },
        {
            "point_count": 8,
            "noise_point_count": 1,
        },
        {
            "cluster_count": 3,
        },
    ]

    monkeypatch.setattr("app.graph.build_publish.db.pooled", lambda: nullcontext(conn))
    monkeypatch.setattr(
        "app.graph.build_publish.get_active_base_policy_version",
        lambda: "curated_base_v2",
    )
    monkeypatch.setattr(
        "app.graph.build_publish.materialize_base_admission",
        lambda graph_run_id: {"policy_version": "curated_base_v2"},
    )
    monkeypatch.setattr(
        "app.graph.build_publish.checkpoint_paths",
        lambda graph_run_id: SimpleNamespace(root=Path("/tmp/graph-run")),
    )

    manifest = {
        "bundle_profile": "base",
        "contract": bundle_contract(),
        "tables": {
            name: {"parquet_file": f"{name}.parquet"} for name in expected_bundle_tables("base")
        },
    }
    bundle = SimpleNamespace(
        bundle_dir="/tmp/bundle",
        bundle_checksum="checksum-abc",
        bundle_bytes=123,
        bundle_manifest=manifest,
    )

    validated: list[tuple[object, str]] = []

    monkeypatch.setattr(
        "app.graph.build_publish.export_graph_bundle",
        lambda **kwargs: bundle,
    )
    monkeypatch.setattr(
        "app.graph.build_publish.validate_bundle_manifest_contract",
        lambda manifest_arg, *, bundle_profile: validated.append((manifest_arg, bundle_profile)),
    )

    result = publish_existing_graph_run(
        graph_run_id="run-1",
        publish_current=False,
        skip_export=False,
    )

    assert validated == [(manifest, "base")]
    assert result.graph_run_id == "run-1"
    assert result.selected_papers == 8
    assert result.cluster_count == 3
    assert result.bundle_checksum == "checksum-abc"
