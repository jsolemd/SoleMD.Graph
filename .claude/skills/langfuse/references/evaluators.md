# Evaluators Reference (Langfuse v4)

> Status: pending backend rebuild. No Langfuse code lives in `apps/` today. Paths
> below track `docs/rag/15-repo-structure.md §7.3` (intended `apps/worker/app/...`).
> Examples will not execute on `main` until the worker-plane Langfuse adapter
> lands.

## Three Evaluator Surfaces

| Surface | Where it runs | Cost | When to use |
|---|---|---|---|
| Structural | Python, in-process | Free, deterministic | Always. Default acceptance surface. |
| Custom (LLM-as-judge) | Python, calls a model | Per-token cost | RAG quality dimensions where structure cannot decide. |
| Managed | Langfuse server-side | Per-eval cost | When you need a UI-managed evaluator on production traces, not just experiments. |

Use structural evaluators by default. Reach for custom LLM judges when the
quality dimension is genuinely semantic (faithfulness, hallucination, answer
relevance). Reach for managed evaluators only when a non-engineer needs to
author or modify the evaluator from the UI, or when you want continuous
evaluation on streamed production traces.

## Item-Level vs Run-Level Evaluators

`dataset.run_experiment(...)` accepts two distinct evaluator lists:

- `evaluators=[...]` — called once per dataset item, sees that item's
  `input`, `output`, `expected_output`, and `metadata`. Returns one or more
  `Evaluation` objects scoped to the item's observation.
- `run_evaluators=[...]` — called once per run, sees all `item_results`.
  Returns aggregate scores written at the run level.

Signatures differ. Do not pass an item-level callable in `run_evaluators` or
vice versa.

```python
from langfuse import Evaluation


def hit_at_1(*, input, output, expected_output, metadata, **kwargs) -> Evaluation:
    return Evaluation(
        name="hit_at_1",
        value=1.0 if output["hit_rank"] == 1 else 0.0,
    )


def avg_hit_at_1(*, item_results, **kwargs) -> Evaluation:
    values = [
        ev.value
        for r in item_results
        for ev in r.evaluations
        if ev.name == "hit_at_1"
    ]
    if not values:
        return Evaluation(name="avg_hit_at_1", value=0.0)
    return Evaluation(name="avg_hit_at_1", value=sum(values) / len(values))
```

## Observation-Level vs Trace-Level Placement

In v4, evaluators can target either the trace or a specific observation. Prefer
**observation-level** scoring when the metric belongs to a single stage:

- Faithfulness, hallucination, answer relevance → score the generation
  observation that produced the answer.
- Context relevance, retrieval precision → score the retrieval observation that
  produced the chunks.

Trace-level scoring is appropriate only for end-to-end metrics that depend on
all stages (e.g., `target_in_grounded_answer`, total `duration_ms`).

```python
from langfuse import get_client

langfuse = get_client()

# Observation-level (preferred when the score belongs to a stage)
with langfuse.start_as_current_observation(
    name="rag.retrieval", as_type="retrieval"
) as obs:
    chunks = retrieve(query)
    obs.score(name="retrieved_count", value=len(chunks))

# Trace-level (only for end-to-end metrics)
langfuse.score_current_trace(
    name="grounded_answer_present",
    value=1 if grounded else 0,
)
```

Observation-level scores survive trace-level filtering and are the only way to
diagnose which stage caused a regression.

## Custom Evaluator Template

```python
from langfuse import Evaluation
from langfuse.types import LanguageModelOutput


def make_faithfulness_evaluator(judge_call):
    """Return an item-level evaluator that calls a Gemini judge for faithfulness.

    judge_call: callable(claims: list[str], context: str) -> dict
                with keys {"score": float in [0, 1], "reasoning": str}
    """
    def faithfulness(*, input, output, expected_output, metadata, **kwargs) -> list[Evaluation]:
        claims = output.get("claims", [])
        context = "\n".join(output.get("retrieved_chunks", []))
        if not claims or not context:
            return [Evaluation(name="faithfulness", value=0.0,
                               comment="empty_claims_or_context")]
        result = judge_call(claims=claims, context=context)
        return [
            Evaluation(
                name="faithfulness",
                value=float(result["score"]),
                comment=result.get("reasoning", "")[:512],
            ),
        ]

    return faithfulness
```

Pass `make_faithfulness_evaluator(judge)` into `evaluators=[...]`. Always cap
`comment` length — Langfuse truncates aggressively and you do not want a 4 KB
chain-of-thought blocking a write.

## Gemini Judge Recipe

Use `gemini-2.5-flash` for routine judging and `gemini-2.5-pro` for gold-set
rescoring escalation. The structured-output mode is mandatory; freeform JSON
parsing is brittle.

```python
import json
from google import genai
from google.genai import types

_client = genai.Client()  # picks up GEMINI_API_KEY


def gemini_judge(prompt: str, *, model: str = "gemini-2.5-flash") -> dict:
    resp = _client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "score": {"type": "NUMBER"},
                    "reasoning": {"type": "STRING"},
                },
                "required": ["score", "reasoning"],
            },
            temperature=0.0,
        ),
    )
    return json.loads(resp.text)
```

`GEMINI_API_KEY` must be injected via `solemd op-run graph -- ...` per the `/op`
skill. Do not stash it in `.env`.

## Score-Config Enforcement

Every name an evaluator returns must have a registered score config (see
[`score-configs.md`](score-configs.md)). The skill rule is:

1. Add the score config first.
2. Then write the evaluator.
3. Then run the experiment.

If you skip step 1, the score is written as untyped and will not aggregate
correctly in the UI.

## Managed Evaluator Activation

Managed evaluators are configured in the Langfuse UI under
**Evaluations → Evaluators**. They run server-side on a sampled subset of
traces. Activate them when:

- A non-engineer owns the evaluator definition.
- You need continuous evaluation against the production environment, not only
  experiment runs.

Activation is cost-bearing and always opt-in. Document any new managed
evaluator in `references/benchmarking.md` so the per-run cost expectation is
visible alongside the suite list.

## Cross-References

- Score config registration and immutability:
  [`score-configs.md`](score-configs.md)
- Canonical RAG quality judges and metric definitions:
  [`rag-metrics.md`](rag-metrics.md)
- Experiment runner integration:
  [`experiment-runner.md`](experiment-runner.md)
