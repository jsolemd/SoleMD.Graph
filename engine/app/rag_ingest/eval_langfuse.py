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

from app.langfuse_config import (
    get_langfuse as _get_langfuse,
)
from app.langfuse_config import (
    langfuse_api as _langfuse_api,
)

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


def _numeric_score_config(
    name: str,
    description: str,
    *,
    max_value: float | None = None,
) -> dict[str, Any]:
    config: dict[str, Any] = {
        "name": name,
        "dataType": "NUMERIC",
        "minValue": 0,
        "description": description,
    }
    if max_value is not None:
        config["maxValue"] = max_value
    return config


def _category(label: str, value: int) -> dict[str, Any]:
    return {"label": label, "value": value}


def _categorical_score_config(
    name: str,
    description: str,
    *,
    categories: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "name": name,
        "dataType": "CATEGORICAL",
        "categories": categories,
        "description": description,
    }


RAG_SCORE_CONFIGS: list[dict[str, Any]] = [
    _numeric_score_config("hit_at_1", "Target paper at rank 1", max_value=1),
    _numeric_score_config("hit_at_k", "Target paper in top-k", max_value=1),
    _numeric_score_config("mrr", "Mean reciprocal rank", max_value=1),
    _numeric_score_config(
        "grounded_answer_rate",
        "Grounded answer present",
        max_value=1,
    ),
    _numeric_score_config(
        "target_in_grounded_answer",
        "Target paper in grounded answer",
        max_value=1,
    ),
    _numeric_score_config(
        "target_in_answer_corpus",
        "Target paper in answer corpus",
        max_value=1,
    ),
    _numeric_score_config("duration_ms", "Service duration in ms"),
    _numeric_score_config(
        "evidence_bundle_count",
        "Evidence bundles returned",
    ),
    _numeric_score_config(
        "display_author_coverage",
        "Fraction of displayed evidence bundles carrying author metadata",
        max_value=1,
    ),
    _numeric_score_config(
        "display_journal_coverage",
        "Fraction of displayed evidence bundles carrying journal metadata",
        max_value=1,
    ),
    _numeric_score_config(
        "display_year_coverage",
        "Fraction of displayed evidence bundles carrying publication year metadata",
        max_value=1,
    ),
    _numeric_score_config(
        "display_study_metadata_coverage",
        "Average author/journal/year coverage across displayed evidence bundles",
        max_value=1,
    ),
    _numeric_score_config(
        "grounded_answer_present",
        "Grounded answer present (binary)",
        max_value=1,
    ),
    _numeric_score_config(
        "faithfulness",
        "Answer faithfulness to retrieved context (managed evaluator or agent review)",
        max_value=1,
    ),
    _categorical_score_config(
        "retrieval_profile",
        "Query retrieval profile (read via stringValue, not the numeric value field)",
        categories=[
            _category("title_lookup", 0),
            _category("question_lookup", 1),
            _category("passage_lookup", 2),
            _category("general", 3),
        ],
    ),
    _categorical_score_config(
        "warehouse_depth",
        "Warehouse content depth for target paper",
        categories=[
            _category("fulltext", 0),
            _category("abstract", 1),
            _category("none", 2),
        ],
    ),
    _numeric_score_config(
        "routing_match",
        "Actual retrieval_profile matches expected_retrieval_profile on the dataset case",
        max_value=1,
    ),
    # Ingest quality scores
    _numeric_score_config("section_count", "Parsed section count"),
    _numeric_score_config("block_count", "Parsed block count"),
    _numeric_score_config("sentence_count", "Parsed sentence count"),
    _numeric_score_config("entity_count", "Entity mention count"),
    _numeric_score_config(
        "has_abstract_section",
        "Parser detected abstract section role",
        max_value=1,
    ),
    _numeric_score_config(
        "has_title_section",
        "Parser detected title/front_matter section",
        max_value=1,
    ),
    _categorical_score_config(
        "source_availability",
        "Warehouse content availability",
        categories=[
            _category("abstract", 0),
            _category("full_text", 1),
        ],
    ),
    _categorical_score_config(
        "source_system",
        "Primary source system",
        categories=[
            _category("biocxml", 0),
            _category("s2orc_v2", 1),
            _category("abstract_only", 2),
        ],
    ),
    # Graph build metrics
    _numeric_score_config("graph_point_count", "Total graph points in build"),
    _numeric_score_config("graph_cluster_count", "Leiden cluster count"),
    _numeric_score_config("graph_bundle_bytes", "Export bundle total bytes"),
    _numeric_score_config(
        "graph_build_duration_s",
        "Full graph build wall-clock seconds",
    ),
    # Graph cluster labeling
    _numeric_score_config(
        "graph_cluster_labeled_count",
        "Clusters successfully labeled by LLM",
    ),
    _numeric_score_config("graph_cluster_error_count", "Batch labeling errors"),
    _numeric_score_config("graph_cluster_total", "Total clusters in labeling run"),
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
