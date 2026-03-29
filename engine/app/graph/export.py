"""Graph bundle delivery contract.

This module is intentionally small and declarative. It defines which artifacts
belong to the mandatory base bundle, which remain browser-local universe
artifacts, and which stay behind evidence fetch paths / APIs.
"""

from __future__ import annotations

from dataclasses import asdict
from dataclasses import dataclass
from dataclasses import field


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
