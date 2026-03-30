"""LLM-powered cluster labeling and hierarchical grouping.

Uses Gemini 2.5 Flash to generate clinical/scientific labels for graph
clusters, replacing or augmenting the c-TF-IDF keyword labels with
human-readable names and short descriptions.

Hierarchy is built via Ward linkage on cluster centroids, cutting the
dendrogram to produce 15-25 parent groups, each labeled by a second
Gemini pass over its children.
"""

from __future__ import annotations

import json
import logging
import time
from collections import defaultdict
from dataclasses import dataclass

from google import genai
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable
from langfuse import get_client, observe
from openinference.instrumentation.google_genai import GoogleGenAIInstrumentor

from app import db
from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Langfuse / OpenTelemetry auto-instrumentation for Gemini
# ---------------------------------------------------------------------------
GoogleGenAIInstrumentor().instrument()

# ---------------------------------------------------------------------------
# Rate-limiting constants
# ---------------------------------------------------------------------------
_MAX_RPM = 10
_MIN_REQUEST_INTERVAL = 60.0 / _MAX_RPM  # 6 seconds between requests
_MAX_RETRIES = 5
_INITIAL_BACKOFF = 6.0  # seconds

# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------
_CLUSTER_LABEL_PROMPT = """\
You are a biomedical research librarian. Given a batch of paper clusters from a \
neuroscience / psychiatry knowledge graph, produce a concise clinical label and \
description for each cluster.

Each cluster below has:
- cluster_id: integer identifier
- keywords: the top c-TF-IDF terms (most distinctive words)
- titles: the 20 highest-cited paper titles in the cluster

Return a JSON array (no markdown fences) of objects with exactly these keys:
- "cluster_id": integer (echo back the input cluster_id)
- "label": string, 3-7 words, clinical/scientific terminology, title case
- "description": string, max 20 words summarizing the research theme

Clusters:
{clusters_json}
"""

_PARENT_LABEL_PROMPT = """\
You are a biomedical research librarian. Given a group of child cluster labels \
from a neuroscience / psychiatry knowledge graph, produce a single parent label \
that captures the overarching research theme.

Child clusters:
{children_json}

Return a JSON object (no markdown fences) with exactly these keys:
- "label": string, 3-7 words, clinical/scientific terminology, title case
- "description": string, max 20 words summarizing the parent theme
"""


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class ClusterContext:
    """Input context for one cluster sent to the LLM."""
    cluster_id: int
    keywords: list[str]
    titles: list[str]


@dataclass(frozen=True, slots=True)
class ClusterLLMLabel:
    """Result of LLM labeling for one cluster."""
    cluster_id: int
    label: str
    description: str


# ---------------------------------------------------------------------------
# Gemini client helpers
# ---------------------------------------------------------------------------
_last_request_time: float = 0.0


def _rate_limited_generate(
    client: genai.Client,
    *,
    model: str,
    contents: str,
    span_name: str = "gemini.generate",
) -> str:
    """Call Gemini with rate limiting, exponential backoff, and named Langfuse spans."""
    global _last_request_time

    # Enforce minimum interval between requests
    elapsed = time.monotonic() - _last_request_time
    if elapsed < _MIN_REQUEST_INTERVAL:
        time.sleep(_MIN_REQUEST_INTERVAL - elapsed)

    lf = get_client()
    with lf.start_as_current_observation(
        as_type="generation",
        name=span_name,
    ) as gen:
        gen.update(input=contents[:1000], model=model)

        backoff = _INITIAL_BACKOFF
        for attempt in range(_MAX_RETRIES):
            try:
                _last_request_time = time.monotonic()
                response = client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=genai.types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.3,
                        safety_settings=[
                            genai.types.SafetySetting(
                                category="HARM_CATEGORY_DANGEROUS_CONTENT",
                                threshold="BLOCK_NONE",
                            ),
                            genai.types.SafetySetting(
                                category="HARM_CATEGORY_HARASSMENT",
                                threshold="BLOCK_NONE",
                            ),
                            genai.types.SafetySetting(
                                category="HARM_CATEGORY_HATE_SPEECH",
                                threshold="BLOCK_NONE",
                            ),
                            genai.types.SafetySetting(
                                category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
                                threshold="BLOCK_NONE",
                            ),
                        ],
                    ),
                )
                text = response.text or ""
                gen.update(output=text[:1000])
                return text
            except (ResourceExhausted, ServiceUnavailable) as exc:
                if attempt == _MAX_RETRIES - 1:
                    raise
                logger.warning(
                    "Gemini %s (attempt %d/%d), backing off %.1fs",
                    type(exc).__name__,
                    attempt + 1,
                    _MAX_RETRIES,
                    backoff,
                )
                time.sleep(backoff)
                backoff *= 2

    raise RuntimeError("Exhausted retries for Gemini API call")


def _get_client() -> genai.Client:
    """Build a Gemini client from settings."""
    if not settings.gemini_api_key:
        raise ValueError(
            "GEMINI_API_KEY is required for LLM labeling. Set it in .env.local"
        )
    return genai.Client(api_key=settings.gemini_api_key)


# ---------------------------------------------------------------------------
# Database loaders
# ---------------------------------------------------------------------------
@observe(name="graph.clusterLabeling.loadContext")
def get_cluster_label_context(graph_run_id: str) -> list[ClusterContext]:
    """Load keywords and representative titles for each cluster.

    Keywords come from the existing c-TF-IDF labels in graph_clusters.
    Titles are the top 20 papers per cluster ranked by citation count.
    """
    contexts: dict[int, ClusterContext] = {}

    with db.connect() as conn, conn.cursor() as cur:
        # Load existing c-TF-IDF labels as keyword proxies
        cur.execute(
            """
            SELECT cluster_id, label
            FROM solemd.graph_clusters
            WHERE graph_run_id = %s
              AND cluster_id != 0
              AND label IS NOT NULL
            ORDER BY cluster_id
            """,
            (graph_run_id,),
        )
        cluster_keywords: dict[int, list[str]] = {}
        for row in cur.fetchall():
            cid = int(row["cluster_id"])
            label = row["label"]
            # c-TF-IDF labels may be compound ("Pain & Delirium") — split for keywords
            keywords = [w.strip() for w in label.replace("&", ",").split(",") if w.strip()]
            cluster_keywords[cid] = keywords

        # Load top 20 titles per cluster by citation count
        cur.execute(
            """
            WITH ranked AS (
                SELECT
                    g.cluster_id,
                    p.title,
                    ROW_NUMBER() OVER (
                        PARTITION BY g.cluster_id
                        ORDER BY COALESCE(p.citation_count, 0) DESC, g.corpus_id
                    ) AS rn
                FROM solemd.graph_points g
                JOIN solemd.papers p ON p.corpus_id = g.corpus_id
                WHERE g.graph_run_id = %s
                  AND g.cluster_id IS NOT NULL
                  AND g.cluster_id != 0
            )
            SELECT cluster_id, title
            FROM ranked
            WHERE rn <= 20
            ORDER BY cluster_id, rn
            """,
            (graph_run_id,),
        )
        cluster_titles: dict[int, list[str]] = defaultdict(list)
        for row in cur.fetchall():
            cid = int(row["cluster_id"])
            if row["title"]:
                cluster_titles[cid].append(row["title"])

    # Merge keywords + titles into ClusterContext objects
    all_cids = sorted(set(cluster_keywords) | set(cluster_titles))
    for cid in all_cids:
        contexts[cid] = ClusterContext(
            cluster_id=cid,
            keywords=cluster_keywords.get(cid, []),
            titles=cluster_titles.get(cid, []),
        )

    logger.info(
        "Loaded label context for %d clusters (graph_run_id=%s)",
        len(contexts),
        graph_run_id,
    )
    return sorted(contexts.values(), key=lambda c: c.cluster_id)


# ---------------------------------------------------------------------------
# LLM labeling
# ---------------------------------------------------------------------------
def _parse_label_response(text: str) -> list[dict]:
    """Parse Gemini JSON response, stripping markdown fences if present."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Strip ```json ... ``` fences
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)
    return json.loads(cleaned)


@observe(name="graph.clusterLabeling.labelClusters")
def label_clusters_with_llm(
    graph_run_id: str,
    model: str = "gemini-2.5-flash",
) -> dict:
    """Label all non-noise clusters using Gemini.

    Batches 10 clusters per prompt for efficiency. Updates graph_clusters
    with LLM-generated labels and descriptions.

    Returns summary dict with counts.
    """
    contexts = get_cluster_label_context(graph_run_id)
    if not contexts:
        logger.warning("No clusters to label for graph_run_id=%s", graph_run_id)
        return {"labeled": 0, "errors": 0}

    client = _get_client()
    batch_size = 10
    all_labels: list[ClusterLLMLabel] = []
    error_count = 0

    for i in range(0, len(contexts), batch_size):
        batch = contexts[i : i + batch_size]
        batch_ids = [c.cluster_id for c in batch]

        clusters_json = json.dumps(
            [
                {
                    "cluster_id": c.cluster_id,
                    "keywords": c.keywords,
                    "titles": c.titles[:20],
                }
                for c in batch
            ],
            indent=2,
        )

        prompt = _CLUSTER_LABEL_PROMPT.format(clusters_json=clusters_json)

        try:
            raw = _rate_limited_generate(
                client, model=model, contents=prompt,
                span_name="graph.clusterLabeling.labelBatch",
            )
            parsed = _parse_label_response(raw)

            for item in parsed:
                all_labels.append(
                    ClusterLLMLabel(
                        cluster_id=int(item["cluster_id"]),
                        label=str(item["label"])[:200],
                        description=str(item.get("description", ""))[:200],
                    )
                )

            logger.info(
                "Labeled batch %d-%d (%d clusters)",
                batch_ids[0],
                batch_ids[-1],
                len(parsed),
            )
        except Exception:
            error_count += 1
            logger.exception(
                "Failed to label batch %d-%d",
                batch_ids[0],
                batch_ids[-1],
            )

    # Write labels to database
    if all_labels:
        _write_llm_labels(graph_run_id, all_labels)

    return {"labeled": len(all_labels), "errors": error_count}


def _write_llm_labels(graph_run_id: str, labels: list[ClusterLLMLabel]) -> None:
    """Persist LLM labels back to graph_clusters."""
    with db.connect() as conn, conn.cursor() as cur:
        for lbl in labels:
            cur.execute(
                """
                UPDATE solemd.graph_clusters
                SET label = %s,
                    label_mode = 'llm',
                    label_source = 'gemini',
                    description = %s,
                    updated_at = now()
                WHERE graph_run_id = %s
                  AND cluster_id = %s
                """,
                (lbl.label, lbl.description, graph_run_id, lbl.cluster_id),
            )
        conn.commit()
    logger.info("Wrote %d LLM labels to graph_clusters", len(labels))


# ---------------------------------------------------------------------------
# Hierarchy: Ward linkage + parent labeling
# ---------------------------------------------------------------------------
@observe(name="graph.clusterLabeling.buildHierarchy")
def build_cluster_hierarchy(
    graph_run_id: str,
    n_parent_groups: int = 20,
) -> dict:
    """Compute hierarchical grouping of clusters via Ward linkage.

    1. Load cluster centroids from graph_clusters.
    2. Compute cosine distance matrix between centroids.
    3. Apply Ward's linkage and cut to n_parent_groups.
    4. Insert parent cluster rows and label them with Gemini.
    5. Assign parent_cluster_id to each child cluster.

    Returns summary dict.
    """
    import numpy as np
    from scipy.cluster.hierarchy import fcluster, linkage
    from scipy.spatial.distance import pdist

    # Load leaf cluster centroids + labels
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT cluster_id, label, centroid_x, centroid_y
            FROM solemd.graph_clusters
            WHERE graph_run_id = %s
              AND cluster_id != 0
              AND hierarchy_level = 0
            ORDER BY cluster_id
            """,
            (graph_run_id,),
        )
        rows = cur.fetchall()

    if not rows:
        logger.warning("No leaf clusters for hierarchy (graph_run_id=%s)", graph_run_id)
        return {"parent_groups": 0, "children_assigned": 0}

    cluster_ids = [r["cluster_id"] for r in rows]
    labels_map = {r["cluster_id"]: r["label"] for r in rows}
    centroids = np.array(
        [[r["centroid_x"], r["centroid_y"]] for r in rows],
        dtype=np.float64,
    )

    # Clamp n_parent_groups to a sensible range
    n_clusters = len(cluster_ids)
    n_parent_groups = max(1, min(n_parent_groups, n_clusters - 1))

    # Ward linkage on cosine distance
    distances = pdist(centroids, metric="cosine")
    # Replace NaN distances (from zero-vector centroids) with max distance
    distances = np.nan_to_num(distances, nan=1.0)
    Z = linkage(distances, method="ward")
    assignments = fcluster(Z, t=n_parent_groups, criterion="maxclust")

    # Group children under parent IDs
    # Parent cluster_ids start after the max existing cluster_id
    max_existing_id = max(cluster_ids)
    parent_children: dict[int, list[int]] = defaultdict(list)
    for idx, parent_group in enumerate(assignments):
        parent_id = max_existing_id + int(parent_group)
        parent_children[parent_id].append(cluster_ids[idx])

    # Compute parent centroids from child centroids
    parent_centroids: dict[int, tuple[float, float]] = {}
    parent_member_counts: dict[int, int] = {}
    for parent_id, children in parent_children.items():
        child_indices = [cluster_ids.index(c) for c in children]
        child_points = centroids[child_indices]
        parent_centroids[parent_id] = (
            float(np.mean(child_points[:, 0])),
            float(np.mean(child_points[:, 1])),
        )
        parent_member_counts[parent_id] = len(children)

    # Label parents with Gemini
    parent_labels = _label_parent_groups(parent_children, labels_map)

    # Write parent rows and update children
    _write_hierarchy(
        graph_run_id=graph_run_id,
        parent_children=parent_children,
        parent_centroids=parent_centroids,
        parent_member_counts=parent_member_counts,
        parent_labels=parent_labels,
    )

    return {
        "parent_groups": len(parent_children),
        "children_assigned": sum(len(c) for c in parent_children.values()),
    }


def _label_parent_groups(
    parent_children: dict[int, list[int]],
    labels_map: dict[int, str | None],
) -> dict[int, ClusterLLMLabel]:
    """Label each parent group using Gemini based on its child labels."""
    client = _get_client()
    parent_labels: dict[int, ClusterLLMLabel] = {}

    for parent_id, children in parent_children.items():
        child_labels = [
            {"cluster_id": cid, "label": labels_map.get(cid, f"Cluster {cid}")}
            for cid in sorted(children)
        ]
        children_json = json.dumps(child_labels, indent=2)
        prompt = _PARENT_LABEL_PROMPT.format(children_json=children_json)

        try:
            raw = _rate_limited_generate(
                client, model="gemini-2.5-flash", contents=prompt,
                span_name="graph.clusterLabeling.labelParentGroup",
            )
            parsed = json.loads(raw.strip())
            parent_labels[parent_id] = ClusterLLMLabel(
                cluster_id=parent_id,
                label=str(parsed["label"])[:200],
                description=str(parsed.get("description", ""))[:200],
            )
        except Exception:
            logger.exception("Failed to label parent group %d", parent_id)
            # Fallback: concatenate first few child labels
            fallback = ", ".join(
                str(labels_map.get(c, f"Cluster {c}")) for c in sorted(children)[:3]
            )
            parent_labels[parent_id] = ClusterLLMLabel(
                cluster_id=parent_id,
                label=fallback[:200],
                description="Auto-grouped clusters",
            )

    return parent_labels


def _write_hierarchy(
    *,
    graph_run_id: str,
    parent_children: dict[int, list[int]],
    parent_centroids: dict[int, tuple[float, float]],
    parent_member_counts: dict[int, int],
    parent_labels: dict[int, ClusterLLMLabel],
) -> None:
    """Insert parent cluster rows and update child→parent references."""
    with db.connect() as conn, conn.cursor() as cur:
        # Insert parent cluster rows
        for parent_id in sorted(parent_children):
            cx, cy = parent_centroids[parent_id]
            lbl = parent_labels.get(parent_id)
            label_text = lbl.label if lbl else f"Group {parent_id}"
            description = lbl.description if lbl else None

            cur.execute(
                """
                INSERT INTO solemd.graph_clusters (
                    graph_run_id, cluster_id, label, label_mode, label_source,
                    description, member_count, paper_count,
                    centroid_x, centroid_y, hierarchy_level, is_noise
                )
                VALUES (%s, %s, %s, 'llm', 'gemini', %s, %s, %s, %s, %s, 1, false)
                ON CONFLICT (graph_run_id, cluster_id) DO UPDATE SET
                    label = EXCLUDED.label,
                    label_mode = EXCLUDED.label_mode,
                    label_source = EXCLUDED.label_source,
                    description = EXCLUDED.description,
                    member_count = EXCLUDED.member_count,
                    centroid_x = EXCLUDED.centroid_x,
                    centroid_y = EXCLUDED.centroid_y,
                    hierarchy_level = EXCLUDED.hierarchy_level,
                    updated_at = now()
                """,
                (
                    graph_run_id,
                    parent_id,
                    label_text,
                    description,
                    parent_member_counts[parent_id],
                    parent_member_counts[parent_id],
                    cx,
                    cy,
                ),
            )

        # Update child clusters with parent references
        for parent_id, children in parent_children.items():
            lbl = parent_labels.get(parent_id)
            parent_label = lbl.label if lbl else f"Group {parent_id}"

            for child_id in children:
                cur.execute(
                    """
                    UPDATE solemd.graph_clusters
                    SET parent_cluster_id = %s,
                        parent_label = %s,
                        updated_at = now()
                    WHERE graph_run_id = %s
                      AND cluster_id = %s
                    """,
                    (parent_id, parent_label, graph_run_id, child_id),
                )

        conn.commit()

    total_children = sum(len(c) for c in parent_children.values())
    logger.info(
        "Wrote %d parent groups and %d child assignments",
        len(parent_children),
        total_children,
    )


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
@observe(name="graph.clusterLabeling.relabel")
def relabel_graph_run(graph_run_id: str) -> dict:
    """Full relabeling pipeline: LLM labels + hierarchy.

    1. Label leaf clusters with Gemini (batched, rate-limited).
    2. Build Ward-linkage hierarchy and label parent groups.

    Returns combined summary dict.
    """
    logger.info("Starting relabel pipeline for graph_run_id=%s", graph_run_id)

    label_result = label_clusters_with_llm(graph_run_id)
    logger.info(
        "LLM labeling complete: %d labeled, %d errors",
        label_result["labeled"],
        label_result["errors"],
    )

    hierarchy_result = build_cluster_hierarchy(graph_run_id)
    logger.info(
        "Hierarchy complete: %d parent groups, %d children assigned",
        hierarchy_result["parent_groups"],
        hierarchy_result["children_assigned"],
    )

    return {
        "graph_run_id": graph_run_id,
        "llm_labeling": label_result,
        "hierarchy": hierarchy_result,
    }
