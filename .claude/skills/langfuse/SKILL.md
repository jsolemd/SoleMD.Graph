---
name: langfuse
description: SoleMD.Graph Langfuse v4 LLM evaluation system — datasets, experiments, evaluators, prompts, score configs, environments, tags, annotation queues, RAG quality feedback loop, and Gemini judge integration. Use when working with Langfuse SDK code, running benchmark experiments, configuring evaluators, or diagnosing RAG quality. Make sure to use this skill whenever the user mentions langfuse, evaluation, experiment, benchmark, dataset, score config, evaluator, run_experiment, llm judge, faithfulness, context relevance, answer relevance, rag quality, baseline, prompt management, managed evaluator, dataset run, gemini judge, propagate_attributes, start_as_current_observation, observe decorator, span, trace, score, langfuse host, langfuse environment, annotation queue, hit_at_1, mrr, or hallucination detection. Do NOT use for general project architecture (use /graph), graph visualization (use /cosmograph), UI styling (use /aesthetic), or secret injection like Gemini API keys (use /op).
allowed-tools: Read Glob Grep Bash
paths: "apps/worker/**/*.py"
metadata:
  short-description: Langfuse v4 LLM eval canon for SoleMD.Graph
---

# SoleMD.Graph — Langfuse Evaluation System

> **Status: pending backend rebuild.** No Langfuse code lives in `apps/` today
> (`grep -rli langfuse apps/` returns zero matches). Paths in this skill track
> the intended `apps/worker/app/eval/...` layout per
> `docs/rag/15-repo-structure.md §7.3`. CLI examples will not execute on `main`
> until the worker-plane Langfuse adapter lands. Treat this skill as the
> contract the rebuild must satisfy.

## Read First

- [`references/benchmarking.md`](references/benchmarking.md) — benchmark
  lifecycle, dataset surfaces, gate modes, run-name convention, CLI patterns,
  diagnosis workflow.
- [`references/experiment-runner.md`](references/experiment-runner.md) —
  `dataset.run_experiment()` API, item-level vs run-level evaluators, async
  tasks, annotation queue helpers.
- [`references/score-configs.md`](references/score-configs.md) — schema,
  immutability rule, idempotent migration helper, archive flow.
- [`references/evaluators.md`](references/evaluators.md) — managed vs custom
  vs structural evaluators, Gemini judge recipe, observation-level vs
  trace-level placement.
- [`references/prompts.md`](references/prompts.md) — `get_prompt`, label
  conventions, prompt-to-generation linking, deferred-fetch fallback.
- [`references/rag-metrics.md`](references/rag-metrics.md) — canonical
  faithfulness, context relevance, answer relevance, hallucination, citation
  validity implementations with judge prompts and score configs.

## Companion Skill Chain

| Situation | Skill |
|-----------|-------|
| System ownership, runtime architecture, asset/publish boundaries | `/graph` |
| Evaluation, benchmark, prompt, scoring, trace interpretation | `/langfuse` |
| Browser graph runtime after asset URLs resolve | `/cosmograph` |
| Gemini / Langfuse / database secret injection | `/op` |
| Post-change cleanup, deduplication, verification, contract close-out | `/clean` |
| Skill contract changed | `/config-sync` |

## Intended Layout (Post-Rebuild)

| File | Purpose |
|------|---------|
| `apps/worker/app/eval/langfuse_config.py` | Central adapter for env loading, prompt access, score constants, safe Langfuse imports |
| `apps/worker/app/eval/score_configs.py` | Score config registration + idempotent migration helper |
| `apps/worker/app/eval/experiment.py` | Task, evaluators, diagnosis helpers, annotation queue support, default benchmark list |
| `apps/worker/app/eval/benchmark_catalog.py` | Catalog-gated benchmark suites + acceptance thresholds |
| `apps/worker/app/eval/run_review.py` | Review and comparison helpers for stored dataset runs |
| `apps/worker/scripts/rag_benchmark.py` | CLI for benchmark execution, review, comparison, quality gates |
| `apps/worker/scripts/prepare_rag_curated_benchmarks.py` | Build and publish benchmark datasets to Langfuse |
| `docs/rag/10a-rag-quality-analyzer.md` | Offline batch consumer of cascade traces and downstream quality metric catalog |

## What Langfuse Owns

Langfuse is the operational control plane for RAG evaluation and traced backend
work.

- Benchmarks live as Langfuse datasets; JSON snapshots are optional mirrors,
  not the source of truth.
- Experiments run through `dataset.run_experiment()` with structural
  evaluators, run evaluators, trace tags, and optional annotation-queue
  escalation.
- Score configs are registered idempotently through `ensure_score_configs()`
  before any evaluator emits a score under that name.
- Prompt templates are managed in Langfuse Prompt Management and fetched
  through the worker-plane adapter — never inline.
- `dev`, `eval`, `staging`, and `production` stay separated through
  `LANGFUSE_TRACING_ENVIRONMENT`.
- `docs/rag/10a-rag-quality-analyzer.md` is the offline downstream consumer of
  cascade traces emitted by these experiment surfaces; when per-stage trace
  fields or score families change, update that doc and this skill in the same
  batch.

## v4 Trinity

The v4 Python SDK collapses the v3 surface into three primitives. Use these
exclusively in any new code.

```python
from langfuse import (
    get_client,
    Langfuse,
    observe,
    propagate_attributes,
    Evaluation,
)
```

Replace v3 idioms wherever you find them:

| v3 (do not use) | v4 (canonical) |
|---|---|
| `langfuse.start_span(...)` / `langfuse.start_generation(...)` | `langfuse.start_as_current_observation(as_type="span" \| "generation" \| "retrieval" \| "tool" \| "embedding")` |
| `update_current_trace(name=, user_id=, tags=, ...)` | `propagate_attributes(trace_name=, user_id=, session_id=, tags=, metadata=)` + `set_current_trace_io(...)` + `set_current_trace_as_public()` |
| `for item in dataset.items: with item.run(...) as trace:` | `dataset.run_experiment(name=, task=, evaluators=, run_evaluators=, max_concurrency=)` |
| `LANGFUSE_HOST` | `LANGFUSE_BASE_URL` (canonical in v4; `LANGFUSE_HOST` is backwards-compat) |

`@observe()` and `start_as_current_observation` compose. Decorate the public
entry point and use the context manager inside it to break work into
observation types. See [`references/experiment-runner.md`](references/experiment-runner.md)
for the full pattern.

## Self-Host vs Cloud Matrix

v4 server is **not** yet self-hostable as of May 2026 — Cloud Fast Preview
only. Self-hosters stay on v3.17x. Pin ClickHouse `>=24.3` and `<=25.5.2` if
you self-host.

| Feature | v3 self-host | v4 Cloud |
|---|---|---|
| `dataset.run_experiment` | yes (via SDK) | yes |
| `propagate_attributes` | yes (v4 SDK works against v3 server) | yes |
| Managed evaluators in UI | yes | yes |
| `api.observations` v2 endpoint | no (use legacy v1) | yes |
| Reasoning model token tracking | partial | full |

The SoleMD.Graph default workstation is **Langfuse Cloud Hobby**. This means:

- `50k` units / month
- `30` days data access
- One trace per request, one observation per major stage. Keep traces coarse.
- JSON snapshot mirrors are mandatory for any benchmark older than 30 days.

## Required Environment Variables

```text
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com    # v4 canonical name
LANGFUSE_TRACING_ENVIRONMENT=eval               # dev | eval | staging | production
GEMINI_API_KEY=AIza...                          # required for the Gemini judge
```

`LANGFUSE_HOST` is honored as backwards-compat but you should not set both. Use
`LANGFUSE_BASE_URL` exclusively in new code.

All credentials are injected via `solemd op-run graph -- <command>`. Do not put
keys in `.env` files. See `/op` for vault, environment, and key-rotation
mechanics.

US tenant: `https://us.cloud.langfuse.com`.
EU tenant: `https://cloud.langfuse.com`.

## Lifecycle Discipline

- Construct the client once via `Langfuse()` (env-driven). After that,
  `get_client()` returns the active singleton from anywhere in the process.
  In multi-client setups (rare here) `get_client(public_key=...)` selects a
  specific client. Adapters should call `Langfuse()` in their bootstrap and
  expose `get_client()` to consumers.
- `atexit.register(langfuse.shutdown)` for long-lived workers. `shutdown()`
  flushes pending observations **and** tears down background uploader
  threads. `flush()` alone does not stop the workers and can leave the
  process unable to exit cleanly. Use `flush()` on demand inside a request
  when the operator needs immediate UI visibility, not at process exit.
- Pydantic v2 is a hard requirement for the v4 SDK. If a venv has a transitive
  Pydantic v1 pin, the SDK refuses to import. Audit `uv pip tree` before
  debugging mysterious startup errors.
- The intended adapter (`apps/worker/app/eval/langfuse_config.py`) is the only
  module that may import from `langfuse` directly. Every other module imports
  the adapter so env loading happens before SDK init.

## Local Ports

The Langfuse UI runs on host port `3100` (see `/graph` →
`runtime-infrastructure.md` for the canonical pinned-port table). Worker
telemetry uses Prometheus on `9095` and Grafana on `3301`; those are
independent of Langfuse and are documented in the same table.

## Environments and Tags

Filter the Langfuse UI by `LANGFUSE_TRACING_ENVIRONMENT` to separate experiment
noise from production. Mixing `eval` and `production` in the same dashboard
defeats the field's purpose.

Experiment traces should be tagged with
`["benchmark", dataset_name, experiment_name]`. Use the UI tag filter to:

- Find all traces for a specific benchmark.
- Compare traces across experiment runs.
- Isolate experiment vs ad-hoc traces.

## Annotation Queue

**Queue**: `rag-failure-review` — `hit@1=0` cases for domain expert review.

Created automatically via `ensure_annotation_queue()`. Populated with
`--enqueue-failures` after a benchmark run. Annotation queues require a
registered score config (see [`references/score-configs.md`](references/score-configs.md))
so reviewers have a target to score against.

Workflow:

1. Run experiment with `--enqueue-failures`.
2. Open Langfuse UI → Annotation Queues → `rag-failure-review`.
3. Review each failure trace: check routing, ranking, evidence.
4. Score with domain expert judgment.
5. Use insights to fix retrieval/routing.

## Prompt Catalog

| Name | Purpose | Type | Default label |
|------|---------|------|---------------|
| `rag-evidence-answer` | Extractive evidence answer generation | text | production |
| `rag-evidence-answer-system` | System prompt for evidence answer | chat | production |
| `rag-grounded-evidence-answer` | Grounded answer generation | text | production |
| `rag-grounded-evidence-answer-system` | System prompt for grounded answer | chat | production |
| `rag-faithfulness-judge` | Faithfulness LLM judge template | text | production |
| `rag-context-relevance-judge` | Context relevance LLM judge template | text | production |
| `rag-answer-completeness-judge` | Answer completeness LLM judge template | text | production |
| `rag-verification` | Answer verification template | text | production |

Prompt mechanics, label conventions, and deferred-fetch fallback live in
[`references/prompts.md`](references/prompts.md).

## Langfuse CLI Discovery

```bash
solemd op-run graph -- langfuse api datasets list
solemd op-run graph -- langfuse api datasets get-runs <dataset-name>
solemd op-run graph -- langfuse api scores list --dataset-run-id <ID> --name hit_at_1 --value 0
solemd op-run graph -- langfuse api traces get <trace-id>
solemd op-run graph -- langfuse api annotation-queues list
solemd op-run graph -- langfuse api score-configs list
```

## Span Naming Convention

Every `@observe` and `start_as_current_observation` must use a `SPAN_*`
constant from `apps/worker/app/eval/langfuse_config.py`. No raw string
literals.

Convention: `domain.subdomain.operation`
Domains: `rag`, `graph`, `ingest`

Adding a new span requires registering the constant in `langfuse_config.py`
first. No engine code ships without an `@observe`-traced public entry point.

## Agentic Quality Workflow

When working on RAG, graph build, cluster labels, or any traced backend path:

1. Start with [`references/benchmarking.md`](references/benchmarking.md) and
   pick the narrowest benchmark surface that can prove the change.
2. Run with `--diagnose` before editing code if the failure mode is not
   already obvious.
3. Fix routing, ranking, ingest, or prompt logic based on the trace evidence.
4. Re-run with `--use-suite-gates` or explicit `--quality-gate`.
5. Escalate unresolved misses with `--enqueue-failures`.
6. Update human-facing docs only when the user-visible runtime contract
   changes; benchmark operations stay in this skill's references.

Managed evaluators cost money. Structural scores are the default surface.
LLM-as-judge runs on `gemini-2.5-flash` with structured output; escalate to
`gemini-2.5-pro` only for gold-set rescoring.

## Operational Notes

- The intended `apps/worker/app/eval/langfuse_config.py` is the only import
  surface for Langfuse SDK access. No other module may `from langfuse import
  ...` directly.
- Use `langfuse.flush()` after long-running operations when the user needs
  immediate UI visibility. Reserve `langfuse.shutdown()` for process exit
  (registered via `atexit`).
- Keep benchmark mechanics in the references; do not duplicate them into
  `docs/map/`.

## Update This Skill When

- The backend rebuild lands and the rebuild-pending banners need to be
  removed.
- Benchmark suite selection, gate modes, or acceptance workflow changes.
- Canonical Langfuse CLI or experiment-runner patterns change.
- Prompt-management ownership or score-config workflow changes.
- A new score family or judge prompt is added.
