# 10a — RAG Quality Analyzer

> **Status**: locked for the inventory of existing eval components, the
> boundary contract against `10-observability.md` / Langfuse Cloud / the
> `langfuse` skill, the six new retrieval-specific metrics this lane
> adds, the `solemd.rag_quality_metrics` Postgres table on serve, the
> Mode-A (Langfuse export) ingestion contract, the cascade-trace parquet
> schema, the analyzer code shape under `engine/app/rag_quality/`, the
> Dramatiq + pg_cron worker placement, and the operational footprint
> targets. **Provisional**: exact Grafana panel JSON / Grafonnet layout,
> the pinned `ranx` minor-version, and the Mode-B (Alloy side-tap)
> ingestion path. **Deferred**: per-policy A/B A/B-test power analysis,
> per-evaluator LLM-judge wiring beyond the existing Patronus Lynx 8B
> faithfulness path, and write-back of `10a` metrics into Langfuse as
> custom scores.
>
> **Date**: 2026-04-17
>
> **Scope**: the local **batch-mode RAG-quality analyzer** that ingests
> cascade traces (Langfuse export today; observability parquet pipeline
> later), computes RAG-specific quality metrics that Langfuse Cloud
> Hobby cannot natively surface (lane-fusion contribution, cross-encoder
> rerank effectiveness, parent-paper promotion dedup, evidence-vs-mapped tier
> hit-rate split, per-`chunk_version_key` A/B recall, evidence-unit
> grounding round-trip success), persists them into a single Postgres
> table on the serve cluster (`solemd.rag_quality_metrics`), and exposes
> them via Grafana panels. This doc owns:
>
> - The new `engine/app/rag_quality/` Python package (Pydantic boundary
>   models, analyzer orchestrator, six metric runners).
> - The `solemd.rag_quality_metrics` table on serve (via the SQL-first
>   `12-migrations.md` workflow).
> - The Mode-A Langfuse-export ingestion contract and the parquet
>   schema both ingestion modes produce.
> - The Dramatiq actor `rag_quality.analyze_dataset_run`, its pg_cron
>   trigger, and the manual CLI entry point.
> - The new "RAG Quality" Grafana dashboard panels (data-source-only;
>   Grafonnet authoring discipline per `10 §0`).
>
> This doc does **not** own:
>
> - Operational telemetry (PG / OpenSearch / Redis / engine-process
>   health, queue depth, latency histograms, alert rules) —
>   `10-observability.md`.
> - Live LLM tracing, prompt management, generic LLM cost tracking,
>   dataset definitions, evaluator score-config UX — Langfuse Cloud
>   plus the `langfuse` skill (`.claude/skills/langfuse/references/benchmarking.md`).
> - The cascade trace shape itself — `08 §15` is authority; `10a`
>   consumes that shape verbatim.
> - Chunker policy decisions — `05a` is authority for the
>   `chunk_version_key` lifecycle; `10a` only *informs* those decisions
>   by computing per-policy recall deltas.
> - Benchmark dataset construction — `engine/scripts/prepare_rag_curated_benchmarks.py`
>   plus the `langfuse` skill own dataset builds; `10a` consumes whatever
>   datasets exist.
>
> **Authority**: this doc is authority for the offline RAG-quality
> analytics surface — its Postgres table, ingestion contract, the six
> new metric specs, the analyzer module layout, and its Grafana panel
> set. It is **not** authority for any of the existing eval components
> enumerated in §2; those remain owned by their files in
> `engine/app/rag_ingest/`. This doc inventories them and locks the
> boundary contracts that wire them into the new analyzer.

## Purpose

A reconnaissance pass before authoring this doc found ~14 evaluation
components already implemented under `engine/app/rag_ingest/` covering
hit@1, hit@k, MRR, NDCG, GroundedAnswerRate, p50/p95/p99 latency, RAGAS
context_precision/context_recall, and PASS/FAIL faithfulness via
Patronus Lynx 8B on local Ollama. What is missing is **plumbing**, not
algorithms:

1. A small persistence layer (one Postgres table) so multi-day
   quality trends survive Langfuse Cloud Hobby's 30-day data-access
   window (`10 §7.3`).
2. Six retrieval-internal analyzers (lane-fusion contribution, rerank
   effectiveness, parent-paper promotion dedup, evidence-vs-mapped tier split,
   per-policy A/B, grounding round-trip) that Langfuse evaluators
   cannot natively express because they require the cascade's
   per-stage `score_breakdown` payload (`08 §15.2`), not just the
   final response.
3. A Grafana dashboard so the operator sees these alongside the
   operational dashboards already authored in `10 §9`.
4. A nightly Dramatiq actor + pg_cron trigger that materializes
   the metrics from the previous day's cascade traces.

Total engineering cost target: **~20h initial, ~2h/quarter
maintenance.** This doc is a wire-up + thin-extension spec, not a
greenfield design.

Two product concerns share the same surface as `10` and must remain
distinguishable:

1. **Operational telemetry** (PG/OpenSearch/Redis/engine health, latency,
   error counters, queue depth) — owned by `10`. Lives in Prometheus +
   Loki, surfaced in five existing Grafana dashboards.
2. **RAG-quality batch analytics** (this doc) — daily-cadence; per-query
   metrics aggregated from cascade traces; stored in Postgres for
   long-term trend analysis. Lives in one new Postgres table, surfaced
   in one new Grafana dashboard.

The two surfaces share the Grafana instance from `10 §2.1` but never
share metric tables. Cross-linking between an operational latency
spike (`10`) and the underlying retrieval-quality regression (`10a`) is
done by hand via the `trace_id` exemplar (`10 §0`), not by a join layer.

## §0 Conventions delta from `08` / `10`

Inherits every convention from `00`, `02 §0`, `03 §0`, `05a §0`,
`06 §0`, `07 §0`, `08 §0`, and `10 §0`. This doc adds:

| Concern | Quality-analyzer delta |
|---|---|
| **Vocabulary discipline** | "Evidence unit" is the canonical retrieval-time term per `05a §0`/`07 §0`/`08 §0`. "Chunk" applies only to warehouse-side assembly + storage (`paper_chunks`, `paper_chunk_members`, `paper_chunk_versions`, per `02 §856`/§868/§841). Evidence tier promotes evidence-unit docs into `evidence_index` (`07 §3.5`); mapped tier has evidence units in warehouse but they are **not indexed** there. Stage 3 promotion (`08 §6.2`) keeps **up to 3 evidence hits per paper**, not "chunks per paper." Abstract-only / thin-text papers can have a smaller evidence surface; not every paper "fully chunks." Every metric below is named in this vocabulary. **locked**. |
| **Cascade-trace-schema-drift coordination rule** | `08 §15` defines the cascade trace shape. Any new field added to that catalog (especially Stage 1 `score_breakdown`, Stage 2 `rerank_score` per candidate, Stage 4 grounding-roundtrip flag) must be backfilled into this doc's parquet schema (§7) **in the same PR** as the `08` change. The analyzer (`engine/app/rag_quality/analyzer.py`) drops unknown fields and emits a `severity=warn` log; coordination is the recovery path. **locked**. |
| **RAG-quality Postgres table convention** | Exactly one table — `solemd.rag_quality_metrics` on the **serve cluster** (not warehouse). Append-only; PK = `run_id`; one row per `(run_id, query_id)`. Aggregations done at query-time via Grafana / SQL views. No materialized views in v1. The table is registered in `12 §9` ledger (see Upstream amendments). **locked**. |
| **Canonical A/B dimensions** | Two columns are the canonical experiment axes: `dataset_name` (the benchmark suite name from `benchmark_catalog.py`) and `chunk_version_key` (`05a §1`). Every analyzer that compares variants compares along one of these two axes. No ad-hoc per-PR experiment tags; if a third axis is needed, add a typed column, not a JSON blob. **locked**. |
| **Mode A (Langfuse export) is locked; Mode B (Alloy side-tap) is deferred** | The day-one ingestion path reads Langfuse v4 dataset-run export API. The deferred path side-taps the Alloy → Langfuse OTLP stream into a parquet writer; no engineering work today. Both modes produce the same parquet shape (§7). When Mode B lands, the analyzer is unchanged — only the upstream writer changes. **locked**. |
| **Boundary against `10`** | Operational metrics live in Prometheus and never flow into `solemd.rag_quality_metrics`. Quality metrics live in `solemd.rag_quality_metrics` and are never scraped by Prometheus. Cross-signal navigation is by hand via `trace_id` exemplar (`10 §0` rule), not by a join layer. **locked**. |
| **No write-back to Langfuse** | This doc never pushes computed `10a` metrics back to Langfuse as custom scores. The reverse (Langfuse-emitted RAGAS scores via `push_ragas_scores_to_langfuse()` in `engine/app/rag_ingest/ragas_eval.py:72-87` during the run itself) is unaffected; that path stays inside the experiment, not the analyzer. **locked** — revisit if the operator wants single-pane review in Langfuse. |
| **Grounding-level split is first-class** | Paper-grounded support and evidence-grounded support are different product behaviors. The analyzer therefore carries `grounding_level` from the cascade trace into `solemd.rag_quality_metrics`, and Grafana panels compare hit@k / MRR / nDCG / faithfulness by `grounding_level` instead of collapsing them into one line. **locked**. |

## §1 Identity / boundary

This document declares **no new canonical identity types**. It composes
existing identities:

| Identity | Source doc | `10a` role |
|---|---|---|
| `trace_id` (UUIDv7) | `08 §15.2` | Per-query primary join across parquet rows and `solemd.rag_quality_metrics`. |
| `run_id` (UUID) | Langfuse dataset-run id | PK of `solemd.rag_quality_metrics`; one analyzer invocation produces one `run_id`'s worth of rows. |
| `serving_run_id` (UUIDv7) | `03 §2`, `08 §15.2` | Carried on every metric row for cohort-drift attribution. |
| `chunk_version_key` (UUIDv7) | `02 §2`, `05a §1` | One of two canonical A/B axes (§0). Per-policy A/B analyzer (§4.5) groups on this. |
| `dataset_name` (text) | `benchmark_catalog.py` | The other canonical A/B axis (§0). |
| `corpus_id` (BIGINT) | `02 §2` | Used internally by the dedup analyzer (§4.3) but **never** stored as a column on `rag_quality_metrics` — that would explode cardinality. Stored only in the upstream parquet for one-off forensic queries. |
| `evidence_key` (UUIDv5) | `02 §2`, `05a §1.2` | Used internally by the grounding-roundtrip analyzer (§4.6); same cardinality discipline as `corpus_id`. |

Per-row metric grain is `(run_id, query_id)`. There is no per-`corpus_id`
or per-`evidence_key` row in `rag_quality_metrics` by design.

## §2 Inventory of existing eval components

The 17-row inventory below is the source of truth for "what already
exists." Each row cites file:line. **Status legend**: **locked** (used
verbatim by the analyzer); **adapt** (small wrapper or input-shape
change at the boundary); **new** (this doc authors).

| # | Component | File:line | Status | Notes |
|---|---|---|---|---|
| 1 | Pure-logic structural metric framework | `engine/app/rag_ingest/eval_metrics.py:1-150` | **locked** | `EvalScore`, `EvalCase`, `BaseEvalMetric` Protocol, `HitAt1`, `HitAtK`, `MRR`, `NDCG`, `GroundedAnswerRate`, `TargetInGroundedAnswer`, `TargetInAnswerCorpus`. Pure functions; analyzer imports without modification. `eval_case_from_runtime_result()` (`:122-150`) is the bridge from runtime cases to `EvalCase`. |
| 2 | RAGAS context wrappers + Langfuse push | `engine/app/rag_ingest/ragas_eval.py:1-87` | **locked** | `compute_context_metrics()` wraps `NonLLMContextPrecisionWithReference` + `NonLLMContextRecall`. Optional dep — graceful fallback returns `error="ragas not installed"`. `push_ragas_scores_to_langfuse()` is run-time push (in-experiment); `10a` never calls it. |
| 3 | Faithfulness checker (Patronus Lynx 8B) | `engine/app/rag_ingest/faithfulness_checker.py:1-136` | **locked** | `LynxFaithfulnessChecker` calls local Ollama at `http://127.0.0.1:11434`; structured 3-field prompt → `ClaimVerdict(verdict="PASS"|"FAIL", success=True|False)`. Local-LLM only; zero unit cost vs Langfuse Cloud. Skipped (verdict=`SKIP`) if Ollama unreachable. |
| 4 | Runtime case results model | `engine/app/rag_ingest/runtime_eval_models.py` (entire file; ≈350 lines) | **locked** | `RuntimeEvalCaseResult`, `RuntimeEvalAggregate`, `RuntimeEvalSummary`, slow-case payloads. Already captures per-case stage durations, candidate counts, retrieval channel hit counts, route signature. |
| 5 | Runtime aggregator (p50/p95/p99 + by-family/depth) | `engine/app/rag_ingest/runtime_eval_summary.py:1-424` | **locked** | `aggregate_case_results()`, `summarize_runtime_results()`. Computes hit_at_1/k_rate, target rates, mean/p50/p95/p99 duration, slow-case hotspots, by-query-family / by-source-system / by-warehouse-depth breakdowns. The analyzer wraps this for per-suite roll-ups; raw output is what populates the per-row metric columns. |
| 6 | Runtime-eval driver (run a query case) | `engine/app/rag_ingest/runtime_eval.py:1-324` + `runtime_eval_execution.py:1-280` | **locked** | Runs a single query case against the live RAG service, captures cascade trace fields (hit_rank, grounded_answer, cited_spans, stage_durations, route_signature). The analyzer never re-runs cases; it consumes their output via the parquet shape (§7). |
| 7 | Benchmark suite catalog (8 suites with quality gates) | `engine/app/rag_ingest/benchmark_catalog.py:1-262` | **locked** | Defines the canonical 8 dataset suites; gates are quality thresholds the experiment runner checks. `10a` consumes the suite name as `dataset_name`; gates are not enforced by `10a` (the experiment runner already does). |
| 8 | Benchmark orchestration + warehouse-depth gates | `engine/app/rag_ingest/runtime_eval_benchmarks.py:1-1218` | **locked** | Per-suite quality gates, warehouse-depth gates, failure-to-annotation-queue handoff. `10a` does not invoke this; it consumes the resulting cascade traces post-hoc. |
| 9 | Langfuse-native experiment runner | `engine/app/rag_ingest/experiment.py:1-1051` | **locked** | Issues per-case `run_experiment` calls to Langfuse, attaches per-case scores. The structured per-case score data this writes is what Mode-A export retrieves. |
| 10 | Langfuse historical-run review | `engine/app/rag_ingest/langfuse_run_review.py:1-702` | **adapt** | Today: CLI-only output of per-route / per-warehouse-depth aggregates. The metric-extraction logic is reused as-is; only the *output sink* changes (CLI → `solemd.rag_quality_metrics` row inserts). The analyzer imports the same private helpers (`_evaluation_value`, `_percentile`, `_mean`) — no fork. |
| 11 | Langfuse-eval push helper | `engine/app/rag_ingest/eval_langfuse.py` (entire file) | **locked** | `push_scores_to_langfuse()` — used by `ragas_eval.py:72-87` only. Not used by `10a`. |
| 12 | RAG benchmark CLI | `engine/scripts/rag_benchmark.py:1-445` | **locked** | Orchestrates benchmark runs, gate checking, baseline comparison, failure diagnosis. Calls `runtime_eval_benchmarks.py`. The analyzer is run **after** this CLI completes, against its emitted Langfuse runs. |
| 13 | Curated benchmark dataset preparer | `engine/scripts/prepare_rag_curated_benchmarks.py:1-3410` | **locked** | Builds and (optionally) JSON-snapshots curated dataset for the 30-day archive (`10 §7.3` "export mirror" requirement on Hobby). `10a` does not author datasets; it consumes whatever datasets exist. |
| 14 | Langfuse score-config registry | `engine/app/langfuse_config.py` (entire file; the `SCORE_*` constants used at `langfuse_run_review.py:11-19`) | **locked** | Constants `SCORE_HIT_AT_1`, `SCORE_HIT_AT_K`, `SCORE_GROUNDED_ANSWER_RATE`, `SCORE_TARGET_IN_CORPUS`, `SCORE_DURATION_MS`, `SCORE_ROUTING_MATCH`. The analyzer keys off these names when reading Langfuse evaluations from the export payload. |
| 15 | RAG quality boundary models | `engine/app/rag_quality/models.py` | **new** | §7 — Pydantic v2 boundary models (`CascadeTraceRecord`, `RagQualityMetric`). |
| 16 | Analyzer orchestrator + 6 metric runners | `engine/app/rag_quality/{analyzer,ragas_runner,ranx_runner,lane_fusion,rerank_analyzer,dedup_analyzer,tier_split,policy_ab,grounding_check}.py` | **new** | §8. |
| 17 | Postgres metric store | `solemd.rag_quality_metrics` (`db/schema/serve/*.sql` + `db/migrations/serve/*.sql`) | **new** | §5; ledger row in `12 §9`. |

Headline: **rows 1-14 (~7 800 lines) exist and are reusable as-is or
with thin shims; rows 15-17 (~600-800 lines new code + one SQL
migration set) is the entire delta this doc owns.** `engine/app/rag_quality/`
is the new package boundary; nothing under `engine/app/rag_ingest/` is
edited.

## §3 Locked metric catalog (already-implemented)

These metrics already compute today. The analyzer's job is to read
them out of the cascade trace and persist them into `rag_quality_metrics`
columns; no new computation. Source for each is cited file:line.

| Metric | Category | Source code | Computed from | Current persistence |
|---|---|---|---|---|
| `hit_at_1` | structural | `eval_metrics.py:50-56` | `case.hit_rank == 1` | Langfuse score (per-case) + `RuntimeEvalAggregate.hit_at_1_rate` (per-suite) |
| `hit_at_k` | structural | `eval_metrics.py:59-65` | `case.hit_rank is not None` | same |
| `mrr` | structural | `eval_metrics.py:68-76` | `1.0 / case.hit_rank` (or 0) | same |
| `ndcg` | structural | `eval_metrics.py:79-87` | `1 / log2(hit_rank + 1)` (or 0); single-relevant variant | same |
| `grounded_answer_rate` | structural | `eval_metrics.py:90-96` | `case.grounded_answer_present` | same |
| `target_in_grounded_answer` | structural | `eval_metrics.py:99-105` | `case.target_in_grounded_answer` | same |
| `target_in_answer_corpus` | structural | `eval_metrics.py:108-114` | `case.target_in_answer_corpus` | same |
| `mean / p50 / p95 / p99 / max duration_ms` | latency | `runtime_eval_summary.py:47-65, 134-148` | `result.duration_ms` per case | per-suite aggregate; not per-case in Langfuse |
| `mean / p50 / p95 / p99 service_duration_ms` | latency | `runtime_eval_summary.py:149-153` | `result.service_duration_ms` per case | per-suite aggregate |
| `over_250 / 500 / 1000 / 5000 / 30000_ms_count` | latency | `runtime_eval_summary.py:155-159` | tail-bucket counts | per-suite aggregate |
| `context_precision` | RAG | `ragas_eval.py:39-66` (NonLLMContextPrecisionWithReference) | `(question, answer, retrieved_contexts, ground_truth)` | Langfuse score (when ground_truth present) |
| `context_recall` | RAG | `ragas_eval.py:39-66` (NonLLMContextRecall) | same | Langfuse score |
| `faithfulness_verdict` | faithfulness | `faithfulness_checker.py` (Lynx 8B via Ollama) | `(question, context, answer)` → `PASS`/`FAIL`/`SKIP` | not currently in Langfuse; was stored in run output only |
| `retrieval_channel_presence_rates` | retrieval-internal | `runtime_eval_summary.py:131-133, 161-164` | `result.retrieval_channel_hit_counts` | per-suite aggregate |
| `route_profiles_ms` (per route_signature) | retrieval-internal | `runtime_eval_summary.py:209-211, 310-316` | `result.session_flags` → `_case_route_signature()` | per-suite aggregate |
| `warehouse_depth_counts` (`fulltext` / `abstract` / `none`) | retrieval-internal | `runtime_eval_summary.py:364-372, 402-404` | derived from `cited_span_count` + `grounded_answer_present` | per-suite aggregate via `by_warehouse_depth` |
| `slow_stage_hotspots` | retrieval-internal | `runtime_eval_summary.py:317-331` | per-stage durations on slow cases | per-suite aggregate |

The analyzer's job for §3 metrics is **read, not compute**. Each
parquet row (§7) carries the per-query inputs; the analyzer dispatches
to the existing helpers and writes the outputs into the matching
`rag_quality_metrics` columns (§5). No re-implementation.

## §4 New metric catalog (the gap — six retrieval-specific analyzers)

Six retrieval-internal metrics that Langfuse Cloud Hobby cannot natively
surface because they require either the cascade's `score_breakdown`
payload (`08 §15.2`), per-candidate rerank scores (Stage 2), parent-paper
grouping (Stage 3), or two-arm comparison (`chunk_version_key` A/B).
Each is **locked** as a target spec. Implementation is part of the ~20h
delta this doc estimates.

### §4.1 Lane-fusion contribution

**Definition.** For each query, the share of the Stage 1 reciprocal-rank
contribution attributable to the BM25 lane vs the dense lane. Diagnoses
queries where one lane dominated (i.e. the other lane was effectively
dead weight on this query).

**Inputs from cascade trace.** Stage 1's `score_breakdown` payload —
per-candidate rank contribution, not raw lane scores. `08 §15.2`
now carries `score_breakdown: list[ScoreBreakdownEntry]` on the Stage 1
row, where `ScoreBreakdownEntry = {corpus_id, bm25_rank, dense_rank,
rrf_score}`. The analyzer therefore requires benchmark/search-pipeline
runs to enable both `req.explain=True` (`08 §2.1`) and the OpenSearch
`hybrid_score_explanation` response processor; the exported
`score_breakdown` remains a SoleMD.Graph normalization of that response.

**Output shape.** Two REAL columns on `rag_quality_metrics`:

- `lane_fusion_bm25_weight` — fraction of the top-K retrieved
  candidates whose dominant reciprocal-rank contribution was BM25.
- `lane_fusion_dense_weight` — same for dense. (Rounding caveat: when
  RRF gives equal contribution, both lanes get 0.5.)

Aggregation in Grafana: mean / median / top-decile per query family
to spot lane imbalance hot-spots.

**Computation cost.** Pure Python over ≤ 200 candidates per query.
Negligible (~1ms per query case).

**Code home.** `engine/app/rag_quality/lane_fusion.py`. **locked**.

### §4.2 Cross-encoder rerank effectiveness

**Definition.** Per cascade run: the calibrated cross-encoder's lift
on top-1 ordering versus Stage 1 RRF order. Three sub-quantities:

- `rerank_score_top1` — top-1 candidate's cross-encoder score
  (calibrated logit from MedCPT-Cross-Encoder per `08 §5.4`).
- `rerank_score_gap` — `rerank_score[0] - rerank_score[1]` (the
  decisiveness of the top-1 pick).
- `rerank_promoted` — boolean: did Stage 2 change top-1 from Stage 1's
  best (`rrf_score` order)?

Together these reveal: high promotion rate + small score gap = rerank
is changing order but not confidently; low promotion rate + large gap
= rerank is mostly confirming Stage 1 (and is therefore expensive but
low-value on this dataset).

**Inputs from cascade trace.** Stage 2's `rerank_scores` (already
captured per `08 §5.2`) plus Stage 1's RRF-ordered candidate list.
Both are present in `08 §15.2`'s field set when `req.explain=True`.

**Output shape.** Three columns on `rag_quality_metrics`:
`rerank_score_top1 REAL`, `rerank_score_gap REAL`, `rerank_promoted BOOLEAN`.

**Computation cost.** Pure Python; ~1ms per query case.

**Code home.** `engine/app/rag_quality/rerank_analyzer.py`. **locked**.

### §4.3 Parent-paper promotion dedup quality

**Definition.** For evidence-lane queries: post-Stage-3 promotion
(`08 §6.2`), how many distinct parent papers populate the top-K and
how many evidence units per paper survive (≤ 3 by `08 §6.2` rule).
Reveals over-clustering — one paper dominating top-K with three
near-duplicate evidence units crowding out distinct citations.

**Inputs from cascade trace.** The post-Stage-3 `final_top_k` (per
`08 §15.2` Stage 3 attributes) — each entry has `(corpus_id,
evidence_keys[])`. Today Stage 3 emits `parent_count` and
`evidence_hits_per_paper_max` (`08 §15.2`); the analyzer needs the per-parent
count distribution. **Upstream amendment needed** — Stage 3 should add
`evidence_units_per_paper: list[int]` (one int per parent in the
final top-K).

**Output shape.** One SMALLINT column on `rag_quality_metrics`:

- `evidence_units_per_paper SMALLINT` — average evidence units per
  parent paper in the final top-K (rounded; range 1-3 by `08 §6.2`
  rule).

For paper-lane queries this is always 1 (one parent per result by
construction); the analyzer writes `1` rather than NULL so Grafana
queries don't need to special-case lane.

**Computation cost.** Pure Python; ~1ms per query case.

**Code home.** `engine/app/rag_quality/dedup_analyzer.py`. **locked**.

### §4.4 Evidence-tier vs mapped-tier hit-rate split

**Definition.** Per benchmark suite, hit@k for queries that resolved
against evidence-only candidates vs queries that drew from the mapped tier.
The evidence tier is the ~10K-paper promoted subset (`07 §3.5`); the mapped
tier is the remainder of `paper_index`. The split reveals whether the
evidence subset cohort is the right ~10K papers — if hit@k is dramatically
higher on mapped, the promotion criteria need revisiting.

**Inputs from cascade trace.** Stage 1's `tier_filter` per query
(`08 §2.1` `RetrieveRequest.evidence_only` plus per-candidate `tier` from
the OpenSearch `_source`). The analyzer joins this against the existing
`hit_at_k` computation (§3) and emits the split.

**Output shape.** One SMALLINT column `tier SMALLINT` on
`rag_quality_metrics` (1 = mapped, 2 = evidence, per `07 §3.2` registry).
Aggregation in Grafana groups by `(dataset_name, tier)`.

**Computation cost.** Pure Python; per-query column write.

**Code home.** `engine/app/rag_quality/tier_split.py`. **locked**.

### §4.5 Per-policy chunker A/B (`chunk_version_key` recall)

**Definition.** When two `chunk_version_key` values coexist within a
time window, the same benchmark queries run against both produce
hit@k deltas. Drives the chunk-policy registry decisions per `05a §4`
(promotion of a candidate policy to the new `is_active=true` policy).

**Inputs from cascade trace.** `chunk_version_key` per query (already
on `EvidenceHit` per `08 §1`). The analyzer groups
`(dataset_name, query_id)` rows by `chunk_version_key` and computes
delta(hit@k), delta(mrr), delta(grounded_answer_rate). Requires that
the experiment runner submits both arms within the same `dataset_name`
window.

**Output shape.** No new columns — `chunk_version_key` is already on
the table (§5). The A/B analysis is done **at query time** in Grafana
via a pivot:

```sql
-- Grafana: per-policy hit_at_k delta on the same dataset
SELECT
  query_id,
  MAX(CASE WHEN chunk_version_key = $candidate_key
           THEN CAST(hit_at_1 AS INT) END) AS candidate_hit,
  MAX(CASE WHEN chunk_version_key = $baseline_key
           THEN CAST(hit_at_1 AS INT) END) AS baseline_hit
FROM solemd.rag_quality_metrics
WHERE dataset_name = $dataset
  AND recorded_at >= NOW() - INTERVAL '7 days'
GROUP BY query_id;
```

Per-`chunk_version_key` index on `rag_quality_metrics` (§5) makes this
a sub-second query at typical row counts.

**Computation cost.** Zero at write time; analyzer just emits the
column. All work is at Grafana panel render time.

**Code home.** `engine/app/rag_quality/policy_ab.py` — the **runner**
is a thin adapter that shapes input rows and stamps `chunk_version_key`;
no per-query computation. **locked**.

### §4.6 Evidence-unit grounding round-trip success rate

**Definition.** For each evidence-lane query: did the FDW dereference
of `evidence_key` (per `08 §7.2`) return text that supports the
synthesized answer? Two-step check: (1) FDW resolved the key (Stage 4
succeeded), (2) the dereferenced text passes either the existing
faithfulness check (Lynx 8B via Ollama) or a simple BM25
query-text-presence heuristic when Ollama is unavailable.

**Inputs from cascade trace.** Stage 4's dereference outcome plus the
dereferenced `chunk_text`. `08 §15.2` now exposes the compact
`grounding_roundtrip_failures: list[evidence_key]` shape rather than a
per-key boolean payload, which preserves Langfuse unit budget while
still letting the analyzer compute round-trip success cleanly. Stage 4
continues to emit `evidence_units_resolved` and `evidence_units_failed`
aggregates as the operator-facing summary surface.

**Output shape.** One nullable BOOLEAN column on `rag_quality_metrics`:
`grounding_roundtrip_ok BOOLEAN NULL` — TRUE if all evidence units
resolved AND faithfulness PASS (or BM25-presence-heuristic pass);
FALSE if any failed; NULL for paper-lane queries.

A partial btree index `WHERE grounding_roundtrip_ok = false` (§5)
makes failure-list queries cheap.

**Computation cost.** Per query: one Lynx 8B call (~1-2s on local
Ollama) when running with faithfulness; near-zero when running with
the BM25 heuristic. Faithfulness mode is opt-in via analyzer flag.

**Code home.** `engine/app/rag_quality/grounding_check.py`. **locked**.

### §4.7 Grounding-level split (paper vs evidence)

**Definition.** The same quality metrics can describe two materially
different support modes:

- `paper` — semantic support grounded to the paper/card level only
- `evidence` — support grounded to at least one resolved evidence unit

This is a **faceting dimension**, not a new score formula. Its job is to
prevent paper-grounded and evidence-grounded retrieval quality from
being averaged together and misread as one system behavior.

**Inputs from cascade trace.** Trace-level `grounding_level` exported by
`08 §15.2`, derived from the final ranked packet: `evidence` if any
ranked paper is evidence-grounded after Stage 4, otherwise `paper`.

**Output shape.** One SMALLINT column on `rag_quality_metrics`:

- `grounding_level SMALLINT NOT NULL` — `1=paper`, `2=evidence`

All top-line quality panels group by this column.

**Computation cost.** Zero. The analyzer copies the exported value into
the metric row and uses it as a grouping dimension.

**Code home.** `engine/app/rag_quality/models.py` + the row writer.
**locked**.

## §5 Postgres metric store

One table on the **serve cluster** (not warehouse), authored via the
`12-migrations.md` SQL-first workflow. **Locked** for the schema below;
**provisional** only for the `evidence_units_per_paper` SMALLINT vs
INT choice (3 fits in SMALLINT trivially today).

### §5.1 Table — `solemd.rag_quality_metrics`

```text
# Illustrative schema sketch. Authoring surface: db/schema/serve/*.sql
# plus db/migrations/serve/*.sql (full file authority: 03 §4 + 12 §2)
# Authority: docs/rag/10a-rag-quality-analyzer.md §5
# Ledger row: 12 §9 row 17 (db table + bootstrap scheduler state).

table "rag_quality_metrics" {
  schema = schema.solemd
  comment = "RAG quality batch analytics. One row per (run_id, query_id). Authority: 10a §5."

  column "run_id"             { null = false; type = uuid }      # PK; one analyzer invocation = one run_id
  column "query_id"           { null = false; type = text }      # canonical query_id from benchmark dataset (case identifier)
  column "dataset_name"       { null = false; type = text }      # canonical benchmark suite name (benchmark_catalog.py)
  column "query_family"       { null = false; type = text }      # e.g. 'title_global', 'evidence_intent', etc.
  column "recorded_at"        { null = false; type = timestamptz; default = sql("now()") }
  column "trace_id"           { null = false; type = uuid }      # cascade trace_id (08 §15.2) for cross-link to Langfuse
  column "serving_run_id"     { null = false; type = uuid }      # active-pointer snapshot at request time (08 §1)
  column "chunk_version_key"  { null = true;  type = uuid }      # one of two canonical A/B axes (§0)
  column "lane"               { null = false; type = smallint }  # 1=paper, 2=evidence (07 §3.2 registry mirror)
  column "grounding_level"    { null = false; type = smallint }  # 1=paper, 2=evidence (§4.7)
  column "tier"               { null = true;  type = smallint }  # 1=mapped, 2=evidence, NULL=mixed (07 §3.2 registry mirror; §4.4)

  # §3 metrics (already computed; analyzer copies in)
  column "hit_rank"                       { null = true;  type = integer }   # 1-based; NULL=miss
  column "hit_at_1"                       { null = false; type = boolean }
  column "hit_at_k"                       { null = false; type = boolean }
  column "mrr"                            { null = false; type = real }      # 1/hit_rank or 0
  column "ndcg_k"                         { null = false; type = real }      # 1/log2(hit_rank+1) or 0
  column "grounded_answer_present"        { null = false; type = boolean }
  column "target_in_grounded_answer"      { null = false; type = boolean }
  column "target_in_answer_corpus"        { null = false; type = boolean }
  column "context_precision"              { null = true;  type = real }      # NULL when ragas unavailable
  column "context_recall"                 { null = true;  type = real }      # NULL when ragas unavailable
  column "faithfulness_verdict"           { null = true;  type = smallint }  # 0=SKIP, 1=PASS, 2=FAIL; NULL=not requested
  column "duration_ms"                    { null = false; type = integer }
  column "service_duration_ms"            { null = false; type = integer }
  column "lifecycle_phase_durations_ms"   { null = false; type = jsonb; default = sql("'{}'::jsonb") } # per-stage from CascadeTimings (08 §2.2)

  # §4 new metrics
  column "lane_fusion_bm25_weight"        { null = false; type = real; default = 0.5 }   # §4.1
  column "lane_fusion_dense_weight"       { null = false; type = real; default = 0.5 }   # §4.1
  column "rerank_score_top1"              { null = true;  type = real }                  # §4.2; NULL when skip_rerank
  column "rerank_score_gap"               { null = true;  type = real }                  # §4.2
  column "rerank_promoted"                { null = false; type = boolean; default = sql("false") } # §4.2
  column "evidence_units_per_paper"       { null = false; type = smallint; default = 1 }  # §4.3
  column "grounding_roundtrip_ok"         { null = true;  type = boolean }               # §4.6; NULL=paper-grounded rows

  primary_key { columns = [column.run_id, column.query_id] }

  # Indexes — see §5.2 for rationale
  index "idx_rag_quality_dataset_recorded" {
    columns = [column.dataset_name, column.recorded_at]
    on      = "DESC"  # recorded_at DESC; dataset_name implicit ASC
  }
  index "idx_rag_quality_chunk_version" {
    columns = [column.chunk_version_key, column.recorded_at]
    where   = "chunk_version_key IS NOT NULL"
  }
  index "idx_rag_quality_grounding_failed" {
    columns = [column.recorded_at]
    where   = "grounding_roundtrip_ok = false"
  }

# Append-only — fillfactor=100 maximizes packing
  settings {
    fillfactor = 100
  }
}
```

Two storage-discipline notes:

1. **Append-only.** No UPDATE path. Re-runs of the same `(run_id,
   query_id)` PK conflict-on-insert and **upsert**: the analyzer is
   idempotent — re-running on the same Langfuse run replaces the row
   bytes-identical. PG MVCC means an upsert leaves a dead tuple per
   row; autovacuum on the table is set per `09 §5` defaults (no
   override needed at this row volume).

2. **No partitioning.** At the cost / footprint targets in §13 (~100K
   rows/year), partitioning is unnecessary overhead. Revisit if row
   volume crosses 10M (multi-year hold + much larger benchmark
   surface). **deferred** until measured pressure.

### §5.2 Index rationale

| Index | Cardinality discipline | Use case |
|---|---|---|
| PK `(run_id, query_id)` | unique by construction | Idempotent upsert; Langfuse-export retry safety. |
| `idx_rag_quality_dataset_recorded` | `dataset_name` is bounded (~8 suites today, ≤ 50 long-term); `recorded_at DESC` for "last N days of suite X" | Quality-trend Grafana panels (§10.1). |
| `idx_rag_quality_chunk_version` partial | NULL-valued rows excluded; partial keeps the index small (only A/B-tagged rows) | Per-policy A/B Grafana panel (§10.5); `policy_ab.py` lookups (§4.5). |
| `idx_rag_quality_grounding_failed` partial | only FALSE rows; tiny index | Failure forensics ("which queries had grounding failures last week?"). |

No covering indexes today — Grafana queries are cheap on the row count
projected (§13). Add a covering-index amendment via `12 §9` if a
specific panel becomes slow.

### §5.3 Retention

90 days local. Rationale: matches Langfuse Cloud Hobby's 30-day data
window with a 60-day buffer for cross-checking historical deltas
against Langfuse exports the operator may have manually archived
(`10 §7.3` "export mirror" path). Pruned by pg_cron daily:

```sql
-- pg_cron bootstrap SQL; run post-apply with a stable named job,
-- not inside the transactional schema migration that creates the table.
SELECT cron.schedule(
  job_name    := 'rag_quality_metrics_prune',
  schedule    := '15 04 * * *',     -- 04:15 UTC daily
  command     := $$ DELETE FROM solemd.rag_quality_metrics
                    WHERE recorded_at < now() - INTERVAL '90 days' $$
);
```

The 04:15 slot is between OpenSearch snapshot at 04:00 (`11 §13`) and
the analyzer fan-out at 04:30 (§9). **provisional** for the schedule
slot; **locked** for the 90-day retention.

Scheduler posture is **bootstrap state, not schema state**: named
`pg_cron` jobs are applied from an executor-owned post-apply / bootstrap
SQL step so re-bootstrap and recovery remain safe. This follows pg_cron's
named-job semantics and the runner-owned operational-step model, instead of
depending on rerunnable transactional migration SQL for job
registration. **locked**.

## §6 Cascade trace ingestion

Two ingestion modes producing the same parquet shape (§7).

### §6.1 Mode A — Langfuse export (locked, day-one)

Daily `langfuse-fetch` job calls Langfuse v4 dataset-run export API for
the previous day's runs and writes parquet to
`/mnt/solemd-graph/rag-quality/cascade-traces/<yyyy-mm-dd>.parquet`.

API surface (Langfuse Python SDK v4):

- `langfuse.api.dataset_runs.list(dataset_name=..., from_timestamp=..., to_timestamp=...)`
- `langfuse.api.dataset_run_items.list(dataset_run_id=...)`
- `langfuse.api.traces.get(trace_id=...)` for the full span tree
  including Stage 1 `score_breakdown` and Stage 2 `rerank_scores`
  (`08 §15.2`).

Primary source: <https://langfuse.com/docs/api> (Langfuse v4 REST API
reference). The Python SDK v4 wraps these endpoints; the analyzer
codes against the SDK, not raw HTTP.

The fetcher writes parquet via `pyarrow.parquet.write_table` at
default snappy compression. Volume: at ~5K cases/day per active
benchmark, ~2 KB per row uncompressed → ~10 MB/day raw → ~2 MB/day
parquet. Negligible against the warehouse FS budget (`01 §1`).

**Locked** for the Mode A contract.

### §6.2 Mode B — Alloy side-tap (deferred)

Alloy already exports OTLP traces to Langfuse (`10 §7.4`). A side-tap
would write the same trace stream to parquet locally, eliminating the
Langfuse round-trip and zeroing unit consumption. Implementation:
add an `otelcol.exporter.file` block to the Alloy pipeline alongside
the existing `otelcol.exporter.otlphttp.langfuse`.

**Deferred** — no engineering work today. When implemented, the
analyzer `engine/app/rag_quality/analyzer.py` is unchanged (the
parquet shape § 7 is the boundary); only the upstream writer changes.
Trigger: Hobby-plan unit budget pressure or an analyst need to skip
Langfuse Cloud entirely.

### §6.3 Failure modes for Mode A

| Failure | Recovery |
|---|---|
| Langfuse API rate-limit / 5xx | Exponential backoff; 3 retries; on persistent failure, log `severity=warn` and skip the day. The next day's run picks up both days (Langfuse retains 30 days). |
| Langfuse API key invalid | `severity=page` (the analyzer is operationally broken). |
| Parquet write to `/mnt/solemd-graph/rag-quality/cascade-traces/` fails (disk full) | `severity=page` per `10 §10.1` `DiskLowPage` rule which fires first. |
| Schema drift (new field in Langfuse export not in §7) | analyzer drops the field with `severity=info` log; coordination rule §0. |

## §7 Cascade trace parquet schema

One row per `(trace_id, query_id)`. Pydantic v2 boundary model lives
under `engine/app/rag_quality/models.py`. **Locked** for the column
set; field types are the typical pyarrow mappings.

### §7.1 Columns

| Column | pyarrow type | Source | Notes |
|---|---|---|---|
| `trace_id` | `string` (UUIDv7 hex) | `08 §15.2` trace-level | join key; PK with `query_id` |
| `query_id` | `string` | benchmark dataset case-id | join key |
| `dataset_name` | `string` | `benchmark_catalog.py` | one of the 8 canonical suites |
| `query_family` | `string` | `RuntimeEvalCaseResult.query_family` | per-row faceting |
| `lane` | `int8` | `RetrieveRequest.lane` (`08 §2.1`) | 1=paper, 2=evidence |
| `grounding_level` | `int8` | `RetrieveResponse.grounding_level` (`08 §2.2`) | 1=paper-grounded packet, 2=evidence-grounded packet |
| `tier_filter` | `string` | `evidence_only` flag derivation | "evidence_only" / "both" |
| `chunk_version_key` | `string` (UUIDv7 hex) | `08 §1` (carried on `EvidenceHit`) | nullable for paper-lane |
| `serving_run_id` | `string` (UUIDv7 hex) | `08 §15.2` trace-level | snapshot |
| `cohort_id` | `int32` | `08 §15.2` trace-level | resolved from active pointer |
| `stage_0_duration_ms` | `float32` | `CascadeTimings.stage_0_query_encoding_ms` | `08 §2.2` |
| `stage_1_duration_ms` | `float32` | `CascadeTimings.stage_1_lane_fusion_ms` | |
| `stage_2_duration_ms` | `float32` | `CascadeTimings.stage_2_cross_encoder_rerank_ms` | |
| `stage_3_duration_ms` | `float32` | `CascadeTimings.stage_3_parent_child_promotion_ms` | |
| `stage_4_duration_ms` | `float32` | `CascadeTimings.stage_4_grounding_dereference_ms` | |
| `total_duration_ms` | `float32` | `CascadeTimings.total_ms` | |
| `candidate_lane_scores` | `string` (JSON) | Stage 1 `score_breakdown` when benchmark/search-pipeline runs enable `req.explain=True` plus OpenSearch `hybrid_score_explanation` | per-candidate `[{corpus_id, bm25_rank, dense_rank, rrf_score}, …]`. Provided by `08 §15.2`; see §4.1. |
| `rerank_scores` | `string` (JSON) | Stage 2 per-candidate scores | `[{corpus_id, rerank_score}, …]` — present when `req.explain=True`. Provided by `08 §15.2`; see §4.2. |
| `final_top_k` | `string` (JSON) | Stage 3 final result | `[{corpus_id, evidence_keys[], rerank_score}, …]` |
| `grounding_roundtrip_failures` | `list<string>` | Stage 4 per-key failures | list of `evidence_key`s that didn't dereference. Provided by `08 §15.2`; see §4.6. |
| `expected_answer_corpus_ids` | `list<int64>` | benchmark dataset ground-truth | `corpus_id` of expected answer paper(s) |
| `cited_corpus_ids` | `list<int64>` | from final RAG response | empty if no LLM synthesis above the cascade |
| `route_signature` | `string` | `runtime_eval_summary._case_route_signature()` | `_ROUTE_SIGNATURE_KEYS` (`runtime_eval_summary.py:28-38`) |
| `warehouse_depth` | `string` | `runtime_eval_summary.py:364-372` | `fulltext` / `abstract` / `none` / `unknown` |

These three columns are part of the current `08 §15.2` export contract.
If any are unexpectedly absent in a degraded export path, the analyzer
writes `NULL` into the matching `rag_quality_metrics` columns and emits
a `severity=warn` log once per day.

### §7.2 Pydantic boundary model

```python
# engine/app/rag_quality/models.py — sketch
from __future__ import annotations
from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class ScoreBreakdownEntry(BaseModel):
    model_config = ConfigDict(frozen=True)
    corpus_id: int
    bm25_rank: int | None
    dense_rank: int | None
    rrf_score: float


class RerankEntry(BaseModel):
    model_config = ConfigDict(frozen=True)
    corpus_id: int
    rerank_score: float


class FinalTopKEntry(BaseModel):
    model_config = ConfigDict(frozen=True)
    corpus_id: int
    evidence_keys: list[UUID] = Field(default_factory=list)
    rerank_score: float


class CascadeTraceRecord(BaseModel):
    """One per (trace_id, query_id). Boundary model for the parquet
    rows. Mirror of the §7.1 schema."""
    model_config = ConfigDict(frozen=True, extra="forbid")

    trace_id: UUID
    query_id: str
    dataset_name: str
    query_family: str
    lane: Literal["paper", "evidence"]
    grounding_level: Literal["paper", "evidence"]
    tier_filter: Literal["evidence_only", "both"]
    chunk_version_key: UUID | None = None
    serving_run_id: UUID
    cohort_id: int | None = None

    stage_0_duration_ms: float
    stage_1_duration_ms: float
    stage_2_duration_ms: float
    stage_3_duration_ms: float
    stage_4_duration_ms: float
    total_duration_ms: float

    candidate_lane_scores: list[ScoreBreakdownEntry] = Field(default_factory=list)
    rerank_scores: list[RerankEntry] = Field(default_factory=list)
    final_top_k: list[FinalTopKEntry] = Field(default_factory=list)
    grounding_roundtrip_failures: list[UUID] = Field(default_factory=list)

    expected_answer_corpus_ids: list[int] = Field(default_factory=list)
    cited_corpus_ids: list[int] = Field(default_factory=list)

    route_signature: str | None = None
    warehouse_depth: Literal["fulltext", "abstract", "none", "unknown"] = "unknown"


class RagQualityMetric(BaseModel):
    """One per (run_id, query_id). Mirrors §5.1 columns. Boundary
    model for the COPY into solemd.rag_quality_metrics."""
    model_config = ConfigDict(frozen=True, extra="forbid")

    run_id: UUID
    query_id: str
    dataset_name: str
    query_family: str
    recorded_at: datetime
    trace_id: UUID
    serving_run_id: UUID
    chunk_version_key: UUID | None
    lane: int
    tier: int | None
    # — §3 metrics (already-computed, copied from existing helpers)
    hit_rank: int | None
    hit_at_1: bool
    hit_at_k: bool
    mrr: float
    ndcg_k: float
    grounded_answer_present: bool
    target_in_grounded_answer: bool
    target_in_answer_corpus: bool
    context_precision: float | None
    context_recall: float | None
    faithfulness_verdict: int | None     # 0=SKIP, 1=PASS, 2=FAIL
    duration_ms: int
    service_duration_ms: int
    lifecycle_phase_durations_ms: dict[str, int] = Field(default_factory=dict)
    # — §4 new metrics
    lane_fusion_bm25_weight: float
    lane_fusion_dense_weight: float
    rerank_score_top1: float | None
    rerank_score_gap: float | None
    rerank_promoted: bool
    evidence_units_per_paper: int
    grounding_roundtrip_ok: bool | None
```

Both models are `frozen=True` per `06 §4.5` boundary discipline.

## §8 Analyzer code shape

New package `engine/app/rag_quality/`. **Locked** for the file
layout below. Per-file responsibility is single-purpose; cross-file
imports are limited to `models.py` (boundary) and the existing
`engine/app/rag_ingest/` helpers (`eval_metrics.py`, `ragas_eval.py`,
`runtime_eval_summary.py`, `faithfulness_checker.py`,
`langfuse_run_review.py` private helpers).

```
engine/app/rag_quality/
├── __init__.py
├── models.py           # CascadeTraceRecord, RagQualityMetric, ScoreBreakdownEntry,
│                       # RerankEntry, FinalTopKEntry. (§7.2)
├── analyzer.py         # Orchestrator. Loads parquet → runs metric runners →
│                       # assembles RagQualityMetric rows → COPY into PG via
│                       # serve_admin pool. (§9)
├── ragas_runner.py     # Adapter wrapping ragas_eval.compute_context_metrics()
│                       # for the analyzer's input shape. (§3 row 11/12)
├── ranx_runner.py      # ranx wrapper for IR metrics not in eval_metrics.py
│                       # today (full nDCG@K, MAP, RRF analysis). Optional dep.
│                       # Primary source: https://amenra.github.io/ranx/
├── lane_fusion.py      # §4.1 — per-query BM25 vs dense weight from
│                       # candidate_lane_scores.
├── rerank_analyzer.py  # §4.2 — top-1 score, gap, promoted flag from
│                       # rerank_scores + Stage-1 RRF order.
├── dedup_analyzer.py   # §4.3 — evidence-units-per-paper from final_top_k.
│                       # Evidence lane only; paper lane writes 1.
├── tier_split.py       # §4.4 — tier column derivation from tier_filter +
│                       # per-candidate tier in the OpenSearch _source.
├── policy_ab.py        # §4.5 — input-shape stamper; no per-query computation
│                       # (A/B is a Grafana-time pivot).
├── grounding_check.py  # §4.6 — grounding_roundtrip_ok via Lynx 8B (Ollama)
│                       # or BM25-presence heuristic. Imports
│                       # faithfulness_checker.LynxFaithfulnessChecker as-is.
└── postgres_writer.py  # COPY-from-stdin writer using serve_admin pool
                        # (per 06 §2.1). Idempotent UPSERT via temp-table swap.
```

`__init__.py` exports `analyze_dataset_run(dataset_name, run_id, *,
input_mode='langfuse'|'parquet', input_path=None) -> int` — the single
public entry point invoked by both the Dramatiq actor (§9) and the
manual CLI.

The `postgres_writer.py` module uses the standard COPY pattern from
`06 §11.5` (write-batch boundary) — assemble `RagQualityMetric` rows,
serialize as TSV, COPY into a temp table, then `INSERT … ON CONFLICT
(run_id, query_id) DO UPDATE` to upsert. At ~5K rows per run this
completes in well under a second.

## §9 Worker placement

### §9.1 Dramatiq actor

```python
# engine/app/rag_quality/actors.py — sketch
import dramatiq
from app.rag_quality.analyzer import analyze_dataset_run

@dramatiq.actor(
    queue_name="rag_quality",
    max_retries=3,
    time_limit=30 * 60_000,   # 30 min per dataset (§9.4)
    min_backoff=60_000,       # 1 min
    max_backoff=15 * 60_000,  # 15 min
)
def rag_quality_analyze_dataset_run(
    dataset_name: str,
    run_id: str,
    input_mode: str = "langfuse",
    input_path: str | None = None,
) -> dict:
    """Analyze one Langfuse dataset run; write metrics into PG.
    Idempotent on (run_id, query_id) PK."""
    written = analyze_dataset_run(
        dataset_name=dataset_name,
        run_id=run_id,
        input_mode=input_mode,
        input_path=input_path,
    )
    return {"dataset_name": dataset_name, "run_id": run_id, "rows_written": written}
```

Pool: `serve_admin` (writes to serve cluster per `06 §2.1`). Reads
from local parquet at `/mnt/solemd-graph/rag-quality/cascade-traces/`
when `input_mode='parquet'`; reads from Langfuse Cloud when
`input_mode='langfuse'` (Mode A default).

### §9.2 pg_cron trigger

Nightly fan-out from the serve cluster's pg_cron at 04:30 UTC (after
OpenSearch snapshot at 04:00 per `11 §13`):

```sql
-- Bootstrapped post-apply with a stable named job; not created inside
-- the transactional migration body.
SELECT cron.schedule(
  job_name := 'rag_quality_nightly_fanout',
  schedule := '30 04 * * *',     -- 04:30 UTC daily
  command  := $$
    -- Emit one notification carrying the UTC day key. The external
    -- listener owns Langfuse enumeration + Dramatiq enqueue.
    SELECT solemd.enqueue_rag_quality_jobs(date_trunc('day', now() - INTERVAL '1 day'));
  $$
);
```

The `solemd.enqueue_rag_quality_jobs(p_day timestamptz)` function lives
in the serve SQL schema surface (for example `db/schema/serve/50_functions.sql`)
as a small **PL/pgSQL + `pg_notify`** helper; it does
not call Langfuse or Redis from inside Postgres. The external listener
consumes the notification, enumerates prior-day dataset runs from
Langfuse Mode-A export / API, then posts one Dramatiq message per
dataset-run to Redis. Idempotent on `(dataset_name, run_id)` — re-run
on the same day overwrites the same rows. `plpython3u` is explicitly
rejected here in favor of `plpgsql` + `NOTIFY`. **locked**.

### §9.3 Manual CLI

```bash
# Run on demand for a specific dataset
uv run python engine/scripts/analyze_rag_quality_batch.py \
  --dataset clinical-evidence-v1 \
  --from-langfuse

# Or from a local parquet snapshot (Mode B path)
uv run python engine/scripts/analyze_rag_quality_batch.py \
  --dataset clinical-evidence-v1 \
  --from-parquet /mnt/solemd-graph/rag-quality/cascade-traces/2026-04-16.parquet
```

Same code path as the Dramatiq actor; the CLI is a thin wrapper that
calls `analyze_dataset_run()` directly without going through Redis.

### §9.4 Time budget

30 min hard time-limit per dataset. Typical case: ~5K query cases per
dataset × ~1ms compute per metric × 9 metric runners ≈ 45s pure compute.
Add ~30s for parquet load and ~2s for COPY. RAGAS computations are
CPU-bound but cached embedding models keep per-row cost ≤ 5ms.
Faithfulness mode (Lynx 8B via Ollama) is the only slow path —
~1-2s per query; opt-in flag, runs only on a subsample (≤ 100
queries) per dataset. Even worst case stays well under the 30-min
budget.

### §9.5 Memory

< 2 GB peak. RAGAS embedding model is ~500 MB resident; parquet load
is streaming via pyarrow row groups; row-by-row processing keeps the
analyzer's RSS bounded. Smaller than the encoder workers (`08 §3`)
already loaded on the same host.

## §10 Grafana dashboards

One new dashboard, "RAG Quality (Batch)", authored as Grafonnet under
`engine/observability/dashboards/rag_quality_batch.jsonnet` per `10 §9`
discipline. Sits alongside the existing `rag_quality.jsonnet` (which
surfaces Langfuse-side panels per `10 §9.2`). Naming distinct so the
operator can tell at a glance which surface they're looking at.

### §10.1 Quality trend panel

| Property | Value |
|---|---|
| Title | "Quality trend (hit@1 / hit@k / MRR / nDCG)" |
| Data source | Postgres (`solemd.rag_quality_metrics`) |
| Query | `SELECT date_trunc('day', recorded_at) AS time, dataset_name, grounding_level, AVG(CAST(hit_at_1 AS INT))::real AS hit_at_1, AVG(CAST(hit_at_k AS INT))::real AS hit_at_k, AVG(mrr) AS mrr, AVG(ndcg_k) AS ndcg FROM solemd.rag_quality_metrics WHERE recorded_at >= NOW() - INTERVAL '30 days' GROUP BY 1, 2, 3 ORDER BY 1` |
| Visualization | time series, faceted by `dataset_name` and `grounding_level` |

Index used: `idx_rag_quality_dataset_recorded`.

Paper-grounded and evidence-grounded trends should never be collapsed
into one line on this panel.

### §10.2 Lane-fusion analysis panel

| Property | Value |
|---|---|
| Title | "Lane-fusion contribution (BM25 vs dense)" |
| Query | `SELECT query_family, AVG(lane_fusion_bm25_weight) AS bm25_share, AVG(lane_fusion_dense_weight) AS dense_share FROM solemd.rag_quality_metrics WHERE recorded_at >= NOW() - INTERVAL '7 days' GROUP BY query_family` |
| Visualization | stacked bar by query family |

Reveals query families where one lane dominates (e.g. `title_global`
should be BM25-heavy; `evidence_intent` should be dense-heavy).

### §10.3 Rerank effectiveness panel

| Property | Value |
|---|---|
| Title | "Cross-encoder rerank effectiveness" |
| Query | `SELECT date_trunc('day', recorded_at) AS time, dataset_name, AVG(rerank_score_gap) AS mean_gap, AVG(CAST(rerank_promoted AS INT))::real AS promotion_rate FROM solemd.rag_quality_metrics WHERE rerank_score_top1 IS NOT NULL AND recorded_at >= NOW() - INTERVAL '30 days' GROUP BY 1, 2` |
| Visualization | dual-axis time series (gap LHS, promotion-rate RHS) |

Watch for: promotion rate climbing while gap shrinks → rerank
churning without confidence; alarm threshold provisional.

### §10.4 Tier split panel

| Property | Value |
|---|---|
| Title | "Evidence vs mapped tier hit@k delta" |
| Query | `SELECT dataset_name, tier, AVG(CAST(hit_at_k AS INT))::real AS hit_at_k FROM solemd.rag_quality_metrics WHERE tier IS NOT NULL AND recorded_at >= NOW() - INTERVAL '7 days' GROUP BY dataset_name, tier` |
| Visualization | grouped bar (per dataset, evidence vs mapped side-by-side) |

If evidence is consistently below mapped on multiple suites, the evidence-tier
promotion criteria (`07 §3.5`) need revisiting.

### §10.5 Per-policy A/B panel

| Property | Value |
|---|---|
| Title | "Per-policy chunker A/B (active vs candidate)" |
| Query | the §4.5 pivot SQL (parameterized on `$candidate_key` and `$baseline_key` Grafana variables) |
| Visualization | side-by-side bars, faceted by suite; only renders when ≥ 2 `chunk_version_key` values exist in window |

Index used: `idx_rag_quality_chunk_version`.

### §10.6 Boundary against the existing `rag_quality.jsonnet`

`rag_quality.jsonnet` (per `10 §9.2`) surfaces **Langfuse-native** panels
(faithfulness 7-day, context relevance 7-day, dataset-run outcomes,
cascade p95 by lane). Those queries hit Langfuse Cloud and Prometheus.
This doc's `rag_quality_batch.jsonnet` surfaces panels that hit
`solemd.rag_quality_metrics` only. The two dashboards are linked from
the Grafana sidebar but never share queries. **Locked**.

## §11 Boundary contracts

Explicit per-system boundaries — every other doc that touches RAG
quality should be read as one of these contracts:

### §11.1 vs `10-observability.md`

`10` owns operational telemetry (PG / OpenSearch / Redis / engine
process health, queue depth, latency histograms, alert rules).
`10a` owns RAG-quality batch analytics. They share the Grafana
instance from `10 §2.1` and the same shared-infra Loki for analyzer
logs, but they **do not share metric tables**:

- Operational metrics: Prometheus + Loki. Never written to
  `solemd.rag_quality_metrics`.
- Quality metrics: `solemd.rag_quality_metrics`. Never scraped by
  Prometheus.

Cross-signal navigation between an operational latency spike and an
underlying retrieval-quality regression is by hand via the `trace_id`
exemplar (`10 §0`); not by a join layer. **Locked**.

### §11.2 vs Langfuse Cloud

Langfuse Cloud Hobby remains:

- the **live** trace store (30-day window per `10 §7.3`).
- the **prompt management** surface.
- the **dataset definition** surface.
- the **annotation queue** surface (per `langfuse` skill).
- the **generic LLM cost tracking** surface.

`10a` ingests Langfuse exports for offline analysis but does **not**
push results back as custom scores. Langfuse remains the human review
surface for individual failures; `10a` is the trend surface.

If the operator wants single-pane review, the deferred path is to
flip `10a` to write back select metrics as Langfuse `score_v2` records.
Not done today — adds Langfuse Hobby unit consumption and creates a
double source of truth. **Locked** for the no-write-back contract.

### §11.3 vs the `langfuse` skill

`.claude/skills/langfuse/references/benchmarking.md` defines:

- **experiment shape** — datasets, evaluators, score configs.
- **score-config registry** — the `SCORE_*` constants in
  `engine/app/langfuse_config.py` (`10a §2` row 14).
- **operator-facing UX** for designing experiments.

`10a` consumes the resulting cascade traces and adds metrics
Langfuse can't natively express. The skill stays the operator-facing
UX; `10a` is infrastructure under it.

Coordination: when the skill adds a new score-config name, `10a §3`
metric catalog should add a row that references it (no code change
needed — `langfuse_run_review.py` already auto-discovers any score
name via `_evaluation_value()` at `langfuse_run_review.py:38-45`).

### §11.4 vs `08-retrieval-cascade.md`

`08 §15` defines the cascade trace shape (one trace, five spans,
fixed per-span attribute set). `10a` consumes that shape verbatim
through Mode-A export. Any new field added to `08 §15.2` must be
backfilled into `10a §7.1` parquet schema **in the same PR** (the §0
coordination rule). The analyzer drops unknown fields with a warn-log
on first sight; that's the recovery path, not the steady-state.

Three fields are now part of the `08 §15.2` trace contract and are
required to enable the new metrics in §4:

1. Stage 1 — `score_breakdown: list[ScoreBreakdownEntry]` (per `10a
   §4.1`).
2. Stage 2 — `rerank_scores: list[RerankEntry]` (per `10a §4.2`).
3. Stage 4 — `grounding_roundtrip_failures: list[evidence_key]`
   (per `10a §4.6`).

All three are reflected in `10a §7.1` and consumed here downstream.
**Locked** for the dependency direction (this doc consumes `08`, never
the reverse).

### §11.5 vs `05a-chunking.md`

`05a` is authority for the `chunk_version_key` lifecycle (registry,
mint-on-policy-edit, `is_active` flip). `10a` *informs* the operator's
decision to flip `is_active=true` to a candidate `chunk_version_key`
by computing per-policy recall deltas (§4.5). It never writes to
`paper_chunk_versions`. **Locked**.

## §12 Failure modes

Explicit failure-class taxonomy. Every analyzer failure has a
deterministic recovery; no silent degradation.

| Failure | Detection | Recovery | Severity |
|---|---|---|---|
| Langfuse export fails (rate-limit / 5xx) | API call returns non-2xx after 3 retries with backoff | Skip the day; log; next day's run picks up both days (Langfuse retains 30 d) | `warn` |
| Langfuse export fails (auth) | API returns 401/403 | Halt; alert | `page` |
| Mode-B parquet missing | File-not-found in expected path | Fall back to Mode A | `info` |
| RAGAS eval fails (missing dep, model not loaded) | `ImportError` or `RagasContextScore.error` set | Row written with `context_precision = NULL`, `context_recall = NULL` | `info` |
| Faithfulness check skipped (Ollama down) | Connection refused on `:11434` | `faithfulness_verdict = 0 (SKIP)`; not an alert | `info` |
| Postgres metric-store write fails | asyncpg exception on COPY/UPSERT | Actor errors; standard Dramatiq backoff (3 retries with 1m/5m/15m backoff); last-known-good metrics still queryable | `warn` (escalates to `page` after 3 retries) |
| Cascade trace parquet schema drift (new field in `08`) | Pydantic `ValidationError` (`extra="forbid"` flips to log-and-strip in this path) | Drop the unknown field; coordination rule `§0` / `§11.4` | `info` |
| Cascade trace parquet schema drift (missing field) | Pydantic default kicks in (most fields default to `None` / `[]` / `0.5`) | Row written with NULL on the impacted metric column | `warn` once per day |
| Lynx 8B verdict invalid (model returned non-JSON) | `ClaimVerdict.success = False` | `faithfulness_verdict = 0 (SKIP)` | `info` |
| pg_cron job missed (Postgres down at 04:30) | Job status not `succeeded` for the day | Manual CLI invocation | `warn` |

Two notable non-failures:

- **No data for the day.** Empty parquet input → analyzer writes 0
  rows; not an error.
- **Rolling cohort cutover during fetch.** `serving_run_id` in the
  trace differs from the current active pointer; analyzer writes the
  trace's snapshot value (the row records what was true at request
  time, not at analyze time). **Locked** by §1 identity discipline.

## §13 Cost & operational footprint

Concrete numbers. **Locked** for orders of magnitude; **provisional**
for exact figures until the first 30-day run.

| Concern | Estimate |
|---|---|
| Postgres storage | ~1 KB per row × 100K rows/year ≈ 100 MB/year. Negligible against `serve_data` budget per `01 §1`. |
| Compute (nightly) | RAGAS + ranx + 6 new analyzers on ~5K cases ≈ 5–15 min CPU at the §9.4 estimate. |
| Compute (faithfulness mode, opt-in) | +1–2s per case × 100-case subsample = +2-3 min Ollama time per dataset per day. |
| Memory | < 2 GB peak (RAGAS embedding loading; smaller than the encoder workers per `08 §3`). |
| Langfuse Cloud unit consumption | **Zero added**. The analyzer is read-only against the Langfuse export API; reads do not count against the 50K monthly Hobby pool per `10 §7.1`. |
| Engineering cost (initial) | ~20 h. Breakdown: ~4 h SQL migration + Pydantic models; ~6 h six metric runners; ~4 h analyzer orchestrator + Postgres writer; ~3 h Dramatiq actor + pg_cron + manual CLI; ~3 h Grafonnet dashboard. |
| Engineering cost (ongoing) | ~2 h/quarter. Mostly chasing `08 §15.2` schema drift and tuning Grafana queries. |
| Disk (parquet snapshots) | ~2 MB/day compressed × 90 day retention ≈ 180 MB total. Co-resident with other `/mnt/solemd-graph/` data; trivial against the host's NVMe budget. |

The dominant cost line item is engineering time, not runtime. Once
landed, the analyzer requires no day-two maintenance unless `08 §15.2`
changes shape.

## Cross-cutting invariants

1. **One Postgres table.** All RAG-quality batch metrics live in
   `solemd.rag_quality_metrics` on serve. No second table, no
   materialized view, no shadow JSON column.
2. **Per-row grain is `(run_id, query_id)`.** Aggregations are at
   query time in Grafana / SQL views. The analyzer never pre-aggregates.
3. **Append-only with PK upsert.** Re-runs on the same `(run_id,
   query_id)` bytes-identically replace the row. Idempotency is the
   contract; PK conflict is the enforcement.
4. **Vocabulary discipline.** "Evidence unit" at retrieval time;
   "chunk" at warehouse-side assembly only. No leakage in column
   names, log events, or panel titles.
5. **Two A/B axes.** `dataset_name` and `chunk_version_key`. No
   third axis without a typed column added via `12 §9` ledger
   amendment.
6. **`evidence_key` and `corpus_id` are NEVER columns on
   `rag_quality_metrics`.** Cardinality discipline. They live only on
   the upstream parquet for forensic queries.
7. **No write-back to Langfuse.** The flow is one-way: Langfuse →
   parquet → analyzer → Postgres → Grafana.
8. **Mode A is the day-one ingestion contract.** Mode B is deferred
   but the parquet shape is the boundary so the analyzer is unchanged
   when Mode B lands.
9. **Cascade-trace-schema-drift coordination rule.** Any new field in
   `08 §15.2` must be backfilled into §7 parquet schema in the same PR.
10. **Postgres metric-store boundary against `10`.** `10` operational
    metrics never enter `solemd.rag_quality_metrics`; `10a` quality
    metrics never enter Prometheus.
11. **Existing eval components are salvage inventory.** Analyzer
    imports or ports them forward as needed, but this document remains
    the authority. The 14 inventoried components (`§2` rows 1-14) are
    the current reuse map, not a legacy override of the analyzer
    contract.
12. **Live hybrid analysis is rank-based.** The analyzer may inspect
    normalization-based debug payloads when benchmark runs enable them,
    but it does not describe live RRF retrieval as if it exposed raw
    comparable BM25 and dense scores.

## §N Decisions

### Locked

| # | Decision |
|---|---|
| L1 | Inventory of 14 existing eval components (§2 rows 1-14) is the source of truth for "what exists." |
| L2 | Six new metrics (§4): lane-fusion contribution, rerank effectiveness, dedup quality, tier split, per-policy A/B, grounding round-trip. |
| L3 | Single Postgres table `solemd.rag_quality_metrics` on serve, schema per §5.1. |
| L4 | Per-row grain `(run_id, query_id)` PK with idempotent upsert. |
| L5 | Mode A (Langfuse export) is the day-one ingestion contract. |
| L6 | Parquet shape per §7 is the analyzer's input boundary; both ingestion modes produce it. |
| L7 | Analyzer code lives under `engine/app/rag_quality/`; never edits `engine/app/rag_ingest/`. |
| L8 | Dramatiq actor `rag_quality_analyze_dataset_run` on `serve_admin` pool; pg_cron fan-out at 04:30 UTC. |
| L9 | Manual CLI at `engine/scripts/analyze_rag_quality_batch.py`. |
| L10 | 90-day retention with daily pg_cron prune at 04:15 UTC. |
| L11 | Grafonnet dashboard `rag_quality_batch.jsonnet`, distinct from existing `rag_quality.jsonnet`. |
| L12 | No write-back to Langfuse (`§11.2`). |
| L13 | Two canonical A/B axes only: `dataset_name` and `chunk_version_key` (`§0`). |
| L14 | Cascade-trace-schema-drift coordination rule (`§0`, `§11.4`). |
| L15 | Vocabulary discipline: "evidence unit" at retrieval time, "chunk" only at warehouse-side assembly. |
| L16 | Live Stage 1 interpretation is rank-based; normalization/explanation payloads are benchmark-debug only. |

### Provisional

| # | Decision |
|---|---|
| P1 | Exact Grafana panel JSON / Grafonnet layout (`§10`); validated after first 30-day run. |
| P2 | `ranx` minor version pin (`§8`); revisit when ranx releases its next 0.x. |
| P3 | pg_cron schedule slot of 04:30 UTC (`§9.2`); revisit if it conflicts with backup window. |
| P4 | 30-min Dramatiq time-limit (`§9.4`); revisit if dataset cardinality grows past ~50K cases. |
| P5 | Faithfulness opt-in subsample size of 100 cases per dataset (`§9.4`); revisit after first measurement of subsample variance. |
| P6 | The `evidence_units_per_paper` SMALLINT vs INT choice (`§5.1`); SMALLINT is sufficient at the `≤ 3` rule today. |

### Deferred

| # | Decision | Trigger |
|---|---|---|
| D1 | Mode B (Alloy side-tap) ingestion | Hobby-plan unit pressure or analyst need to skip Langfuse Cloud |
| D2 | Per-policy A/B power analysis (proper statistical tests) | Operator running >2 candidate policies in regular rotation |
| D3 | Per-evaluator LLM-judge wiring beyond Patronus Lynx 8B | Operator reports faithfulness ceiling on Lynx |
| D4 | Write-back of `10a` metrics into Langfuse as custom scores | Operator wants single-pane review in Langfuse |
| D5 | Materialized views for hot Grafana panels | Panel render time exceeds ~1 s |
| D6 | Partitioning of `rag_quality_metrics` | Row volume crosses ~10M (multi-year hold + larger benchmark surface) |
| D7 | Self-host Langfuse | Per `10 §7.2` triggers (data residency, cost scaling, 30-day window pressure) |

## Open items

1. **`grounding_check.py` BM25-presence heuristic.** Spec is
   under-defined — needs explicit threshold (e.g. ≥ 50% of query terms
   present in `chunk_text` after tokenization). **Open** for the
   threshold value.

2. **Faithfulness subsample selection policy.** §9.4 says ≤ 100
   queries per dataset run; doesn't specify random vs stratified
   sampling. Stratified by `query_family` is the right default.
   **Open** for the explicit policy.

3. **Cohort-rolling A/B confound.** When `chunk_version_key` flips
   mid-window, the per-policy A/B comparison (§4.5) confounds with the
   cohort cutover. Mitigation: `policy_ab.py` should warn when both
   `chunk_version_key` AND `serving_run_id` differ across the two arms.
   **Open** for the warning logic.

## Upstream amendments applied in this batch

| Target doc | Section | Amendment |
|---|---|---|
| `08-retrieval-cascade.md` | `§15.2` Stage 1 attributes table | Applied: added `score_breakdown` — `list[ScoreBreakdownEntry]` per candidate when `req.explain=True`; per-entry `{corpus_id, bm25_rank, dense_rank, rrf_score}`. Required for `10a §4.1`. |
| `08-retrieval-cascade.md` | `§15.2` Stage 2 attributes table | Applied: added `rerank_scores` — `list[RerankEntry]` per candidate; per-entry `{corpus_id, rerank_score}`. Required for `10a §4.2`. |
| `08-retrieval-cascade.md` | `§15.2` Stage 4 attributes table | Applied: added `grounding_roundtrip_failures` — `list[evidence_key]` of FDW-unresolved keys. Required for `10a §4.6`. (Preferred over per-key boolean for Langfuse Hobby unit budget per `10 §7.3`.) |
| `10-observability.md` | `§0` Conventions delta | Applied: added the sibling-surface note pointing at `10a` as the offline batch analytics doc and reaffirmed the no-shared-table boundary. |
| `10-observability.md` | `§9.1` Dashboard index | Applied: added `RAG Quality (Batch)` → `rag_quality_batch.jsonnet` as the Postgres-backed daily quality dashboard distinct from the existing Langfuse-side panels. |
| `12-migrations.md` | `§9` Accumulated upstream amendments ledger | Applied: added the `solemd.rag_quality_metrics` / pg_cron / helper-function ledger row targeting `db/schema/serve/*.sql` + `db/migrations/serve/*.sql`. |
| `05a-chunking.md` | (no change required) | `10a` consumes `chunk_version_key` as authored by `05a §1`; no upstream change needed. Cross-reference is one-way (`10a` → `05a`). |
| `langfuse` skill (`benchmarking.md`) | "Downstream consumers" section | Applied: added the note that `10a-rag-quality-analyzer.md` is the offline consumer of cascade traces emitted by experiments authored here. Score-config additions should be added to `10a §3` metric catalog in the same PR. |
