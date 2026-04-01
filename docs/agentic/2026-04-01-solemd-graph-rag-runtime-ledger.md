# SoleMD.Graph RAG Runtime Agentic Ledger

Target: runtime RAG retrieval, grounding, evaluation, and supporting ingest/runtime interfaces
Started: 2026-04-01
Mode: agentic overnight improvement loop

## Active Queue

| id | status | priority | theme | evidence | next action | verification |
|---|---|---:|---|---|---|---|
| A01 | done | P0 | Correctness | Dense-query candidates were dropped from the second-stage candidate merge in `engine/app/rag/service.py`, so channel signals could exist without the paper surviving into final bundles. | Keep `dense_query_hits` in the second `merge_candidate_papers(...)` call and lock it with a regression test. | `uv run pytest test/test_rag_service.py test/test_rag_repository.py` |
| A02 | done | P0 | Correctness | Weighted lexical SQL param tuples in `engine/app/rag/repository.py` still matched the old query shape and missed the lowered-query placeholder. | Align repository parameter tuples with the upgraded SQL and extend mapper tests for richer metadata fields. | `uv run pytest test/test_rag_repository.py` |
| A03 | done | P0 | Reliability | Runtime eval surfaced invalid SQL: outer lexical selects referenced `c.doi` through the wrong scope. | Rework the lexical query surface to reuse the canonical joined projection and add regression coverage for the search shape. | `uv run pytest test/test_rag_repository.py test/test_rag_service.py` |
| A04 | done | P0 | Performance | Live `title_selected` smoke with dense query enabled showed mean `47.3s`, p95 `99.6s`; `EXPLAIN ANALYZE` showed the lexical query scanning the graph scope and computing filters row-by-row across millions of rows. | Split lexical search into exact-title, FTS, and trigram candidate lanes; add runtime paper-search indexes; short-circuit exact-title lookups; remeasure with DB-backed smokes. | `uv run pytest test/test_rag_repository.py test/test_rag_service.py` + live eval smokes |
| A05 | done | P0 | Centralization | Entity/relation seeded paper searches returned incomplete metadata compared with lexical/dense surfaces, weakening downstream ranking and explanations. | Route all paper-returning SQL through the shared paper projection/core joins and lock the richer mapping in repository tests. | `uv run pytest test/test_rag_repository.py` |
| A06 | done | P0 | Evaluation | Runtime eval and CLI were still using direct connects and under-reporting warmed runtime behavior. | Switch eval/service construction to pooled connections, preserve wall-clock failure duration, surface warmup and dense-query status, and add per-case service/overhead timing fields. | `uv run pytest test/test_rag_runtime_eval.py test/test_rag_service.py` |
| A07 | done | P0 | Performance | Graph-scoped ANN queries still risked post-filter truncation, and dense-query ANN only made a single candidate pass before exact fallback. | Filter inside ANN candidate CTEs, centralize HNSW session settings, use exact search for small graph releases, and add iterative ANN expansion for dense-query search. | `uv run pytest test/test_rag_repository.py` |
| A08 | done | P0 | Evaluation | A fully warmed, pooled, all-query-family runtime scorecard was needed before the next optimization target could be chosen. | Run the full current-live-graph eval across `title_global`, `title_selected`, and `sentence_global`; preserve the report artifact and compare quality/latency by family and source. | `.tmp/rag-runtime-eval-default-structural-v1-all-families-v7-full.json` |
| A09 | done | P0 | Modularity | `service.py` still mixed retrieval gating rules directly into the orchestration path, which made precision fixes harder to reason about and test. | Extract centralized runtime retrieval decisions into `engine/app/rag/retrieval_policy.py` and lock exact-title/dense/semantic/citation gating in focused tests. | `uv run pytest test/test_rag_retrieval_policy.py test/test_rag_service.py` |
| A10 | done | P0 | Throughput | Dense-query startup was GPU-backed but first-forward overhead still leaked into DB-backed perf gates. | Warm the real service path (embedder + full-path runtime query), surface runtime-ready logging, and keep the pooled eval hot-path representative of FastAPI startup. | `uv run pytest test/test_rag_runtime_perf.py test/test_rag_runtime_eval.py` |
| A11 | done | P0 | Grounding fidelity | Runtime answers could already include the right paper while grounded output silently dropped it, because mixed citation/entity packet assembly collapsed to citation-only packets and `answer_corpus_ids` was overwritten by the grounded subset. | Preserve entity-only packets alongside citation packets in `warehouse_grounding.py` and keep `answer_corpus_ids` as the answer-selection truth in `service.py`. | `uv run pytest test/test_rag_warehouse_grounding.py test/test_rag_service.py` |
| A12 | done | P1 | Reliability | The central Psycopg pool factory relied on an implicit `ConnectionPool(open=...)` default that is deprecated upstream and was surfacing warnings in the perf gate. | Set `open=True` explicitly in `engine/app/db.py` and lock the pool constructor shape with a focused regression test. | `uv run pytest test/test_db.py test/test_rag_runtime_perf.py` |
| A13 | in_progress | P1 | Precision | The live runtime now has perfect answer/grounding coverage, but `sentence_global hit@1` is still `0.9444` and `biocxml hit@1` is `0.9615`, so ranking precision still trails coverage. | Analyze the remaining non-rank-1 cases from the `v7` artifact and tighten ranking/selection so direct target evidence wins more often without hurting latency or grounding. | Focused artifact analysis + targeted ranking tests + refreshed live artifact |
| A14 | pending | P1 | Scale | The runtime scorecard is still measured on the current 54-paper live graph release, while the warehouse is materially larger and cleaner. | Expand the graph release / evaluation population and rerun all query families on a larger graph-backed sample once ranking precision is tightened. | Larger live report artifact + comparison summary |
| A15 | pending | P2 | Ops | Migration rollout, report retention, and batch commits still need a durable record as the runtime stack evolves. | Record migration/runtime notes, prune superseded report artifacts when safe, and commit cohesive verified batches once the current precision batch settles. | Ledger update + commit checkpoints |

## Completed Batches

### Batch 1
- Fixed dense-query candidate loss in the runtime service.
- Made service tests deterministic with explicit no-op/fake query embedders.
- Added dense-query regression coverage in service and repository tests.

### Batch 2
- Fixed weighted lexical query parameter drift in the repository adapter.
- Expanded repository mapping coverage for publication/evidence metadata.

### Batch 3
- Reworked lexical SQL to remove the invalid outer projection and centralize the joined projection usage.
- Began the database-native performance pass based on live runtime eval evidence.

### Batch 4
- Added database-native runtime search indexes:
  - `036_add_runtime_paper_search_indexes.sql`
  - `037_add_runtime_exact_title_index.sql`
- Split runtime lexical search into exact-title, FTS, and trigram lanes with an exact-title short-circuit.
- Centralized all paper-returning retrieval SQL on the shared paper projection/core joins.
- Switched runtime eval/CLI to pooled service construction and warmed dense-query/runtime status reporting.
- Added small-graph exact-search policy, centralized HNSW session settings, and filtered ANN candidate CTEs for graph-scoped dense/semantic search.
- Extended repository/runtime-eval tests to lock the new exact-vs-ANN behavior and service/overhead timing fields.

### Batch 5
- Extracted centralized runtime retrieval policy decisions into `engine/app/rag/retrieval_policy.py`.
- Added exact-title anchor suppression for dense-query and semantic-neighbor contamination in selected/title lookups.
- Tightened passage-query behavior with bounded phrase fallback, direct-evidence-first citation-context scoring, and cleaner selected-paper answer ordering.
- Added regression coverage in:
  - `engine/test/test_rag_retrieval_policy.py`
  - `engine/test/test_rag_answer.py`
  - `engine/test/test_rag_ranking.py`
  - `engine/test/test_rag_service.py`

### Batch 6
- Warmed the real runtime path via `RagService.warm()` and FastAPI startup instead of only warming the embedder.
- Regenerated all-family runtime artifacts:
  - `.tmp/rag-runtime-eval-default-structural-v1-all-families-v4.json`
  - `.tmp/rag-runtime-eval-default-structural-v1-all-families-v5-full.json`
  - `.tmp/rag-runtime-eval-default-structural-v1-all-families-v6-full.json`
- Moved the live runtime from partial grounding coverage to full grounding coverage while leaving only a small `sentence_global` hit@1 precision gap.

### Batch 7
- Fixed grounded-answer packet assembly so mixed citation/entity evidence keeps entity-only packets instead of collapsing to citation-only coverage.
- Preserved `answer_corpus_ids` as the answer-selection contract instead of overwriting it with the grounded subset.
- Hardened the shared PostgreSQL pool factory with explicit `ConnectionPool(open=True)` to remove the upstream deprecation warning.
- Added focused regressions in:
  - `engine/test/test_rag_warehouse_grounding.py`
  - `engine/test/test_rag_service.py`
  - `engine/test/test_db.py`
- Regenerated the live full-release all-family artifact:
  - `.tmp/rag-runtime-eval-default-structural-v1-all-families-v7-full.json`

## Live Evidence

- Dense-query encoder smoke:
  - GPU visible: `NVIDIA GeForce RTX 5090`
  - `torch.cuda.is_available() == True`
  - SPECTER2 ad-hoc query embedding returns a 768-d vector
- Runtime eval smoke before lexical query optimization:
  - report: `.tmp/rag-runtime-eval-title-selected-dense-smoke.json`
  - `title_selected` mean `47303.568 ms`
  - `title_selected` p95 `99638.347 ms`
- `EXPLAIN ANALYZE` on the lexical query showed:
  - execution time about `30.48s`
  - planner enumerating graph scope and probing papers row-by-row
  - no runtime weighted title+abstract FTS index in place yet
- Post-index/runtime-smoke evidence:
  - exact-title lookup hot path dropped from about `21.2s` repository time to about `334ms`
  - end-to-end selected-paper title query dropped from about `24.96s` to about `4.24s`
  - 5-paper warmed smoke reports:
    - `.tmp/rag-runtime-eval-title-selected-dense-smoke-post037-v1.json`
    - `.tmp/rag-runtime-eval-title-global-dense-smoke-post037-v1.json`
  - `title_selected` mean `1852.687 ms`, p95 `4281.825 ms`, grounded-answer rate `0.8`
  - `title_global` mean `1755.924 ms`, p95 `4197.345 ms`, grounded-answer rate `0.8`
- Current verification state:
  - `uv run pytest test/test_rag_retrieval_policy.py test/test_rag_answer.py test/test_rag_ranking.py test/test_rag_service.py` -> `40 passed`
  - `uv run pytest test/test_rag_runtime_perf.py test/test_rag_runtime_eval.py test/test_rag_service.py test/test_rag_warehouse_grounding.py` -> `34 passed`
  - `uv run pytest test/test_db.py test/test_rag_runtime_perf.py` -> `3 passed`
  - `uv run ruff check app/db.py app/rag/warehouse_grounding.py app/rag/service.py test/test_db.py test/test_rag_warehouse_grounding.py test/test_rag_service.py` -> passed
- All-family live current-release report (`v7`):
  - `.tmp/rag-runtime-eval-default-structural-v1-all-families-v7-full.json`
  - `162` cases across `54` live graph papers
  - overall:
    - `hit@1 = 0.9815`
    - `hit@k = 1.0`
    - `target_in_answer_corpus_rate = 1.0`
    - `grounded_answer_rate = 1.0`
    - `target_in_grounded_answer_rate = 1.0`
    - `mean_service_duration_ms = 234.136`
    - `p95_service_duration_ms = 358.0`
  - by family:
    - `title_global`: all quality metrics `1.0`, `p95_service_duration_ms = 295.0`
    - `title_selected`: all quality metrics `1.0`, `p95_service_duration_ms = 297.0`
    - `sentence_global`: `hit@1 = 0.9444`, all answer/grounding metrics `1.0`, `p95_service_duration_ms = 409.0`
  - by source:
    - `s2orc_v2`: all quality metrics `1.0`
    - `biocxml`: `hit@1 = 0.9615`, all answer/grounding metrics `1.0`
  - failure themes: none remaining for answer/grounding coverage

## Commits

- None yet in this agentic batch.
- Reason: the runtime tree is still part of a broader uncommitted batch and includes neighboring changes outside the files touched in Batch 7; commit only after the current precision pass is finalized and the batch can be isolated cleanly.

## Blockers

- None currently requiring human judgment.
- Current blocker is analytical only: identify the remaining non-rank-1 `sentence_global`/`biocxml` cases and tighten ranking precision without regressing the now-perfect answer/grounding contract.

## Next Review Gate

1. Analyze the `v7` artifact rows where `hit_rank != 1`, especially `sentence_global` and `biocxml`.
2. Tighten ranking/selection so direct target evidence wins more often without reducing the current `1.0` answer/grounding coverage.
3. Expand evaluation beyond the 54-paper live graph release once the precision pass settles.
4. Run another explicit `/clean` pass on the touched runtime files and then create a narrow git commit if the batch can be isolated safely.
