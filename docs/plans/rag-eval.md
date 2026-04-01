# Full RAG System Audit & Biomedical Evidence Best-Practices Evaluation

**Date**: 2026-03-30
**Scope**: Complete audit of the SoleMD.Graph RAG system (engine + frontend) compared against OpenEvidence, Consensus, Elicit, Semantic Scholar AI, and published biomedical RAG best practices. Based on deep analysis by 12 parallel research and code audit agents.

---

## Executive Summary

The SoleMD.Graph RAG architecture is **genuinely excellent** — contract-first design, clean backend/frontend boundary, graph-visual integration, and domain knowledge pipeline are materially better than most biomedical RAG projects. The 37-module engine with 36 test files and 13+ typed contracts represents serious engineering discipline.

**However, the system has 4 critical bugs, 7 critical architectural gaps, and 6 significant unused data signals** that must be addressed before the system can compete with OpenEvidence/Consensus/Elicit on answer quality.

The gap is primarily **population and integration**, not architecture. The contracts already support the full evidence vision.

---

## Part 1: Critical Bugs Found

### BUG-1: `citation_boost` is unbounded (P0)
- **Location**: `ranking.py:107-113`, `repository.py:551-557`
- **Impact**: Citation context score is `sum(1.0 for term in query_terms if term in context)`. A 5-word query matching a context produces score 5.25. After weighting (0.18), contributes 0.945 to fused score. Maximum RRF from ALL four channels for rank-1 is ~0.066. **Citation boost alone outweighs the entire RRF ranking by 14x.**
- **Fix**: Clamp `citation_boost` to [0, 1.0] before entering the fusion formula.

### BUG-2: No HNSW index in any migration (P0)
- **Location**: No migration file creates `idx_papers_embedding_hnsw`
- **Impact**: `ORDER BY seed.embedding <=> p.embedding` forces sequential scan + cosine distance against ALL papers. At 200M papers, this is **completely infeasible**. Even the current 2.45M papers will be slow without the index.
- **Fix**: Add migration: `CREATE INDEX CONCURRENTLY idx_papers_embedding_hnsw ON solemd.papers USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`

### BUG-3: Entity fuzzy threshold 0.3 too low (P1)
- **Location**: `repository.py:24` — `ENTITY_FUZZY_SIMILARITY_THRESHOLD = 0.3`
- **Impact**: "depression" matches "expression" (trigram sim ~0.31). Produces false-positive entity matches for short biomedical terms.
- **Fix**: Raise to 0.5, minimum 0.4.

### BUG-4: `citation_row_from_parse()` copies citation key as reference key (P2)
- **Location**: `warehouse_contract.py:126`
- **Impact**: `source_reference_key=record.source_citation_key` — uses the citation key as the reference key instead of deriving from the citation's reference linkage.
- **Fix**: Derive from the citation's `ref_id` → bibliography entry linkage.

---

## Part 2: Critical Architectural Gaps

### GAP-1: No sub-document retrieval (paper-level only)
- **Best practice**: All leading systems (OpenEvidence, Consensus, Elicit, ScholarQA) retrieve at passage/chunk level. ScholarQA uses 480-token passages at sentence/section boundaries across 285.6M passages.
- **SoleMD status**: Warehouse contracts exist, write pipeline implemented, but tables empty. Chunk tables (031) not applied.
- **Severity**: Critical — this is the #1 differentiator between current SoleMD and competitors.

### GAP-2: No LLM answer synthesis
- **Best practice**: ScholarQA uses "quote-then-synthesize" (extract verbatim quotes → outline thematic sections → generate synthesis with inline citations). Consensus uses GPT-5 multi-agent. OpenEvidence uses proprietary medical LLM.
- **SoleMD status**: Answer is extractive concatenation of paper title + year + snippet. No LLM integration.
- **Severity**: Critical — the biggest UX gap.

### GAP-3: No query embedding for semantic search
- **Location**: `service.py:435` — semantic channel only fires when `selected_corpus_id is not None`
- **Impact**: For pure text queries ("does melatonin prevent delirium?"), the entire semantic channel produces **zero results**. This is the strongest conceptual relevance signal, completely dark for the most common query type.
- **Best practice**: All competitors embed user queries for dense retrieval. MedCPT (trained on 255M PubMed pairs) is the domain SOTA.
- **Fix**: Add query embedding path using SPECTER2 or MedCPT against `papers.embedding`.

### GAP-4: Global lexical search is title-only
- **Location**: `queries.py:80-151` — `PAPER_SEARCH_SQL` only uses title tsvector
- **Impact**: Papers with relevant abstracts but generic titles ("A Prospective Study of...") never surface via global lexical. Selection-mode does search abstracts, but global mode does not.
- **Best practice**: All systems search titles + abstracts at minimum. ScholarQA searches 285.6M full-text passages.
- **Fix**: Add stored generated column `title_abstract_search_vector` with GIN index.

### GAP-5: Bulk ingestion orchestrator doesn't exist
- **Status**: Per-paper write pipeline is production-ready (COPY/upsert, staging tables, Pydantic validation). But no batch grouping, no parallel workers, no progress tracking, no checkpoint/resume.
- **Scale target**: 14M+ full-text articles. Current pipeline processes one paper at a time with no outer loop.
- **Severity**: Critical for warehouse population.

### GAP-6: Cross-source alignment will fail 30-60%
- **Location**: `alignment.py` — offset-only matching
- **Impact**: BioCXML entity offsets reference passage structure; S2ORC offsets reference cleaned body.text. For cross-source overlay (BioCXML entities → S2ORC blocks), offset spaces don't match. Estimated 30-60% entity alignment failure.
- **Failure mode**: Safe (entities get `SOURCE_LOCAL_ONLY`, not incorrectly linked), but significant enrichment loss at scale.
- **Fix**: Add fuzzy text-matching alignment layer for cross-source spans.

### GAP-7: SQL never tested against real database
- **Location**: All 36 test files use FakeRepository or mock cursors
- **Impact**: ~15 SQL queries in `queries.py` and ~11 SQL templates in `write_sql_contract.py` could have syntax errors, wrong column names, or parameter count mismatches that pass all tests but crash production.
- **Severity**: Critical for production confidence.

---

## Part 3: Unused Data Signals

| Signal | Location | Why It Matters |
|--------|----------|----------------|
| `entities.synonyms TEXT[]` | migration 012 | "Prozac" vs "Fluoxetine" — brand/generic blind spot. Column exists, never searched. |
| `paper_evidence_summary.*` | migration 020 | `has_vocab_match`, `has_entity_rule_hit`, `has_relation_rule_hit`, `entity_rule_families` — rich pre-computed evidence signals completely unused in retrieval. |
| `papers.abstract` in global search | migration 001 | Only searched in selection mode, not global. |
| `citations.intents JSONB` | migration 010 | Loaded but never scored. S2-provided citation intent labels could directly inform support/refute classification. |
| `papers.publication_types TEXT[]` | migration 001 | Could filter meta-analyses, RCTs, case reports. GIN index exists, no query uses it. |
| `papers.fields_of_study TEXT[]` | migration 001 | Could scope retrieval to relevant domains. Never queried. |

---

## Part 4: Ranking & Scoring Analysis

### RRF Fusion Is Functionally Inert
The 15% weight spread across channels (1.0/0.95/0.90/0.85) produces delta of 0.0025 at rank-1. Meanwhile, boost features contribute up to 0.59. **The system is functionally a weighted feature combination with an RRF-shaped tiebreaker**, not true RRF fusion. Either multiply `channel_fusion_score` by 10-15x, or percentile-normalize all features to [0, 1].

### Intent Scoring Is Fragile
- SUPPORT_CUES (10 items) and REFUTE_CUES (11 items) are minimal and treatment-outcome biased
- No negation awareness: "was not reduced" triggers SUPPORT cue "reduced"
- Base score 0.25 is too generous for single-cue matches with high false-positive risk
- **Best practice**: DeBERTa NLI at 88% F1 on SciFact far exceeds cue-word heuristics (~60-70%)

### Missing Scoring Signals
- No study type classification (meta-analysis > RCT > cohort > case report)
- No recency weighting in retrieval fusion
- No MeSH hierarchy expansion for resolved entities
- Relation matching ignores subject/object entities (finds ALL "treat" relations regardless of entity pair)

---

## Part 5: Structural Signals Available

### S2ORC v2 (Primary Text Spine)

S2ORC v2 uses a standoff annotation model: `body.text` (contiguous flat string) + `body.annotations` (dictionary of annotation lists with character offsets). Section membership is reconstructed from `section_header` annotations.

| Signal | Parsed | Used in Retrieval | Notes |
|--------|--------|-------------------|-------|
| Section headers + IMRaD inference | Yes | No (warehouse only) | Missing "Background", "Case Report" mappings |
| Paragraph boundaries | Yes | No | Good chunking boundaries |
| Sentence boundaries (~80% coverage) | Yes with fallback | No | Fallback splits on "Fig.", "vs." incorrectly |
| Citation spans (bib_ref) | Yes | Indirectly via citations table | ~41% have `matched_paper_id` (~50-60% for biomedical) |
| Bibliography entries | Yes | Via paper_references | |
| fig_ref / tab_ref annotations | **No** | No | Available but not parsed |
| Section-aware entity density | No | No | High-value signal |

**Most valuable S2ORC signals for RAG**:
1. **Citation context windows** — the sentence(s) surrounding each `bib_ref` are expert-authored summaries. Research shows 250-300 word windows around citations give 19% improvement in P@10.
2. **Section role weighting** — Results sections carry primary findings (weight 1.0x), Discussion (0.85x), Methods (0.5x for evidence queries).
3. **Paragraph-aware chunking** — structurally meaningful boundaries from GROBID's layout analysis.
4. **Bibliography linkage** — `matched_paper_id` enables citation-graph-augmented retrieval (CG-RAG, SIGIR 2025).

### PubTator3 BioCXML (Entity/Annotation Overlay)

BioCXML uses a flat passage sequence with document-global offsets. Six entity types (Gene, Disease, Chemical, Species, Mutation, CellLine) with normalized identifiers (MeSH, NCBI Gene, NCBI Taxonomy, Cellosaurus, dbSNP/HGVS). 1.6B entity annotations at 98% precision.

| Signal | Parsed | Used in Retrieval | Notes |
|--------|--------|-------------------|-------|
| 6 entity types with normalized IDs | Yes | Via entity-seeded channel | 98% annotation precision, 1.6B annotations |
| Entity character offsets | Yes | For alignment only | Cross-source alignment 30-60% failure |
| Figure/table captions | Yes | No (warehouse only) | High-value standalone retrieval units |
| Section type from passage structure | Partially | No | Flat passage sequence, must reconstruct hierarchy |
| Relation types (8 types) | Via tab files | Via relation-seeded channel | **Abstract-only** — major limitation |
| OMIM identifiers | **No** | No | Missing routing in `_normalize_concept_identifier()` |
| Entity confidence scores | Available in `raw_attrs_json` | No | Not surfaced |

**Key insight: Relations are abstract-only.** PubTator3 relations (~33M) are extracted from abstracts only, even though entity annotations cover full text. This means relation-seeded retrieval cannot ground claims in Results/Discussion sections. For full-text claim verification, you'll need either (a) a relation extraction model on full text, or (b) entity co-occurrence as a proxy for relations.

**Key insight: Figure/table captions are high-value retrieval units.** Captions contain high-density content-bearing words that effectively summarize key findings. Research confirms they should be indexed as first-class retrieval units. The current SoleMD chunk policy already includes `figure_caption` and `table_caption` as valid block kinds.

---

## Part 6: Comparison Against Competitors

### Architecture Comparison

| Dimension | ScholarQA | Consensus | Elicit | SoleMD |
|-----------|-----------|-----------|--------|--------|
| Retrieval | Hybrid (BM25 + mxbai embeddings) | BM25 + semantic + quality reranking | SPLADE → full-text search | RRF (lexical + entity + relation + semantic + citation) |
| Passages | 480-token, 285.6M passages | Abstract-level + verbatim quotes | Full-text search, sentence extraction | Paper-level only (warehouse not populated) |
| Reranking | mxbai-rerank-large-v1 | Precision model on top 20 | Not disclosed | None |
| Answer | Quote-then-synthesize (Claude 3.7) | GPT-5 multi-agent | Claude Opus 4.5 Research Agents | Extractive paper title+snippet |
| Citations | Inline from verbatim quotes | Verbatim quote extraction | Sentence-level links | None (grounded_answer always null) |
| Entity integration | None | None | None | **PubTator entities + relations (unique advantage)** |
| Graph visualization | None | None | None | **Cosmograph + DuckDB (unique advantage)** |
| Domain curation | None | None | None | **572 entity rules from curated vocab (unique)** |
| Study quality | None | Basic study type filter | None | None |
| Scale | 100M abstracts + 11.7M full-text | 200M papers | 138M papers | 2.45M graph points (target: 200M+) |

### What SoleMD Does Better Than All Competitors
1. **Graph-visual integration** — no competitor has this
2. **Entity/relation retrieval channels** — direct PubTator integration with 318M entity annotations and 24.8M relations
3. **Domain curation** — 572 entity rules from 3,361 curated neuro/psych terms with UMLS CUIs
4. **Release-scoped evidence** — versioned, reproducible evidence snapshots
5. **Demand-attach graph materialization** — papers appear on graph on-demand via Arrow IPC

### Where SoleMD Lags
1. **Answer quality** — extractive vs LLM synthesis (every competitor)
2. **Passage-level retrieval** — paper-level vs chunk-level (every competitor)
3. **Inline citations** — none vs structured citations (every competitor)
4. **Reranking** — none vs cross-encoder (ScholarQA, Consensus)
5. **Query embedding** — selected-paper-only vs free-text dense retrieval (every competitor)

### Differentiation Opportunity
**No competitor combines biomedical entity extraction with evidence quality grading.** Consensus comes closest with filterable study design. No system uses PubTator-level entity/relation grounding for both retrieval AND evidence quality assessment. This is SoleMD's strongest potential differentiator beyond the graph.

---

## Part 7: Frontend Audit Summary

### Strengths
- Typed end-to-end (Pydantic → Engine → TypeScript → Zod → React)
- Three-bucket graph resolution (active/overlay/evidence-only)
- Producer-owned overlay membership (concurrent Ask/compose don't clobber)
- Comprehensive error propagation through three layers
- Demand-attachment for missing papers via Arrow IPC

### Issues Found
1. **Stream not truly streaming** — entire answer written as single `text-delta` chunk
2. **Hard 4-item cap** on evidence results with no "show more"
3. **Citation labels are static** — no click-to-scroll, no tooltip, no paper navigation
4. **Paper navigation from evidence cards missing** — clicking result card does nothing
5. **Retrieval channels not displayed** — data available but never rendered
6. **No visual signal differentiation on graph** — support/refute not color-coded
7. **No multi-turn conversation** — messages reset each query
8. **No evidence export/share**
9. **Streaming route entirely untested**

### Serving Contract for Inline Citations
The `GroundedAnswerRecord` (segments + inline_citations + cited_spans) is a solid v1 foundation with strong Pydantic validation. TypeScript types are a 1:1 mirror. Key gaps vs competitors:
- Segment-citation mapping is positional 1:1 only (can't do interleaved `[1,3]`-style citations)
- No LLM-integrated citation markers (answer is plain text, citations post-hoc)
- `quote_text` always equals `text` (no sub-span highlighting)
- No evidence stance/polarity on cited spans

---

## Part 8: Test Coverage Assessment

### Coverage: 86% file-level (32/37 modules)
- ~95 individual test functions
- Strong fixture-based contract testing with realistic biomedical data
- Comprehensive edge case coverage for null fields, duplicates, alignment failures

### Critical Gaps
1. **SQL never executed against real DB** — syntax errors, wrong columns would pass all tests
2. **No schema drift detection** — Python contracts never compared to actual DB schema
3. **Streaming route untested** — primary user-facing entry point
4. **No negative parser tests** — malformed BioCXML/S2ORC not tested
5. **No performance benchmarks**
6. **Write pipeline against real DB untested** — COPY/upsert, staging table creation, partition routing
7. **`mapEngineRagResponse`** in graph-rag.ts not directly tested with realistic nested payloads

---

## Part 9: Priority Roadmap

### Tier 0: Critical Bugs (immediate)
1. Clamp `citation_boost` to [0, 1.0]
2. Add HNSW index migration for `papers.embedding`
3. Raise entity fuzzy threshold to 0.5
4. Fix `citation_row_from_parse()` reference key

### Tier 1: Highest-Impact Wins (current tables, no warehouse needed)
5. **Title+abstract FTS** — stored generated column + GIN index. ~30-50% lexical recall improvement.
6. **Query embedding** — embed user queries via MedCPT/SPECTER2, search `papers.embedding`. Enables dense retrieval for all queries.
7. **Entity synonym search** — search `entities.synonyms` column. Fixes brand/generic name blind spot.
8. **Citation direction indexes** — partial btree on `citing_corpus_id`/`cited_corpus_id` WHERE `context_count > 0`.
9. **Composite entity annotation index** — `(entity_type, concept_id)` on 318M row table.
10. **Rebalance RRF vs boost scales** — multiply `channel_fusion_score` by 10-15x or normalize features.
11. **Use `paper_evidence_summary`** signals in ranking (study quality proxy).
12. **Use `citations.intents`** for support/refute scoring instead of/alongside cue words.
13. **Use `papers.publication_types`** to boost meta-analyses and RCTs.

### Tier 2: LLM Answer Synthesis (high-impact, independent of warehouse)
14. **LLM answer path** — Claude API in `answer.py` to synthesize from top bundle abstracts/TLDRs.
15. **"Quote-then-synthesize" pattern** — extract verbatim quotes from abstracts, then generate around them with inline citations. This is the ScholarQA gold standard and reduces hallucination.
16. **True streaming** — refactor answer generation to stream token-by-token.
17. **Multi-segment answer assembly** with per-claim citation mapping (replacing positional 1:1).

### Tier 3: Warehouse Population & Passage Retrieval
18. **Bulk ingestion orchestrator** — Dramatiq workers, progress tracking, checkpoint/resume.
19. **Apply migration 031** — `paper_chunk_versions`, `paper_chunks`, `paper_chunk_members`.
20. **Text-matching cross-source alignment** — fuzzy substring matching for BioCXML entities → S2ORC blocks.
21. **Block splitting** — split paragraphs exceeding `hard_max_tokens` (common in Methods sections).
22. **Chunk-level retrieval channel** — once chunks are populated.
23. **OMIM identifier routing** — important for neuro/psych disease annotations.
24. **Parse fig_ref/tab_ref annotations** from S2ORC v2.

### Tier 4: ML Model Integration
25. **MedCPT cross-encoder reranking** — +18-25% accuracy, ~50-200ms latency. Lowest effort, highest immediate gain.
26. **DeBERTa NLI** for support/refute — 88% F1 replacing cue-word heuristics (~60-70%).
27. **Study design classifier** — RoBERTa at 96% recall for RCT detection.
28. **Relation matching with subject/object** — use entity terms to filter relation pairs, not just type.
29. **Add negation awareness** to intent cue matching (at minimum, skip cue if preceded by "not"/"no").
30. **Verb lemmatization** for relation term extraction ("treats" → "treat").

### Tier 5: Frontend & UX
31. Interactive citation labels (click-to-scroll, tooltip, paper navigation)
32. Evidence card → graph paper fly-to navigation
33. Remove 4-item cap, add "show more"
34. Render retrieval channel breakdown
35. Visual signal differentiation on graph (support=green, refute=red)
36. Multi-turn conversation support
37. Evidence export/share
38. Evidence comparison/pinning across queries

### Tier 6: Scale & Infrastructure
39. **Qdrant integration** for ANN over chunk embeddings
40. **Database integration tests** — execute SQL against real PostgreSQL
41. **Streaming route tests**
42. **Schema drift detection** tests
43. **Negative parser tests** for malformed inputs
44. **Performance benchmarks** via pytest-benchmark

---

## Part 10: Best Practice Models & Performance Numbers

### Reranking
- **MedCPT Cross-Encoder** (PubMedBERT ~110M): SOTA on BEIR biomedical tasks. +18-25% accuracy over BM25 alone (MIRAGE benchmark, 7,663 questions).
- **ModernBERT + ColBERTv2** (~149M): MIRAGE SOTA (0.4448 avg accuracy). Late-interaction = much faster than full cross-encoder. ~57.7ms total per query.

### NLI / Claim Verification
- **DeBERTa on SciFact**: 88% F1 on support/refute/NEI classification.
- **MultiVerS** (Allen AI): SciFact leaderboard SOTA using full-document context.
- **Step-by-step verification**: +4.9 F1 on SciFact, +4.3 on HealthFC vs single-turn.

### Embedding Models
- **MedCPT Article Encoder** (768-dim): Trained on 18M PubMed query-article pairs. Beats GTR-XXL (4.8B params).
- **SapBERT** (768-dim): SOTA for entity linking / UMLS concept normalization.
- Domain-specific embeddings outperform general models by +2-8% on PubMed retrieval tasks.

### Study Quality
- **Cochrane RCT Classifier**: 99.5% recall for RCT detection.
- **RobotReviewer**: AUC 0.987 for Cochrane risk-of-bias domains.
- **GRADE automation**: 63.2% agreement with human evaluators (semi-automated recommended).

### Citation Best Practices
- **Adaptive chunking**: 87% accuracy vs 50% for fixed-size (PMC 2025).
- **Post-hoc citation risk**: Up to 57% of post-hoc citations may be post-rationalized (not actually used by the model).
- **SELF-RAG**: Reflection tokens let the model self-decide when to retrieve and self-evaluate citations.
- **LongCite**: Sentence-level citations in long-context QA. 8B/9B models surpass GPT-4o in citation quality.
- **ALCE benchmark**: Standard for citation evaluation (fluency, correctness, citation quality).

---

## Part 11: Overall Verdict

| Category | Score | Key Finding |
|----------|-------|-------------|
| Architecture quality | **9/10** | Contract-first, clean boundaries, excellent layering |
| Domain knowledge integration | **9/10** | PubTator + curated vocab + entity rules is best-in-class |
| Retrieval pipeline | **5/10** | Multi-channel RRF is sound but citation_boost bug, no query embedding, title-only FTS |
| Answer quality | **2/10** | Extractive paper-level only, no LLM, no inline citations |
| Graph integration | **10/10** | Unique — no competitor has this |
| Frontend evidence UX | **5/10** | Functional but static citations, no navigation, 4-item cap |
| Scale readiness | **4/10** | Architecture supports 200M+ but missing HNSW index, no bulk orchestrator |
| Test coverage | **7/10** | 86% file coverage but no real DB tests, no streaming tests |
| Warehouse readiness | **7/10** | Contracts complete, write pipeline exists, population not started |
| **Overall** | **6.4/10** | Strong foundations, critical gaps in answer quality and passage grounding |

**The architecture is ahead of competitors. The content depth is behind. The highest-leverage investments are: (1) fix the 4 bugs, (2) title+abstract FTS + query embedding, (3) LLM answer synthesis with quote-then-synthesize, (4) warehouse population.**

**No competitor combines biomedical entity extraction with graph visualization with domain-curated evidence rules. That combination — once answer quality catches up — is a genuine differentiation moat.**


Another agent said this: 
The audit in docs/plans/rag-eval.md is directionally right: the architecture is stronger
  than the current retrieval and answer path. After tracing the code with code-search,
  checking the migrations/tests, and doing external research, these are the claims I would
  keep.

  Findings

  - Critical: citation_boost is numerically incompatible with the RRF scale. Raw query-term
    counts are assigned in engine/app/rag/repository.py:551 and injected directly into fusion
    in engine/app/rag/ranking.py:162. With RRF_K=60, the whole 4-channel RRF contribution
    tops out around 0.06, while a 5-term citation context contributes 0.90 after weighting.
    This is a real ranking bug.
  - Critical: citation-to-reference linkage is broken at the contract boundary.
    PaperCitationMentionRecord has only source_citation_key in engine/app/rag/
    parse_contract.py:157, but citation_row_from_parse() copies that value into
    source_reference_key in engine/app/rag/warehouse_contract.py:125. S2 parsing emits
    distinct reference keys and citation keys in engine/app/rag/source_parsers.py:565 and
    engine/app/rag/source_parsers.py:594, so this can mis-wire inline citations to
    bibliography entries.
  - High: free-text semantic retrieval is effectively absent, and the existing vector path is
    unindexed. RagService.search() only queries semantic neighbors when a paper is already
    selected in engine/app/rag/service.py:422, and the SQL does <=> nearest-neighbor ordering
    in engine/app/rag/queries.py:821. I found no HNSW or IVFFlat DDL anywhere under engine/
    db/migrations; the current migrations only add btree/gin indexes such as engine/db/
    migrations/006_add_s2_embedding_tracking.sql:34, engine/db/
    migrations/031_rag_derived_serving.sql:75, and engine/db/
    migrations/034_rag_post_load_lexical_indexes.sql:17.
  - High: global lexical retrieval is weaker than scoped retrieval. Global search vectorizes
    title only in engine/app/rag/queries.py:115, while selection-mode search uses weighted
    title plus abstract in engine/app/rag/queries.py:193. That makes the common unscoped path
    materially underpowered.
  - High: chunk/passage infrastructure exists, but the serving path is still paper-centric.
    Chunk tables and runtime gates are real in engine/db/
    migrations/031_rag_derived_serving.sql:20, engine/app/rag/write_repository.py:141, and
    engine/app/rag/grounded_runtime.py:144, but retrieval and bundling still operate on
    papers in engine/app/rag/service.py:392 and engine/app/rag/bundle.py:118, and answer
    synthesis is just top-bundle string assembly in engine/app/rag/answer.py:17. The accurate
    critique is not “no passage system”; it is “passage infrastructure is not yet on the
    primary retrieval/ranking path.”
  - High: cross-source overlay alignment is intentionally strict and therefore brittle.
    align_span_to_canonical_ordinals() only succeeds when spans line up in the same offset
    space in engine/app/rag/alignment.py:48, and overlay grounding calls it directly in
    engine/app/rag/source_grounding.py:61. The audit’s exact “30-60%” failure rate is
    unproven here, but the failure mode is real.
  - Medium: DB-facing SQL is still tested mostly against mocks. The repository and write
    tests assert SQL against mocked cursors in engine/test/test_rag_repository.py:13, engine/
    test/test_rag_write_repository.py:3, and engine/test/test_rag_grounded_runtime.py:11.
    That leaves real adapter/schema/query-plan failures largely uncovered.
  - Medium: the UI “stream” is not incremental. The server emits a single full text-delta in
    app/api/evidence/chat/stream.ts:108. The current behavior is a product choice, not an AI
    SDK limitation.
  - Medium: the fuzzy entity/relation path is probably noisy, but this still needs
    measurement. The threshold is 0.3 in engine/app/rag/repository.py:24, fuzzy matching
    allows substring or trigram hits in engine/app/rag/queries.py:269, and relation matching
    is lexical over type/id strings in engine/app/rag/repository.py:648. I would treat this
    as a tuning risk rather than a proven bug.

  Audit Appraisal

  - The other LLM is right that the system’s bones are good. The contract layer, dual-source
    grounding split, resumable orchestration, and staged write/cutover design are real
    strengths.
  - “No bulk ingestion orchestrator” is incorrect. run_rag_refresh() in engine/app/rag/
    orchestrator.py:1072 is the bulk ingest orchestrator; the real problem is that it has
    grown into a very large control function.
  - “grounded_answer always null” is too strong. Warehouse and chunk grounders both exist in
    engine/app/rag/warehouse_grounding.py:164 and engine/app/rag/grounded_runtime.py:144.
    Whether chunk-backed grounding is active is a deployment-state question, not a code-level
    absence.
  - The exact alignment-failure percentage and the exact entity false-positive rate are
    evaluation claims. The code supports the direction of the criticism, not the quoted
    percentages.

  Improvement Order

  1. Fix the hard defects first: normalize or cap citation-context scoring before fusion, and
     add an explicit citation-to-reference field through parse -> warehouse -> grounding.
  2. Fix retrieval before adding more answer generation: add free-text query embeddings, keep
     selected-paper neighbors as a contextual channel instead of the only semantic channel,
     widen global lexical search to title plus abstract, and move chunk retrieval/reranking
     into engine/app/rag/service.py:367.
  3. Add the missing operational safety net: real Postgres/pgvector integration tests for
     queries.py and write_repository.py, plus a vector ANN migration.
  4. Add answer synthesis only after retrieval is competitive. Right now engine/app/rag/
     answer.py:17 mostly exposes retrieval weaknesses more clearly.
  5. Replace strict offset-only overlay alignment with text-aware alignment and wire
     warehouse_quality.py into the pipeline so alignment failures become measurable.

  Targeted tests passed locally: 24 tests across ranking/service/grounding/warehouse-contract
  and 23 tests across repository/write-repository, but they are mock-heavy. I could not
  validate the live DB state because the local supabase-db container was not running on
  localhost:5433.

  External references used after doc-search came up short for these libraries: pgvector ANN
  indexing docs https://github.com/pgvector/pgvector, AI SDK streaming docs
  https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream-response, MedCPT
  https://arxiv.org/abs/2307.00589, and ScholarQA https://arxiv.org/abs/2505.07917.