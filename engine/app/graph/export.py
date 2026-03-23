"""Bundle export contract for the first mapped graph."""

from __future__ import annotations

from dataclasses import asdict
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class GraphBundleContract:
    points: str = "corpus_points.parquet"
    links: str = "corpus_links.parquet"
    clusters: str = "corpus_clusters.parquet"
    documents: str = "corpus_documents.parquet"
    cluster_exemplars: str = "corpus_cluster_exemplars.parquet"
    geo_points: str = "geo_points.parquet"
    geo_links: str = "geo_links.parquet"
    geo_citation_links: str = "geo_citation_links.parquet"
    graph_author_geo: str = "graph_author_geo.parquet"
    manifest: str = "manifest.json"


def bundle_contract() -> dict[str, str]:
    return asdict(GraphBundleContract())
