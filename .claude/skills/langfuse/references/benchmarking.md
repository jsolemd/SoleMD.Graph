# Langfuse Benchmarking Reference

## Canonical Files

- `engine/scripts/rag_benchmark.py` - benchmark runner, run review, gating, and comparison CLI
- `engine/scripts/prepare_rag_curated_benchmarks.py` - dataset builder and Langfuse dataset sync
- `engine/app/rag_ingest/experiment.py` - structural evaluators, diagnosis helpers, annotation queue support, default benchmark list
- `engine/app/rag_ingest/benchmark_catalog.py` - acceptance suites, gate modes, default thresholds, warehouse-depth gates
- `engine/app/rag_ingest/eval_langfuse.py` - score config registration and dataset upload helpers
- `engine/app/rag_ingest/langfuse_run_review.py` - historical run review and comparison helpers

## Source Of Truth

- Langfuse datasets are the **live** benchmark source of truth.
- When using Langfuse Cloud Hobby, JSON under
  `engine/data/runtime_eval_benchmarks/` is also the **archive mirror**
  created by `prepare_rag_curated_benchmarks.py --snapshot`, because
  cloud data access is limited to 30 days on that plan.
- `rag_benchmark.py --all-benchmarks` runs the live dataset list from
  `engine/app/rag_ingest/experiment.py::ALL_BENCHMARK_DATASETS`.
- `--use-suite-gates` applies default acceptance thresholds only for suites
  registered in `benchmark_catalog.py`.

## Downstream Consumers

- `docs/rag/10a-rag-quality-analyzer.md` is the offline batch consumer of
  cascade traces emitted by benchmark experiments and run reviews.
- If a benchmark change adds or removes cascade trace fields, update
  `08-retrieval-cascade.md` and `10a-rag-quality-analyzer.md` in the same
  PR so the trace producer and the batch analyzer stay aligned.
- If a benchmark change adds a new persisted score family, add it to
  `10a §3` in the same batch if the offline analyzer should retain it
  beyond Langfuse Cloud's live surface.

## Benchmark Lifecycle

```text
prepare_rag_curated_benchmarks.py
  -> ensure_score_configs()
  -> create or update Langfuse datasets
  -> optionally write JSON snapshots

rag_benchmark.py
  -> select one dataset or ALL_BENCHMARK_DATASETS
  -> run dataset.run_experiment() or review an existing run
  -> attach structural scores + run-level evaluators
  -> optionally diagnose failures
  -> optionally compare against a baseline run
  -> optionally enqueue hit@1=0 traces to rag-failure-review
```

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

These remain part of the default live benchmark run, but they are better treated
as lane-specific debugging surfaces than release-policy docs:

- `benchmark-title_retrieval_v2` - exact and fuzzy title routing
- `benchmark-clinical_evidence_v2` - mixed clinical evidence retrieval
- `benchmark-passage_retrieval_v2` - chunk-gated passage alignment
- `benchmark-adversarial_routing_v2` - router stress and false-positive control
- `benchmark-keyword_search_v2` - short-keyword exactness
- `benchmark-abstract_stratum_v2` - abstract-only retrieval coverage
- `benchmark-question_evidence_v2` - interrogative evidence routing
- `benchmark-semantic_recall_v2` - paraphrase and semantic recall robustness
- `benchmark-entity_relation_v2` - entity-heavy and relation-heavy retrieval

## Commands

```bash
cd engine

# Rebuild datasets in Langfuse
uv run python -m scripts.prepare_rag_curated_benchmarks

# Also write git-tracked JSON snapshots
uv run python -m scripts.prepare_rag_curated_benchmarks --snapshot

# Run all live datasets with catalog defaults where available
uv run python scripts/rag_benchmark.py \
  --all-benchmarks \
  --run baseline-2026-04-16 \
  --use-suite-gates \
  --diagnose

# Run one focused diagnostic suite
uv run python scripts/rag_benchmark.py \
  --dataset benchmark-adversarial_routing_v2 \
  --run routing-debug-2026-04-16 \
  --diagnose

# Review an existing Langfuse run without re-executing retrieval
uv run python scripts/rag_benchmark.py \
  --dataset benchmark-biomedical_optimization_v3 \
  --run baseline-2026-04-16 \
  --review-existing-run \
  --compare-run accepted-2026-04-12

# Add explicit gates on top of suite defaults or for one-off experiments
uv run python scripts/rag_benchmark.py \
  --dataset benchmark-passage_retrieval_v2 \
  --run passage-fix-2026-04-16 \
  --quality-gate avg_hit_at_1=0.9,error_rate=0

# Escalate misses for human/domain review
uv run python scripts/rag_benchmark.py \
  --all-benchmarks \
  --run triage-2026-04-16 \
  --diagnose \
  --enqueue-failures
```

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
  `grounded_answer_present`
- Decomposition: `target_*` signal scores and `channel_*` contribution scores
- Metadata and routing: `retrieval_profile`, `warehouse_depth`,
  `route_signature`, `source_system`, `source_availability`
- Run-level: `avg_*`, `p50/p95/p99_duration_ms`, `error_rate`, plus review
  metrics such as repeated-paper or repeated-title counts

Managed LLM evaluators can exist in Langfuse, but they are not the default
acceptance surface. Structural scores are the baseline. Any managed-evaluator
activation is a deliberate, cost-bearing choice.

## Score To Action Mapping

| Pattern | Likely next move |
|---|---|
| `hit_at_1=0` with `route=title_lookup` | Check title-like query thresholds in `query_enrichment.py` |
| `hit_at_1=0` with `route=question_lookup` | Inspect MedCPT reranker and question-route logic in `retrieval_policy.py` |
| `depth=none` | Treat as ingest gap first; do not disguise it as a ranking fix |
| `depth=abstract` with weak dense signal | Check dense-query enablement and embedding availability |
| `bundles=0` or weak context relevance | Inspect routing and evidence-lane selection |
| `hit_at_k=1` but `hit_at_1=0` | Inspect fusion and rerank ordering rather than recall |
| `error_rate>0` | Debug runtime, dependency, or connection failures before interpreting retrieval metrics |
| Faithfulness or hallucination issues | Tighten generation prompts or grounded-answer logic, then rerun |

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
