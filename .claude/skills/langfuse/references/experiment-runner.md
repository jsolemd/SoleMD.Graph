# Langfuse Experiment Runner Reference (v4)

> Status: pending backend rebuild. No Langfuse code lives in `apps/` today. Paths
> below track `docs/rag/15-repo-structure.md §7.3` (intended `apps/worker/app/...`).
> Examples will not execute on `main` until the worker-plane Langfuse adapter
> lands.

## Intended Source Files (Post-Rebuild)

- `apps/worker/app/eval/experiment.py` — main module
- `apps/worker/scripts/run_rag_experiment.py` — CLI entry point
- `apps/worker/app/eval/langfuse_config.py` — score constants, prompt helpers
- `apps/worker/app/eval/score_configs.py` — score config registration

## Langfuse v4 Trinity

The v4 SDK collapses the v3 surface into three primitives. Internalize these
three before writing any new evaluation code:

```python
from langfuse import (
    get_client,
    Langfuse,
    observe,
    propagate_attributes,
    Evaluation,
)
```

| v3 idiom | v4 replacement |
|---|---|
| `langfuse.start_span(...)` / `langfuse.start_generation(...)` | `langfuse.start_as_current_observation(as_type="span" \| "generation" \| "retrieval" \| "tool" \| "embedding")` |
| `update_current_trace(name=, user_id=, tags=, ...)` | `propagate_attributes(trace_name=, user_id=, session_id=, tags=, metadata=)` + `set_current_trace_io(...)` + `set_current_trace_as_public()` |
| `for item in dataset.items: with item.run(...) as trace:` | `dataset.run_experiment(name=, task=, evaluators=, run_evaluators=, max_concurrency=)` |
| `LANGFUSE_HOST` | `LANGFUSE_BASE_URL` (canonical in v4; `LANGFUSE_HOST` is backwards-compat) |

The `@observe()` decorator and `start_as_current_observation` context manager
compose. Decorate the public entry point and use the context manager inside it
to break work into observation types.

```python
from langfuse import get_client, observe

langfuse = get_client()


@observe()
def answer_question(query: str) -> dict:
    with langfuse.start_as_current_observation(
        name="rag.retrieval", as_type="retrieval"
    ) as retrieval:
        chunks = retrieve(query)
        retrieval.update(input={"query": query}, output={"chunks": chunks})

    with langfuse.start_as_current_observation(
        name="rag.generation",
        as_type="generation",
        model="gemini-2.5-flash",
        prompt=langfuse.get_prompt(name="rag-evidence-answer"),
    ) as generation:
        answer = generate(query, chunks)
        generation.update(input={"query": query, "chunks": chunks}, output=answer)

    return {"chunks": chunks, "answer": answer}
```

## Trace Attributes via `propagate_attributes`

`propagate_attributes` is a context manager. Anything started inside it
inherits the propagated attributes. This is the v4 way to set trace name,
user/session IDs, tags, and metadata — never call legacy mutators.

```python
from langfuse import get_client, propagate_attributes

langfuse = get_client()

with propagate_attributes(
    trace_name="rag.benchmark",
    user_id="benchmark-runner",
    session_id=run_name,
    tags=["benchmark", dataset_name, run_name],
    metadata={"git_sha": git_sha, "model": "gemini-2.5-flash"},
):
    answer_question(query)
    # langfuse.set_current_trace_io(input=query, output=answer)
    # langfuse.set_current_trace_as_public()  # only when sharing externally
```

`set_current_trace_io` is the v4 surface for declaring trace-level I/O
explicitly, separate from the leaf observation's I/O. Use it when the trace
sees a transformed input/output that the inner generation does not.

## `dataset.run_experiment` API Surface

```python
from langfuse import get_client, Evaluation, propagate_attributes

langfuse = get_client()
dataset = langfuse.get_dataset(name="benchmark-adversarial_routing_v2")


def task(*, item, **kwargs) -> dict:
    """Item-level callable. Receives a DatasetItem, returns a dict."""
    query = item.input["query"]
    expected = item.expected_output  # {"corpus_id", "title", "primary_source_system"}
    with propagate_attributes(
        tags=["benchmark", "experiment-name"],
        metadata={"benchmark_key": item.metadata.get("benchmark_key")},
    ):
        result = retrieve_and_answer(query)
    return {
        "hit_rank": result.hit_rank,
        "answer": result.answer,
        "retrieved_chunks": result.chunks,
    }


def hit_at_1(*, input, output, expected_output, metadata, **kwargs) -> Evaluation:
    """Item-level evaluator. Returns an Evaluation."""
    return Evaluation(
        name="hit_at_1",
        value=1.0 if output["hit_rank"] == 1 else 0.0,
    )


def avg_hit_at_1(*, item_results, **kwargs) -> Evaluation:
    """Run-level evaluator. Returns an aggregate Evaluation."""
    values = [
        ev.value
        for r in item_results
        for ev in r.evaluations
        if ev.name == "hit_at_1"
    ]
    return Evaluation(
        name="avg_hit_at_1",
        value=sum(values) / max(len(values), 1),
    )


result = dataset.run_experiment(
    name="baseline-2026-04-16",
    description="Routing baseline against adversarial v2",
    task=task,
    evaluators=[hit_at_1],
    run_evaluators=[avg_hit_at_1],
    max_concurrency=4,
    metadata={
        "git_sha": "abc1234",
        "model": "gemini-2.5-flash",
    },
)

print(result.format())          # human summary
print(result.dataset_run_url)   # deep link to the UI
```

## Item-Level vs Run-Level Evaluators

The signatures are different. The runner refuses to dispatch a callable into
the wrong slot, but the failure mode is a stack trace, not a clear message.

| Slot | Kwargs available | Returns | Score scope |
|---|---|---|---|
| `evaluators=[...]` | `input`, `output`, `expected_output`, `metadata`, `item`, `trace_id` | `Evaluation` or `list[Evaluation]` | per-item, attached to the item's observations |
| `run_evaluators=[...]` | `item_results` (list of per-item result objects) | `Evaluation` or `list[Evaluation]` | per-run, attached to the dataset run |

Each `item_result` exposes `output`, `evaluations`, and the trace ID for that
item. Aggregate by reading `evaluations` and emitting a single Evaluation with
an `avg_*` or `p95_*` name.

## Async / Concurrent Tasks

`task` may be `async def`. The runner awaits it with the configured
`max_concurrency`. For mixed I/O workloads, prefer async tasks with bounded
concurrency over thread pools:

```python
async def task(*, item, **kwargs) -> dict:
    query = item.input["query"]
    chunks = await retrieve_async(query)
    answer = await generate_async(query, chunks)
    return {"answer": answer, "retrieved_chunks": chunks}


result = dataset.run_experiment(
    name=run_name,
    task=task,
    evaluators=[...],
    max_concurrency=8,  # tune to API rate limits
)
```

`max_concurrency` defaults to `1` (serial). Always set it explicitly for
benchmark runs; the default is only safe for tiny datasets.

## Local-Data Path

For ad-hoc runs that do not need a stored dataset, `langfuse.run_experiment`
accepts in-memory data and bypasses dataset creation:

```python
local_data = [
    {"input": {"query": "..."}, "expected_output": {"corpus_id": 123}},
    {"input": {"query": "..."}, "expected_output": {"corpus_id": 456}},
]

result = langfuse.run_experiment(
    name="local-smoke-2026-04-16",
    data=local_data,
    task=task,
    evaluators=[hit_at_1],
    run_evaluators=[avg_hit_at_1],
    max_concurrency=2,
)
```

Use this when iterating on evaluator code. Promote to a real dataset before
pushing changes that affect benchmark output, so the run shows up in the UI's
dataset views.

## Annotation Queue API

```python
# Forward-looking import — see banner at top of this file
# from app.eval.experiment import ensure_annotation_queue, enqueue_failures

# Create or find the rag-failure-review queue (must reference an existing score config)
queue_id = ensure_annotation_queue(
    name="rag-failure-review",
    score_config_name="reviewer_notes",
)

# After running an experiment, enqueue hit@1=0 traces for human review
n = enqueue_failures(result, queue_id, predicate=lambda r: any(
    ev.name == "hit_at_1" and ev.value == 0.0 for ev in r.evaluations
))
```

Annotation queues require a registered score config so reviewers have a target
to score against. See [`score-configs.md`](score-configs.md). The Langfuse UI
drives the workflow once items are enqueued.

CLI entry point (forward-looking):

```bash
solemd op-run graph -- uv run python apps/worker/scripts/run_rag_experiment.py \
  --dataset benchmark-adversarial_routing_v2 \
  --experiment "$(git rev-parse --short=7 HEAD)-baseline-$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --diagnose --enqueue-failures
```

## Dataset Item Structure

```json
{
  "input": {
    "query": "What is the mechanism of action of ketamine in treatment-resistant depression?",
    "query_family": "sentence_global",
    "evidence_intent": null,
    "benchmark_labels": ["question_lookup", "mechanism"]
  },
  "expected_output": {
    "corpus_id": 12345678,
    "title": "Ketamine and depression: a review",
    "primary_source_system": "s2orc_v2"
  },
  "metadata": {
    "primary_source_system": "s2orc_v2",
    "stratum_key": "benchmark:question_lookup_v1|theme:mechanism|source:s2orc_v2",
    "benchmark_key": "question_lookup_v1"
  }
}
```

`metadata` flows into both the task callable and the evaluators. Use it for
stratification, gate keys, and anything else that shapes scoring decisions.

## Cross-References

- Suite acceptance, gates, and run-name convention: [`benchmarking.md`](benchmarking.md)
- Score config registration before any evaluator runs:
  [`score-configs.md`](score-configs.md)
- Custom evaluator templates and Gemini judge wiring:
  [`evaluators.md`](evaluators.md)
- Canonical RAG quality scores and judge prompts:
  [`rag-metrics.md`](rag-metrics.md)
- Prompt management for judge templates: [`prompts.md`](prompts.md)
