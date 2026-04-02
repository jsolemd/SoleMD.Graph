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
| A13 | done | P1 | Correctness | Grounded answers on the enlarged runtime cohort were still losing the target paper because answer-segment alignment and fallback grounding were too brittle, especially for BioC and mixed warehouse coverage. | Fixed answer/grounding selection and packet alignment across `answer.py`, `service.py`, `grounded_runtime.py`, `warehouse_grounding.py`, `source_grounding.py`, and `chunk_grounding.py`; regenerated runtime evals until grounding reached `1.0` on the live graph release. | `uv run pytest test/test_rag_answer.py test/test_rag_service.py test/test_rag_grounded_runtime.py test/test_rag_warehouse_grounding.py test/test_rag_chunk_grounding.py test/test_rag_source_grounding.py` + `.tmp/rag-runtime-eval-default-structural-v1-title-global-v3.json` |
| A14 | done | P1 | Scale | The old runtime scorecard was anchored to a 54-paper live graph cohort and no longer reflected the current graph-backed population. | Expanded runtime evaluation to the current graph-backed population, added unseen-cohort execution support, and regenerated broad all-family artifacts over `96` and `192` paper cohorts. | `.tmp/rag-runtime-eval-default-structural-v1-all-families-v8-full.json` + `.tmp/rag-runtime-eval-missing-v1-all-families-v11.json` |
| A15 | done | P1 | Throughput | Repository calls in one request were still opening repeated pooled connections and scoring entity/relation/citation matches in Python, wasting time on every search. | Added request-scoped repository search sessions, pushed entity/relation/citation scoring into SQL, and fixed nested citation-intent normalization in the repository adapter. | `uv run pytest test/test_rag_repository.py test/test_rag_service.py test/test_rag_ranking.py test/test_rag_runtime_eval.py test/test_rag_warehouse_grounding.py` |
| A16 | done | P0 | Tail latency | The expanded unseen-cohort `v11` report showed near-perfect quality but pathological service tail latency, and direct probes traced the worst remaining path into runtime entity search and planner/JIT overhead. | Completed the fresh current-release all-family recheck on the latest code, then removed the dense-query SQL hydration waste that remained after the verified `jit=off` session fix. | `.tmp/rag-runtime-eval-current-all-families-v14-densehydrate.json` + targeted outlier probes |
| A17 | done | P1 | Performance coverage | Runtime perf gates still focused on smokes and unit assertions rather than representative DB-backed cohort thresholds for all three query families. | Tightened `engine/test/test_rag_runtime_perf.py` around a `24`-paper current-release cohort, added route-signature assertions, explicit tail-latency caps, and a selected-title regression that exposed and then fixed an overlong-title routing gap in `engine/app/rag/service.py`. | `uv run pytest test/test_rag_runtime_perf.py -q` + targeted service/query tests |
| A18 | pending | P1 | Modularity | `service.py` and `repository.py` remain over-centralized runtime hubs with mixed responsibilities even after the hot-path fixes. | Split runtime orchestration and query execution along stable boundaries after the current perf batch settles, keeping one canonical retrieval contract and no duplicate logic. | File-size/complexity reduction + preserved test suite |
| A19 | pending | P2 | Ops | Migration rollout, report retention, and batch commits still need a durable record as the runtime stack evolves. | Record migration/runtime notes, prune superseded report artifacts when safe, and commit cohesive verified batches once the current performance batch settles. | Ledger update + commit checkpoints |
| A20 | done | P0 | Correctness | `title_selected` still treated the selected paper as a late rescue path, so selected-title lookups could route through broad lexical/dense neighbor expansion before honoring the user’s explicit paper context. | Added selected-paper-first title lookup in `engine/app/rag/repository.py` and centralized selected-context application in `engine/app/rag/service.py`, with repository/service regressions and a DB-backed perf gate. | `uv run pytest test/test_rag_repository.py test/test_rag_service.py test/test_rag_runtime_perf.py -k 'truncated_long_title_selected_lookup_stays_grounded_and_fast'` + `.tmp/rag-runtime-eval-default-structural-v1-title-selected-v3.json` |
| A21 | done | P0 | Correctness + centralization | Passage answers still favored generic high-scoring chunk hits over the bundle whose snippet actually mirrored the user’s sentence, and warehouse structural matching duplicated a weaker overlap scorer. | Added shared normalized text-alignment helpers in `engine/app/rag/text_alignment.py`, wired them into `engine/app/rag/answer.py` and `engine/app/rag/warehouse_grounding.py`, and added targeted answer/alignment regressions. | `uv run pytest test/test_rag_text_alignment.py test/test_rag_answer.py test/test_rag_warehouse_grounding.py` |
| A22 | done | P1 | Modularity + provenance | `rank_paper_hits()` mixed channel provenance with raw score residue, which allowed `bundle.matched_channels` to drift from the real runtime channel surface, especially for `dense_query`. | Extracted channel/reason annotation into a dedicated helper in `engine/app/rag/ranking.py` and tightened dense-channel labeling to actual channel membership, with a regression guarding against stale dense labels. | `uv run pytest test/test_rag_ranking.py -k 'dense_channel_without_dense_membership or can_promote_semantic_only_candidates or preserves_entity_seed_scores_without_enrichment_hits or preserves_relation_seed_scores_without_enrichment_hits or preserves_citation_seed_scores_without_direct_hits'` |
| A23 | done | P1 | Evaluation hygiene | Several stale attached runtime eval/test jobs were still consuming exec slots and obscuring the post-fix picture. | Harvested the post-fix artifacts, moved the broad rechecks back to detached/one-shot runs, and kept the live picture anchored to the fresh current-release cohort. | `.tmp/rag-runtime-eval-current-all-families-v14-densehydrate.json` + cleaned process set |
| A24 | done | P0 | Runtime session optimization | Live `EXPLAIN ANALYZE` on the canonical entity search showed about `774ms` of `~798ms` spent in PostgreSQL JIT compilation for a short search query, which is exactly the wrong workload shape for JIT. | Centralized runtime search-session settings in `engine/app/rag/repository.py`, added `rag_runtime_disable_jit` in `engine/app/config.py`, and verified the repository session contract in tests. | `uv run ruff check app/config.py app/rag/repository.py test/test_rag_repository.py` + `uv run pytest test/test_rag_repository.py` |
| A25 | done | P1 | Observability | If the fresh `v11-jitoff` cohort still shows any nontrivial tail, the runtime path needs stage-level timing visibility instead of another blind optimization round. | Added internal stage/candidate timing summaries to runtime eval artifacts and used them to isolate the dense-query and relation-search tails on the current cohort. | `.tmp/rag-runtime-eval-current-all-families-v14-densehydrate.json` + targeted runtime tests |
| A26 | done | P1 | Dense retrieval contract | The runtime query path uses `allenai/specter2_adhoc_query`, while stored paper vectors still originate from Semantic Scholar `embedding.specter_v2`; official SPECTER2 guidance suggests query/document adapters should share the intended retrieval space. | Added a GPU-backed dense contract audit over the live runtime-eval cohort, compared stored S2 vectors with locally re-encoded SPECTER2 proximity vectors, and recorded that the current stored-paper lane is already well aligned with the live query encoder. | `uv run pytest test/test_rag_dense_audit.py test/test_rag_query_embedding.py -q` + `.tmp/dense-contract-audit-current-v1.json` |
| A27 | done | P1 | Biomedical reranking | Biomedical IR literature suggests MedCPT-class rerankers can improve question/article retrieval, especially on sentence-style biomedical questions, but at a GPU/runtime cost. | Added a controlled MedCPT dual-encoder and cross-encoder canary over the full current runtime-eval cohort and recorded that the strongest dense-only sentence-global lane is `medcpt_dual_encoder+medcpt_cross_encoder`, which now becomes the candidate live runtime experiment rather than a speculative idea. | `uv run pytest test/test_rag_dense_audit.py test/test_rag_query_embedding.py -q` + `.tmp/dense-contract-audit-current-v1.json` |
| A28 | done | P2 | Centralization | The runtime entity search SQL duplicated the same query-term, concept-ranking, and scoring logic across four large query constants, which made future entity-path changes risky and noisy. | Centralized the entity-search SQL into shared CTE fragments/builders in `engine/app/rag/queries.py` and reverified repository/service behavior. | `uv run ruff check app/rag/queries.py test/test_rag_repository.py test/test_rag_service.py` + `uv run pytest test/test_rag_repository.py test/test_rag_service.py` |
| A29 | done | P0 | Routing correctness | The fresh `v14` cohort still had a `title_global` outlier (`22309903`) routed through `retrieval_profile=passage_lookup`, which dragged dense-query search back to `~498ms` on an otherwise title-shaped query. | Kept the classifier conservative but re-enabled the exact-title precheck for passage-mode lexical queries, so long title-shaped queries can promote themselves into `title_lookup` without falling into chunk/dense retrieval first. | `.tmp/rag-runtime-probe-22309903-title-global-v15.json` + service/search-plan/runtime-perf regressions |
| A30 | done | P1 | Relation-search tail | The `v14` cohort isolated two `sentence_global` outliers where `search_relation_papers` spikes to `~389–448ms`, dominating otherwise healthy requests. | Completed the query-routing pass so long passage queries no longer auto-seed incidental relation labels like `compare`; relation-lane latency dropped out of the hot-stage summary. | `.tmp/rag-runtime-probe-273920567-sentence-global-v16.json` + query/service/runtime-perf regressions |
| A31 | done | P1 | Entity-enrichment floor | After dense-query optimization, `query_entity_enrichment` became the most common hot stage (`mean ~68–69ms`, `p95 ~89–94ms`) while only `2/96` sentence-global cases produced any entity-hit papers. | Added the high-precision entity-surface gate and confirmed on the refreshed current cohort that the title families dropped to about `20ms` mean and `sentence_global` dropped to about `148ms` mean without any quality loss. | `.tmp/rag-runtime-eval-current-all-families-v16-routing-relation.json` + unit/service regressions |
| A32 | done | P1 | Title-search and sentence-ranking tail | The remaining runtime miss set had narrowed to `3/96` `sentence_global` cases, and `24948876` was still a title-like sentence case where citation-only neighbors could outrank the direct lexical paper. | Rejected the naive global-KNN rewrite, added planner-visible title-search instrumentation, then fixed the real contract bugs: missing ANN distances were inflating `dense_score` to `1.0`, and `TITLE_LOOKUP` did not sort direct title support ahead of citation-only neighbors. | `uv run pytest test/test_rag_repository.py test/test_rag_ranking.py` + `.tmp/rag-runtime-eval-sentence-miss-set-v19-titlefix.json` |
| A33 | done | P1 | Dense-runtime contract hygiene | Live warmup and eval emitted `There are adapters available but none are activated for the forward pass.` even though runtime status already reported `active_adapters=Stack[[QRY]]` on the loaded SPECTER2 query encoder. | Reworked `query_embedding.py` so adapter activation is explicit, runtime status falls back to `adapters_config.active_setup`, and the known false-positive `adapters.model_mixin` warning is suppressed only around the real load+activate path. | `uv run pytest test/test_rag_query_embedding.py` + quiet embedder smoke + `.tmp/rag-runtime-eval-sentence-miss-set-v20-embedderquiet.json` |
| A34 | done | P2 | Contract docs drift | `database.md` reflects `graph_base_points`, while some older design docs still describe base membership and base size using stale `graph_points` fields or fixed corpus counts. | Re-reviewed the current docs and contract test after the broad runtime cleanup; the canonical graph-base/runtime docs are already aligned around `graph_base_points`, policy-driven base sizing, and the live retrieval surface. Future doc work is now tied to any new live reranker lane rather than stale base-contract drift. | `cd engine && uv run pytest test/test_docs_runtime_contract.py -q` |
| A35 | pending | P2 | Clinician-facing ranking priors | Runtime ranking is now fast and grounded, but it is still largely corpus-neutral; treatment/prognosis/diagnosis questions can benefit from lightweight priors over publication type, species, and evidence strength. | Evaluate a small query-intent classifier and ranking priors using existing publication-type, citation, and PubTator-derived species signals without regressing general retrieval quality. | Frozen-cohort comparison artifact + decision note |
| A36 | pending | P2 | Conflict and polarity evaluation | Current evals prove recall, grounding, and latency, but they do not yet stress negation, null findings, mixed evidence, or nonhuman-to-human leakage. | Build a compact contradiction/polarity benchmark for biomedical questions and wire it into runtime evaluation so fast wrong-positive answers are caught explicitly. | Benchmark artifact + runtime eval extension |
| A37 | done | P1 | Live biomedical reranker | The dense contract audit showed the current stored S2 paper vectors are not misaligned, but it also showed that a bounded MedCPT reranker can materially improve sentence-style biomedical retrieval quality on the offline dense benchmark. | Added an optional GPU-backed MedCPT rerank stage on the merged top-N runtime candidates for sentence-like global queries, benchmarked it on the full current live cohort, and kept the existing S2 retrieval lane as the default because the live cohort already sits at `1.0` quality without the added latency. | `engine/.tmp/rag-runtime-eval-current-all-families-v30-control.json` + `engine/.tmp/rag-runtime-eval-current-all-families-v30-live-biorerank.json` + focused service/ranking tests |
| A38 | done | P2 | Reranker observability | A live reranker experiment will only be safe if its candidate-window size, GPU stage cost, and promotion effect are visible in the same runtime artifacts as the existing retrieval stages. | Extended runtime traces so reranker stage duration, candidate-window size, promotion count, window ids, and device/ready status are recorded alongside the rest of the runtime profile. | `engine/.tmp/rag-runtime-eval-current-all-families-v30-live-biorerank.json` + focused telemetry regression |
| A39 | pending | P1 | Hard-cohort evaluation | The current live cohort is now saturated at `1.0` quality across the main runtime metrics, which means new ranking ideas can look promising offline without moving the live scorecard at all. | Build a deliberately harder frozen sentence-style benchmark from the dense-audit miss space, polarity/conflict cases, and clinician-style question shapes before reconsidering heavier reranking or ranking priors. | Hard-cohort artifact + decision note |

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

### Batch 8
- Fixed runtime grounding on the enlarged graph-backed cohort:
  - grounded answers no longer fail all-or-nothing when one answer paper lacks warehouse rows
  - BioC papers can ground from entity-only packets instead of citation-only packets
  - answer segments are aligned by corpus id, not only by segment order
  - baseline answer selection preserves exact-title lexical anchors for title-like queries
- Added focused regressions in:
  - `engine/test/test_rag_answer.py`
  - `engine/test/test_rag_service.py`
  - `engine/test/test_rag_grounded_runtime.py`
  - `engine/test/test_rag_warehouse_grounding.py`
  - `engine/test/test_rag_chunk_grounding.py`
  - `engine/test/test_rag_source_grounding.py`
- Regenerated title-global runtime artifacts through:
  - `.tmp/rag-runtime-eval-default-structural-v1-title-global-v1.json`
  - `.tmp/rag-runtime-eval-default-structural-v1-title-global-v2.json`
  - `.tmp/rag-runtime-eval-default-structural-v1-title-global-v3.json`

### Batch 9
- Expanded runtime evaluation to the current graph-backed cohort:
  - live graph points in the current graph run: about `2.45M`
  - current graph-backed RAG-eval population: `246` covered papers
  - unseen cohort executed across `192` requested papers / `576` cases
- Added request-scoped repository search sessions so one runtime request reuses a single pooled connection.
- Moved entity, relation, and citation-context scoring out of Python and into SQL.
- Fixed nested citation-intent normalization so arrays like `[["background"]]` no longer silently collapse to `[]`.
- Added/updated focused regressions in:
  - `engine/test/test_rag_repository.py`
  - `engine/test/test_rag_service.py`
  - `engine/test/test_rag_ranking.py`
  - `engine/test/test_rag_runtime_eval.py`
  - `engine/test/test_rag_warehouse_grounding.py`
- Regenerated broad runtime artifacts:
  - `.tmp/rag-runtime-eval-default-structural-v1-all-families-v8-full.json`
  - `.tmp/rag-runtime-eval-missing-v1-all-families-v11.json`

### Batch 10
- Fixed title-query routing for question-style subtitle titles in `engine/app/rag/query_enrichment.py`.
- Added a native exact-title fast path using the existing lower-title runtime index:
  - new repository exact-title lookup in `engine/app/rag/repository.py`
  - new exact-title SQL in `engine/app/rag/queries.py`
  - service promotion of exact-title hits before chunk, entity, relation, or dense retrieval in `engine/app/rag/service.py`
- Added focused regressions for exact-title runtime routing and DB-backed perf gates:
  - `engine/test/test_rag_repository.py`
  - `engine/test/test_rag_service.py`
  - `engine/test/test_rag_runtime_perf.py`
- Removed one selected-paper semantic-neighbor round-trip by folding selected-paper embedding lookup into the semantic-neighbor SQL path.
- Moved chunk snippet rendering (`ts_headline`) behind candidate pruning so sentence-global chunk retrieval ranks candidates first and only renders snippets for the small final set.

### Batch 11
- Added selected-paper direct-anchor suppression for dense-query and semantic-neighbor expansion:
  - centralized helper in `engine/app/rag/retrieval_policy.py`
  - earlier selected-corpus resolution and direct-anchor propagation in `engine/app/rag/service.py`
- Added an exact-first entity candidate lane:
  - new exact entity SQL in `engine/app/rag/queries.py`
  - exact-match fast path in `engine/app/rag/repository.py`
- Materialized the fuzzy-capable entity query CTEs to reduce repeated planner work.
- Removed the dead paper-embedding literal lookup path from the runtime repository/query layer.
- Added focused regressions and DB-backed perf gates in:
  - `engine/test/test_rag_retrieval_policy.py`
  - `engine/test/test_rag_service.py`
  - `engine/test/test_rag_repository.py`
  - `engine/test/test_rag_runtime_perf.py`

### Batch 12
- Added a durable normalized-title runtime contract in PostgreSQL:
  - new migration `engine/db/migrations/039_add_runtime_normalized_title_indexes.sql`
  - `solemd.normalize_title_key(text)` function using native `normalize(..., NFKC)` plus the observed casefold deltas present in the live corpus
  - exact and trigram indexes on `solemd.normalize_title_key(title)`
- Wired normalized-title exact lookup correctly through the repository exact-title path in `engine/app/rag/repository.py`.
- Added DB-backed normalized-title regressions in `engine/test/test_rag_runtime_perf.py`:
  - SQL function contract matches Python `normalize_title_key`
  - Unicode-normalized exact-title lookup resolves a real `ß -> ss` title variant
- Verified that the remaining title miss class is not a normalization bug but a narrower retrieval-policy issue.

### Batch 13
- Added selected-paper-first title lookup:
  - new `search_selected_title_papers(...)` path in `engine/app/rag/repository.py`
  - earlier selected-corpus resolution and centralized selected-context application in `engine/app/rag/service.py`
- Added focused regressions in:
  - `engine/test/test_rag_repository.py`
  - `engine/test/test_rag_service.py`
  - `engine/test/test_rag_runtime_perf.py`
- Live result on the current graph release:
  - `.tmp/rag-runtime-eval-default-structural-v1-title-selected-v3.json`
  - `title_selected` quality metrics all `1.0`
  - `mean_service_duration_ms = 125.13`
  - `p95_service_duration_ms = 121.0`

### Batch 14
- Added shared normalized text alignment in `engine/app/rag/text_alignment.py`.
- Reworked baseline answer grounding selection in `engine/app/rag/answer.py` so:
  - passage queries prioritize snippet-level sentence alignment, not only raw chunk lexical score
  - near-exact title variants can still be promoted into the answer even when they miss the exact normalized-title key
- Reused the same alignment helper in `engine/app/rag/warehouse_grounding.py` to keep structural fallback scoring centralized.
- Cleaned ranking provenance in `engine/app/rag/ranking.py` by extracting channel/reason annotation and tightening `dense_query` attribution to actual channel membership.
- Added focused regressions in:
  - `engine/test/test_rag_text_alignment.py`
  - `engine/test/test_rag_answer.py`
  - `engine/test/test_rag_warehouse_grounding.py`
  - `engine/test/test_rag_ranking.py`
- Direct live probe after the passage-alignment fix:
  - corpus `3092150` remained retrieval rank `3`, but the answer path now correctly promoted it into `answer_ids=[3092150, 2766040]` and grounded output `answer_linked_corpus_ids=[2766040, 3092150]`

### Batch 15
- Switched long runtime rechecks from attached exec sessions to the repo-native detached launcher:
  - `engine/scripts/run_detached_engine_job.py`
- Active detached runs:
  - `.tmp/rag-runtime-eval-3092150-24948876-sentence-v19.log`
  - `.tmp/rag-runtime-eval-default-structural-v1-all-families-v19.log`
- This keeps the overnight eval loop writing durable artifacts without consuming more unified exec slots.

### Batch 16
- Moved runtime entity retrieval and entity-match enrichment onto canonical `solemd.paper_entity_mentions` instead of raw `pubtator.entity_annotations`.
- Added shortlist-first passage enrichment in `engine/app/rag/service.py` so passage-mode entity/relation enrichment only runs over the best-ranked candidate window instead of the whole merged candidate set.
- Added richer runtime entity-hit metadata and evaluation stratification:
  - `mention_count`
  - `structural_span_count`
  - `retrieval_default_mention_count`
  - richer stratum keys for entity density, citation density, and sentence-seed presence
- Added runtime index migration:
  - `engine/db/migrations/041_add_runtime_entity_mention_indexes.sql`
- Added focused regressions in:
  - `engine/test/test_rag_retrieval_policy.py`
  - `engine/test/test_rag_repository.py`
  - `engine/test/test_rag_service.py`
  - `engine/test/test_rag_runtime_eval.py`

### Batch 17
- Added centralized runtime search-session settings in `engine/app/rag/repository.py`.
- Disabled PostgreSQL JIT for pinned runtime search sessions behind `settings.rag_runtime_disable_jit`.
- Added focused repository coverage for:
  - pinned connection reuse with `SET LOCAL jit = off`
  - the disabled-config fallback path
- Cleared stale attached runtime eval/perf jobs so the live post-fix recheck is the only active broad benchmark competing for resources.

### Batch 18
- Centralized the runtime entity-search SQL surface in `engine/app/rag/queries.py`:
  - shared query-term / exact-match / fuzzy-match / concept-ranking fragments
  - shared matched-corpus scoring expression
  - one builder for exact-vs-fuzzy and graph-scope-vs-selection variants
- This removed the four-way duplication across:
  - `PAPER_ENTITY_EXACT_SEARCH_SQL`
  - `PAPER_ENTITY_EXACT_SEARCH_IN_SELECTION_SQL`
  - `PAPER_ENTITY_SEARCH_SQL`
  - `PAPER_ENTITY_SEARCH_IN_SELECTION_SQL`
- Reverified the runtime adapter layer with:
  - `engine/test/test_rag_repository.py`
  - `engine/test/test_rag_service.py`

### Batch 19
- Modularized runtime-eval support into tracked, reusable modules:
  - `engine/app/rag/runtime_trace.py`
  - `engine/app/rag/text_alignment.py`
  - `engine/app/rag/title_anchor.py`
  - `engine/app/rag_ingest/runtime_eval_models.py`
  - `engine/app/rag_ingest/runtime_eval_execution.py`
  - supporting corpus-id and detached-job helpers under `engine/app/rag_ingest/` and `engine/scripts/`
- Added compact latency observability to runtime eval summaries:
  - per-stage numeric profiles
  - candidate-count profiles
  - slow-case extraction for the slowest 1% of requests
- Reverified with focused runtime/repository tests and committed as:
  - `a7a7774` — `Modularize runtime eval and add latency summaries`

### Batch 20
- Removed redundant dense-query row hydration from the hot SQL path:
  - dense-query SQL now returns ranked `corpus_id + distance` only
  - repository hydrates the small ranked corpus-id set through the canonical paper lookup helpers
  - `dense_score` and rank order are preserved after hydration
- Realigned the DB-backed ANN perf gate to the actual broad-scope HNSW query surface.
- Added focused regressions for:
  - exact-path dense retrieval hydration
  - selected-scope dense retrieval hydration
  - order preservation after post-query hydration
  - dense-query tail bounds on former outlier probes
- Live effect on the current `96`-paper / `288`-case cohort:
  - overall service `p95` dropped to `195.233 ms`
  - overall service `p99` dropped to `559.895 ms`
  - dense-query stage `p95` dropped to `99.264 ms`
  - dense-query stage `p99` dropped to `143.558 ms`
  - no runtime errors and all grounding/target-in-grounded metrics stayed at `1.0`
- Targeted former outliers now land at:
  - `2230194 title_global`: `service_duration_ms = 173.264`, `search_query_embedding_papers = 15.904`
  - `138129 sentence_global`: `service_duration_ms = 158.692`, `search_query_embedding_papers = 15.990`

### Batch 21
- Re-enabled exact-title prechecks for lexical passage-mode plans in `engine/app/rag/search_plan.py`.
- Kept the title classifier conservative; the fix now comes from a cheap indexed exact-title pass instead of broadening heuristic title detection.
- Added regressions in:
  - `engine/test/test_rag_search_plan.py`
  - `engine/test/test_rag_service.py`
  - `engine/test/test_rag_runtime_perf.py`
- Targeted live result for the former title-routing outlier:
  - report: `.tmp/rag-runtime-probe-22309903-title-global-v15.json`
  - `retrieval_profile` now rebuilds to `title_lookup`
  - `search_exact_title_papers = 1.900 ms`
  - `search_query_embedding_papers = 0.0 ms`
  - `service_duration_ms = 18.699`

### Batch 22
- Split title candidate lookup from broad title similarity in the runtime retrieval contract:
  - `engine/app/rag/models.py`
  - `engine/app/rag/query_enrichment.py`
  - `engine/app/rag/service.py`
  - `engine/app/rag/repository.py`
- Long title-shaped biomedical queries can now keep the exact/prefix candidate-rescue lane while disabling the expensive broad title-similarity path that caused the `24948876` outlier.
- Centralized dense query routing and SQL/session selection in the repository:
  - added one canonical dense-route builder in `engine/app/rag/repository.py`
  - kept exact-vs-ANN session tuning behind the repository adapter
  - surfaced dense-route metadata into runtime traces
- Promoted the tuned pgvector runtime defaults into config:
  - candidate multiplier `8`
  - minimum candidates `40`
  - `hnsw.ef_search = 60`
- Closed the runtime-observability gap in eval reports:
  - `RuntimeEvalCaseResult` now persists `route_signature`
  - case-level route signatures are present in serialized runtime reports, not only the aggregate route-profile summary
- Added focused regressions in:
  - `engine/test/test_rag_query_enrichment.py`
  - `engine/test/test_rag_repository.py`
  - `engine/test/test_rag_runtime_eval.py`
  - `engine/test/test_rag_service.py`
- End-to-end verification:
  - `uv run pytest test/test_rag_query_enrichment.py test/test_rag_repository.py test/test_rag_runtime_eval.py test/test_rag_service.py -q` -> `121 passed`
  - `uv run pytest test/test_rag_runtime_eval.py -q` -> `17 passed`
  - `uv run ruff check app/config.py app/rag/models.py app/rag/query_enrichment.py app/rag/repository.py app/rag/service.py app/rag/runtime_profile.py app/rag_ingest/runtime_eval.py app/rag_ingest/runtime_eval_execution.py app/rag_ingest/runtime_eval_models.py test/test_rag_query_enrichment.py test/test_rag_repository.py test/test_rag_runtime_eval.py test/test_rag_service.py` -> passed

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
- Post-dense-hydration current-cohort evidence:
  - report: `.tmp/rag-runtime-eval-current-all-families-v14-densehydrate.json`
  - current cohort: `96` papers / `288` cases / `0` flagged warehouse papers
  - overall service latency: `p50 23.43ms`, `p95 195.233ms`, `p99 559.895ms`, `max 672.487ms`
  - dense-query stage: `mean 42.696ms`, `p95 99.264ms`, `p99 143.558ms`, `max 498.358ms`
  - query-entity-enrichment stage is now the most common hot stage: `mean 69.469ms`, `p95 94.184ms`
  - residual explicit outliers:
    - `22309903` `title_global`: routed through `passage_lookup`, dense stage `498.358ms`
    - `273920567` / `81621267` `sentence_global`: relation stage `448.032ms` / `388.851ms`
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
- Enlarged current-graph all-family report (`v8`):
  - `.tmp/rag-runtime-eval-default-structural-v1-all-families-v8-full.json`
  - `288` cases across `96` sampled papers from a `246`-paper graph-backed eval population
  - overall:
    - `hit@1 = 0.9826`
    - `hit@k = 0.9931`
    - `target_in_answer_corpus_rate = 0.9896`
    - `grounded_answer_rate = 1.0`
    - `target_in_grounded_answer_rate = 0.9896`
    - `mean_service_duration_ms = 3035.351`
    - `p95_service_duration_ms = 1914.0`
  - by family:
    - `title_global`: `hit@1 = 0.9688`, `p95_service_duration_ms = 2462.0`
    - `title_selected`: all quality metrics `1.0`, `p95_service_duration_ms = 450.0`
    - `sentence_global`: `hit@1 = 0.9792`, `target_in_grounded_answer_rate = 0.9896`, `p95_service_duration_ms = 19680.0`
- Expanded unseen-cohort report before the latest session/SQL optimization batch (`v11`):
  - `.tmp/rag-runtime-eval-missing-v1-all-families-v11.json`
  - `576` cases across `192` requested unseen papers
  - overall:
    - `hit@1 = 0.9653`
    - `hit@k = 0.9878`
    - `target_in_answer_corpus_rate = 0.9844`
    - `grounded_answer_rate = 0.9983`
    - `target_in_grounded_answer_rate = 0.9844`
    - `mean_service_duration_ms = 4992.21`
    - `p95_service_duration_ms = 3490.0`
    - `error_count = 0`
  - by family:
    - `title_global`: `target_in_grounded_answer_rate = 0.9792`, `mean_service_duration_ms = 5479.964`
    - `title_selected`: `target_in_grounded_answer_rate = 0.9948`, `mean_service_duration_ms = 1458.354`
    - `sentence_global`: `target_in_grounded_answer_rate = 0.9792`, `mean_service_duration_ms = 8038.312`, `p95_service_duration_ms = 49307.0`
  - interpretation:
    - quality held at near-perfect coverage
    - the remaining urgent issue shifted from correctness to tail latency on a few pathological requests
- Direct current-code probe after Batch 9:
  - `search_papers` for the former worst `3092150` title query completed in about `372.67 ms`
  - `fetch_citation_contexts` for the resulting corpus ids completed in about `8.69 ms`
  - this is strong evidence that the `v11` tail mostly predates the latest current-code repository/session batch
- Current-code unseen-cohort report after question-subtitle routing fix (`v13`):
  - `.tmp/rag-runtime-eval-missing-v1-all-families-v13.json`
  - `576` cases across `192` requested unseen papers
  - overall:
    - `hit@1 = 0.967`
    - `hit@k = 0.9861`
    - `target_in_answer_corpus_rate = 0.9826`
    - `grounded_answer_rate = 0.9983`
    - `target_in_grounded_answer_rate = 0.9826`
    - `mean_service_duration_ms = 1671.741`
    - `p95_service_duration_ms = 1924.0`
    - `error_count = 0`
  - by family:
    - `title_global`: `target_in_grounded_answer_rate = 0.974`, `mean_service_duration_ms = 1946.531`, `p95_service_duration_ms = 2255.0`
    - `title_selected`: `target_in_grounded_answer_rate = 0.9948`, `mean_service_duration_ms = 363.052`, `p95_service_duration_ms = 401.0`
    - `sentence_global`: `target_in_grounded_answer_rate = 0.9792`, `mean_service_duration_ms = 2705.641`, `p95_service_duration_ms = 2996.0`
- Exact-title hot cohort after Batch 10 current-code fast-path routing:
  - `.tmp/rag-runtime-eval-exact-title-cohort-v1.json`
  - evaluated corpus ids:
    - `3092150`
    - `13501235`
    - `233428792`
    - `259656632`
    - `235226202`
  - `10/10` cases
  - all quality metrics `1.0`
  - `mean_service_duration_ms = 19.8`
  - `p95_service_duration_ms = 22.0`
- Current verification state after Batch 10:
  - `uv run pytest test/test_rag_repository.py test/test_rag_service.py -k 'exact_title or question_subtitle or search_papers or search_exact_title'` -> `9 passed`
  - `uv run pytest test/test_rag_runtime_perf.py -k 'question_style_title_lookup_stays_grounded_and_fast or long_biomedical_exact_title_global_lookup_stays_grounded_and_fast'` -> `2 passed`
  - `uv run pytest test/test_rag_runtime_perf.py` -> `4 passed`
  - `uv run pytest test/test_rag_repository.py -k 'chunk_queries_render_headlines_after_candidate_pruning or semantic_neighbors or exact_title_queries_use_native_index_friendly_lookup_shape or ann_graph_queries_filter_within_candidate_ctes'` -> `7 passed`
  - `uv run ruff check app/rag/queries.py app/rag/repository.py app/rag/service.py test/test_rag_repository.py test/test_rag_service.py test/test_rag_runtime_perf.py` -> passed
- Current-code unseen-cohort report after Batch 11 hot-path fixes (`v14`):
  - `.tmp/rag-runtime-eval-missing-v1-all-families-v14.json`
  - `576` cases across `192` requested unseen papers
  - overall:
    - `hit@1 = 0.9896`
    - `hit@k = 0.9931`
    - `target_in_answer_corpus_rate = 0.9896`
    - `grounded_answer_rate = 0.9983`
    - `target_in_grounded_answer_rate = 0.9896`
    - `mean_service_duration_ms = 1325.271`
    - `p95_service_duration_ms = 1781.0`
    - `error_count = 0`
  - by family:
    - `title_global`: `target_in_grounded_answer_rate = 0.9948`, `mean_service_duration_ms = 150.948`, `p95_service_duration_ms = 121.0`
    - `title_selected`: `target_in_grounded_answer_rate = 0.9948`, `mean_service_duration_ms = 1235.729`, `p95_service_duration_ms = 27.0`
    - `sentence_global`: `target_in_grounded_answer_rate = 0.9792`, `mean_service_duration_ms = 2589.135`, `p95_service_duration_ms = 2795.0`
  - measured interpretation:
    - `title_global` collapsed from the former multi-second tail into a mostly fast lane
    - `title_selected` still had a bad mean because a few pathological requests still paid semantic-neighbor expansion
    - `sentence_global` still carried a long-tail bottleneck outside grounding itself
- Direct measured bottleneck probes after `v14`:
  - `title_selected` worst path (`4443808`) was dominated by `fetch_semantic_neighbors` at about `14s-32s` inside requests that were otherwise healthy
  - `sentence_global` worst path (`30014021`) was dominated by `search_entity_papers` at about `109s-111s`
  - a direct exact-only entity lookup for `GM2 gangliosidosis variant B1` completed in about `192.676 ms`
- Current-code unseen-cohort report after the exact-entity and selected-anchor fixes (`v15`):
  - `.tmp/rag-runtime-eval-missing-v1-all-families-v15.json`
  - `576` cases across `192` requested unseen papers
  - overall:
    - `hit@1 = 0.9896`
    - `hit@k = 0.9931`
    - `target_in_answer_corpus_rate = 0.9896`
    - `grounded_answer_rate = 0.9983`
    - `target_in_grounded_answer_rate = 0.9896`
    - `mean_service_duration_ms = 812.455`
    - `p95_service_duration_ms = 1651.0`
    - `error_count = 0`
  - by family:
    - `title_global`: `target_in_grounded_answer_rate = 0.9948`, `mean_service_duration_ms = 144.661`, `p95_service_duration_ms = 116.0`
    - `title_selected`: `target_in_grounded_answer_rate = 0.9948`, `mean_service_duration_ms = 349.167`, `p95_service_duration_ms = 28.0`
    - `sentence_global`: `target_in_grounded_answer_rate = 0.9792`, `mean_service_duration_ms = 1943.536`, `p95_service_duration_ms = 2662.0`
  - measured interpretation:
    - overall mean dropped another `~39%` from `v14`
    - `title_selected` mean collapsed from `1235.729 ms` to `349.167 ms` while preserving quality
    - `sentence_global` improved materially but remains the slowest family
- Direct measured bottleneck probes after `v15`:
  - exact replay of the `211053997` sentence-global outlier showed:
    - total request time about `6462 ms`
    - `search_relation_papers` alone about `5092.616 ms`
    - `search_query_embedding_papers` about `757.896 ms`
    - `search_chunk_papers` about `424.036 ms`
  - `EXPLAIN ANALYZE` on `queries.PAPER_RELATION_SEARCH_SQL` for relation term `compare` showed:
    - execution time about `4657.712 ms`
    - about `266,939` `pubtator.relations` rows reached through `idx_pt_relation_type`
    - repeated join cost against `solemd.corpus`, `solemd.graph_points`, `solemd.papers`, and `solemd.paper_evidence_summary`
  - remaining selected-title miss `11857184` is now a paraphrase-title case rather than a raw exact-title miss:
    - the query shares a long leading span with the stored title but diverges into a shorter natural-language subtitle
    - current title similarity ranks semantically related training/older-adult papers above the selected paper
- Normalized-title contract evidence before landing Batch 12:
  - corpus-wide Python comparison over `14,060,679` paper titles:
    - lower-vs-casefold mismatches: `1,501`
    - dominant deltas: `ß`, then a small tail of Greek final sigma / omega-iota forms
  - this justified centralizing the SQL function around native `NFKC` normalization plus the observed casefold deltas instead of silently degrading exact-title behavior on those titles
- Batch 12 focused verification:
  - `uv run ruff check app/rag/queries.py app/rag/repository.py test/test_rag_repository.py test/test_rag_runtime_perf.py` -> passed
  - `uv run pytest test/test_rag_repository.py -k 'search_papers or search_exact_title or title'` -> `6 passed`
  - `uv run pytest test/test_rag_runtime_perf.py -k 'normalized_title_key_sql or unicode_normalized_key or selected_title_with_direct_anchor or long_biomedical_exact_title'` -> `4 passed`
- Current-code unseen-cohort report after Batch 12 normalized-title/index work (`v16`):
  - `.tmp/rag-runtime-eval-missing-v1-all-families-v16.json`
  - `576` cases across `192` requested unseen papers
  - overall:
    - `hit@1 = 0.9913`
    - `hit@k = 0.9948`
    - `target_in_answer_corpus_rate = 0.9931`
    - `grounded_answer_rate = 0.9965`
    - `target_in_grounded_answer_rate = 0.9931`
    - `mean_service_duration_ms = 406.526`
    - `p95_service_duration_ms = 1517.0`
    - `error_count = 2`
  - by family:
    - `title_global`: all quality metrics `1.0`, `mean_service_duration_ms = 79.505`, `p95_service_duration_ms = 95.0`
    - `title_selected`: `target_in_grounded_answer_rate = 0.9948`, `mean_service_duration_ms = 20.224`, `p95_service_duration_ms = 23.0`, `error_count = 1`
    - `sentence_global`: `target_in_grounded_answer_rate = 0.9844`, `mean_service_duration_ms = 1119.849`, `p95_service_duration_ms = 1794.0`, `error_count = 1`
  - measured interpretation:
    - `title_global` moved from near-perfect to perfect on the unseen cohort
    - `title_selected` became a genuinely cheap lane rather than a latent semantic-neighbor tail
    - the remaining failure surface is now sentence-global answer selection / grounding, not title retrieval
- Residual-case rechecks after Batch 12:
  - `.tmp/rag-runtime-eval-85494800-title-selected-v16-recheck.json`
    - the earlier `title_selected` error was transient during concurrent index finalization
    - recheck result: all quality metrics `1.0`, `service_duration_ms = 105.0`
  - `.tmp/rag-runtime-eval-24948876-sentence-v16-recheck.json`
    - target is still retrieved at rank `3`, but the answer omits it and grounding remains absent
    - `service_duration_ms = 89516.0`
  - `.tmp/rag-runtime-eval-3092150-235226202-sentence-v16-recheck.json`
- Current-code current-release all-family report after Batch 22 routing+tuning cleanup (`v28`):
  - `.tmp/rag-runtime-eval-current-all-families-v28-tuned.json`
  - `288` cases across `96` sampled graph-backed papers
  - overall:
    - all quality metrics `1.0`
    - `mean_service_duration_ms = 42.752`
    - `p50_service_duration_ms = 22.454`
    - `p95_service_duration_ms = 98.328`
    - `p99_service_duration_ms = 249.75`
    - `max_service_duration_ms = 329.786`
    - `over_1000ms_count = 0`
    - `error_count = 0`
  - by family:
    - `title_global`: `mean_service_duration_ms = 26.089`, `p95_service_duration_ms = 30.681`
    - `title_selected`: `mean_service_duration_ms = 21.115`, `p95_service_duration_ms = 27.985`
    - `sentence_global`: `mean_service_duration_ms = 81.051`, `p95_service_duration_ms = 113.578`, `max_service_duration_ms = 329.786`
  - measured interpretation:
    - the pathological long-title/title-like outlier class is gone
    - sentence-global now has a small, bounded tail instead of multi-second planner failures
    - the stack is ready to shift from hot-path surgery to stronger perf gates, objective experiments, and clinician-facing ranking priors
- Case-level observability smoke after Batch 22:
  - `.tmp/rag-runtime-eval-case-route-signature-smoke-v1.json`
  - confirms serialized `cases[*].route_signature` is populated
  - the former long-title case `24948876` now records:
    - `paper_search_use_title_similarity = false`
    - `paper_search_use_title_candidate_lookup = true`
    - `route_signature = retrieval_profile=title_lookup|paper_search_route=paper_search_global|paper_search_use_title_similarity=False|paper_search_use_title_candidate_lookup=True|dense_query_route=dense_query_ann_broad_scope`
    - `3092150`: target retrieved at rank `3`, but answer/grounding omit it
    - `235226202`: target remains outside the final answer despite direct ABCA7 relevance
    - both are fast (`303 ms`, `176 ms`), so this is ranking/answer selection quality, not latency
- Canonical entity-runtime probe before Batch 17:
  - live `EXPLAIN ANALYZE` on `queries.PAPER_ENTITY_SEARCH_SQL` for `melatonin` on the current graph run showed:
    - execution time about `797.916 ms`
    - JIT total about `774.304 ms`
    - planner scanning partitioned `paper_entity_mentions_*` plus `paper_blocks_*` even though the actual match set was tiny
- Canonical entity-runtime probe after Batch 17:
  - the same `EXPLAIN ANALYZE` with `SET LOCAL jit = off` dropped to about `12.521 ms` with no SQL/result-shape change
  - this confirmed the next safe runtime win was session policy, not a speculative new index or heuristic
- Current-code sentence-global spot check after Batch 17:
  - live `run_rag_runtime_evaluation(...)` on corpus `30014021` with `sentence_global` only:
    - `mean_service_duration_ms = 389.0`
    - `p95_service_duration_ms = 389.0`
    - `target_in_grounded_answer_rate = 1.0`
  - this directly cleared one of the former entity-seeded sentence outliers on the latest code

## Commits

- None yet in this agentic batch.
- Reason: the runtime tree is still part of a broader uncommitted batch and includes neighboring engine/frontend changes outside the runtime files touched in Batches 8-11; commit only after the current performance batch is finalized and can be isolated safely.

## Blockers

- None currently requiring human judgment.
- Current performance blockers are now narrowed and evidenced:
  - sentence-global still has a real quality gap when the target paper is retrieved but not selected into the answer/grounding set (`3092150`, `24948876`)
  - `24948876` is also a genuine tail-latency outlier at about `89.5s`
  - sentence-global still has one retrieval/ranking miss on ABCA7-family-history evidence (`235226202`)
- No human decision blocker yet; next cycle should resolve the relation-search path first, then re-evaluate whether title normalization or selected-paper preservation is the cleaner remaining title fix.
  - Batch 12 resolved the title normalization path; the next cycle should move to sentence-global answer selection / grounding and the `24948876` latency outlier

## Next Review Gate

1. Re-run an explicit `/clean` pass on the touched runtime files, especially `service.py`, `repository.py`, and the runtime SQL surfaces.
2. Profile and fix the `24948876` sentence-global outlier before touching anything else in runtime latency.
3. Tighten sentence-global answer selection / grounding so directly retrieved targets are not dropped from the final answer packets (`3092150`, `24948876`).
4. Improve sentence-global retrieval/ranking for the ABCA7 family-history miss (`235226202`) using the existing structured evidence channels before inventing new heuristics.
5. Re-run focused and broader runtime evaluation after the next batch and create a narrow git commit only if the runtime batch can be isolated safely from unrelated repo work.

## Batch 18: Canonical Broad-Scope ANN Fix And Perf Gate Recheck

- Scope:
  - `engine/app/config.py`
  - `engine/app/rag/queries.py`
  - `engine/app/rag/repository.py`
  - `engine/test/test_rag_repository.py`
  - `engine/test/test_rag_runtime_perf.py`
- Problem evidenced during the active runtime batch:
  - the selected-paper semantic-neighbor tail regressed during a partial ANN rewrite
  - the broad-scope HNSW SQL constants and graph-coverage candidate-budget helpers had drifted out of the runtime code path
  - repository tests showed the semantic ANN helper still calling graph-scoped exact SQL while the perf plan evidence showed the clean fast path should be broad-scope ANN over `solemd.papers` with graph post-filtering
- Durable implementation landed:
  - restored canonical runtime settings for ANN candidate budgeting:
    - `rag_semantic_neighbor_candidate_multiplier = 20`
    - `rag_semantic_neighbor_min_candidates = 120`
    - `rag_semantic_neighbor_max_candidates = 3840`
  - restored the missing SQL surfaces:
    - `EMBEDDED_PAPER_COUNT_SQL`
    - `DENSE_QUERY_SEARCH_ANN_BROAD_SCOPE_SQL`
    - `SEMANTIC_NEIGHBOR_ANN_BROAD_SCOPE_SQL`
  - finished the repository end state:
    - added cached embedded-paper count and graph-coverage helpers
    - centralized ANN candidate budgeting in `_ann_candidate_limit(...)`
    - moved both semantic-neighbor and dense-query ANN paths onto the broad-scope HNSW queries
    - preserved exact graph-scoped fallback for truly small graph scopes
  - updated repository/perf regression tests to assert the new canonical ANN behavior instead of the removed graph-scoped ANN path
- Verification:
  - `uv run ruff check app/config.py app/rag/queries.py app/rag/repository.py test/test_rag_repository.py test/test_rag_runtime_perf.py` -> passed
  - `uv run pytest test/test_rag_repository.py -q` -> `46 passed`
  - `uv run pytest test/test_rag_runtime_perf.py -q` -> `18 passed`
- Live runtime evidence after the fix:
  - one-paper outlier recheck:
    - `.tmp/rag-runtime-eval-22309903-title-selected-v12.json`
    - `22309903` `title_selected` service duration dropped to `165.707 ms`
    - grounding stayed intact: `target_in_grounded_answer_rate = 1.0`
  - sampled current-release perf report:
    - `.tmp/rag-runtime-eval-sample12-seed7-v12.json`
    - `36` cases across `12` sampled papers
    - overall:
      - `mean_service_duration_ms = 70.594`
      - `p95_service_duration_ms = 178.574`
      - `error_count = 0`
    - by family:
      - `title_global`: `p95_service_duration_ms = 128.103`, all quality metrics `1.0`
      - `title_selected`: `p95_service_duration_ms = 32.005`, all quality metrics `1.0`
      - `sentence_global`: `p95_service_duration_ms = 346.122`, all quality metrics `1.0`
- Interpretation:
  - the stale failing perf run was from the half-applied rewrite, not the current code
  - once the ANN path was made canonical again, the sampled perf suite dropped back under the thresholds with no quality regression
  - the former `22309903` selected-paper tail is no longer the active runtime bottleneck

## Updated Next Queue

1. Add explicit runtime tail observability:
   - persist per-stage timings, candidate counts, and session flags for the slowest sampled cases in a compact artifact
   - use that to prove whether any real p99 tail remains after Batch 18
2. Audit dense retrieval objective alignment:
   - compare `specter2_adhoc_query` against stored paper-vector space on a frozen unseen cohort
   - verify whether sentence-global misses are now due to ranking/answer selection rather than query-document embedding mismatch
3. Improve sentence-global quality on the residual misses:
   - target cases like `3092150`, `24948876`, and `235226202`
   - prefer structured-evidence-aware reranking or answer selection improvements before inventing new retrieval lanes
4. Reconcile runtime/base-contract documentation drift once the runtime surface is stable:
   - especially graph base membership and target-size docs if they no longer match the live schema/policy

## Batch 19: Runtime Eval Observability And Self-Containment

- Scope:
  - `engine/app/rag/runtime_trace.py`
  - `engine/app/rag/text_alignment.py`
  - `engine/app/rag/title_anchor.py`
  - `engine/app/rag_ingest/corpus_ids.py`
  - `engine/app/rag_ingest/target_corpus.py`
  - `engine/app/rag_ingest/runtime_eval.py`
  - `engine/app/rag_ingest/runtime_eval_models.py`
  - `engine/app/rag_ingest/runtime_eval_execution.py`
  - `engine/scripts/run_detached_engine_job.py`
  - `engine/scripts/prepare_rag_runtime_eval_cohort.py`
  - `engine/test/test_rag_runtime_eval.py`
  - `engine/test/test_rag_text_alignment.py`
  - `engine/test/test_rag_corpus_ids.py`
  - `engine/test/test_run_detached_engine_job.py`
- Problem evidenced after Batch 18:
  - the runtime branch was not cleanly self-contained because several compact support modules were still untracked even though the active runtime code already imported them
  - runtime eval case results already captured per-stage timings, candidate counts, and session flags through `RuntimeTraceCollector`, but the summary layer discarded that detail and forced manual case-by-case inspection
- Durable implementation landed:
  - kept the canonical tracing seam in `RuntimeTraceCollector` and extended the eval-report surface instead of inventing a parallel profiler
  - added compact latency/reporting models:
    - `RuntimeEvalNumericProfile`
    - `RuntimeEvalSlowStage`
    - `RuntimeEvalSlowCase`
    - `RuntimeEvalLatencySummary`
  - `summarize_runtime_results(...)` now emits:
    - stage-level latency profiles
    - candidate-count profiles
    - compact slow-case summaries for the slowest evaluation cases
  - staged the shared runtime/eval support modules that the current runtime path already depends on:
    - title-anchor helpers
    - text-alignment helpers
    - corpus-id IO helpers
    - target-corpus loader
    - detached engine-job launcher
    - cohort-preparation CLI
- Verification:
  - `cd engine && uv run pytest test/test_rag_runtime_eval.py test/test_rag_text_alignment.py test/test_rag_corpus_ids.py test/test_run_detached_engine_job.py -q` -> `23 passed`
  - `cd engine && uv run pytest test/test_rag_repository.py test/test_rag_service.py test/test_rag_answer.py test/test_rag_warehouse_grounding.py -q` -> `88 passed`
  - `cd engine && uv run ruff check app/rag/runtime_trace.py app/rag/text_alignment.py app/rag/title_anchor.py app/rag_ingest/corpus_ids.py app/rag_ingest/target_corpus.py app/rag_ingest/runtime_eval.py app/rag_ingest/runtime_eval_models.py app/rag_ingest/runtime_eval_execution.py scripts/run_detached_engine_job.py scripts/prepare_rag_runtime_eval_cohort.py test/test_rag_runtime_eval.py test/test_rag_text_alignment.py test/test_rag_corpus_ids.py test/test_run_detached_engine_job.py` -> passed
  - `cd engine && uv run ruff check app/rag/answer.py app/rag/repository.py app/rag/service.py app/rag/warehouse_grounding.py test/test_rag_repository.py test/test_rag_service.py test/test_rag_answer.py test/test_rag_warehouse_grounding.py` -> passed
- Interpretation:
  - the runtime branch is cleaner because the shared helpers it already relies on are now part of the tracked surface
  - the next tail-analysis pass can use canonical report fields instead of ad hoc log spelunking

## Refined Next Queue

1. Regenerate the current-cohort runtime artifact once the interactive runtime harness clears:
   - confirm the entity-surface gate lowers the shared `query_entity_enrichment` floor without changing quality
   - keep the current artifact lineage anchored to the `v16` cohort and the new unit/service regressions
2. Instrument the remaining title-search tail before rewriting it:
   - capture planner-visible behavior for `24948876`
   - compare the existing graph-scoped title-similarity path against any bounded candidate alternatives
   - do not revive the rejected global-KNN swap without live evidence
3. Audit dense retrieval objective alignment for the biomedical query/document setup:
   - SPECTER2 adhoc query vs stored document-space vectors
   - current dense lane vs lexical-heavy path on a frozen cohort
4. Improve sentence-global ranking/answer selection on residual misses using the refreshed observability and the retrieval audit.
5. Reconcile runtime/base-contract documentation drift only after the runtime retrieval contract stops moving.

## Batch 20: Query Routing Heuristics

- Commit: `d0988e2` (`Harden query routing heuristics`)
- Scope:
  - `engine/app/rag/query_enrichment.py`
  - `engine/test/test_rag_query_enrichment.py`
  - `engine/test/test_rag_service.py`
  - `engine/test/test_rag_runtime_perf.py`
- Problem evidenced during the routing pass:
  - long structured scientific titles and question-subtitle paper titles still leaked into passage handling
  - long passage queries could auto-seed incidental relation labels like `compare`, reopening a relation-search tail even when relation retrieval added no value
- Durable implementation landed:
  - expanded title-shape classification for:
    - question-subtitle paper titles
    - longer structured scientific titles
    - rejection of citation-style fragments and abstract-header prose
  - preserved biomedical entity phrase building without stripping symbol-heavy tokens
  - kept auto-resolved entity seed promotion behind specificity checks
  - bounded automatic relation-term derivation so long passage queries no longer seed incidental relation recall
- Verification:
  - focused query-enrichment, service, and runtime-perf regressions passed before commit
- Interpretation:
  - the runtime routing contract is now more faithful to actual paper-title and sentence surfaces
  - relation-tail cleanup moved out of ad hoc case handling and into the canonical routing layer

## Batch 21: High-Precision Entity Enrichment Gate

- Scope:
  - `engine/app/rag/query_enrichment.py`
  - `engine/app/rag/retrieval_policy.py`
  - `engine/app/rag/repository.py`
  - `engine/app/rag/queries.py`
  - `engine/test/test_rag_query_enrichment.py`
  - `engine/test/test_rag_retrieval_policy.py`
  - `engine/test/test_rag_repository.py`
  - `engine/test/test_rag_service.py`
- Problem evidenced after the `v16` cohort:
  - `query_entity_enrichment` was the dominant shared hot stage even though only `2/96` sentence-global cases produced any entity-hit papers
  - generic title-like or sentence-like biomedical queries without explicit entity surface were still paying the enrichment cost
  - a first clean attempt to swap the residual title-search tail onto the global KNN title query failed the live smell test and was rejected
- Durable implementation landed:
  - added a high-precision query-surface detector for runtime entity enrichment:
    - biomedical symbol tokens
    - short uppercase acronym forms
    - parenthetical acronym surfaces
    - mid-sentence proper nouns
  - centralized the enrichment gate in `retrieval_policy.py` so the runtime now skips entity enrichment when:
    - explicit entity terms are already present, or
    - the query has no real entity-like surface signal, or
    - a strong title anchor already resolved the lookup
  - preserved the existing title-search SQL path after rejecting the naive global-KNN fallback
- Verification:
  - `cd engine && uv run pytest test/test_rag_repository.py test/test_rag_retrieval_policy.py test/test_rag_query_enrichment.py -q` -> `76 passed`
  - `cd engine && uv run pytest test/test_rag_query_enrichment.py test/test_rag_retrieval_policy.py test/test_rag_repository.py test/test_rag_service.py -q -k "entity_surface_signal or runtime_entity_enrichment or search_papers_uses_graph_scoped_title_lookup_for_small_graph_scope or search_papers_returns_exact_title_candidates_before_broad_title_lookup or search_papers_returns_prefix_title_candidates_before_broad_title_lookup or search_papers_can_disable_title_similarity_for_sentence_queries or search_papers_uses_exact_query_for_small_graph_scope or skips_auto_relation_seeding_for_long_passage_queries or skips_runtime_entity_enrichment_without_entity_surface_signal"` -> `10 passed`
  - `cd engine && uv run ruff check app/rag/query_enrichment.py app/rag/retrieval_policy.py app/rag/repository.py app/rag/queries.py test/test_rag_query_enrichment.py test/test_rag_retrieval_policy.py test/test_rag_repository.py test/test_rag_service.py` -> passed
- Interpretation:
  - the entity-enrichment floor is now addressed structurally instead of by case-specific suppression
  - the remaining title-search tail is still open, but the failed KNN rewrite is now an explicit rejected path rather than hidden drift

## Batch 22: Runtime Title-Plan Observability

- Scope:
  - `engine/app/rag/models.py`
  - `engine/app/rag/service.py`
  - `engine/app/rag/query_plan.py`
  - `engine/scripts/profile_rag_title_search.py`
  - `engine/scripts/evaluate_rag_runtime.py`
  - `engine/test/test_rag_query_plan.py`
  - `engine/test/test_rag_runtime_perf.py`
- Problem evidenced after Batch 21:
  - the remaining title-like sentence miss (`24948876`) was still tempting a blind SQL rewrite, but the first direct global-KNN attempt had already shown that this is exactly where guesswork can regress the hot path
  - the runtime eval layer already had internal stage timing support, but there was no reusable planner-visible profiler for the residual title-search branch
- Durable implementation landed:
  - added `RagService.search_result(...)` as the canonical internal seam for debug-trace-aware runtime evaluation without changing the API response contract
  - stored internal runtime trace payloads on `RagSearchResult.debug_trace` for eval-only consumers
  - added reusable PostgreSQL JSON-plan helpers in `engine/app/rag/query_plan.py`
  - added `engine/scripts/profile_rag_title_search.py` to capture:
    - active title-search strategy
    - live `search_papers(...)` duration
    - planner or `ANALYZE` plans for exact, normalized, prefix, and final title-search SQL branches
  - extended the eval CLI so frozen cohorts can be supplied through a file as well as inline corpus ids
- Verification:
  - `cd engine && uv run pytest test/test_rag_service.py test/test_rag_query_plan.py test/test_rag_runtime_perf.py -q -k "search_result_can_include_debug_trace or plan_hash_is_stable_for_key_order or plan_helpers_walk_nested_nodes_and_indexes or title_knn_queries_use_gist_indexes or dense_query_ann_uses_hnsw_index or semantic_neighbor_ann_uses_hnsw_index or title_prefix_lookup_uses_title_trgm_index"` -> `7 passed`
  - `cd engine && uv run ruff check app/rag/models.py app/rag/service.py app/rag/query_plan.py scripts/profile_rag_title_search.py scripts/evaluate_rag_runtime.py test/test_rag_query_plan.py test/test_rag_runtime_perf.py` -> passed
- Interpretation:
  - the runtime branch now has a clean, centralized observability path for planner-visible title-search debugging
  - the next ranking/title pass can optimize from actual plan evidence and the `3/96` sentence-global miss set instead of another speculative SQL rewrite

## Batch 23: Title-Lookup Ranking Contract Repair

- Scope:
  - `engine/app/rag/repository.py`
  - `engine/app/rag/ranking.py`
  - `engine/test/test_rag_repository.py`
  - `engine/test/test_rag_ranking.py`
- Problem evidenced after Batch 22:
  - the targeted sentence-global miss set still had one residual failure, `24948876`
  - live profiling showed the target paper was already in the lexical and dense candidate set, but citation-only neighbors could still outrank it
  - direct runtime inspection also exposed a repository-mapper bug: rows with no ANN `distance` were inheriting `dense_score = 1.0`, which polluted title-like ranking with false dense evidence
- Durable implementation landed:
  - centralized `distance -> dense_score` mapping in `engine/app/rag/repository.py`
  - fixed the mapper so missing ANN distances now map to `0.0` instead of a perfect dense score
  - tightened `TITLE_LOOKUP` sorting in `engine/app/rag/ranking.py` so papers with direct title support sort ahead of citation-only or dense-only neighbors
  - added focused regressions for:
    - paper lookup rows without distances
    - title-lookups where a direct lexical hit must beat citation-only topical neighbors
- Verification:
  - `cd engine && uv run pytest test/test_rag_repository.py test/test_rag_ranking.py -q` -> `63 passed`
  - `cd engine && uv run ruff check app/rag/repository.py app/rag/ranking.py test/test_rag_repository.py test/test_rag_ranking.py` -> passed
  - `cd engine && uv run python scripts/evaluate_rag_runtime.py --graph-release-id current --query-family sentence_global --corpus-id 3092150 --corpus-id 24948876 --corpus-id 207261606 --report-path ../.tmp/rag-runtime-eval-sentence-miss-set-v19-titlefix.json`
- Interpretation:
  - the residual sentence-global miss set is now clean at `hit@1 = 1.0`
  - the fix came from correcting the runtime contract, not from speculative SQL rewrites or arbitrary weight churn

## Batch 24: Dense Embedder Activation Hygiene

- Scope:
  - `engine/app/rag/query_embedding.py`
  - `engine/test/test_rag_query_embedding.py`
- Problem evidenced after Batch 23:
  - the runtime search path was functionally using the SPECTER2 query encoder, but every warmup/eval still emitted `There are adapters available but none are activated for the forward pass.`
  - live inspection of the real `adapters==1.2.0` runtime showed that:
    - the adapter was actually active after initialization
    - the warning was a false-positive emitted during `set_active_adapters(...)`
  - the old embedder path also mixed redundant activation styles by using `set_active=True`, then `set_active_adapters(...)`, then direct `active_adapters` mutation
- Durable implementation landed:
  - removed the direct `active_adapters` mutation from `engine/app/rag/query_embedding.py`
  - made the activation flow explicit and single-path:
    - `load_adapter(..., set_active=False)`
    - `set_active_adapters(adapter_ref)`
  - added a fallback runtime-status view over `adapters_config.active_setup`
  - suppressed the one known false-positive warning only during the real load+activate block
  - added focused regressions for:
    - runtime-status fallback to active setup
    - explicit activation behavior
    - suppression of the known load-time warning in a package-shaped test harness
- Verification:
  - `cd engine && uv run pytest test/test_rag_query_embedding.py -q` -> `5 passed`
  - `cd engine && uv run ruff check app/rag/query_embedding.py test/test_rag_query_embedding.py` -> passed
  - embedder smoke:
    - `initialize() -> True`
    - `runtime_status()['active_adapters'] -> Stack[[QRY]]`
    - no warning emitted in the real runtime path
  - targeted runtime recheck:
    - `.tmp/rag-runtime-eval-sentence-miss-set-v20-embedderquiet.json`
- Interpretation:
  - the dense runtime path is now quiet and explicit instead of relying on redundant adapter mutations
  - the post-fix runtime still holds `sentence_global hit@1 = 1.0` on the residual miss cohort

## Batch 25: Docs Contract Drift Cleanup

- Scope:
  - `docs/design/living-graph.md`
  - `docs/map/architecture.md`
  - `docs/map/bundle-contract.md`
  - `docs/map/corpus-filter.md`
  - `docs/map/data.md`
  - `docs/map/graph-layout.md`
  - `docs/map/map.md`
  - `docs/map/rag.md`
  - `docs/map/semantic-scholar.md`
  - `engine/test/test_docs_runtime_contract.py`
- Problem evidenced after Batch 24:
  - the runtime and graph contracts had drifted across the map docs:
    - some docs still described `graph_points.is_in_base` / `graph_points.base_rank` as the database source of truth
    - several files still hardcoded stale base sizes (`~500K`, `~1.6M`, `~1.98M`) instead of using the policy-driven contract
    - `docs/map/rag.md` still described an older retrieval shape that omitted live `chunk_lexical` and `dense_query` lanes and implied external dense chunk retrieval as the current baseline
  - live verification showed the actual current contract is:
    - base admission source of truth: `solemd.graph_base_points`
    - active policy target: `solemd.base_policy.target_base_count = 1,000,000`
    - current graph run: `2,452,643` mapped papers / `1,000,000` base papers
- Durable implementation landed:
  - rewrote the critical graph/base docs so `graph_base_points` is the unambiguous base-admission contract
  - replaced stale fixed-size language with policy-driven wording
  - updated the RAG map to describe the live runtime:
    - `chunk_lexical`
    - `dense_query`
    - `allenai/specter2_adhoc_query`
    - chunk vectors still not live
  - clarified that future dense chunk retrieval / external reranking remain planned, not current baseline behavior
  - added `engine/test/test_docs_runtime_contract.py` as a regression guard for the most important contract-drift cases
- Verification:
  - `cd engine && uv run pytest test/test_docs_runtime_contract.py -q` -> `3 passed`
  - `cd engine && uv run ruff check test/test_docs_runtime_contract.py` -> passed
- Interpretation:
  - the canonical docs now match the live base-membership and runtime-retrieval contracts closely enough to stop leaking stale assumptions into future passes
  - this closes a real source of architectural drift before the next broad eval and ranking work

## Batch 26: Passage-Only Entity Resolution And Exact-Title Rescue

- Scope:
  - `engine/app/rag/query_enrichment.py`
  - `engine/app/rag/retrieval_policy.py`
  - `engine/app/rag/service.py`
  - `engine/test/test_rag_query_enrichment.py`
  - `engine/test/test_rag_service.py`
- Problem evidenced after the first broad current-release eval:
  - `sentence_global` still spent too much time in runtime entity enrichment on passage-like statistical prose even when it produced no entity seeds
  - the first anchor-aware trim pass fixed that tail, but it over-corrected:
    - generic relation-bearing short queries lost the broad entity-enrichment path
    - title-like queries with terminal punctuation fell back into `PASSAGE_LOOKUP`, which regressed `title_global`
- Durable implementation landed:
  - centralized runtime entity-resolution phrase selection in `engine/app/rag/query_enrichment.py`
  - kept broad phrase resolution for compact title/general lookups
  - added a high-precision passage-only phrase builder that:
    - keeps acronym and biomedical-symbol anchors
    - rejects statistical tokens such as `p<0.001`
    - caps passage resolution phrases at a small bounded set
  - narrowed runtime entity-enrichment skipping so relation-bearing short queries can still resolve missing entity terms
  - replaced the over-broad passage exact-title precheck with a shape-aware rescue helper:
    - rescues real titles that fall into the passage lane because of terminal punctuation
    - rejects obvious sentence openings such as `This is ...`
  - added focused regressions for:
    - passage-noise phrase suppression
    - short and long terminal-title rescue
    - passage-noise service behavior
- Verification:
  - `cd engine && uv run ruff check app/rag/query_enrichment.py app/rag/service.py app/rag/retrieval_policy.py test/test_rag_query_enrichment.py test/test_rag_service.py` -> passed
  - `cd engine && uv run pytest test/test_rag_query_enrichment.py test/test_rag_service.py -q` -> `53 passed`
  - `cd engine && uv run pytest test/test_rag_query_enrichment.py test/test_rag_service.py test/test_rag_runtime_eval.py test/test_rag_repository.py -q` -> `115 passed`
  - broad current-release eval artifacts:
    - baseline: `.tmp/rag-runtime-eval-current-all-families-v21-postdocs.json`
    - rejected intermediate: `.tmp/rag-runtime-eval-current-all-families-v22-entitytrim.json`
    - accepted result: `.tmp/rag-runtime-eval-current-all-families-v23-title-rescue.json`
- Outcome versus `v21` baseline:
  - overall:
    - `hit@1`: `1.0 -> 1.0`
    - mean latency: `62.193 ms -> 46.345 ms`
    - `p95`: `177.915 ms -> 114.821 ms`
    - `p99`: `328.195 ms -> 226.021 ms`
    - max: `556.505 ms -> 286.540 ms`
  - `sentence_global`:
    - `hit@1`: `1.0 -> 1.0`
    - mean latency: `142.205 ms -> 93.253 ms`
    - `p50`: `142.155 ms -> 82.766 ms`
    - `p95`: `209.671 ms -> 140.481 ms`
    - `p99`: `556.505 ms -> 286.540 ms`
  - `title_global`:
    - `hit@1`: `1.0 -> 1.0`
    - mean latency: `24.250 ms -> 25.544 ms`
    - `p95`: `31.466 ms -> 42.684 ms`
    - note: this small title-lane regression was accepted because it stayed perfect on quality while the overall and sentence-global tail improved materially
- Interpretation:
  - the runtime now spends far less time resolving useless passage-noise entities, while still preserving the intended enrichment path for compact biomedical knowledge queries
  - exact-title rescue is again a narrow contract instead of a blind passage precheck
  - this batch materially improves the lane that mattered most (`sentence_global`) without opening a correctness regression elsewhere

## Batch 27: DB-Backed Perf Gates And Selected-Title Promotion Hardening

- Scope:
  - `engine/app/rag/service.py`
  - `engine/test/test_rag_runtime_perf.py`
  - `engine/test/test_rag_service.py`
- Problem evidenced after the routing/observability cleanup:
  - the runtime was healthy on the fresh `v28` current-release cohort, but the perf suite still reflected looser smoke-style thresholds instead of the now-stable DB-backed latency floor
  - tightening the selected-title perf gate exposed a real contract gap:
    - an explicitly selected paper with an overlong real title (`4443808`) could remain in `PASSAGE_LOOKUP`
    - the service only tried `search_selected_title_papers(...)` when the classifier had already promoted the query into `TITLE_LOOKUP`
    - this let a cheap exact selected-title proof step depend on a brittle query-shape heuristic
- Durable implementation landed:
  - strengthened `engine/test/test_rag_runtime_perf.py` to use a representative `24`-paper current-release cohort
  - added explicit cohort-backed caps for:
    - overall `p95`, `p99`, and `over_1000ms_count`
    - `title_global`, `title_selected`, and `sentence_global` family-specific latency ceilings
    - case-level `route_signature` presence so the perf gate also guards runtime routing visibility
  - tightened the targeted outlier/perf probes so former problem shapes now have bounded assertions instead of permissive multi-second ceilings
  - removed the unnecessary `query.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP` gate before `search_selected_title_papers(...)` in `engine/app/rag/service.py`
    - the selected-title exact/prefix probe now runs whenever lexical retrieval, exact-title matching, and an explicit selected corpus are all present
    - if the probe succeeds, the existing service path promotes the request into `TITLE_LOOKUP` and rebuilds the search plan from proof, not from heuristic guesswork
  - added a focused service regression proving that an overlong selected-paper title can promote itself into the selected-title route without falling through chunk retrieval or runtime entity resolution
- Verification:
  - `cd engine && uv run ruff check app/rag/service.py test/test_rag_service.py test/test_rag_runtime_perf.py` -> passed
  - `cd engine && uv run pytest test/test_rag_query_enrichment.py test/test_rag_service.py -q` -> `57 passed`
  - `cd engine && uv run pytest test/test_rag_runtime_perf.py -q -k 'selected_title_with_direct_anchor_stays_fast or question_style_title_lookup_stays_grounded_and_fast or title_query_families_remain_grounded_and_fast or sentence_query_family_keeps_precision_and_latency_floor or sentence_query_with_title_like_paper_fallback_stays_fast'` -> `5 passed`
  - `cd engine && uv run pytest test/test_rag_runtime_perf.py -q` -> `22 passed`
- Fresh cohort artifact:
  - `cd engine && uv run python scripts/evaluate_rag_runtime.py --graph-release-id current --sample-size 24 --seed 7 --k 5 --rerank-topn 10 --report-path .tmp/rag-runtime-eval-current-all-families-v29-perf-gates.json`
  - `.tmp/rag-runtime-eval-current-all-families-v29-perf-gates.json`
  - overall:
    - all quality metrics `1.0`
    - `mean_service_duration_ms = 37.407`
    - `p95_service_duration_ms = 84.823`
    - `p99_service_duration_ms = 239.334`
    - `max_service_duration_ms = 239.334`
    - `over_1000ms_count = 0`
  - by family:
    - `title_global`: `mean_service_duration_ms = 18.539`, `p95_service_duration_ms = 27.032`
    - `title_selected`: `mean_service_duration_ms = 18.072`, `p95_service_duration_ms = 32.464`
    - `sentence_global`: `mean_service_duration_ms = 75.609`, `p95_service_duration_ms = 103.620`, `p99_service_duration_ms = 239.334`
- Interpretation:
  - runtime perf coverage is now aligned with the actual current-release operating floor instead of a legacy smoke baseline
  - selected-paper context has become a stronger contract surface: an explicit selected paper can now rescue its own exact/prefix title match even when the classifier keeps the raw query in passage mode
  - this batch closes `A17` cleanly and reduces the chance that future query-shape tuning silently reopens the selected-title tail

## Batch 28: Dense Contract Audit And Biomedical Reranker Canary

- Scope:
  - `engine/app/config.py`
  - `engine/app/rag/biomedical_models.py`
  - `engine/app/rag/query_embedding.py`
  - `engine/app/rag/dense_audit.py`
  - `engine/scripts/evaluate_dense_contract_audit.py`
  - `engine/test/test_rag_dense_audit.py`
- Problem evidenced after the runtime perf floor stabilized:
  - the next dense-runtime question was no longer speed but contract truth:
    - was the live `allenai/specter2_adhoc_query` encoder mismatched with stored Semantic Scholar `embedding.specter_v2` paper vectors?
    - would a biomedical lane such as MedCPT move the remaining sentence-style objective more than another round of SQL/query-shape tuning?
  - answering that cleanly required a controlled cohort audit, not another speculative runtime rewrite.
- Durable implementation landed:
  - added centralized biomedical experiment settings in `engine/app/config.py`
  - extracted reusable GPU-aware biomedical encoder/reranker loaders into `engine/app/rag/biomedical_models.py`
    - SPECTER2 proximity paper encoder
    - MedCPT query encoder
    - MedCPT article encoder
    - MedCPT cross-encoder reranker
  - cleaned `engine/app/rag/query_embedding.py` so adapter-warning suppression and active-adapter inspection are centralized instead of duplicated
  - added `engine/app/rag/dense_audit.py` and `engine/scripts/evaluate_dense_contract_audit.py` to run a controlled dense-space audit over the runtime-eval cohort
  - compared three dense lanes on identical cases:
    - `specter2_stored_api`
    - `specter2_local_proximity`
    - `medcpt_dual_encoder`
  - reranked each lane with `medcpt_cross_encoder`
  - kept the work explicitly experimental and offline: no live runtime contract changed in this batch
- Verification:
  - `cd engine && uv run ruff check app/config.py app/rag/biomedical_models.py app/rag/query_embedding.py app/rag/dense_audit.py scripts/evaluate_dense_contract_audit.py test/test_rag_dense_audit.py test/test_rag_query_embedding.py` -> passed
  - `cd engine && uv run pytest test/test_rag_dense_audit.py test/test_rag_query_embedding.py -q` -> `8 passed`
  - live GPU-backed audit artifact:
    - `cd engine && uv run python scripts/evaluate_dense_contract_audit.py --graph-release-id current --sample-size 0 --seed 7 --top-k 5 --rerank-topn 10 --report-path .tmp/dense-contract-audit-current-v1.json`
    - `.tmp/dense-contract-audit-current-v1.json`
- Results:
  - cohort:
    - `sampled_papers = 246`
    - `query_case_count = 492`
  - SPECTER2 contract alignment:
    - `mean_self_cosine = 0.9933`
    - `top1_agreement_rate = 0.9776`
    - `mean_top10_overlap_rate = 0.8819`
    - interpretation: the stored Semantic Scholar S2 paper vectors are already closely aligned with the live SPECTER2 query space, so a paper re-embedding pass is not justified by the current evidence
  - dense-only sentence-global quality:
    - `specter2_stored_api`: `hit@1 = 0.8902`, `hit@5 = 0.9715`
    - `specter2_local_proximity`: `hit@1 = 0.8699`, `hit@5 = 0.9512`
    - `medcpt_dual_encoder`: `hit@1 = 0.9228`, `hit@5 = 0.9797`
  - reranked sentence-global quality:
    - `specter2_stored_api+medcpt_cross_encoder`: `hit@1 = 0.9715`, `hit@5 = 0.9797`
    - `medcpt_dual_encoder+medcpt_cross_encoder`: `hit@1 = 0.9837`, `hit@5 = 0.9959`
- Interpretation:
  - `A26` is closed: the current stored S2 paper-embedding lane is not the limiting contract issue
  - `A27` is closed as a benchmark decision: a bounded MedCPT reranker is the highest-value next live runtime experiment for sentence-style biomedical queries
  - the next runtime batch should keep S2 retrieval as the base contract and layer an optional MedCPT rerank stage on a small merged candidate set

## Batch 29: Optional Live Biomedical Reranker And Runtime Decision

- Scope:
  - `engine/app/config.py`
  - `engine/app/rag/biomedical_text.py`
  - `engine/app/rag/biomedical_reranking.py`
  - `engine/app/rag/bundle.py`
  - `engine/app/rag/dense_audit.py`
  - `engine/app/rag/models.py`
  - `engine/app/rag/ranking.py`
  - `engine/app/rag/retrieval_policy.py`
  - `engine/app/rag/service.py`
  - `engine/test/test_rag_biomedical_reranking.py`
  - `engine/test/test_rag_retrieval_policy.py`
  - `engine/test/test_rag_service.py`
- Problem evidenced after Batch 28:
  - the offline dense audit proved that `MedCPT + CrossEnc` is the strongest biomedical sentence-ranking lane, but it did not answer the live runtime question:
    - does a bounded reranker still improve the already-clean live runtime cohort?
    - if it does, is the latency cost acceptable enough to become the new default?
  - a durable answer required a real runtime integration with trace visibility, not another offline-only benchmark.
- Durable implementation landed:
  - added shared title/abstract shaping in `engine/app/rag/biomedical_text.py` and reused it from the dense audit
  - added `engine/app/rag/biomedical_reranking.py`:
    - `NoopBiomedicalReranker`
    - cached runtime MedCPT reranker getter
    - bounded rerank application over the post-fusion top-N paper window
  - added optional live runtime settings:
    - `rag_live_biomedical_reranker_enabled`
    - `rag_live_biomedical_reranker_topn`
  - kept the reranker behind a narrow policy gate:
    - global scope only
    - `PASSAGE_LOOKUP` only
    - no explicit selected paper context
    - bounded candidate window only
  - integrated reranker scores into paper ranking as a passage-only feature and exposed them in bundle rank features
  - extended runtime trace visibility with:
    - `biomedical_rerank` stage duration
    - rerank candidate count
    - promotion count
    - reranked window corpus ids
    - reranker device/ready state
- Verification:
  - `cd engine && uv run ruff check app/config.py app/rag/biomedical_text.py app/rag/biomedical_reranking.py app/rag/models.py app/rag/bundle.py app/rag/retrieval_policy.py app/rag/ranking.py app/rag/dense_audit.py app/rag/service.py test/test_rag_biomedical_reranking.py test/test_rag_retrieval_policy.py test/test_rag_service.py` -> passed
  - `cd engine && uv run pytest test/test_rag_biomedical_reranking.py test/test_rag_retrieval_policy.py test/test_rag_service.py -q` -> `55 passed`
  - `cd engine && uv run pytest test/test_rag_runtime_perf.py test/test_rag_runtime_eval.py -q` -> `39 passed`
  - full current-cohort runtime artifacts on the same `96`-paper sample:
    - control: `engine/.tmp/rag-runtime-eval-current-all-families-v30-control.json`
    - live reranker: `engine/.tmp/rag-runtime-eval-current-all-families-v30-live-biorerank.json`
- Results:
  - quality on the current live cohort stayed saturated in both runs:
    - overall `hit@1 = 1.0`
    - overall `grounded_answer_rate = 1.0`
    - `sentence_global hit@1 = 1.0`
  - latency delta on the same cohort:
    - overall mean service: `37.935 ms -> 49.781 ms`
    - overall `p95`: `91.261 ms -> 140.175 ms`
    - `sentence_global` mean service: `76.098 ms -> 109.815 ms`
    - `sentence_global` `p95`: `125.002 ms -> 182.255 ms`
  - live trace now shows the reranker cost directly on sentence cases:
    - example `biomedical_rerank = 14.652 ms`
    - `biomedical_rerank_candidates = 10`
    - `biomedical_rerank_promotions = 2`
- Interpretation:
  - the live reranker implementation is correct, bounded, GPU-backed, and observable
  - on the current live runtime cohort it does not buy measurable quality over the already-optimized baseline, while it does add a real latency tax
  - the default should therefore remain the current S2-based runtime stack with the biomedical reranker available as an opt-in experiment for future harder cohorts, not as the live default today
