# RAG Metrics Reference (Langfuse v4)

> Status: pending backend rebuild. No Langfuse code lives in `apps/` today. Paths
> below track `docs/rag/15-repo-structure.md §7.3` (intended `apps/worker/app/...`).
> Examples will not execute on `main` until the worker-plane Langfuse adapter
> lands.

## How To Use This Reference

Each metric below carries:

- A definition of what is being measured.
- Score-config registration kwargs.
- A judge prompt template (where applicable) with structured-output JSON schema.
- The expected score range and the observation-level placement.

Register the score configs once via `ensure_score_configs` (see
[`score-configs.md`](score-configs.md)). Wire the judges into custom evaluators
(see [`evaluators.md`](evaluators.md)). Recommend observation-level scoring
scoped to the relevant retrieval or generation node — the v4 data model treats
observation scores as first-class and they aggregate cleanly under
`dataset.run_experiment` results.

## Faithfulness

**Definition.** Of the claims in the answer, what fraction are entailed by the
retrieved chunks. Scope: generation observation.

**Score config.**

```python
{"name": "faithfulness", "data_type": "NUMERIC",
 "min_value": 0.0, "max_value": 1.0,
 "description": "Fraction of answer claims entailed by retrieved chunks."}
```

**Judge prompt template (`rag-faithfulness-judge`).**

```text
You will be given a list of CLAIMS extracted from a RAG answer and a CONTEXT
made of retrieved chunks. For each claim, decide whether the context entails
it. Return a faithfulness score equal to the fraction of claims entailed.

CLAIMS:
{{claims}}

CONTEXT:
{{context}}

Respond with JSON: {"score": <float in [0, 1]>, "reasoning": "<one sentence>"}.
```

**Structured output schema.**

```python
{"type": "OBJECT",
 "properties": {"score": {"type": "NUMBER"}, "reasoning": {"type": "STRING"}},
 "required": ["score", "reasoning"]}
```

**Expected range.** `[0.0, 1.0]`. A run-average of `0.7` is the working
baseline; below `0.5` is a routing/grounding regression, not a judge tuning
problem.

## Context Relevance

**Definition.** Per retrieved chunk, is the chunk relevant to the question.
Aggregated as a per-item average. Scope: retrieval observation.

**Score config.**

```python
{"name": "context_relevance", "data_type": "NUMERIC",
 "min_value": 0.0, "max_value": 1.0,
 "description": "Average per-chunk relevance to the user query."}
```

**Judge prompt template (`rag-context-relevance-judge`).**

```text
QUESTION: {{question}}

For each CHUNK below, decide whether it is relevant to answering the question.
Return a relevance value in [0, 1] (binary 0/1 is acceptable). Average them.

CHUNKS:
{{chunks}}

Respond with JSON: {"score": <float in [0, 1]>, "per_chunk": [<float>, ...],
                    "reasoning": "<one sentence>"}.
```

**Structured output schema.** Add `per_chunk: array(NUMBER)` to the schema in
[`evaluators.md`](evaluators.md) so the per-chunk values survive the judge
call. Persist the average as the score; persist the array in `comment` JSON.

**Expected range.** `[0.0, 1.0]`. Below `0.4` indicates routing failure, not
ranking failure.

## Answer Relevance

**Definition.** Does the answer respond to the question that was asked. Scope:
generation observation.

**Score config.**

```python
{"name": "answer_relevance", "data_type": "NUMERIC",
 "min_value": 0.0, "max_value": 1.0,
 "description": "Whether the answer addresses the user question."}
```

**Judge prompt template (`rag-answer-relevance-judge`).**

```text
QUESTION: {{question}}

ANSWER: {{answer}}

Score whether the answer addresses the question, regardless of whether it is
correct. 1.0 = directly responsive. 0.0 = unrelated, refusal, or off-topic.

Respond with JSON: {"score": <float in [0, 1]>, "reasoning": "<one sentence>"}.
```

**Expected range.** `[0.0, 1.0]`. Persistent low values usually point at
generation prompt drift, not retrieval.

## Context Precision and Recall

**Definition.**

- Precision: of the retrieved chunks, what fraction match the gold relevant set.
- Recall: of the gold relevant chunks, what fraction were retrieved.

Both require a labeled gold set in `expected_output`. Scope: retrieval
observation.

**Score config.**

```python
[
    {"name": "context_precision", "data_type": "NUMERIC",
     "min_value": 0.0, "max_value": 1.0},
    {"name": "context_recall", "data_type": "NUMERIC",
     "min_value": 0.0, "max_value": 1.0},
]
```

**Implementation.** No judge needed — these are structural.

```python
def context_precision_recall(*, output, expected_output, **kwargs):
    retrieved_ids = {c["corpus_id"] for c in output["retrieved_chunks"]}
    gold_ids = set(expected_output.get("relevant_corpus_ids", []))
    if not retrieved_ids:
        return [
            Evaluation(name="context_precision", value=0.0),
            Evaluation(name="context_recall", value=0.0),
        ]
    tp = retrieved_ids & gold_ids
    return [
        Evaluation(
            name="context_precision",
            value=len(tp) / len(retrieved_ids),
        ),
        Evaluation(
            name="context_recall",
            value=len(tp) / max(len(gold_ids), 1),
        ),
    ]
```

## Hallucination Detector

**Definition.** Boolean: does the answer contain claims that are not entailed
by the retrieved context. Scope: generation observation.

**Score config.**

```python
{"name": "hallucination", "data_type": "BOOLEAN",
 "description": "1 if the answer contains unsupported claims, else 0."}
```

**Judge prompt.** Reuse the faithfulness judge and threshold:
`hallucination = 1 if faithfulness < 0.8 else 0`. Do not run a separate judge
call — it doubles cost for no signal gain.

## Citation Validity

**Definition.** Boolean: every citation the answer uses must be present in the
retrieved chunks. Scope: generation observation.

**Score config.**

```python
{"name": "citation_valid", "data_type": "BOOLEAN",
 "description": "1 if every citation maps to a retrieved chunk, else 0."}
```

**Implementation.** Structural — no judge needed.

```python
def citation_valid(*, output, **kwargs):
    cited = {c["corpus_id"] for c in output.get("citations", [])}
    retrieved = {c["corpus_id"] for c in output.get("retrieved_chunks", [])}
    return Evaluation(
        name="citation_valid",
        value=1 if cited.issubset(retrieved) else 0,
    )
```

A failing `citation_valid` is a generation bug — the model fabricated a
citation. Treat it as a release blocker even when the answer text reads well.

## Run-Level Aggregates

Run evaluators emit:

- `avg_hit_at_1`, `avg_mrr`, `avg_faithfulness`, `avg_context_relevance` (NUMERIC)
- `error_rate` (NUMERIC, share of items that errored)
- `p50_duration_ms`, `p95_duration_ms`, `p99_duration_ms` (NUMERIC)

Register each separately. The UI lets you filter and chart them across runs,
which is how regression detection works in practice.

## Recommended Placement Cheat Sheet

| Metric | Observation type | Why |
|---|---|---|
| `hit_at_1`, `hit_at_k`, `mrr` | retrieval | Belongs to retrieval ordering. |
| `routing_match` | retrieval | Belongs to routing decision. |
| `context_relevance`, `context_precision`, `context_recall` | retrieval | Scoped to chunk set. |
| `faithfulness`, `answer_relevance`, `answer_completeness` | generation | Scoped to model output. |
| `hallucination`, `citation_valid` | generation | Scoped to model output. |
| `grounded_answer_present`, `target_in_grounded_answer`, `duration_ms` | trace | End-to-end signal. |

## Cross-References

- Score config registration: [`score-configs.md`](score-configs.md)
- Custom evaluator wiring + Gemini judge integration:
  [`evaluators.md`](evaluators.md)
- Prompt management for the judge templates: [`prompts.md`](prompts.md)
- Suite gating, acceptance thresholds, and run-level review:
  [`benchmarking.md`](benchmarking.md)
