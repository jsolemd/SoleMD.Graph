# Langfuse Experiment Runner Reference

## Source Files

- `engine/app/rag_ingest/experiment.py` — main module
- `engine/scripts/run_rag_experiment.py` — CLI entry point
- `engine/app/langfuse_config.py` — score constants, prompt helpers
- `engine/app/rag_ingest/eval_langfuse.py` — score config registration

## Langfuse v4 API (Python)

```python
from langfuse import get_client, Evaluation, propagate_attributes

langfuse = get_client()
dataset = langfuse.get_dataset("benchmark-adversarial_router_v1")

# Task: receives DatasetItem, returns dict
def task(*, item, **kwargs):
    query = item.input["query"]
    target = item.expected_output  # {"corpus_id", "title", "primary_source_system"}
    with propagate_attributes(tags=["benchmark", "experiment-name"]):
        return {"hit_rank": ..., "answer": ...}

# Evaluator: receives input/output/expected_output, returns Evaluation
def evaluator(*, input, output, expected_output, **kwargs):
    return Evaluation(name="hit_at_1", value=1.0 if output["hit_rank"] == 1 else 0.0)

# Run evaluator: receives all item_results, returns aggregate
def run_evaluator(*, item_results, **kwargs):
    scores = [e.value for r in item_results for e in r.evaluations if e.name == "hit_at_1"]
    return Evaluation(name="avg_hit_at_1", value=sum(scores)/len(scores))

result = dataset.run_experiment(
    name="baseline",
    task=task,
    evaluators=[evaluator],
    run_evaluators=[run_evaluator],
    max_concurrency=4,
)
print(result.format())
print(result.dataset_run_url)
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

## Annotation Queue API

```python
from app.rag_ingest.experiment import ensure_annotation_queue, enqueue_failures

# Create or find the rag-failure-review queue
queue_id = ensure_annotation_queue()

# After running an experiment, enqueue hit@1=0 traces
n = enqueue_failures(result, queue_id)
```

Or via CLI:
```bash
uv run python scripts/run_rag_experiment.py \
  --dataset benchmark-adversarial_router_v1 \
  --experiment baseline-2026-04-05 \
  --diagnose --enqueue-failures
```
