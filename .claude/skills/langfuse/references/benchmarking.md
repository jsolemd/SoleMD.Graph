# Langfuse Benchmarking Reference (v4)

> Status: pending backend rebuild. No Langfuse code lives in `apps/` today. Paths
> below track `docs/rag/15-repo-structure.md §7.3` (intended `apps/worker/app/...`).
> CLI examples will not execute on `main` until the worker-plane Langfuse adapter
> lands; treat the patterns here as the contract the rebuild must satisfy.

## Intended File Layout (Post-Rebuild)

| Path | Purpose |
|---|---|
| `apps/worker/app/eval/langfuse_config.py` | env loading, prompt access, score constants, safe SDK imports |
| `apps/worker/app/eval/score_configs.py` | score-config registration + idempotent migration |
| `apps/worker/app/eval/experiment.py` | task, evaluators, diagnosis helpers, annotation queue, default benchmark list |
| `apps/worker/app/eval/benchmark_catalog.py` | acceptance suites, gate modes, default thresholds, warehouse-depth gates |
| `apps/worker/app/eval/run_review.py` | historical run review + comparison helpers |
| `apps/worker/scripts/rag_benchmark.py` | benchmark runner CLI |
| `apps/worker/scripts/prepare_rag_curated_benchmarks.py` | dataset builder + Langfuse dataset sync |

These paths are forward-looking. Do not attempt to import them today; consult
`docs/rag/15-repo-structure.md` before adding any of these files.

## Source Of Truth

- Langfuse datasets are the **live** benchmark source of truth. The intended
  worker-plane runtime fetches them via `langfuse.get_dataset(name=...)`.
- When using Langfuse Cloud Hobby, JSON snapshots remain the **archive mirror**
  because cloud data access is limited to 30 days on that plan. The intended
  builder script writes them under the worker's data directory when invoked
  with `--snapshot`.
- `--all-benchmarks` runs the live dataset list constant
  (`ALL_BENCHMARK_DATASETS`) declared in `apps/worker/app/eval/experiment.py`.
- `--use-suite-gates` applies default acceptance thresholds only for suites
  registered in `apps/worker/app/eval/benchmark_catalog.py`.

## Benchmark Lifecycle

```text
prepare_rag_curated_benchmarks.py
  -> ensure_score_configs()                         # see references/score-configs.md
  -> langfuse.create_dataset(name=, description=, metadata=)
  -> langfuse.create_dataset_item(dataset_name=, input=, expected_output=, metadata=)
  -> optionally write JSON snapshots

rag_benchmark.py
  -> dataset = langfuse.get_dataset(name=...)
  -> dataset.run_experiment(
         name=run_name,
         description="...",
         task=task,
         evaluators=[...],
         run_evaluators=[...],
         max_concurrency=4,
         metadata={"git_sha": ..., "model": ...},
     )
  -> attach observation-level structural scores
  -> optionally diagnose failures
  -> optionally compare against a baseline run
  -> optionally enqueue hit@1=0 traces to rag-failure-review
```

`dataset.run_experiment(...)` returns a result with `.format()` and
`.dataset_run_url`. Always print both at the end of a run so the operator can
click through to the UI.

## Run-Name Convention

Reusing a run name silently appends to the existing run. Always include a
timestamp and git SHA so reruns are distinguishable:

```python
from datetime import datetime, timezone
import subprocess

git_sha = subprocess.check_output(
    ["git", "rev-parse", "--short=7", "HEAD"], text=True
).strip()
run_name = f"{git_sha}-gemini-2.5-flash-{datetime.now(timezone.utc).isoformat(timespec='seconds')}"
```

The pattern is `<git_sha>-<model>-<iso8601_utc>`. Drop in stable suffixes
(`-baseline`, `-routing-fix`) only when you need the run name to communicate
intent in the UI.

## Environment Filtering

`LANGFUSE_TRACING_ENVIRONMENT` is the v4 UI filter axis. Use:

- `dev` for local exploratory runs.
- `eval` for benchmark experiments.
- `staging` for pre-release validation.
- `production` for live API traces.

Set it before client construction (it is read at SDK init):

```bash
export LANGFUSE_TRACING_ENVIRONMENT=eval
```

Filter by environment in the Langfuse UI to separate experiment noise from
production traffic. Mixing `eval` and `production` in the same dashboard
defeats the entire point of having an environment field.

## Acceptance Surfaces

Seven suites currently have catalog-defined gate modes and default thresholds.
These are the surfaces that matter for release acceptance when using
`--use-suite-gates`.

| Dataset | Mode | Cases | Acceptance focus |
|---|---|---:|---|
| `benchmark-biomedical_optimization_v3` | `required` | 297 | Main covered-paper optimization gate for title, selected-context, and non-title sentence retrieval |
| `benchmark-biomedical_holdout_v1` | `required` | 48 | Paper- and title-disjoint anti-overfitting guard |
| `benchmark-biomedical_citation_context_v1` | `required` | 24 | Cited-study preservation when prompt context names the study |
| `benchmark-biomedical_narrative_v1` | `shadow` | 36 | Narrative clinician-style and patient-style biomedical QA |
| `benchmark-biomedical_metadata_retrieval_v1` | `guardrail` | 36 | Author, journal, and year aware retrieval |
| `benchmark-biomedical_evidence_type_v1` | `guardrail` | 16 | Study-design aware retrieval preference |
| `benchmark-biomedical_expert_canonicalization_v1` | `shadow` | 64 | Expert shorthand and abbreviation-heavy biomedical concept recovery |

Notes:

- `benchmark-biomedical_expert_canonicalization_v1` is gated only on
  `chunks_entities_sentence` cases via `gate_warehouse_depths`.
- `required` suites are release blockers.
- `guardrail` suites are narrower regression guards.
- `shadow` suites are still operationally useful, but they are not release
  blockers yet.

## Focused Diagnostic Suites

These remain part of the default live benchmark run, but they are better
treated as lane-specific debugging surfaces than release-policy docs:

- `benchmark-title_retrieval_v2` - exact and fuzzy title routing
- `benchmark-clinical_evidence_v2` - mixed clinical evidence retrieval
- `benchmark-passage_retrieval_v2` - chunk-gated passage alignment
- `benchmark-adversarial_routing_v2` - router stress and false-positive control
- `benchmark-keyword_search_v2` - short-keyword exactness
- `benchmark-abstract_stratum_v2` - abstract-only retrieval coverage
- `benchmark-question_evidence_v2` - interrogative evidence routing
- `benchmark-semantic_recall_v2` - paraphrase and semantic recall robustness
- `benchmark-entity_relation_v2` - entity-heavy and relation-heavy retrieval

## Commands (Forward-Looking)

```bash
# Rebuild datasets in Langfuse (post-rebuild path)
solemd op-run graph -- uv run python -m apps.worker.scripts.prepare_rag_curated_benchmarks

# Also write archive snapshots
solemd op-run graph -- uv run python -m apps.worker.scripts.prepare_rag_curated_benchmarks --snapshot

# Run all live datasets with catalog defaults where available
solemd op-run graph -- uv run python apps/worker/scripts/rag_benchmark.py \
  --all-benchmarks \
  --run "$(git rev-parse --short=7 HEAD)-flash-baseline-$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --use-suite-gates \
  --diagnose

# Run one focused diagnostic suite
solemd op-run graph -- uv run python apps/worker/scripts/rag_benchmark.py \
  --dataset benchmark-adversarial_routing_v2 \
  --run "$(git rev-parse --short=7 HEAD)-routing-debug-$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --diagnose

# Review an existing Langfuse run without re-executing retrieval
solemd op-run graph -- uv run python apps/worker/scripts/rag_benchmark.py \
  --dataset benchmark-biomedical_optimization_v3 \
  --run baseline-2026-04-16 \
  --review-existing-run \
  --compare-run accepted-2026-04-12

# Add explicit gates on top of suite defaults or for one-off experiments
solemd op-run graph -- uv run python apps/worker/scripts/rag_benchmark.py \
  --dataset benchmark-passage_retrieval_v2 \
  --run "$(git rev-parse --short=7 HEAD)-passage-fix-$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --quality-gate avg_hit_at_1=0.9,error_rate=0

# Escalate misses for human/domain review
solemd op-run graph -- uv run python apps/worker/scripts/rag_benchmark.py \
  --all-benchmarks \
  --run "$(git rev-parse --short=7 HEAD)-triage-$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --diagnose \
  --enqueue-failures
```

`solemd op-run graph -- ...` is mandatory — the runtime needs `LANGFUSE_*`,
`GEMINI_API_KEY`, and database DSNs injected from 1Password (see `/op`).

Useful review flags:

- `--use-suite-gates` - apply default thresholds from `benchmark_catalog.py`
- `--quality-gate key=value,...` - add explicit thresholds
- `--review-existing-run` - inspect a stored Langfuse dataset run instead of executing
- `--compare-run <name>` - diff a reviewed run against a baseline run
- `--review-live` - print live family and miss-taxonomy summaries

## How To Choose A Surface

- Use `benchmark-biomedical_optimization_v3` and
  `benchmark-biomedical_holdout_v1` for acceptance and anti-overfitting checks.
- Use a focused v2 suite when debugging one lane, such as title routing,
  passage retrieval, adversarial routing, or semantic recall.
- Keep `--use-suite-gates` on for accepted surfaces so the warehouse-depth rules
  and suite-default thresholds apply automatically.
- Use `--review-existing-run` when you need interpretation, not execution.

## Score Families

- Structural retrieval: `hit_at_1`, `hit_at_k`, `mrr`, `routing_match`,
  `duration_ms`, `evidence_bundle_count`
- Grounding and answer quality: `grounded_answer_rate`,
  `target_in_grounded_answer`, `target_in_answer_corpus`,
  `grounded_answer_present`, `faithfulness`, `answer_relevance`,
  `context_relevance`, `hallucination`, `citation_valid`
- Decomposition: `target_*` signal scores and `channel_*` contribution scores
- Metadata and routing: `retrieval_profile`, `warehouse_depth`,
  `route_signature`, `source_system`, `source_availability`
- Run-level: `avg_*`, `p50/p95/p99_duration_ms`, `error_rate`, plus review
  metrics such as repeated-paper or repeated-title counts

Managed LLM evaluators can exist in Langfuse, but they are not the default
acceptance surface. Structural scores are the baseline. Any managed-evaluator
activation is a deliberate, cost-bearing choice. See [`evaluators.md`](evaluators.md)
for the managed-vs-custom-vs-structural decision tree and
[`rag-metrics.md`](rag-metrics.md) for canonical Python implementations of the
quality scores.

## Score To Action Mapping

| Pattern | Likely next move |
|---|---|
| `hit_at_1=0` with `route=title_lookup` | Check title-like query thresholds in query enrichment |
| `hit_at_1=0` with `route=question_lookup` | Inspect MedCPT reranker and question-route logic in retrieval policy |
| `depth=none` | Treat as ingest gap first; do not disguise it as a ranking fix |
| `depth=abstract` with weak dense signal | Check dense-query enablement and embedding availability |
| `bundles=0` or weak `context_relevance` | Inspect routing and evidence-lane selection |
| `hit_at_k=1` but `hit_at_1=0` | Inspect fusion and rerank ordering rather than recall |
| `error_rate>0` | Debug runtime, dependency, or connection failures before interpreting retrieval metrics |
| Low `faithfulness` or `hallucination=1` | Tighten generation prompts or grounded-answer logic, then rerun |

## Agentic Loop

1. Pick the narrowest benchmark surface that can prove or falsify the change.
2. Run with `--diagnose` and read the failure patterns before touching code.
3. Fix routing, ranking, ingest, or prompt logic based on the evidence.
4. Re-run with `--use-suite-gates` or explicit `--quality-gate`.
5. Use `--compare-run` to measure deltas against the last accepted baseline.
6. Escalate unresolved misses with `--enqueue-failures`.
7. Update human-facing docs only if the user-visible runtime contract changed.
   Benchmark operations stay in this reference, not in `docs/map/`.

## Cost Discipline

- Structural evaluators are the default and should run on routine benchmark work.
- Managed evaluators are optional, cost money, and should only be enabled for
  targeted diagnosis where structural scores are insufficient.
- `gemini-2.5-flash` is the default judge. Escalate to `gemini-2.5-pro` only
  for gold-set rescoring on high-disagreement items.

## Cross-References

- Score-config schema and registration: [`score-configs.md`](score-configs.md)
- Evaluator surfaces and Gemini judge integration: [`evaluators.md`](evaluators.md)
- Canonical RAG quality metric implementations: [`rag-metrics.md`](rag-metrics.md)
- Prompt management lifecycle: [`prompts.md`](prompts.md)
- Experiment runner API surface and async patterns:
  [`experiment-runner.md`](experiment-runner.md)
