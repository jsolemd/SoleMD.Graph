"""Langfuse v4 integration for evaluation scores and datasets."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

from app.rag_ingest.eval_metrics import EvalScore

logger = logging.getLogger(__name__)


def _get_langfuse_client():
    try:
        from langfuse import get_client

        return get_client()
    except Exception:
        logger.debug("Langfuse client not available")
        return None


def push_scores_to_langfuse(
    scores: dict[str, EvalScore],
    *,
    trace_name: str | None = None,
    trace_input: dict[str, Any] | None = None,
    trace_output: dict[str, Any] | None = None,
    trace_metadata: dict[str, Any] | None = None,
    tags: dict[str, str] | None = None,
) -> None:
    """Create a Langfuse trace for an eval case and attach scores.

    Langfuse v4 (OTel-based) requires traces to exist before scores can be
    attached.  We create a short-lived ``evaluator`` span that becomes the
    trace, then push numeric and categorical scores against its trace ID.
    """
    client = _get_langfuse_client()
    if client is None:
        return

    with client.start_as_current_observation(
        name=trace_name or "runtime-eval",
        as_type="evaluator",
        input=trace_input,
        output=trace_output,
        metadata=trace_metadata,
    ):
        trace_id = client.get_current_trace_id()
        if trace_id is None:
            logger.warning("Langfuse trace_id is None; skipping score push")
            return

        for name, score in scores.items():
            client.create_score(
                trace_id=trace_id,
                name=name,
                value=score.value,
                comment=score.reason,
            )

        # Push categorical tags as string-valued scores for Langfuse filtering
        if tags:
            for name, value in tags.items():
                client.create_score(
                    trace_id=trace_id,
                    name=name,
                    value=value,
                    data_type="CATEGORICAL",
                )


def create_langfuse_dataset(
    dataset_name: str,
    items: Sequence[dict],
) -> None:
    client = _get_langfuse_client()
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
    {"name": "faithfulness", "dataType": "NUMERIC", "minValue": 0, "maxValue": 1, "description": "Answer faithfulness to retrieved context (future LLM-as-judge)"},
    {"name": "retrieval_profile", "dataType": "CATEGORICAL", "categories": [{"value": "title_lookup", "label": "Title Lookup"}, {"value": "question_lookup", "label": "Question Lookup"}, {"value": "passage_lookup", "label": "Passage Lookup"}, {"value": "general", "label": "General"}], "description": "Query retrieval profile"},
    {"name": "warehouse_depth", "dataType": "CATEGORICAL", "categories": [{"value": "fulltext", "label": "Full Text"}, {"value": "abstract", "label": "Abstract"}, {"value": "none", "label": "None"}], "description": "Warehouse content depth for target paper"},
    {"name": "route_signature", "dataType": "CATEGORICAL", "description": "Full routing fingerprint"},
    # Ingest quality scores
    {"name": "section_count", "dataType": "NUMERIC", "minValue": 0, "description": "Parsed section count"},
    {"name": "block_count", "dataType": "NUMERIC", "minValue": 0, "description": "Parsed block count"},
    {"name": "sentence_count", "dataType": "NUMERIC", "minValue": 0, "description": "Parsed sentence count"},
    {"name": "entity_count", "dataType": "NUMERIC", "minValue": 0, "description": "Entity mention count"},
    {"name": "has_abstract_section", "dataType": "NUMERIC", "minValue": 0, "maxValue": 1, "description": "Parser detected abstract section role"},
    {"name": "has_title_section", "dataType": "NUMERIC", "minValue": 0, "maxValue": 1, "description": "Parser detected title/front_matter section"},
    {"name": "source_availability", "dataType": "CATEGORICAL", "categories": [{"value": "abstract", "label": "Abstract"}, {"value": "full_text", "label": "Full Text"}], "description": "Warehouse content availability"},
    {"name": "source_system", "dataType": "CATEGORICAL", "categories": [{"value": "biocxml", "label": "BioCXML"}, {"value": "s2orc_v2", "label": "S2ORC"}], "description": "Primary source system"},
]


def ensure_score_configs() -> list[str]:
    """Create or update all RAG score configs in Langfuse. Returns created names."""
    client = _get_langfuse_client()
    if client is None:
        return []
    created: list[str] = []
    for config in RAG_SCORE_CONFIGS:
        try:
            client.create_score_config(**config)
            created.append(config["name"])
        except Exception:
            logger.debug("Score config %s may already exist", config["name"])
            created.append(config["name"])
    return created
