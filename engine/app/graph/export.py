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
