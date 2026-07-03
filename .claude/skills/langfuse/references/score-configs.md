# Score Configs Reference (Langfuse v4)

> Status: pending backend rebuild. No Langfuse code lives in `apps/` today. Paths
> below track `docs/rag/15-repo-structure.md §7.3` (intended `apps/worker/app/...`).
> Examples will not execute on `main` until the worker-plane Langfuse adapter
> lands.

## What a Score Config Is

A score config defines the schema for a named score that traces, observations, or
dataset runs can carry. It enforces the value type, range, and category labels so
filters, aggregates, and managed evaluators can reason about the metric.

A score config is **immutable** in v4. Once created you cannot change `data_type`,
`min_value`, `max_value`, or category definitions. You can archive it, but the
existing scored data keeps its original config binding. This is why score-config
hygiene is part of the skill contract: a typo in a name becomes permanent.

## Data Type Surface

The v4 SDK exposes these data types via `langfuse.api.score_configs.create`:

| `data_type` | Value space | Use for |
|---|---|---|
| `NUMERIC` | float in `[min_value, max_value]` | continuous quality metrics, rates, durations |
| `CATEGORICAL` | one of declared `categories` (label + value) | route signatures, family labels, taxonomy buckets |
| `BOOLEAN` | `0` or `1` | binary detectors (hallucination, citation valid) |
| `TEXT` | free-form string | reviewer notes, structured comment payloads |

## Canonical Category Construction

For `CATEGORICAL` configs, build categories with `ConfigCategory(label=, value=)`
or the equivalent dict shape. The label is what the UI shows; the value is what
gets persisted on the score.

```python
from langfuse import get_client
from langfuse.api import ConfigCategory

langfuse = get_client()

langfuse.api.score_configs.create(
    name="route_signature",
    data_type="CATEGORICAL",
    categories=[
        ConfigCategory(label="title_lookup", value=1),
        ConfigCategory(label="question_lookup", value=2),
        ConfigCategory(label="entity_lookup", value=3),
        ConfigCategory(label="passage_lookup", value=4),
    ],
    description="Routing decision the retrieval policy chose for this query.",
)
```

## Idempotent Migration Helper

You will register score configs from CI and from interactive sessions. Make the
helper idempotent so reruns are safe.

```python
from langfuse import Langfuse


def ensure_score_configs(langfuse: Langfuse, configs: list[dict]) -> None:
    """Create score configs that do not already exist. No-op for existing names.

    Pass dicts shaped like the kwargs of langfuse.api.score_configs.create:
      {"name": ..., "data_type": "NUMERIC" | "CATEGORICAL" | "BOOLEAN" | "TEXT",
       "min_value": ..., "max_value": ..., "categories": ..., "description": ...}
    """
    existing: dict[str, object] = {}
    page_cursor = None
    while True:
        page = langfuse.api.score_configs.list(cursor=page_cursor)
        for cfg in page.data:
            existing[cfg.name] = cfg
        if not page.meta.has_more:
            break
        page_cursor = page.meta.next_cursor

    for cfg in configs:
        if cfg["name"] in existing:
            continue
        langfuse.api.score_configs.create(**cfg)
```

Call `ensure_score_configs` from any benchmark builder before `create_dataset` or
`run_experiment`. If you misspell a name once, fix it in code, register the
correctly named config, and archive the typo via the UI — the bad name stays in
the archive but is no longer surfaced in autocomplete.

## SoleMD.Graph Score Catalog

The intended worker-plane catalog (post-rebuild, in
`apps/worker/app/eval/score_configs.py`) lives in
[`rag-metrics.md`](rag-metrics.md). Recognized families:

- Structural retrieval: `hit_at_1`, `hit_at_k`, `mrr`, `routing_match`,
  `duration_ms`, `evidence_bundle_count` (NUMERIC)
- Quality: `faithfulness`, `context_relevance`, `answer_relevance`,
  `answer_completeness` (NUMERIC `[0, 1]`)
- Boolean detectors: `hallucination`, `citation_valid` (BOOLEAN)
- Routing taxonomy: `route_signature`, `retrieval_profile`, `warehouse_depth`,
  `source_system`, `source_availability` (CATEGORICAL)
- Run-level aggregates: `avg_hit_at_1`, `avg_mrr`, `error_rate`,
  `p50_duration_ms`, `p95_duration_ms`, `p99_duration_ms` (NUMERIC)
- Reviewer surface: `reviewer_notes` (TEXT)

When you add a new score family, register the config first, then write the
evaluator that emits it. Never let an evaluator emit a score whose config does
not exist — the SDK will accept it, but the UI will treat it as untyped.

## Archive vs Recreate

Archive a config when:

- The name is wrong and you need a corrected duplicate.
- The metric is being retired and you want it hidden from filters.

Do **not** archive when only the value bounds changed — accept the original
bounds as historical. If the schema must change, archive the old config and
create a new one under a versioned name (`faithfulness_v2`).

## Cross-References

- Catalog and judge prompts: [`rag-metrics.md`](rag-metrics.md)
- Custom and managed evaluators that emit these scores: [`evaluators.md`](evaluators.md)
- Benchmark suites that depend on the score catalog:
  [`benchmarking.md`](benchmarking.md)
