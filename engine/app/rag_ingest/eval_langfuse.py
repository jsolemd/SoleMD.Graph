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
