"""Graph bundle delivery contract.

This module is intentionally small and declarative. It defines which artifacts
belong to the mandatory hot bundle, which are optional browser-local warm
artifacts, and which must remain cold behind fetch paths / APIs.
"""

from __future__ import annotations

from dataclasses import asdict
from dataclasses import dataclass
from dataclasses import field


@dataclass(frozen=True, slots=True)
class GraphBundleArtifactSet:
    hot: tuple[str, ...] = (
        "corpus_points",
        "corpus_clusters",
    )
    warm: tuple[str, ...] = (
        "corpus_documents",
        "corpus_cluster_exemplars",
    )
    cold: tuple[str, ...] = (
        "corpus_links",
        "citation_neighborhood",
        "pubtator_annotations",
        "pubtator_relations",
        "paper_assets",
        "full_text",
        "rag_chunks",
    )


@dataclass(frozen=True, slots=True)
class GraphBundleFileSet:
    corpus_points: str = "corpus_points.parquet"
    corpus_clusters: str = "corpus_clusters.parquet"
    corpus_documents: str = "corpus_documents.parquet"
    corpus_cluster_exemplars: str = "corpus_cluster_exemplars.parquet"
    corpus_links: str = "corpus_links.parquet"
    manifest: str = "manifest.json"


@dataclass(frozen=True, slots=True)
class GraphBundleContract:
    artifact_sets: GraphBundleArtifactSet = field(default_factory=GraphBundleArtifactSet)
    files: GraphBundleFileSet = field(default_factory=GraphBundleFileSet)


def bundle_contract() -> dict[str, object]:
    return asdict(GraphBundleContract())
