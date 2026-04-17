---
name: langfuse
description: |
  SoleMD.Graph Langfuse-native evaluation system — datasets, experiments, evaluators,
  prompts, score configs, environments, tags, annotation queues, and the RAG quality
  feedback loop. Use this skill when working with Langfuse integration, running benchmark
  experiments, configuring evaluators, or diagnosing RAG quality from Langfuse data.

  Triggers: langfuse, evaluation, experiment, benchmark, dataset, score config,
  evaluator, run_experiment, llm judge, faithfulness, context relevance,
  rag quality, rag eval, baseline, prompt management, managed evaluator,
  dataset run, gemini judge, eval metrics, score push, annotation queue,
  failure review, environment, tags.

  Do NOT use for: general project architecture (use /graph),
  graph visualization (use /cosmograph), UI styling (use /aesthetic).
version: 2.2.0
allowed-tools:
  - Read
  - Bash
metadata:
  short-description: Langfuse-native RAG evaluation — datasets, experiments, evaluators, annotation queues
---

# SoleMD.Graph — Langfuse Evaluation System

## Read First

- `references/benchmarking.md` - benchmark lifecycle, dataset surfaces, gate
  modes, CLI patterns, and diagnosis workflow
- `references/experiment-runner.md` - `dataset.run_experiment()` API,
  evaluator signatures, and annotation queue helpers

## Companion Skill Chain

| Situation | Skill |
|-----------|-------|
| System ownership, runtime architecture, asset/publish boundaries | `/graph` |
| Evaluation, benchmark, prompt, scoring, trace interpretation | `/langfuse` |
| Browser graph runtime after asset URLs resolve | `/cosmograph` |
| Post-change cleanup, deduplication, verification, contract close-out | `/clean` |
| Skill contract changed | `/config-sync` |

## Key Files

| File | Purpose |
|------|---------|
| `engine/app/langfuse_config.py` | Central adapter for env loading, prompt access, score constants, and safe Langfuse imports |
| `engine/app/rag_ingest/eval_langfuse.py` | Score config registration and dataset upload helpers |
| `engine/app/rag_ingest/experiment.py` | Task, evaluators, diagnosis helpers, annotation queue support, default dataset list |
| `engine/app/rag_ingest/benchmark_catalog.py` | Catalog-gated benchmark suites and default acceptance thresholds |
| `engine/app/rag_ingest/langfuse_run_review.py` | Review and comparison helpers for stored dataset runs |
| `engine/scripts/rag_benchmark.py` | CLI for benchmark execution, review, comparison, and quality gates |
| `engine/scripts/prepare_rag_curated_benchmarks.py` | Build and publish benchmark datasets to Langfuse |

## What Langfuse Owns

Langfuse is the operational control plane for RAG evaluation and traced backend
work.

- Benchmarks live as Langfuse datasets; JSON snapshots are optional mirrors, not
  the source of truth.
- Experiments run through `dataset.run_experiment()` with structural evaluators,
  run evaluators, trace tags, and optional annotation-queue escalation.
- Score configs are registered idempotently through `ensure_score_configs()`.
- Prompt templates are managed in Langfuse Prompt Management and fetched through
  `app.langfuse_config`.
- `development` and `production` stay separated through
  `LANGFUSE_TRACING_ENVIRONMENT`.
- Detailed benchmark policy lives in `references/benchmarking.md`, not in this
  skill body.

## Environments

- `development` — benchmark experiments, local testing (set via `LANGFUSE_TRACING_ENVIRONMENT`)
- `production` — live API traces from the Next.js frontend

Filter in Langfuse UI by environment to separate experiment noise from production.

## Tags

Experiment traces are tagged with: `["benchmark", dataset_name, experiment_name]`

Use Langfuse UI tag filter to:
- Find all traces for a specific benchmark
- Compare traces across experiment runs
- Isolate experiment vs. ad-hoc traces

## Annotation Queue

**Queue**: `rag-failure-review` — hit@1=0 cases for domain expert review.

Created automatically via `ensure_annotation_queue()`. Populated with `--enqueue-failures`.

Workflow:
1. Run experiment with `--enqueue-failures`
2. Open Langfuse UI → Annotation Queues → `rag-failure-review`
3. Review each failure trace: check routing, ranking, evidence
4. Score with domain expert judgment
5. Use insights to fix retrieval/routing

## Prompts (Langfuse Prompt Management)

| Name | Purpose | Label |
|------|---------|-------|
| `rag-evidence-answer` | Extractive evidence answer generation | production |
| `rag-evidence-answer-system` | System prompt for evidence answer | production |
| `rag-faithfulness-judge` | Faithfulness LLM judge template | production |
| `rag-context-relevance-judge` | Context relevance LLM judge template | production |
| `rag-answer-completeness-judge` | Answer completeness LLM judge template | production |
| `rag-grounded-evidence-answer` | Grounded answer generation | production |
| `rag-grounded-evidence-answer-system` | System prompt for grounded answer | production |
| `rag-verification` | Answer verification template | production |

## Langfuse CLI Discovery

```bash
# List datasets
langfuse api datasets list

# Get dataset runs
langfuse api datasets get-runs <dataset-name>

# List scores for a run
langfuse api scores list --dataset-run-id <ID> --name hit_at_1 --value 0

# Get trace details
langfuse api traces get <trace-id>

# List annotation queues
langfuse api annotation-queues list

# List score configs
langfuse api score-configs list
```

## Credentials

Canonical local path:
`solemd op-run graph -- <command>`

Required variables:
```
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=http://127.0.0.1:3100
LANGFUSE_HOST=http://127.0.0.1:3100
LANGFUSE_TRACING_ENVIRONMENT=development
GEMINI_API_KEY=AIza...  # For LLM judge
```

## Span Naming Convention

Every `@observe` must use a `SPAN_*` constant from
`engine/app/langfuse_config.py`. No raw string literals.

Convention: `domain.subdomain.operation`
Domains: `rag`, `graph`, `ingest`

## Agentic Quality Workflow

When working on RAG, graph build, cluster labels, or any traced backend path:

1. Start with `references/benchmarking.md` and pick the narrowest benchmark
   surface that can prove the change.
2. Run with `--diagnose` before editing code if the failure mode is not already
   obvious.
3. Fix routing, ranking, ingest, or prompt logic based on the trace evidence.
4. Re-run with `--use-suite-gates` or explicit `--quality-gate`.
5. Escalate unresolved misses with `--enqueue-failures`.
6. Update human-facing docs only when the user-visible runtime contract changes;
   benchmark operations stay in the skill references.

Managed evaluators cost money. Structural scores are the default surface.

### Enforcement

- Every `@observe` MUST use a `SPAN_*` constant from `langfuse_config.py`. No string literals.
- Adding a new span requires registering the constant in `langfuse_config.py` first.
- No engine code ships without `@observe` tracing on public entry points.

## Operational Notes

- Use `app.langfuse_config` as the only import surface for Langfuse SDK access.
- Use `flush()` after long-running operations when the user needs immediate UI
  visibility.
- Keep benchmark mechanics in `references/benchmarking.md` and API details in
  `references/experiment-runner.md`; do not duplicate them into human docs.

## Update This Skill When

- benchmark suite selection, gate modes, or acceptance workflow changes
- canonical Langfuse CLI or experiment-runner patterns change
- prompt-management ownership or score-config workflow changes
