from __future__ import annotations

import pytest

from app.graph.export import (
    bundle_contract,
    expected_bundle_tables,
    validate_bundle_manifest_contract,
)


def test_expected_bundle_tables_match_canonical_profiles():
    assert expected_bundle_tables("base") == (
        "base_points",
        "base_clusters",
        "universe_points",
    )
    assert expected_bundle_tables("full") == (
        "base_points",
        "base_clusters",
        "universe_points",
        "paper_documents",
        "cluster_exemplars",
        "universe_links",
    )


def test_validate_bundle_manifest_contract_accepts_canonical_manifest():
    manifest = {
        "bundle_profile": "base",
        "contract": bundle_contract(),
        "tables": {
            name: {"parquet_file": f"{name}.parquet"} for name in expected_bundle_tables("base")
        },
    }

    validate_bundle_manifest_contract(manifest, bundle_profile="base")


def test_validate_bundle_manifest_contract_rejects_missing_tables():
    manifest = {
        "bundle_profile": "base",
        "contract": bundle_contract(),
        "tables": {
            "base_points": {"parquet_file": "base_points.parquet"},
        },
    }

    with pytest.raises(RuntimeError, match="missing=.*base_clusters"):
        validate_bundle_manifest_contract(manifest, bundle_profile="base")
