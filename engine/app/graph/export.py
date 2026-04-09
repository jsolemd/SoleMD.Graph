"""Graph bundle delivery contract.

This module is intentionally small and declarative. It defines which artifacts
belong to the mandatory base bundle, which remain browser-local universe
artifacts, and which stay behind evidence fetch paths / APIs.

The `evidence` artifact set is a manifest-level contract only. It does not
authorize widening the live browser hot path or autoattaching evidence payloads
to the graph runtime.

The autoload rule is stricter than the artifact taxonomy:
- `base` is the only mandatory first-load set
- `universe` is browser-attachable on demand only
- `evidence` stays off the startup browser path
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import asdict, dataclass, field


@dataclass(frozen=True, slots=True)
class GraphBundleArtifactSet:
    base: tuple[str, ...] = (
        "base_points",
        "base_clusters",
    )
    universe: tuple[str, ...] = (
        "universe_points",
        "paper_documents",
        "cluster_exemplars",
    )
    # Evidence artifacts describe lazy/on-demand evidence-domain surfaces.
    # `universe_links` is the overlay-activation exception: browser-attachable
    # when needed, but still not a first-load hot-path artifact.
    evidence: tuple[str, ...] = (
        "universe_links",
        "citation_neighborhood",
        "pubtator_annotations",
        "pubtator_relations",
        "paper_assets",
        "full_text",
        "rag_chunks",
    )


@dataclass(frozen=True, slots=True)
class GraphBundleFileSet:
    base_points: str = "base_points.parquet"
    base_clusters: str = "base_clusters.parquet"
    universe_points: str = "universe_points.parquet"
    paper_documents: str = "paper_documents.parquet"
    cluster_exemplars: str = "cluster_exemplars.parquet"
    universe_links: str = "universe_links.parquet"
    manifest: str = "manifest.json"


@dataclass(frozen=True, slots=True)
class GraphBundleContract:
    artifact_sets: GraphBundleArtifactSet = field(default_factory=GraphBundleArtifactSet)
    files: GraphBundleFileSet = field(default_factory=GraphBundleFileSet)


def bundle_contract() -> dict[str, object]:
    return asdict(GraphBundleContract())


def expected_bundle_tables(bundle_profile: str) -> tuple[str, ...]:
    """Return the canonical table names for a bundle profile."""
    normalized = bundle_profile.strip().lower()
    if normalized == "base":
        return ("base_points", "base_clusters", "universe_points")
    if normalized == "full":
        return (
            "base_points",
            "base_clusters",
            "universe_points",
            "paper_documents",
            "cluster_exemplars",
            "universe_links",
        )
    raise ValueError(f"unsupported bundle profile: {bundle_profile}")


def validate_bundle_manifest_contract(
    manifest: Mapping[str, object],
    *,
    bundle_profile: str,
) -> None:
    """Raise if the exported bundle manifest drifts from the canonical contract."""
    manifest_profile = manifest.get("bundle_profile")
    if manifest_profile != bundle_profile:
        raise RuntimeError(
            "graph bundle manifest profile does not match the requested bundle profile"
        )

    contract = manifest.get("contract")
    expected_contract = bundle_contract()
    if contract != expected_contract:
        raise RuntimeError("graph bundle manifest contract does not match the canonical contract")

    tables = manifest.get("tables")
    if not isinstance(tables, Mapping):
        raise RuntimeError("graph bundle manifest tables must be a mapping")

    expected_tables = set(expected_bundle_tables(bundle_profile))
    actual_tables = set(str(name) for name in tables.keys())
    missing_tables = sorted(expected_tables - actual_tables)
    unexpected_tables = sorted(actual_tables - expected_tables)
    if missing_tables or unexpected_tables:
        raise RuntimeError(
            "graph bundle manifest tables do not match the canonical bundle profile: "
            f"missing={missing_tables}, unexpected={unexpected_tables}"
        )
