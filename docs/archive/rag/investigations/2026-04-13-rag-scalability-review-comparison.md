# RAG Scalability Review Comparison

Superseded as the primary handoff by:

- [rag-future-info.md](/home/workbench/SoleMD/SoleMD.Graph/docs/rag-future-info.md)

Date: 2026-04-13

## Purpose

This document compares two architecture reviews of the SoleMD.Graph retrieval augmentation stack:

1. The external plan at `/home/workbench/.claude/plans/jazzy-inventing-chipmunk.md`
2. A second review based on direct inspection of the repo contracts, live PostgreSQL measurements taken on 2026-04-13, and current primary-source infrastructure guidance

The goal is not to restate both documents independently. The goal is to produce a single comparison artifact that an external reviewer can use to:

- see where both reviews agree strongly
- see where they diverge
- identify which claims are directly supported by current code and live-system evidence
- identify which recommendations still need validation

Follow-up refinement:

- [2026-04-13-rag-scalability-review-addendum-evidence-serving.md](/home/workbench/SoleMD/SoleMD.Graph/docs/investigations/2026-04-13-rag-scalability-review-addendum-evidence-serving.md) evaluates a second critique that shifts the emphasis from warehouse-scale concerns toward an evidence-serving read model, child-first retrieval, and MedCPT-centered runtime retrieval.

## Bottom Line

The other review is directionally strong. Its most important conclusions are mostly correct:

- the canonical relational spine is worth keeping
- chunk lexical retrieval should move out of PostgreSQL
- chunk-level dense retrieval should not be implemented inside the canonical warehouse tables
- bounded grounding and lineage-preserving packet assembly should remain in PostgreSQL

The main places where I differ are:

- I think the first hard failure is even more clearly `paper_chunks` lexical search in PostgreSQL than that review states.
- I think its storage estimate is too optimistic. Using measured bytes-per-row from the live runtime tables, the 20M-hot-paper case is closer to `5.7–7.0 TiB` for the current runtime surface, not `~2.5 TiB`.
- I agree with object storage for cold or rebuildable text, but I do not think `pg_lake + Iceberg` should be treated as the required gold-standard runtime design yet. It is a plausible direction, not a settled operational requirement.
- I think `16 -> 64` partitions is a prudent mitigation if the current storage shape remains hot in PostgreSQL, but it is not the primary architecture fix. Externalizing retrieval is higher leverage than repartitioning.

## Inputs Reviewed

### Repo contracts

- `engine/app/rag/index_contract.py:59-64`
- `engine/app/rag/chunk_runtime_contract.py:15-21`
- `engine/app/rag/search_plan.py:35-39`
- `engine/app/rag/search_plan.py:54-80`
- `engine/app/rag/_queries_chunk_search.py:12-134`
- `engine/app/rag/chunk_grounding.py:14-156`
- `engine/app/rag/chunk_grounding.py:267-304`
- `engine/app/rag/_queries_dense_semantic.py:16-60`
- `engine/app/rag/repository_vector_search.py:55-94`
- `engine/app/rag/repository_vector_search.py:197-238`
- `engine/app/rag_ingest/chunk_policy.py:21-97`
- `engine/app/rag_ingest/write_repository.py:28-39`
- `engine/app/rag_ingest/write_repository.py:173-238`
- `engine/app/rag_ingest/write_repository.py:462-525`
- `engine/app/rag_ingest/write_repository.py:527-540`
- `engine/app/rag_ingest/write_repository.py:605-627`
- `engine/db/migrations/001_core_schema.sql:50-54`
- `engine/db/migrations/029_rag_canonical_spans_and_mentions.sql:19-88`
- `engine/db/migrations/031_rag_derived_serving.sql:41-120`
- `engine/db/migrations/034_rag_post_load_lexical_indexes.sql:17-99`
- `engine/db/migrations/035_add_papers_embedding_hnsw.sql:18-21`
- `engine/db/scripts/backfill_structural_chunks.py:69-72`
- `docs/map/rag.md:21-37`

### Live database measurements

Measured against the live `solemd_graph` PostgreSQL instance on 2026-04-13.

Key numbers:

- `solemd.corpus`: `~14.06M`
- `solemd.papers`: `~14.06M`
- `solemd.graph_points` in current release: `2,452,643`
- non-null `papers.embedding`: `2,529,674`
- current chunked papers: `753`
- current chunks: `20,345`
- current chunk members: `92,851`
- current sentences: `95,718`
- current entity mentions: `105,782`
- current citation mentions: `14,582`
- current `idx_papers_embedding_hnsw` size: `10.36 GiB`
- current chunk GIN total size: `~21.5 MiB`
- current block GIN total size: `~16.2 MiB`

### External plan under review

- `/home/workbench/.claude/plans/jazzy-inventing-chipmunk.md`

### External sources used in this comparison

Primary sources were preferred where possible:

- PostgreSQL 16 declarative partitioning: <https://www.postgresql.org/docs/16/ddl-partitioning.html>
- PostgreSQL 16 WAL archiving / recovery: <https://www.postgresql.org/docs/16/continuous-archiving.html>
- pgvector README: <https://github.com/pgvector/pgvector>
- OpenSearch hybrid search: <https://docs.opensearch.org/3.0/query-dsl/compound/hybrid/>
- OpenSearch score-ranker / RRF: <https://docs.opensearch.org/3.0/search-plugins/search-pipelines/score-ranker-processor/>
- Qdrant payload and hybrid text search: <https://qdrant.tech/documentation/concepts/payload/> and <https://qdrant.tech/documentation/guides/text-search/>
- Elastic data tiers: <https://www.elastic.co/docs/manage-data/lifecycle/data-tiers>
- Databricks lakehouse reference: <https://docs.databricks.com/aws/en/lakehouse-architecture/reference>
- Databricks Vector Search: <https://docs.databricks.com/aws/en/vector-search/vector-search>

## Side-by-Side Evaluation

| Topic | External plan | My evaluation | Result |
|---|---|---|---|
| Canonical relational spine | Keep it | Strong agree | `Agree` |
| Chunk lexical should leave PostgreSQL | Yes | Strong agree | `Agree` |
| Chunk dense should not live in canonical PG tables | Yes | Strong agree | `Agree` |
| Grounded packet assembly should stay in PostgreSQL | Yes | Strong agree | `Agree` |
| 16-way hash partitioning is too small long-term | Yes | Agree, but secondary to retrieval split | `Agree with caveat` |
| Repartition to 64 before 5M hot papers | Yes | Reasonable if current hot storage shape remains; not the first move if retrieval is externalized earlier | `Partial agree` |
| Move text columns to Iceberg + `pg_lake` | Yes | Agree on object-store direction; do not treat `pg_lake` as mandatory runtime architecture yet | `Partial agree` |
| 20M-hot-paper runtime surface is ~2.5 TiB | Yes | Too optimistic against measured bytes/row | `Disagree` |
| Same-cluster 200M warehouse + 20M hot tier can coexist | Implicitly yes | Only with stricter separation of workloads; likely separate operational planes sooner | `Partial agree` |

## Where the External Plan Is Strong

### 1. The schema-level judgment is right

The external plan correctly identifies that the repo already has the right canonical shape:

- `paper_blocks`, `paper_sentences`, `paper_chunk_members`, `paper_citation_mentions`, and `paper_entity_mentions` are not the problem by themselves.
- The current `corpus_id`-first partitioning and join keys are exactly what bounded grounding wants.

That matches the live query evidence. The grounding SQL in `engine/app/rag/chunk_grounding.py` is efficient because every query is bounded by `corpus_id`, and the joins stay local to one paper or a small paper set.

### 2. The dense boundary in code is basically correct

`engine/app/rag/index_contract.py:59-64` explicitly says:

- do not put pgvector ANN on the canonical warehouse span tables
- PostgreSQL owns provenance, bounded grounding, and lexical fallback
- first-pass dense retrieval is a future external concern

That is still the right high-level boundary. The live system reinforces it:

- dense retrieval today is paper-level only
- only `~2.53M` papers currently have embeddings
- the current paper HNSW index is already `10.36 GiB`

If chunk-level vectors are added for hundreds of millions of chunks, they should not live in the canonical warehouse.

### 3. The retrieval-plane split is the real architectural move

The external plan is right that the scalable pattern is not "bigger Postgres." The scalable pattern is:

- canonical relational store for metadata and provenance
- specialized lexical retrieval service
- specialized vector retrieval service
- orchestration layer that fuses candidate sets

That matches current industry practice much better than trying to force PostgreSQL to serve all three roles.

### 4. Grounding belongs in PostgreSQL

The external plan is also right that the grounded packet assembly path should stay in PostgreSQL.

Why:

- the lineage keys are relational
- joins are exact
- answer assembly depends on canonical ordinals and offsets, not just search recall
- the query path is cheap when bounded

This is where PostgreSQL is strong.

## Where I Think the External Plan Overstates or Needs Correction

### 1. The storage estimate is too optimistic

The external plan estimates the 20M-hot-paper runtime surface at roughly `~2.5 TiB`.

My measured extrapolation from the live runtime tables is materially higher.

Using measured table-plus-index bytes per row from the current materialized subset:

- `paper_blocks`: `~1802 B/row`
- `paper_sentences`: `~383 B/row`
- `paper_citation_mentions`: `~578 B/row`
- `paper_entity_mentions`: `~451 B/row`
- `paper_chunks`: `~2395 B/row`
- `paper_chunk_members`: `~338 B/row`

At `20M` hot papers, that produces:

- `~540M` chunks, not `~405M`
- `~2.47B` chunk members
- `~2.54B` sentences
- `~2.80B–4.03B` entity mentions, depending on coverage assumptions
- `~5.7–7.0 TiB` for the runtime surface if the current physical representation is preserved

The external plan’s order of magnitude is still directionally useful, but it understates the degree of pain if the current PostgreSQL serving surface is simply scaled up unchanged.

### 2. The chunk count in the 20M example is inconsistent

From the live measured average:

- `20,345 / 753 = ~27.0 chunks/paper`

That implies:

- `15M` hot papers -> `~405M` chunks
- `20M` hot papers -> `~540M` chunks

The external plan uses `~405M` chunks in places while discussing the `20M` case. That should be corrected before it is used for capacity planning.

### 3. Partitioning is not the first fix

The external plan treats `16 -> 64` repartitioning as an early must-do. I agree that 16-way hash partitioning is not the final state if the current hot surface remains in PostgreSQL.

I disagree with the implied prioritization.

If the current retrieval design remains:

- yes, 16 becomes too small
- yes, `paper_sentences` and `paper_chunk_members` partitions become awkwardly large

But if global lexical retrieval is externalized before the hot set reaches those sizes, then repartitioning becomes a second-line optimization rather than the main scale unlock.

My prioritization would be:

1. move chunk lexical search out of PostgreSQL
2. define the chunk dense retrieval system
3. reduce or split the hot serving surface
4. then revisit whether 16-way partitioning is still the bottleneck

I still think `64` is the likely long-term count if the current families remain hot in PostgreSQL. I just would not frame it as the central architectural decision.

### 4. `pg_lake + Iceberg` is plausible, not yet the gold-standard runtime dependency

The external plan recommends moving:

- `paper_blocks.text`
- `paper_sentences.text`
- `paper_chunks.text`

to Iceberg-on-S3, with PostgreSQL querying that data through `pg_lake`.

I agree with the underlying problem statement:

- text-heavy columns drive heap growth
- they amplify WAL, backup, and rebuild cost
- object storage is the right home for cold or rebuildable text

I do not think the specific answer "`pg_lake` should be the chosen runtime bridge" is mature enough to promote to hard recommendation yet.

More conservative framing:

- object storage plus Parquet/Iceberg is a strong direction for cold text and rebuildable history
- PostgreSQL should not remain the only long-term home of all chunk text
- the hot runtime still needs an authoritative text-fetch strategy
- that strategy could be:
  - PostgreSQL for only the active hot subset
  - object-store fetch via service layer
  - FDW-style query bridge
  - a dual-write read model

I would present `pg_lake` as an option to test, not the default final answer.

### 5. The 200M warehouse tier likely needs stronger isolation

The external plan is broadly correct that PostgreSQL can remain the warehouse store for a 200M-paper universe if the runtime serving layer is separated.

I would push that one step further:

- if the 200M tier is doing broad semantic analysis, entity/relation analysis, and warehouse queries
- and the 20M tier is serving low-latency grounded retrieval

then they should be treated as separate operational planes even if they share some logical lineage.

That does not necessarily force separate vendors or separate clouds, but it does argue against one monolithic PostgreSQL instance trying to do both at peak scale.

## Specific Comparison by Question

### Q1. Can the current architecture support 15–20M fully retrieval-active papers as-is?

External plan: no, because chunk lexical, dense retrieval, and partitioning break.

My view: also no, but the rank order matters:

1. chunk lexical in PostgreSQL breaks first
2. total runtime table and index growth become operationally hostile
3. undefined chunk dense retrieval becomes the next architectural blocker
4. partitioning pain arrives after those

The "no" is the same. The reason hierarchy is slightly different.

### Q2. What breaks first?

External plan: chunk lexical FTS, dense path, then 16-way partitioning.

My view:

- `paper_chunks` lexical FTS is overwhelmingly the first break
- the current post-load GIN strategy in `engine/db/migrations/034_rag_post_load_lexical_indexes.sql` is a rollout-friendly pattern, not a 500M-chunk steady-state design
- dense chunk ANN is not "broken" yet because it does not exist, but the architecture cannot be considered complete without defining it
- 16-way partitioning is a real issue, but it is not the first thing that fails under current live query shapes

### Q3. What do the current runtime materialization numbers imply at scale?

On this point the two reviews agree on direction but differ on severity.

My measured extrapolation at `20M` hot papers:

- `~612.7M` blocks
- `~2.54B` sentences
- `~540.4M` chunks
- `~2.47B` chunk members
- `~5.7–7.0 TiB` runtime surface if current physical representation persists

That is harsher than the external plan’s estimate and suggests the current runtime surface should be treated as a derived, aggressively controlled hot layer rather than a forever-growing warehouse-in-Postgres.

### Q4. What should stay in PostgreSQL?

Both reviews largely agree:

- metadata source of truth
- canonical lineage
- citation and entity mention alignment
- grounded packet assembly
- vocab / UMLS / PubTator normalization substrate

I strongly agree with that.

### Q5. What should move?

Both reviews agree that lexical and dense retrieval must move out.

I agree, with one nuance:

- lexical retrieval should definitely move
- chunk dense retrieval should definitely move
- text storage should likely bifurcate into hot vs cold rather than one immediate hard cut to Iceberg for everything

### Q6. Is 16-way `corpus_id` hash partitioning good long-term?

Both reviews: right key, wrong final cardinality.

My refined view:

- yes, `corpus_id` is the correct partition key
- yes, hash is the correct top-level strategy
- 16 is enough for current bounded grounding use
- 16 is probably too small if the current hot materialization shape remains in PostgreSQL beyond the low millions
- moving to 64 is a reasonable plan, but it is not a substitute for splitting the retrieval plane

### Q7. Is PostgreSQL still the right place for grounded packet assembly at 15–20M hot papers?

Both reviews: yes, under constraints.

I agree strongly.

Constraints:

- candidate sets must already be small
- packet queries must stay explicitly bounded by `corpus_id`
- PostgreSQL should dereference authoritative lineage, not perform first-stage global search

### Q8. Three horizons

The external plan’s horizon framing is useful and mostly sound.

I would rewrite it slightly:

- Horizon 1: keep canonical PostgreSQL grounding and paper-first identity as-is
- Horizon 2: externalize lexical and dense retrieval before 5M hot papers
- Horizon 3: reduce hot PostgreSQL footprint to lineage plus active grounding read model, and keep cold text/history in object storage

The difference is mainly that I would make retrieval-plane separation the earliest major change.

### Q9. What is the actual mistake to keep scaling?

Both reviews identify the same core mistake:

- scaling PostgreSQL chunk FTS as the primary hot retrieval engine

I agree completely.

## Synthesized Recommendation

This is the recommendation I would hand to an implementation team after reading both reviews.

### Keep

- paper-first result identity
- canonical span and mention schema
- versioned chunk policy
- PostgreSQL as the authoritative provenance and grounding store
- `corpus_id`-keyed lineage and packet joins

### Redesign before 5M hot papers

- move chunk lexical retrieval to OpenSearch or Elasticsearch
- define chunk dense retrieval in Qdrant or another dedicated ANN system
- make retrieval return stable IDs that can be rejoined in PostgreSQL for grounding

### Redesign before 15–20M hot papers

- split hot PostgreSQL grounding data from broader warehouse data
- keep only the active runtime chunk version hot
- move rebuildable or cold text out of PostgreSQL heap
- tighten chunk-version retention so old chunk generations do not accumulate indefinitely

### Treat as optional or experimental, not mandatory

- `pg_lake` as the runtime bridge
- same-cluster coexistence of the 200M analytical tier and the 20M hot serving tier
- any claim that repartitioning alone makes the current design safe

## Questions for an External Reviewer

An additional expert reviewer should focus on these questions:

1. Is the measured `5.7–7.0 TiB` extrapolation the right way to think about the current physical design, or should the hot runtime be modeled with a different compressed or split representation?
2. If PostgreSQL remains the authoritative grounding store, what is the minimum hot text surface that must remain locally queryable for low-latency packet assembly?
3. Is `64` the right long-term partition count for the canonical hot grounding families, or should the team plan directly for `128` if the hot grounding surface remains in PostgreSQL?
4. For `15–20M` hot papers and `~540M` hot chunks, is Qdrant clearly preferable to a Postgres sibling running `pgvectorscale`, or is a two-stage dense design warranted?
5. Should the object-store text layer be considered part of the online runtime, or should it be treated only as rebuild/archive storage with a separate serving copy in search and grounding systems?
6. What is the cleanest way to separate the `200M` warehouse plane from the `20M` hot grounded-serving plane without duplicating concept-normalization logic?

## Confidence Assessment

### High confidence

- PostgreSQL should not remain the primary chunk lexical engine at 15–20M hot papers.
- Chunk dense retrieval should not be implemented inside the canonical warehouse tables.
- Grounded packet assembly should remain in PostgreSQL.
- The current `corpus_id`-keyed lineage design is worth preserving.

### Medium confidence

- `64` is the right next partition count if the current hot storage shape remains in PostgreSQL.
- The 200M analytical universe should be operationally separated from the 20M hot serving tier earlier rather than later.

### Lower confidence / needs validation

- `pg_lake` as a runtime dependency
- the exact point at which text should leave PostgreSQL heap
- whether a Postgres sibling with `pgvectorscale` is viable for any chunk-scale ANN role beyond niche or intermediate stages

## Suggested External Review Prompt

An external reviewer should be asked to evaluate this comparison, not just one of the two base reviews. Suggested prompt:

> Review `docs/investigations/2026-04-13-rag-scalability-review-comparison.md` together with `/home/workbench/.claude/plans/jazzy-inventing-chipmunk.md`. Focus on which claims are strongly supported by the live SoleMD.Graph contracts and measurements, which recommendations are too aggressive or too conservative, and what the best target architecture is for `15–20M` hot papers plus a `200M` PostgreSQL-backed warehouse universe. Pay particular attention to lexical retrieval placement, dense retrieval placement, partitioning strategy, hot-vs-cold text storage, and whether the grounding read path should keep any text locally in PostgreSQL.

## Final Judgment

The external plan is a good architecture review and worth keeping. It gets the big structural calls right.

My recommended synthesis is:

- accept its retrieval-plane split
- accept its decision to keep grounding in PostgreSQL
- accept its judgment that the current schema spine is worth preserving
- correct its storage math upward
- treat `pg_lake + Iceberg` as a candidate design, not yet a required conclusion
- treat repartitioning as a supporting move, not the main scale unlock

If the team follows that synthesis, the likely target architecture is:

- PostgreSQL for metadata, normalization, lineage, and grounded packet assembly
- OpenSearch or Elasticsearch for lexical retrieval
- Qdrant or equivalent for chunk dense retrieval
- object storage for cold or rebuildable text and historical runtime artifacts

That is the strongest common answer across both reviews.
