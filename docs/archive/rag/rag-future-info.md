# SoleMD.Graph RAG Future Info

Date: 2026-04-13
Status: canonical merged review

## Purpose

This is the canonical merged review of the SoleMD.Graph retrieval-augmentation stack for two targets:

- `15–20M` papers fully hot for retrieval, citation grounding, and answer assembly
- `~200M` papers retained for metadata, semantic analysis, entity/relation analysis, and warehouse use

This document supersedes the two intermediate notes:

- [2026-04-13-rag-scalability-review-comparison.md](/home/workbench/SoleMD/SoleMD.Graph/docs/investigations/2026-04-13-rag-scalability-review-comparison.md)
- [2026-04-13-rag-scalability-review-addendum-evidence-serving.md](/home/workbench/SoleMD/SoleMD.Graph/docs/investigations/2026-04-13-rag-scalability-review-addendum-evidence-serving.md)

Those remain useful as supporting analysis, but this file is the final merged position.

## Executive Conclusion

The right answer is no longer “can PostgreSQL scale if we keep extending the current runtime surface?” The right answer is “what should PostgreSQL continue to own, and what should become a dedicated evidence-serving read model?”

My final judgment is:

- Keep PostgreSQL as the canonical metadata, lineage, offsets, mentions, citation anchors, and grounding authority.
- Stop using PostgreSQL as the first-stage global chunk retrieval engine.
- Build the next runtime around a typed `EvidenceUnit` serving model, with child-first retrieval for evidence-seeking queries and paper-first rendering in the UI.
- Move runtime biomedical dense retrieval away from SPECTER2-first and toward a MedCPT-family retrieval stack.
- Use OpenSearch as the first serving-plane target for lexical, hybrid, weighted-RRF fusion, filtering, and bounded reranking.
- Treat Qdrant as a later split only if OpenSearch vector retrieval becomes the demonstrated wall.
- Treat partition surgery and remote lake-bridge design as second-order follow-ups unless the hot PostgreSQL grounding surface remains large after retrieval leaves PostgreSQL.

The main mistake to avoid is continuing to optimize the warehouse-first frame while the repo’s own evaluation surface already shows the current frontier is shortlist formation, child-evidence recall, and top-rank conversion.

## Current Repo Truth

### What is already strong

The repo already has the pieces many teams never build correctly:

- canonical span and mention lineage in PostgreSQL
- release scoping through `graph_run_id`
- grounded packet assembly through stable ordinals and offsets
- explicit chunk versioning
- a benchmark and Langfuse evaluation surface that isolates miss classes

The strongest local evidence:

- [index_contract.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/index_contract.py:59) already draws the right dense boundary: canonical PostgreSQL is not where chunk ANN should live.
- [chunk_grounding.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/chunk_grounding.py:14) already implements the right grounding shape: citation/entity packet joins remain bounded by `corpus_id`.
- [chunk_policy.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag_ingest/chunk_policy.py:21) already has explicit, versioned, conservative chunk policy.
- [chunk_runtime_contract.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/chunk_runtime_contract.py:15) already has a sane cutover contract.

### What is already failing conceptually

The current hot retrieval path is still anchored to paper-first merging and PostgreSQL chunk FTS:

- chunk lexical retrieval is in [_queries_chunk_search.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/_queries_chunk_search.py:12)
- retrieval candidates are merged into `PaperEvidenceHit` objects early in [retrieval_fusion.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/retrieval_fusion.py:55)
- passage and question queries already prefer chunk lexical in [search_plan.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/search_plan.py:54), which shows the system is already leaning toward child evidence conceptually

The repo’s own expert-suite summary makes the current frontier explicit:

- [docs/map/rag.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/rag.md:125) reports `hit@1 = 0.164`, `hit@k = 0.279`, and `target_in_answer_corpus = 0.230`
- [docs/map/rag.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/rag.md:154) reports `0 no-target-signal misses`, `7 target-visible-not-top1`, and `44 top1 misses`
- [docs/map/rag.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/rag.md:163) explicitly says stronger parent-child evidence promotion is needed

That means the center of gravity has moved:

- not “can we normalize concepts?”
- not “can we ground answers?”
- but “can we retrieve and promote the right child evidence fast enough and reliably enough?”

## What I Learned From the Critiques

Three changes to the earlier architecture review are now warranted.

### 1. The target should be evidence-serving behavior, not just warehouse scalability

The public comparison target is closer to OpenEvidence than to a scientific research assistant. The important visible behaviors are:

- low-latency paper retrieval
- passage-level evidence
- explicit citations
- source labels
- “why was this source cited?” style explanation

That means the next target architecture should be optimized for clinician-facing evidence serving, not just for warehouse durability.

### 2. “Paper-first UI, child-first retrieval” is the right split

I no longer think “paper-first everywhere” is the right frame.

The better split is:

- paper-first UI and response identity
- child-first candidate generation for evidence-seeking query classes

That does not apply uniformly to every route:

- `TITLE_LOOKUP` should remain paper-first
- citation-style metadata lookup should remain paper-first
- `PASSAGE_LOOKUP` and `QUESTION_LOOKUP` should become child-first internally
- some clinician-style `GENERAL` queries should likely follow the same child-first path

### 3. MedCPT should be treated as the main runtime retrieval candidate

The repo already contains:

- `MedCPTQueryEncoder` in [biomedical_models.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/biomedical_models.py:298)
- `MedCPTArticleEncoder` in [biomedical_models.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/biomedical_models.py:321)
- `MedCPTReranker` in [biomedical_models.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/biomedical_models.py:344)

But live dense query retrieval still runs through the SPECTER2-aligned query encoder in [query_embedding.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/query_embedding.py:46).

My revised position:

- keep SPECTER2 for graph build, proximity priors, cluster organization, and paper-relatedness
- evaluate MedCPT as the primary runtime biomedical retrieval lane for both paper and child evidence

## Current Database Setup Review

The current PostgreSQL setup is heavy, but the important nuance is that it is not yet heavy because of the new RAG span and chunk runtime. It is heavy because one database is simultaneously carrying:

- canonical warehouse tables
- raw ingest surfaces
- serving projections
- stage/swap rebuild tables
- search and vector indexes

That is why the system feels bloated already, even before the hot evidence-serving surface is large.

### What is actually consuming space today

Live inspection of `solemd-graph-db` on 2026-04-13/14 shows the largest relations are still legacy warehouse and raw-ingest families, not the new chunk runtime:

- `solemd.citations`: about `106 GB` total (`83 GB` heap, `21 GB` indexes), about `259M` rows
- `pubtator.entity_annotations`: about `62 GB` total (`25 GB` heap, `37 GB` indexes), about `318M` rows
- `solemd.papers`: about `54 GB` total (`~10 GB` heap, `32 GB` indexes), about `14.1M` rows
- `solemd.entity_corpus_presence`: about `38 GB` total, about `312M` rows
- `solemd.entity_corpus_presence_next`: another `38 GB` total, about `312M` rows
- `solemd.corpus`: about `4.8 GB`
- `solemd.graph_paper_summary`: about `4.7 GB`
- `solemd.graph_points`: about `3.0 GB`

The largest indexes reinforce the same point:

- `entity_corpus_presence_pkey`: about `14 GB`
- `entity_corpus_presence_next_pkey`: about `14 GB`
- `pubtator.entity_annotations` lookup indexes: about `14 GB` each for the two largest composites
- `citations_pkey`: about `10 GB`
- `idx_papers_embedding_hnsw`: about `9.9 GB`
- `idx_papers_title_gist_trgm`: about `8.3 GB`
- `idx_papers_normalized_title_key_gist_trgm`: about `8.2 GB`

By contrast, the current materialized RAG runtime is still tiny:

- `paper_blocks`: about `40 MB` across partitions
- `paper_sentences`: about `35 MB`
- `paper_chunks`: about `46 MB`
- `paper_chunk_members`: about `30 MB`
- `paper_entity_mentions`: about `46 MB`
- `paper_citation_mentions`: about `8 MB`

That matters. The present database is already large, but the present size is not proof that the new RAG runtime is already the main problem. The main current footprint is still the canonical warehouse, raw PubTator ingest, paper search/vector indexes, and large serving projections such as citation and entity-presence surfaces.

### Why the current setup feels bloated

The setup feels bloated for three concrete reasons.

First, one PostgreSQL instance is doing too many jobs at once. `solemd.papers` is a good example of a disciplined table after [044_papers_fts_vector.sql](/home/workbench/SoleMD/SoleMD.Graph/engine/db/migrations/044_papers_fts_vector.sql:1), which explicitly rebuilt the table to cut index and heap bloat while keeping the hot retrieval and ingestion paths documented. But the broader database still mixes canonical storage, serving projections, staging artifacts, FTS, and ANN in one operational plane.

Second, stage/swap rebuild surfaces are real disk consumers, not bookkeeping details. The stage/swap contract in [entity_projections.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/corpus/entity_projections.py:1279) is the correct operational pattern for large derived projections, and the cleanup ledger explicitly says stage tables such as `entity_corpus_presence_next` may be intentionally reusable after a failed build in [2026-04-11-graph-serving-backend-cleanup-ledger.md](/home/workbench/SoleMD/SoleMD.Graph/docs/agentic/2026-04-11-graph-serving-backend-cleanup-ledger.md:133). But a reusable stage table still consumes another `~38 GB` until it is retired. Rebuild discipline needs an explicit retention policy, not just a successful swap path.

Third, some large canonical tables are carrying request-serving burdens that should be projected away. [049_materialize_citation_contexts.sql](/home/workbench/SoleMD/SoleMD.Graph/engine/db/migrations/049_materialize_citation_contexts.sql:1) is the right precedent: instead of exploding JSONB citation arrays from `solemd.citations` on every request, the repo created a small derived serving table. The next architecture shift should apply the same idea to evidence retrieval more broadly.

### What is not safe to infer from the current stats

Several large indexes currently show `idx_scan = 0`, but the postmaster restart time is fresh (`2026-04-14 00:55 UTC`). That means the local scan counters are near-fresh too. So the current measurements support “these indexes are large,” but they do not support “these indexes are unused.” Any drop or rebuild decision still needs an owning-query audit first.

### Bottom line on the current database

My current read is:

- yes, the database is operationally bloated
- no, the answer is not “delete canonical data”
- yes, the answer is to separate canonical truth, serving read models, and stage artifacts much more aggressively
- and no, the current all-in-one PostgreSQL setup is not the right long-term online evidence-serving substrate for the target scale

One clarification matters here: PostgreSQL already holding roughly `14M` papers, their citations, and their entity annotation backbone is not itself the architectural mistake. Those tables are the warehouse and canonical graph substrate. The mistake would be trying to make that same backbone double as the online global evidence-serving engine for all `14M+` hot papers without a separate serving package.

### Physical storage note: `E:` is a cluster move, not a table-by-table feature today

The current Docker setup mounts PostgreSQL data at `/var/lib/postgresql/data` from `${GRAPH_POSTGRES_HOST_ROOT:-pgdata}` in [docker/compose.yaml](/home/workbench/SoleMD/SoleMD.Graph/docker/compose.yaml:40). In the current live setup, that resolves to the Docker named volume `solemd-graph_pgdata`, not a bind mount on `/mnt/e`, and the cluster has no custom PostgreSQL tablespaces.

That means there are two different questions:

- logical architecture: what stays canonical in PostgreSQL versus what becomes a serving package
- physical storage placement: where the PostgreSQL cluster files live on disk

If the immediate goal is disk relief, the simplest safe move is to relocate the whole PostgreSQL cluster to `E:` with a bind mount, not to try to move selected tables first inside the current single-cluster layout. Selective placement via PostgreSQL tablespaces is possible later, but I would not make tablespaces the first migration move while the serving-plane split is still unsettled.

## Scale Assessment That Still Stands

The earlier scale conclusions still hold.

### Hot runtime extrapolation

From the live runtime slice measured on 2026-04-13:

- `753` chunked papers
- `20,345` chunks
- `92,851` chunk members
- `95,718` sentences
- `105,782` entity mentions
- `14,582` citation mentions

Using observed row densities:

- `15M` hot papers implies roughly `405M` chunks and `1.85B` chunk members
- `20M` hot papers implies roughly `540M` chunks and `2.47B` chunk members

Using measured bytes-per-row from the current runtime families, preserving the current physical shape would likely push the hot runtime surface into the `5.7–7.0 TiB` range at `20M` hot papers. That remains incompatible with PostgreSQL as the primary global chunk retrieval surface.

### What breaks first

The first failure mode is still global chunk lexical search in PostgreSQL, not grounding.

Why:

- [_queries_chunk_search.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/_queries_chunk_search.py:12) performs text-search-driven chunk retrieval over `paper_chunks.text`
- [034_rag_post_load_lexical_indexes.sql](/home/workbench/SoleMD/SoleMD.Graph/engine/db/migrations/034_rag_post_load_lexical_indexes.sql:17) builds GIN indexes for that path
- those queries do not partition-prune on `corpus_id` in the way grounding queries do

The bounded grounding queries remain viable much longer because they stay local to small `corpus_id` sets.

## Updated Architecture Recommendation

The right architecture is now best described as:

- canonical PostgreSQL warehouse and grounder
- evidence-serving read model
- later hot/cold storage split

### Canonical PostgreSQL stays responsible for

- `solemd.corpus`
- `solemd.papers`
- `paper_documents`
- `paper_sections`
- `paper_blocks` structural identity
- `paper_sentences` structural identity
- `paper_citation_mentions`
- `paper_entity_mentions`
- `paper_chunk_versions`
- `paper_chunk_members`
- stable offsets, ordinals, and canonical span lineage
- concept normalization surfaces and authoritative crosswalks

This includes the current backbone tables that already justify a large warehouse footprint:

- `papers`
- `citations`
- `pubtator.entity_annotations`
- entity-presence and normalization backbone tables

Those should be treated as warehouse and canonical graph assets, not as proof that the final online retrieval plane also belongs inside PostgreSQL.

### The evidence-serving read model becomes responsible for

- first-stage lexical retrieval
- first-stage hybrid retrieval
- child evidence candidate generation
- evidence-unit retrieval for:
  - paragraph
  - results paragraph
  - abstract conclusion
  - constrained sentence window for high-yield zones
- fusion of lexical and dense lanes
- bounded reranking of the shortlist

For v1, evidence-index cardinality should be treated as a first-class constraint, not a storage afterthought. The first serving plane should be intentionally smaller than the theoretical full evidence ontology. Raw `sentence` rows should stay canonical in PostgreSQL for grounding and local extraction inside top parent units. `table_row` and `figure_caption` belong on the roadmap, but they should not block the first serving-plane cutover.

The cleanest mental model is:

- PostgreSQL holds the canonical backbone
- the serving plane is built from that backbone as a releaseable package

In practice, that package should include:

- a `paper` serving package
- an `evidence` serving package
- a grounding lookup package keyed by stable IDs that round-trip into PostgreSQL

That package can be release-scoped, checksumed, and rebuilt from canonical sources without redefining truth.

### Object storage becomes responsible for

- cold text
- retired chunk versions
- rebuildable artifacts
- eventually broader warehouse text that does not need to remain on the hot PostgreSQL heap

## Preferred Near-Term Serving Stack

My preferred next-step stack is:

- PostgreSQL for grounding and canonical lineage
- OpenSearch for paper and evidence retrieval

not yet:

- PostgreSQL + OpenSearch + Qdrant all at once

Why:

- OpenSearch already supports lexical retrieval, hybrid retrieval, score-ranker pipelines, filtering, and k-NN
- the repo needs to prove the evidence-serving read model before it needs to prove a multi-engine serving topology
- operational simplicity matters while the retrieval contract is still changing

Qdrant stays on the roadmap as a likely later split for child ANN if production evidence shows OpenSearch vector retrieval is the bottleneck.

### OpenSearch should stay a retrieval engine, not a policy engine

OpenSearch is the right first serving plane, but its query model should not become the home for every downstream business prior and parent-child policy.

The safer contract is:

- keep first-stage retrieval inside a small number of clause families
- keep article-type priors, citation-preserve logic, species or human applicability, and parent-child promotion in application code
- keep the backend abstraction strong enough that engine-specific query limits do not leak into the product contract

For that reason, I would collapse first-stage serving lanes into five families:

- paper lexical
- evidence lexical
- paper dense
- evidence dense
- preserve or prior lane

Entity, relation, citation, selected-context, and graph-cluster features should mostly become indexed fields, filters, or second-stage features rather than separate first-pass retrieval clauses.

## Retrieval and Ranking Contract

### 1. Typed `EvidenceUnit`

The repo should stop treating all child evidence as generic chunks in the serving layer.

Canonical spans remain canonical spans. But the serving plane should index typed evidence units with stable `evidence_key`s.

Suggested types:

- `paragraph`
- `results_paragraph`
- `abstract_conclusion`
- constrained `sentence_window`

Those units should be derived from the canonical PostgreSQL spine, not replace it.

For v1, I would keep the ontology smaller than the long-term roadmap:

- index `paragraph`, `results_paragraph`, `abstract_conclusion`, and constrained `sentence_window`
- keep raw `sentence` rows in PostgreSQL for grounding and local extraction
- add `table_row` and `figure_caption` only after stable typing, offsets, and IDs are proven reliable

This keeps evidence-index cardinality under control while still shifting retrieval to child evidence.

### 2. `ConceptPackage`, not loose expansion strings

The next version of [search_retrieval_concepts.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/search_retrieval_concepts.py:1) should not primarily emit expansion phrases.

It should emit a structured retrieval package with fields like:

- exposure or intervention
- phenotype or outcome
- temporality
- polarity
- dose intensity
- population
- article-type prior
- canonical IDs
- lexical guard tokens

That avoids flattening clinically meaningful structure into one expanded query string.

### 3. Weighted RRF stays, but the second stage should simplify

The repo already uses weighted RRF:

- [ranking_support.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/ranking_support.py:26)
- [ranking.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/ranking.py:140)

The problem is not that RRF is missing. The problem is that too much is being asked of the post-RRF additive score in [ranking.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/ranking.py:172).

The cleaner contract is:

1. first-stage lane fusion with weighted RRF
2. second-stage bounded reranking
3. explicit parent-child promotion logic downstream of child evidence quality

The practical serving sequence should also be narrow:

1. lexical candidate generation over the evidence-serving plane
2. MedCPT-family reranking over evidence units
3. paper promotion from the reranked child evidence
4. only later, true child ANN if the remaining miss surface still justifies it

### 4. Parent-child promotion becomes explicit

Paper score should no longer be “the same score object with a child bonus.”

Paper promotion should be downstream of:

- best child hit
- second-best corroborating child hit
- section-type prior
- study-design prior
- cited-context support
- selected-context support
- bounded reranker preference

That is already partly visible in the repo:

- child evidence corroboration in [ranking_support.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/ranking_support.py:501)
- direct-support priority in [ranking.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/ranking.py:301)

The next step is to make that the center of the paper ranking contract, not just one adjustment term.

## Grounding and Answer Contract

### Keep

- PostgreSQL as the authoritative grounder
- `corpus_id`-bounded grounding joins
- packet fetches that round-trip to authoritative offsets and anchors

### Change

The current answer contract is still whole-answer oriented:

- [answer.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/answer.py:87)
- [grounded_runtime.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/grounded_runtime.py:84)

The next answer contract should be claim-local:

- `direct_span`
- `indirect_review_or_background`
- `not_rendered`

Each claim should carry:

- one or more stable `evidence_key`s
- authoritative PostgreSQL-backed offsets and citation anchors
- source labels
- short “why cited” metadata

This is both a product improvement and a cleaner trust contract.

The ID split should be explicit:

- `evidence_key`: canonical grounding key derived from stable tuple fields such as `corpus_id`, `chunk_version`, `evidence_type`, canonical ordinals, and a short content hash
- serving document ID: release-scoped index document identity that can change across rebuilds without changing the grounding object

## Partitioning, Storage, and the 200M Warehouse Tier

### What changes from my earlier view

Partition re-shard is no longer the headline next move.

If retrieval leaves PostgreSQL early and PostgreSQL remains the canonical grounder:

- 16-way hash partitioning by `corpus_id` may hold longer than I first argued
- because grounding queries prune aggressively

### What does not change

Partitioning still matters if:

- retrieval leaks back into across-corpus scans on span tables
- the hot PostgreSQL grounding surface remains very large
- chunk versions accumulate
- future features query mentions or spans globally without `corpus_id` pruning

So the rule is:

- do not make repartitioning the H1 project
- do preserve `corpus_id` as the grounding partition key
- do revisit `16 -> 64` only if the hot PostgreSQL grounding surface actually stays large after retrieval moves out

### The 200M warehouse tier is still real

The warehouse question remains distinct from the hot evidence-serving question.

At `~200M` papers:

- metadata, entity/relation analysis, and broad semantic analysis remain a separate operational problem
- text-heavy warehouse storage should not be treated as an afterthought

My current recommendation remains:

- metadata, lineage, entities, and relations can remain PostgreSQL-backed
- cold or broad-corpus text should move to object storage / lakehouse-style formats
- the 200M analytical plane should be treated as operationally separate from the 15–20M hot serving plane, even if some canonical logic is shared

## Migration Plan From the Current Database to the Evidence-Serving Model

The migration should not be a rewrite. It should be a controlled separation of responsibilities using the repo’s existing stage/swap and cutover discipline.

The existing cutover pattern in [chunk_runtime_contract.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/chunk_runtime_contract.py:15) is the right operational template: build the derived surface first, backfill it, enable reads only after lineage is complete, and apply heavier serving indexes only after the data plane is stable.

### Phase 0: Classify the database explicitly

Before moving anything, classify every large relation into one of three buckets:

- source-of-truth canonical tables
- derived serving projections
- stage/swap or disposable rebuild surfaces

For this repo, the practical split should be:

- canonical: `corpus`, `papers`, `citations`, `paper_references`, `paper_documents`, `paper_sections`, `paper_blocks`, `paper_sentences`, `paper_citation_mentions`, `paper_entity_mentions`, `paper_chunk_versions`, `paper_chunk_members`, vocab and crosswalk surfaces
- derived serving: `citation_contexts`, `graph_paper_summary`, `paper_evidence_summary`, entity-presence and alias serving tables, and the future paper/evidence search documents
- stage/swap: `*_next`, `*_old`, rebuild scratch tables, one-off backfill surfaces

This sounds bureaucratic, but it is the prerequisite for making cleanup safe. The current setup is bloated partly because these classes are mixed operationally.

At the same time, decide whether there is immediate storage pressure that justifies a physical cluster relocation to `E:`. If yes, do that as an infrastructure move:

- stop the current container
- recreate the PostgreSQL data root as a bind mount on `/mnt/e/...`
- restore or copy the full cluster there
- bring the container back using the new host root

Do not conflate that storage relocation with the logical serving-plane migration. They solve different problems.

### Phase 1: Freeze the new identifier and serving contract

Before building a new serving plane, lock down the new stable IDs and payload contracts:

- stable `evidence_key`
- release-scoped serving document ID
- typed `EvidenceUnit`
- `ConceptPackage`
- paper-to-evidence and evidence-to-grounding round-trip keys

The rule should be simple:

- the serving plane may denormalize
- but every served paper or evidence hit must round-trip back into PostgreSQL grounding without ambiguity

This is the highest-leverage design decision in the migration. If `evidence_key` is weak or unstable, the rest of the split becomes brittle. OpenSearch `_id` should not become the grounding key.

### Phase 2: Build the read model outside PostgreSQL

Stand up the first serving plane as:

- `paper_index` in OpenSearch
- `evidence_index` in OpenSearch

Build both from canonical PostgreSQL plus the canonical chunk and mention lineage. Do not create a second truth system. Build a derived read model.

Given the current backbone size, I would describe this explicitly as a serving-package build:

- source warehouse package inputs: `papers`, `citations`, `pubtator.entity_annotations`, normalization and release-scoping surfaces
- derived serving package outputs: `paper_index`, `evidence_index`, stable grounding-ID maps, and later any cold-text manifests

That framing matches the reality that the repo already has the `14M`-paper backbone in PostgreSQL, but does not yet have the corresponding online serving package for that same backbone.

The first migration should be backfill plus incremental sync, not dual-write business logic scattered across services. The repo already prefers centralized writers and stage-safe rebuilds; keep that principle.

The first units to index should be:

- `paper`
- `paragraph`
- `results_paragraph`
- `abstract_conclusion`
- constrained `sentence_window`

Keep raw `sentence` rows in PostgreSQL for grounding and local extraction rather than indexing every sentence immediately. `table_row` and `figure_caption` should be added only after the extraction contract is solid enough to trust their identifiers and offsets.

### Phase 3: Cut retrieval over in query-class order

Do not cut every route over at once.

The safest migration order is:

1. `PASSAGE_LOOKUP`
2. `QUESTION_LOOKUP`
3. evidence-seeking `GENERAL` routes
4. later, any paper-level hybrid path that clearly benefits

Keep `TITLE_LOOKUP` and pure metadata or citation lookup paths paper-first unless the new evidence-serving backend proves strictly better.

During this phase:

- OpenSearch becomes the first-stage lexical retriever and paper/evidence candidate plane
- PostgreSQL chunk FTS stays behind a flag as fallback only
- PostgreSQL remains the authoritative grounding backend through [chunk_grounding.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/chunk_grounding.py:14)
- MedCPT-family reranking should be evaluated over evidence units before committing to a true child ANN lane

The hard rule is:

- no new across-corpus span scans in PostgreSQL once the evidence-serving backend is live

That is the invariant that makes 16-way `corpus_id` partitioning remain tolerable for the grounding plane.

### Phase 4: Slim PostgreSQL after the read model is trusted

Once OpenSearch is the hot retrieval plane, start removing PostgreSQL from jobs it no longer needs to do.

The order should be:

1. stop treating PostgreSQL chunk lexical search as a primary hot path
2. keep only the active chunk version hot in PostgreSQL by default, with `current + N-1` retention if rollback needs it
3. archive retired chunk text and broader cold text to object storage
4. keep ordinals, offsets, anchors, mentions, and membership lineage in PostgreSQL
5. audit large serving projections and either justify them, compact them, or rebuild them with explicit retention

Janitor and retention work should start early, even before the full serving cutover is complete. By the time the read model is trusted, it should already exist:

- TTL or explicit retirement policy for `*_next` and `*_old`
- rebuild metadata that records which stage tables are intentionally reusable
- alerting for large stage artifacts left behind after a completed swap

Without that janitor, the database will keep regaining disk weight even after the serving split.

The cleanup target is not “all child tables.” It is:

- stale `*_next`
- stale `*_old`
- failed rebuild scratch tables
- retired chunk versions beyond the retention window
- rebuildable cold text that no longer needs to live on the hot PostgreSQL heap

By contrast, the partition child tables for `paper_blocks`, `paper_sentences`, `paper_chunks`, `paper_chunk_members`, `paper_entity_mentions`, and `paper_citation_mentions` are not junk. They are the physical storage for the partitioned grounding surfaces and should be kept as long as those canonical grounding tables remain partitioned in PostgreSQL.

### Phase 5: Change the model mix, then the engine mix

Once the serving plane exists, move the runtime dense comparison toward:

- MedCPT-family paper retrieval
- MedCPT-family child retrieval
- bounded cross-encoder reranking

Only after that should the team decide whether OpenSearch alone is enough. If vector latency, RAM pressure, or ANN rebuild cost becomes the next wall, then split child ANN into Qdrant. Do not pay the two-engine tax before the evidence-serving contract is stable.

### Phase 6: Split the warehouse plane only when it becomes the next bottleneck

The 200M-paper warehouse target is real, but it is not the first migration move.

After the hot serving split:

- keep canonical metadata, entities, relations, and grounding in PostgreSQL
- move cold or replayable text-heavy assets to object storage
- consider a separate warehouse PostgreSQL or analytical replica if hot serving and analytical rebuilds begin to compete materially

The key is sequence. The first migration is “remove PostgreSQL from first-stage evidence retrieval.” The later migration is “separate the hot grounding plane from the 200M analytical plane if operational pressure requires it.”

## Recommended Implementation Order

### Near-term

1. Classify large PostgreSQL relations into canonical, serving, and stage/swap families.
2. If disk pressure warrants it, relocate the full PostgreSQL cluster to `E:` via bind-mounted host storage rather than trying to move selected warehouse tables first.
3. Define typed `EvidenceUnit` schemas with explicit evidence-cardinality limits for v1.
4. Define stable `evidence_key`s and release-scoped serving document IDs.
5. Add janitor and retention rules for `*_next` and `*_old` rebuild surfaces.
6. Stand up OpenSearch paper and evidence indexes for the hot tier.
7. Remove PostgreSQL chunk FTS from the hot retrieval path for evidence-seeking queries.
8. Promote MedCPT evaluation to the center of the runtime dense retrieval comparison.
9. Refactor [search_retrieval_concepts.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/search_retrieval_concepts.py:1) toward structured concept packages.
10. Introduce an `EvidenceSearchBackend` abstraction so `search_plan.py` controls lane breadth and rerank budget, not backend-specific query construction.

### Mid-term

11. Keep weighted RRF as first-stage fusion, but simplify post-RRF arbitration.
12. Re-anchor paper ranking around child-to-parent promotion.
13. Add claim-local evidence states and source-label metadata to the answer contract.
14. Add async retention / archive handling for retired chunk versions and cold text.

### Later, only if measured bottlenecks warrant it

15. Split dense child ANN into Qdrant if OpenSearch vector retrieval becomes the demonstrated wall.
16. Re-shard hot grounding tables if PostgreSQL still carries a very large hot grounding surface.
17. Split the 200M warehouse plane more aggressively if analytical load and hot serving start competing materially.

## Keep, Redesign, Wait

### Keep

- canonical span and mention schema
- PostgreSQL grounding and provenance
- `corpus_id`-bounded packet assembly
- chunk versioning
- release scoping
- the six-phase runtime cutover contract

### Redesign

- the current all-in-one PostgreSQL serving role
- hot retrieval around typed evidence units
- runtime dense retrieval model choice
- parent-child promotion logic
- answer-grounding contract
- PostgreSQL’s role in hot lexical retrieval

### Wait

- Qdrant split unless OpenSearch proves insufficient
- partition surgery unless hot grounding remains large
- hot-path remote lake bridging
- live graph traversal in the hot path

## Questions for an External Reviewer

1. Is OpenSearch alone the best first evidence-serving plane for SoleMD.Graph, or should the team introduce a dedicated ANN engine earlier?
2. What typed evidence-unit ontology best fits clinician evidence retrieval without overcomplicating ingest?
3. Should MedCPT replace SPECTER2 in the runtime dense lane for both paper and child retrieval, or only for child retrieval?
4. What is the minimum viable claim-local citation contract that preserves current extractive fallback behavior?
5. At what measured hot grounding-table size would repartitioning become mandatory even after retrieval leaves PostgreSQL?
6. What is the cleanest operational split between the 15–20M hot serving plane and the 200M warehouse plane?

## Final Recommendation

The canonical answer is now:

- build the evidence-serving read model first
- keep canonical PostgreSQL behind it as the grounding authority
- make child-first evidence retrieval the main next runtime direction for evidence-seeking queries
- move runtime biomedical dense retrieval toward MedCPT
- use OpenSearch first
- split further only when production evidence proves the need

That is the merged position that best fits:

- the current repo contracts
- the live measurements
- the current miss surface
- and the strongest parts of the external critiques

## Supporting Notes

These remain useful appendices but are no longer the primary handoff:

- [2026-04-13-rag-scalability-review-comparison.md](/home/workbench/SoleMD/SoleMD.Graph/docs/investigations/2026-04-13-rag-scalability-review-comparison.md)
- [2026-04-13-rag-scalability-review-addendum-evidence-serving.md](/home/workbench/SoleMD/SoleMD.Graph/docs/investigations/2026-04-13-rag-scalability-review-addendum-evidence-serving.md)
