"""Langfuse v4 integration for evaluation scores and datasets.

Score pushing is now handled automatically by ``experiment.py`` via
``dataset.run_experiment()`` — the ``push_scores_to_langfuse()`` function
has been removed.  This module retains dataset creation helpers and
score config registration.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

from app.langfuse_config import get_langfuse as _get_langfuse, langfuse_api as _langfuse_api

logger = logging.getLogger(__name__)


def create_langfuse_dataset(
    dataset_name: str,
    items: Sequence[dict],
) -> None:
    client = _get_langfuse()
    if client is None:
        return
    client.create_dataset(name=dataset_name)
    for item in items:
        client.create_dataset_item(
            dataset_name=dataset_name,
            input=item.get("input", {}),
            expected_output=item.get("expected_output", {}),
        )


# ---------------------------------------------------------------------------
# Score configs — define quality dimensions for the Langfuse UI
# ---------------------------------------------------------------------------

RAG_SCORE_CONFIGS: list[dict[str, Any]] = [
    {"name": "hit_at_1", "dataType": "NUMERIC", "minValue": 0, "maxValue": 1, "description": "Target paper at rank 1"},
    {"name": "hit_at_k", "dataType": "NUMERIC", "minValue": 0, "maxValue": 1, "description": "Target paper in top-k"},
    {"name": "mrr", "dataType": "NUMERIC", "minValue": 0, "maxValue": 1, "description": "Mean reciprocal rank"},
    {"name": "grounded_answer_rate", "dataType": "NUMERIC", "minValue": 0, "maxValue": 1, "description": "Grounded answer present"},
    {"name": "target_in_grounded_answer", "dataType": "NUMERIC", "minValue": 0, "maxValue": 1, "description": "Target paper in grounded answer"},
    {"name": "target_in_answer_corpus", "dataType": "NUMERIC", "minValue": 0, "maxValue": 1, "description": "Target paper in answer corpus"},
    {"name": "duration_ms", "dataType": "NUMERIC", "minValue": 0, "description": "Service duration in ms"},
    {"name": "evidence_bundle_count", "dataType": "NUMERIC", "minValue": 0, "description": "Evidence bundles returned"},
    {"name": "grounded_answer_present", "dataType": "NUMERIC", "minValue": 0, "maxValue": 1, "description": "Grounded answer present (binary)"},
    {"name": "faithfulness", "dataType": "NUMERIC", "minValue": 0, "maxValue": 1, "description": "Answer faithfulness to retrieved context (managed evaluator or agent review)"},
    {"name": "retrieval_profile", "dataType": "CATEGORICAL", "categories": [{"label": "title_lookup", "value": 0}, {"label": "question_lookup", "value": 1}, {"label": "passage_lookup", "value": 2}, {"label": "general", "value": 3}], "description": "Query retrieval profile"},
    {"name": "warehouse_depth", "dataType": "CATEGORICAL", "categories": [{"label": "fulltext", "value": 0}, {"label": "abstract", "value": 1}, {"label": "none", "value": 2}], "description": "Warehouse content depth for target paper"},
    {"name": "route_signature", "dataType": "CATEGORICAL", "categories": [{"label": "default", "value": 0}], "description": "Full routing fingerprint"},
    # Ingest quality scores
    {"name": "section_count", "dataType": "NUMERIC", "minValue": 0, "description": "Parsed section count"},
    {"name": "block_count", "dataType": "NUMERIC", "minValue": 0, "description": "Parsed block count"},
    {"name": "sentence_count", "dataType": "NUMERIC", "minValue": 0, "description": "Parsed sentence count"},
    {"name": "entity_count", "dataType": "NUMERIC", "minValue": 0, "description": "Entity mention count"},
    {"name": "has_abstract_section", "dataType": "NUMERIC", "minValue": 0, "maxValue": 1, "description": "Parser detected abstract section role"},
    {"name": "has_title_section", "dataType": "NUMERIC", "minValue": 0, "maxValue": 1, "description": "Parser detected title/front_matter section"},
    {"name": "source_availability", "dataType": "CATEGORICAL", "categories": [{"label": "abstract", "value": 0}, {"label": "full_text", "value": 1}], "description": "Warehouse content availability"},
    {"name": "source_system", "dataType": "CATEGORICAL", "categories": [{"label": "biocxml", "value": 0}, {"label": "s2orc_v2", "value": 1}, {"label": "abstract_only", "value": 2}], "description": "Primary source system"},
    # Graph build metrics
    {"name": "graph_point_count", "dataType": "NUMERIC", "minValue": 0, "description": "Total graph points in build"},
    {"name": "graph_cluster_count", "dataType": "NUMERIC", "minValue": 0, "description": "Leiden cluster count"},
    {"name": "graph_bundle_bytes", "dataType": "NUMERIC", "minValue": 0, "description": "Export bundle total bytes"},
    {"name": "graph_build_duration_s", "dataType": "NUMERIC", "minValue": 0, "description": "Full graph build wall-clock seconds"},
    # Graph cluster labeling
    {"name": "graph_cluster_labeled_count", "dataType": "NUMERIC", "minValue": 0, "description": "Clusters successfully labeled by LLM"},
    {"name": "graph_cluster_error_count", "dataType": "NUMERIC", "minValue": 0, "description": "Batch labeling errors"},
    {"name": "graph_cluster_total", "dataType": "NUMERIC", "minValue": 0, "description": "Total clusters in labeling run"},
]


def ensure_score_configs() -> list[str]:
    """Create or update all RAG score configs in Langfuse via REST API.

    The v4 Python SDK doesn't expose ``create_score_config()``, so we use
    the centralized ``langfuse_api()`` helper. Skips configs that already
    exist (by name). Returns all config names (created + existing).
    """
    # Fetch existing configs to avoid duplicates
    existing_names: set[str] = set()
    resp = _langfuse_api("GET", "/score-configs")
    if resp and "data" in resp:
        for cfg in resp["data"]:
            existing_names.add(cfg["name"])

    result: list[str] = []
    for config in RAG_SCORE_CONFIGS:
        name = config["name"]
        if name in existing_names:
            result.append(name)
            continue
        created = _langfuse_api("POST", "/score-configs", config)
        if created is not None:
            logger.debug("Registered score config: %s", name)
        result.append(name)
    return result
