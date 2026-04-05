"""Run LLM-as-judge evaluation on RAG traces using Gemini 3 Flash via Langfuse.

Uses Langfuse's `run_batched_evaluation` to score existing traces for
faithfulness, context relevance, and answer completeness. Costs are tracked
automatically through Langfuse's model cost tracking.

Usage:
    cd engine
    export LANGFUSE_HOST=http://localhost:3100
    export LANGFUSE_PUBLIC_KEY=pk-lf-...
    export LANGFUSE_SECRET_KEY=sk-lf-...
    export GEMINI_API_KEY=AIza...

    # Score recent rag.search traces
    uv run python scripts/run_llm_judge_evaluation.py

    # Score with a limit
    uv run python scripts/run_llm_judge_evaluation.py --max-items 10

    # Score only traces from a specific benchmark tag
    uv run python scripts/run_llm_judge_evaluation.py --filter 'name = "rag.search"'
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logging.getLogger("langfuse").setLevel(logging.ERROR)
logger = logging.getLogger(__name__)

_GEMINI_MODEL = "gemini-3-flash-preview"

# ---------------------------------------------------------------------------
# Evaluation prompts
# ---------------------------------------------------------------------------

_FAITHFULNESS_PROMPT = """\
You are evaluating whether an extractive evidence answer is faithful to the
retrieved biomedical literature context.

The system retrieves scientific papers and assembles an extractive answer from
ranked evidence snippets. It does NOT generate free text — it selects and
arranges passages from retrieved papers.

QUESTION: {question}

RETRIEVED EVIDENCE (paper titles and snippets):
{context}

ANSWER:
{answer}

Evaluate faithfulness on a scale from 0.0 to 1.0:
- 1.0: Answer is fully grounded in the retrieved evidence
- 0.7-0.9: Answer is mostly grounded, minor extrapolation
- 0.3-0.6: Answer has some grounding but significant unsupported claims
- 0.0-0.2: Answer is not grounded in the evidence

Respond with JSON: {{"score": <float>, "reasoning": "<explanation>"}}
"""

_CONTEXT_RELEVANCE_PROMPT = """\
You are evaluating whether retrieved biomedical papers are relevant to a
clinical/scientific query.

QUESTION: {question}

RETRIEVED PAPERS:
{context}

Evaluate context relevance on a scale from 0.0 to 1.0:
- 1.0: All retrieved papers are directly relevant to the question
- 0.7-0.9: Most papers are relevant, 1-2 tangential
- 0.3-0.6: Mixed relevance, some papers clearly off-topic
- 0.0-0.2: Papers are mostly irrelevant to the question

Respond with JSON: {{"score": <float>, "reasoning": "<explanation>"}}
"""

_ANSWER_COMPLETENESS_PROMPT = """\
You are evaluating whether a biomedical evidence answer adequately addresses
the clinical/scientific question asked.

QUESTION: {question}

ANSWER:
{answer}

RETRIEVED PAPER COUNT: {bundle_count}

Evaluate answer completeness on a scale from 0.0 to 1.0:
- 1.0: Answer thoroughly addresses the question with relevant evidence
- 0.7-0.9: Answer addresses the question but misses some aspects
- 0.3-0.6: Answer partially addresses the question
- 0.0-0.2: Answer does not address the question

Respond with JSON: {{"score": <float>, "reasoning": "<explanation>"}}
"""


def _build_context_from_trace(output: dict) -> str:
    """Extract readable context from trace output top_bundles."""
    bundles = output.get("top_bundles", [])
    if not bundles:
        # Fall back to full bundles if top_bundles not present
        bundles = output.get("bundles", [])

    parts = []
    for i, b in enumerate(bundles[:5]):
        title = b.get("title") or b.get("paper", {}).get("title", "Unknown")
        snippet = b.get("snippet", "")
        corpus_id = b.get("corpus_id") or b.get("paper", {}).get("corpus_id", "?")
        parts.append(f"[{i+1}] (ID: {corpus_id}) {title}\n    {snippet}")

    return "\n\n".join(parts) if parts else "(no evidence retrieved)"


def _call_gemini_judge(prompt: str) -> dict:
    """Call Gemini 3 Flash and parse the JSON response."""
    from google import genai
    from google.genai import types as genai_types

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return {"score": None, "reasoning": "GEMINI_API_KEY not set"}

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=_GEMINI_MODEL,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )

    try:
        parsed = json.loads(response.text)
        return {
            "score": float(parsed.get("score", 0)),
            "reasoning": str(parsed.get("reasoning", "")),
            "input_tokens": response.usage_metadata.prompt_token_count,
            "output_tokens": response.usage_metadata.candidates_token_count,
        }
    except (json.JSONDecodeError, TypeError, ValueError):
        return {"score": None, "reasoning": f"Failed to parse: {response.text[:200]}"}


def _map_trace(*, item):
    """Extract evaluation inputs from a Langfuse trace into EvaluatorInputs."""
    from langfuse import EvaluatorInputs

    inp = getattr(item, "input", None) or {}
    out = getattr(item, "output", None) or {}

    question = inp.get("query", "") if isinstance(inp, dict) else ""
    answer = out.get("answer", "") if isinstance(out, dict) else ""
    context = _build_context_from_trace(out if isinstance(out, dict) else {})
    bundle_count = out.get("evidence_bundle_count", 0) if isinstance(out, dict) else 0

    return EvaluatorInputs(
        input={"query": question},
        output={
            "question": question,
            "answer": answer,
            "context": context,
            "bundle_count": bundle_count,
            "has_answer": bool(answer),
        },
        metadata={},
    )


def _faithfulness_evaluator(*, input, output, expected_output=None, metadata=None, **kwargs):
    """Score faithfulness of the extractive answer."""
    if not output.get("has_answer"):
        return None

    prompt = _FAITHFULNESS_PROMPT.format(
        question=output["question"],
        context=output["context"],
        answer=output["answer"],
    )
    result = _call_gemini_judge(prompt)
    if result["score"] is None:
        return None
    from langfuse import Evaluation
    return Evaluation(name="faithfulness", value=result["score"], comment=result["reasoning"])


def _context_relevance_evaluator(*, input, output, expected_output=None, metadata=None, **kwargs):
    """Score relevance of retrieved context to the question."""
    if not output.get("question"):
        return None

    prompt = _CONTEXT_RELEVANCE_PROMPT.format(
        question=output["question"],
        context=output["context"],
    )
    result = _call_gemini_judge(prompt)
    if result["score"] is None:
        return None
    from langfuse import Evaluation
    return Evaluation(name="context_relevance", value=result["score"], comment=result["reasoning"])


def _answer_completeness_evaluator(*, input, output, expected_output=None, metadata=None, **kwargs):
    """Score how completely the answer addresses the question."""
    if not output.get("has_answer"):
        return None

    prompt = _ANSWER_COMPLETENESS_PROMPT.format(
        question=output["question"],
        answer=output["answer"],
        bundle_count=output["bundle_count"],
    )
    result = _call_gemini_judge(prompt)
    if result["score"] is None:
        return None
    from langfuse import Evaluation
    return Evaluation(name="answer_completeness", value=result["score"], comment=result["reasoning"])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run LLM-as-judge on RAG traces")
    parser.add_argument("--max-items", type=int, default=None)
    parser.add_argument("--filter", default=None, help="Langfuse filter JSON string")
    parser.add_argument("--batch-size", type=int, default=10)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    from langfuse import Langfuse

    client = Langfuse()

    filter_str = args.filter
    print(f"Running LLM-as-judge evaluation on rag.search traces")
    print(f"  Model: {_GEMINI_MODEL}")
    print(f"  Max items: {args.max_items or 'all'}")
    print(f"  Evaluators: faithfulness, context_relevance, answer_completeness")
    print()

    result = client.run_batched_evaluation(
        scope="traces",
        filter=filter_str,
        mapper=_map_trace,
        evaluators=[
            _faithfulness_evaluator,
            _context_relevance_evaluator,
            _answer_completeness_evaluator,
        ],
        fetch_batch_size=args.batch_size,
        max_items=args.max_items,
        max_concurrency=1,  # Respect Gemini rate limits
        verbose=args.verbose,
    )

    print(f"\nEvaluation complete:")
    print(f"  Fetched: {result.total_items_fetched}")
    print(f"  Processed: {result.total_items_processed}")
    print(f"  Failed: {result.total_items_failed}")
    print(f"  Scores created: {result.total_scores_created}")
    print(f"  Duration: {result.duration_seconds:.1f}s")
    if result.evaluator_stats:
        for stat in result.evaluator_stats:
            name = getattr(stat, "evaluator_name", getattr(stat, "name", "?"))
            scores = getattr(stat, "scores_created", getattr(stat, "total_scores", 0))
            print(f"  Evaluator {name}: {scores} scores")
    if result.error_summary:
        print(f"  Error summary: {result.error_summary}")

    client.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
