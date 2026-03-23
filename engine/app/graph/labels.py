"""Generate lightweight lexical cluster labels for graph bundles."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import re


TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9-]{2,}")
STOPWORDS = {
    "about",
    "after",
    "among",
    "analysis",
    "clinical",
    "disease",
    "during",
    "effects",
    "from",
    "into",
    "paper",
    "patients",
    "study",
    "studies",
    "syndrome",
    "system",
    "treatment",
    "using",
    "with",
}


@dataclass(frozen=True, slots=True)
class ClusterLabel:
    cluster_id: int
    label: str
    label_mode: str
    label_source: str


def _top_terms(texts: list[str], *, limit: int = 3) -> list[str]:
    counts: Counter[str] = Counter()
    for text in texts:
        for token in TOKEN_RE.findall(text.lower()):
            if token in STOPWORDS:
                continue
            counts[token] += 1
    return [term for term, _ in counts.most_common(limit)]


def build_cluster_labels(cluster_texts: dict[int, list[str]]) -> list[ClusterLabel]:
    labels: list[ClusterLabel] = []
    for cluster_id, texts in sorted(cluster_texts.items()):
        if cluster_id == 0:
            labels.append(
                ClusterLabel(
                    cluster_id=cluster_id,
                    label="Noise",
                    label_mode="fixed",
                    label_source="system",
                )
            )
            continue

        top_terms = _top_terms(texts)
        label = " / ".join(term.title() for term in top_terms) if top_terms else f"Cluster {cluster_id}"
        labels.append(
            ClusterLabel(
                cluster_id=cluster_id,
                label=label,
                label_mode="lexical",
                label_source="title_terms",
            )
        )
    return labels
