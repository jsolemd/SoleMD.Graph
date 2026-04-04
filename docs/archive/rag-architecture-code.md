# SoleMD.Graph RAG Architecture Code Guide

> **Archived**: moved out of `docs/map` on 2026-04-03 after consolidation into
> [../map/rag.md](../map/rag.md) and [../map/rag-info.md](../map/rag-info.md).

> **Companion document**: this is the code-oriented companion to
> [rag-architecture.md](./rag-architecture.md).
>
> **Goal**: give an agent enough live implementation shape to recreate the
> SoleMD.Graph RAG pipeline with similar boundaries, contracts, and control flow.
>
> **Method**: every section anchors to the real repository, then quotes a
> representative snippet or reduced excerpt from the live implementation. These
> snippets are intentionally selective. They show the seam that matters, not
> every guard and helper.
>
> **Read this with**:
> - [../map/rag.md](../map/rag.md) for the current short overview
> - [rag-architecture.md](./rag-architecture.md) for the full narrative design
> - [../map/database.md](../map/database.md) for schema and migration detail

---

## 1. How To Use This Document

This is not meant to be a second source of truth for every line of the runtime.
It is meant to answer a narrower question:

> If another agent had to rebuild this pipeline from the repo's architecture,
> what are the key functions, contracts, and code shapes it should copy?

The guiding rule is:

1. Preserve the boundary.
2. Preserve the contract.
3. Preserve the sequencing.
4. Preserve the justification for why the code is shaped this way.

When this document shows an excerpt, the full implementation still lives in the
linked source file. The excerpt is here because it defines the architecture, not
because it is the only code that matters.

---

## 2. Minimal Reconstruction Mental Model

If an agent were rebuilding the system from scratch, the fastest correct order is:

1. Define the **transport contract** between frontend and engine.
2. Define the **normalized query** model and query-shape inference.
3. Define the **retrieval plan** abstraction.
4. Define the **repository protocol** and PostgreSQL adapter.
5. Build the **retrieval stage** that collects candidate papers.
6. Build the **fusion and ranking** stage.
7. Build the **answer payload** stage.
8. Build the **grounded answer** runtime gate.
9. Build the **canonical parse contract** for offline ingest.
10. Build source adapters for **S2 abstract**, **S2ORC**, and **BioCXML**.
11. Build **source precedence** and **alignment**.
12. Build **chunk derivation** from canonical spans.
13. Build **warehouse write batches**.
14. Build **evaluation** so the runtime can be measured and profiled.

The sections below follow that order.

---

## 3. Transport Boundary: Browser To Engine

The frontend does not assemble SQL, embeddings, or warehouse packets. It builds
one typed request and sends it to the engine.

**Source**:
- [`lib/engine/graph-rag.ts`](../../lib/engine/graph-rag.ts)
- [`app/api/evidence/chat/stream.ts`](../../app/api/evidence/chat/stream.ts)

### 3.1 Request builder

This is the shape to copy if you want a graph-aware frontend boundary that stays
thin and typed.

```ts
export function buildEngineRagSearchRequest(
  input: GraphEvidenceSearchInput,
): EngineRagSearchRequest {
  const request: EngineRagSearchRequest = {
    graph_release_id: input.graph_release_id,
    query: input.query,
  }

  const selectedGraphPaperRef = normalizeString(
    input.selected_graph_paper_ref ?? input.selected_paper_id ?? null,
  )
  const selectedPaperId = normalizeString(input.selected_paper_id ?? null)
  const selectedNodeId = normalizeString(input.selected_node_id ?? null)
  const selectionGraphPaperRefs = normalizeStringList(input.selection_graph_paper_refs ?? null)

  if (input.selected_layer_key) {
    request.selected_layer_key = input.selected_layer_key
  }
  if (selectedNodeId) {
    request.selected_node_id = selectedNodeId
  }
  if (selectedGraphPaperRef) {
    request.selected_graph_paper_ref = selectedGraphPaperRef
  }
  if (selectedPaperId) {
    request.selected_paper_id = selectedPaperId
  }
  if (selectionGraphPaperRefs.length > 0) {
    request.selection_graph_paper_refs = selectionGraphPaperRefs
  }
  if (input.scope_mode === 'selection_only') {
    request.scope_mode = input.scope_mode
  }
  if (input.evidence_intent) {
    request.evidence_intent = input.evidence_intent
  }
  if (typeof input.k === 'number') {
    request.k = input.k
  }
  if (typeof input.rerank_topn === 'number') {
    request.rerank_topn = input.rerank_topn
  }
  if (typeof input.use_lexical === 'boolean') {
    request.use_lexical = input.use_lexical
  }
  if (typeof input.generate_answer === 'boolean') {
    request.generate_answer = input.generate_answer
  }

  return request
}
```

**Why this matters**:

- The frontend sends graph context, but it does not decide retrieval semantics.
- Selection is carried explicitly as `selected_graph_paper_ref`,
  `selected_node_id`, and `selection_graph_paper_refs`.
- The request is small enough to be stable, but rich enough for scoped
  retrieval, title lookup, and answer grounding.

### 3.2 Streaming route

The route is intentionally thin: extract the query, call the engine adapter,
emit the structured response, then optionally stream the answer text.

```ts
export function createGraphAskMessageStream({
  request,
  signal,
}: {
  request: GraphAskChatRequest
  signal?: AbortSignal
}): ReadableStream<UIMessageChunk> {
  const messages = request.messages as GraphAskChatMessage[]

  return createUIMessageStream<GraphAskChatMessage>({
    originalMessages: messages,
    async execute({ writer }) {
      const query = extractLatestUserText(messages)
      if (!query) {
        writer.write({
          type: 'data-engine-error',
          data: {
            client_request_id: request.client_request_id,
            error_code: 'bad_request',
            error_message: 'Ask requests require a user message with text content.',
            request_id: null,
            retry_after: null,
            status: 400,
          },
        })
        return
      }

      const response = await searchGraphEvidence(
        {
          graph_release_id: request.graph_release_id,
          query,
          selected_layer_key: request.selected_layer_key ?? null,
          selected_node_id: request.selected_node_id ?? null,
          selected_graph_paper_ref:
            request.selected_graph_paper_ref ?? request.selected_paper_id ?? null,
          selected_paper_id: request.selected_paper_id ?? null,
          selection_graph_paper_refs: request.selection_graph_paper_refs ?? null,
          selected_cluster_id: request.selected_cluster_id ?? null,
          scope_mode: request.scope_mode ?? null,
          evidence_intent: request.evidence_intent ?? null,
          k: request.k,
          rerank_topn: request.rerank_topn,
          use_lexical: request.use_lexical,
          generate_answer: request.generate_answer,
        },
        { signal },
      )

      writer.write({
        type: 'data-evidence-response',
        data: {
          client_request_id: request.client_request_id,
          response,
        },
      })
    },
  })
}
```

**Keep this shape**:

- Request parsing and validation in the web layer.
- Search orchestration in the engine.
- Optional answer text streaming after the structured evidence response exists.

---

## 4. Service Boundary: One Entrypoint, Two Stages

The engine exposes one service entrypoint, but splits execution into:

1. **retrieval**
2. **finalization**

That split is one of the most important architectural decisions in the runtime.

**Source**:
- [`engine/app/rag/service.py`](../../engine/app/rag/service.py)
- [`engine/app/rag/search_execution.py`](../../engine/app/rag/search_execution.py)

### 4.1 `RagService`

```python
class RagService:
    """Baseline evidence search over the canonical PostgreSQL substrate."""

    def __init__(
        self,
        repository: RagRepository | None = None,
        warehouse_grounder=None,
        query_embedder: RagQueryEmbedder | None = None,
        biomedical_reranker: RagBiomedicalReranker | None = None,
    ):
        self._repository = repository or PostgresRagRepository()
        self._query_embedder = query_embedder or get_query_embedder()
        self._biomedical_reranker = (
            biomedical_reranker or get_runtime_biomedical_reranker()
        )
        if warehouse_grounder is not None:
            self._warehouse_grounder = warehouse_grounder
        elif isinstance(self._repository, PostgresRagRepository):
            self._warehouse_grounder = build_grounded_answer_from_runtime
        else:
            self._warehouse_grounder = None

    def search_result(
        self,
        request: RagSearchRequest,
        *,
        include_debug_trace: bool = False,
    ):
        started = perf_counter()
        trace = RuntimeTraceCollector(enabled=include_debug_trace)
        with repository_search_session(self._repository):
            return execute_search(
                request=request,
                repository=self._repository,
                query_embedder=self._query_embedder,
                biomedical_reranker=self._biomedical_reranker,
                warehouse_grounder=self._warehouse_grounder,
                started=started,
                trace=trace,
            )
```

**Why this matters**:

- The service owns dependency wiring.
- The repository is an adapter boundary, not a concrete SQL dependency.
- Grounding is optional and injected, which keeps the service testable.
- Search runs inside one repository session so runtime-scoped DB settings apply
  consistently across all retrieval stages.

### 4.2 `execute_search`

```python
def execute_search(
    *,
    request: RagSearchRequest,
    repository: RagRepository,
    query_embedder: RagQueryEmbedder,
    biomedical_reranker: RagBiomedicalReranker,
    warehouse_grounder: object | None,
    started: float,
    trace: RuntimeTraceCollector,
):
    retrieval = trace.call(
        "retrieve_search_state",
        retrieve_search_state,
        request=request,
        repository=repository,
        query_embedder=query_embedder,
        trace=trace,
    )
    result = trace.call(
        "finalize_search_result",
        finalize_search_result,
        retrieval=retrieval,
        repository=repository,
        biomedical_reranker=biomedical_reranker,
        warehouse_grounder=warehouse_grounder,
        trace=trace,
        started=started,
    )
    if trace.enabled:
        result.debug_trace = trace.as_debug_trace()
    return result
```

**Why this matters**:

- Retrieval and finalization can be reasoned about independently.
- Profiling and evaluation can attribute cost to the correct stage.
- The pipeline stays composable: candidate generation first, evidence assembly later.

---

## 5. Query Normalization And Retrieval Planning

The runtime does not use the raw HTTP payload directly. It converts the request
into a normalized query model, then derives an execution plan from that model.

**Source**:
- [`engine/app/rag/search_support.py`](../../engine/app/rag/search_support.py)
- [`engine/app/rag/search_plan.py`](../../engine/app/rag/search_plan.py)

### 5.1 Build the normalized query object

```python
def build_query(request: RagSearchRequest) -> PaperRetrievalQuery:
    selected_graph_paper_ref = request.selected_graph_paper_ref
    if selected_graph_paper_ref is None:
        selected_graph_paper_ref = request.selected_paper_id
    if selected_graph_paper_ref is None and request.selected_layer_key == "paper":
        selected_graph_paper_ref = request.selected_node_id

    selection_graph_paper_refs = _normalize_refs(request.selection_graph_paper_refs)
    if (
        request.scope_mode == RetrievalScope.SELECTION_ONLY
        and not selection_graph_paper_refs
        and selected_graph_paper_ref
    ):
        selection_graph_paper_refs = [selected_graph_paper_ref]

    retrieval_profile = determine_query_retrieval_profile(
        request.query,
        allow_terminal_title_punctuation=bool(selected_graph_paper_ref)
        or request.selected_layer_key == "paper",
    )

    return PaperRetrievalQuery(
        graph_release_id=request.graph_release_id,
        query=request.query,
        normalized_query=normalize_query_text(request.query),
        entity_terms=_normalize_terms(request.entity_terms),
        relation_terms=_normalize_relation_terms(request.relation_terms),
        selected_layer_key=request.selected_layer_key,
        selected_node_id=request.selected_node_id,
        selected_graph_paper_ref=selected_graph_paper_ref,
        selected_paper_id=request.selected_paper_id,
        selection_graph_paper_refs=selection_graph_paper_refs,
        selected_cluster_id=request.selected_cluster_id,
        scope_mode=request.scope_mode,
        retrieval_profile=retrieval_profile,
        clinical_intent=infer_clinical_query_intent(request.query),
        evidence_intent=request.evidence_intent,
        k=request.k,
        rerank_topn=max(request.k, request.rerank_topn),
        use_lexical=request.use_lexical,
        use_title_candidate_lookup=retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP,
        use_title_similarity=should_use_title_similarity(
            request.query,
            retrieval_profile=retrieval_profile,
        ),
        use_dense_query=request.use_dense_query,
        generate_answer=request.generate_answer,
    )
```

**What to preserve**:

- Graph selection is normalized before retrieval starts.
- `PaperRetrievalQuery` is the runtime contract; later stages consume it, not
  the raw HTTP request.
- Query profile and clinical intent are inferred once, centrally.

### 5.2 Turn the normalized query into an execution plan

```python
@dataclass(frozen=True, slots=True)
class RetrievalSearchPlan:
    retrieval_profile: QueryRetrievalProfile
    allow_exact_title_matches: bool
    use_paper_lexical: bool
    use_chunk_lexical: bool
    fallback_to_paper_lexical_on_empty_chunk: bool
    expand_citation_frontier: bool
    preserve_selected_candidate: bool
    prefer_precise_grounding: bool
    selected_context_bonus: float


def build_search_plan(query: PaperRetrievalQuery) -> RetrievalSearchPlan:
    has_selected_context = bool(
        query.selected_graph_paper_ref or query.selected_paper_id or query.selected_node_id
    )
    use_chunk_lexical = (
        query.use_lexical
        and query.retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP
    )

    if query.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP:
        return RetrievalSearchPlan(
            retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
            allow_exact_title_matches=True,
            use_paper_lexical=True,
            use_chunk_lexical=False,
            fallback_to_paper_lexical_on_empty_chunk=False,
            expand_citation_frontier=not has_selected_context,
            preserve_selected_candidate=has_selected_context,
            prefer_precise_grounding=has_selected_context,
            selected_context_bonus=1.0 if has_selected_context else 0.0,
        )

    if query.retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP or use_chunk_lexical:
        return RetrievalSearchPlan(
            retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
            allow_exact_title_matches=query.use_lexical,
            use_paper_lexical=False,
            use_chunk_lexical=True,
            fallback_to_paper_lexical_on_empty_chunk=True,
            expand_citation_frontier=False,
            preserve_selected_candidate=has_selected_context,
            prefer_precise_grounding=True,
            selected_context_bonus=0.55 if has_selected_context else 0.0,
        )

    return RetrievalSearchPlan(
        retrieval_profile=QueryRetrievalProfile.GENERAL,
        allow_exact_title_matches=True,
        use_paper_lexical=True,
        use_chunk_lexical=False,
        fallback_to_paper_lexical_on_empty_chunk=False,
        expand_citation_frontier=True,
        preserve_selected_candidate=False,
        prefer_precise_grounding=False,
        selected_context_bonus=0.0,
    )
```

**Why this matters**:

- Query-shape logic lives in one place.
- Retrieval stages read plan flags instead of reimplementing routing heuristics.
- This is how the runtime remains fast without flattening title, passage, and
  general queries into one lowest-common-denominator behavior.

---

## 6. Retrieval Policy: Precision Before Fan-Out

The routing policy keeps the runtime from opening expensive channels
unconditionally.

**Source**:
- [`engine/app/rag/retrieval_policy.py`](../../engine/app/rag/retrieval_policy.py)

### 6.1 Bounded chunk fallback phrases

```python
def chunk_search_queries(query: PaperRetrievalQuery) -> list[str]:
    """Build bounded passage-search fallbacks when the full sentence misses."""

    raw_query = query.query.strip()
    primary_query = query.normalized_query or raw_query
    if not primary_query and not raw_query:
        return []
    if query.retrieval_profile != QueryRetrievalProfile.PASSAGE_LOOKUP:
        return [primary_query]

    candidates: list[str] = []
    seen: set[str] = set()
    if raw_query and has_statistical_surface_signal(raw_query):
        candidates.append(raw_query)
        seen.add(raw_query)
    if primary_query and primary_query not in seen:
        candidates.append(primary_query)
        seen.add(primary_query)

    fallback_phrases: list[tuple[int, str]] = []
    for index, phrase in enumerate(build_query_phrases(primary_query)):
        if len(phrase.split()) < MIN_CHUNK_FALLBACK_WORDS or phrase in seen:
            continue
        seen.add(phrase)
        fallback_phrases.append((index, phrase))

    for original_index, phrase in sorted(
        fallback_phrases,
        key=lambda item: _chunk_fallback_sort_key(item[1], item[0]),
    ):
        _ = original_index
        candidates.append(phrase)
        if len(candidates) >= MAX_CHUNK_FALLBACK_PHRASES + 1:
            break
    return candidates
```

### 6.2 Dense retrieval only when lexical anchors are not enough

```python
def should_run_dense_query(
    *,
    query: PaperRetrievalQuery,
    search_plan: RetrievalSearchPlan,
    lexical_hits: Sequence[PaperEvidenceHit],
    selected_direct_anchor: bool = False,
) -> bool:
    """Allow dense query search only when it adds real recall beyond lexical anchors."""

    if not query.use_dense_query:
        return False
    if selected_direct_anchor and search_plan.prefer_precise_grounding:
        return False
    return not (
        search_plan.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP
        and has_strong_lexical_title_anchor(
            query_text=query.query,
            lexical_hits=lexical_hits,
        )
    )
```

### 6.3 Cheap paper-level FTS fallback for weak passage anchors

```python
def should_run_paper_lexical_fallback(
    *,
    query: PaperRetrievalQuery,
    search_plan: RetrievalSearchPlan,
    lexical_hits: Sequence[PaperEvidenceHit],
    chunk_lexical_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Return True when passage queries should fall through to cheap paper-level FTS."""

    if not query.use_lexical:
        return False
    if search_plan.retrieval_profile != QueryRetrievalProfile.PASSAGE_LOOKUP:
        return search_plan.use_paper_lexical
    if not search_plan.fallback_to_paper_lexical_on_empty_chunk:
        return False
    if not chunk_lexical_hits:
        return True
    if not has_weak_passage_anchor(
        lexical_hits=lexical_hits,
        chunk_lexical_hits=chunk_lexical_hits,
    ):
        return False
    return (
        query.clinical_intent != ClinicalQueryIntent.GENERAL
        or has_statistical_surface_signal(query.query)
    )
```

**Why these functions matter**:

- They encode the latency/quality tradeoff explicitly.
- They keep dense expansion and semantic neighbor expansion from drowning strong
  direct evidence.
- They let passage queries stay chunk-first without trapping the runtime when
  chunk lexical support is weak.

---

## 7. Retrieval Stage: Build The Candidate Set Once

`retrieve_search_state` is the retrieval half of the runtime. It resolves the
release, normalizes the query, applies enrichment, opens retrieval channels, and
returns one state object for finalization.

**Source**:
- [`engine/app/rag/search_retrieval.py`](../../engine/app/rag/search_retrieval.py)

### 7.1 Retrieval state contract

```python
@dataclass(slots=True)
class SearchRetrievalState:
    release: GraphRelease
    query: PaperRetrievalQuery
    search_plan: RetrievalSearchPlan
    scope_corpus_ids: list[int]
    selected_corpus_id: int | None
    lexical_hits: list[PaperEvidenceHit]
    chunk_lexical_hits: list[PaperEvidenceHit]
    entity_seed_hits: list[PaperEvidenceHit]
    relation_seed_hits: list[PaperEvidenceHit]
    dense_query_hits: list[PaperEvidenceHit]
    semantic_neighbors: list[GraphSignal]
    semantic_seed_hits: list[PaperEvidenceHit]
    initial_paper_hits: list[PaperEvidenceHit]
```

This object is important because it freezes the boundary between:

- **candidate generation**
- **evidence enrichment + ranking + answer assembly**

### 7.2 Retrieval-stage shape

The full function is long. This excerpt shows the parts an agent should recreate.

```python
def retrieve_search_state(
    *,
    request: RagSearchRequest,
    repository: RagRepository,
    query_embedder: RagQueryEmbedder,
    trace: RuntimeTraceCollector,
) -> SearchRetrievalState:
    release = trace.call(
        "resolve_graph_release",
        repository.resolve_graph_release,
        request.graph_release_id,
    )
    query = trace.call("build_query", build_query, request)
    search_plan = trace.call("build_search_plan", build_search_plan, query)
    query = trace.call("relation_enrichment", _apply_relation_enrichment, query)

    scope_corpus_ids = (
        trace.call(
            "resolve_scope_corpus_ids",
            repository.resolve_scope_corpus_ids,
            graph_run_id=release.graph_run_id,
            graph_paper_refs=query.selection_graph_paper_refs,
        )
        if query.scope_mode == RetrievalScope.SELECTION_ONLY
        else []
    )

    selected_corpus_id = trace.call(
        "resolve_selected_corpus_id",
        repository.resolve_selected_corpus_id,
        graph_run_id=release.graph_run_id,
        selected_graph_paper_ref=query.selected_graph_paper_ref,
        selected_paper_id=query.selected_paper_id,
        selected_node_id=query.selected_node_id,
    )

    selected_title_hits = (
        trace.call(
            "search_selected_title_papers",
            repository.search_selected_title_papers,
            release.graph_run_id,
            query.query,
            selected_corpus_id=selected_corpus_id,
            limit=query.rerank_topn,
            scope_corpus_ids=scope_corpus_ids or None,
        )
        if query.use_lexical
        and search_plan.allow_exact_title_matches
        and selected_corpus_id is not None
        else []
    )

    exact_title_hits = list(selected_title_hits)
    if (
        not exact_title_hits
        and query.use_lexical
        and search_plan.allow_exact_title_matches
        and should_use_exact_title_precheck(query.query)
    ):
        exact_title_hits = trace.call(
            "search_exact_title_papers",
            repository.search_exact_title_papers,
            release.graph_run_id,
            query.query,
            limit=query.rerank_topn,
            scope_corpus_ids=scope_corpus_ids or None,
        )

    chunk_lexical_hits: list[PaperEvidenceHit] = []
    chunk_queries = chunk_search_queries(query)
    if (
        not exact_title_hits
        and query.use_lexical
        and query.retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP
    ):
        for chunk_query in chunk_queries:
            chunk_lexical_hits = trace.call(
                "search_chunk_papers",
                repository.search_chunk_papers,
                release.graph_run_id,
                chunk_query,
                limit=query.rerank_topn,
                scope_corpus_ids=scope_corpus_ids or None,
            )
            if chunk_lexical_hits:
                break

    lexical_hits: list[PaperEvidenceHit] = list(exact_title_hits)
    sparse_passage_paper_fallback = (
        search_plan.retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP
        and should_run_paper_lexical_fallback(
            query=query,
            search_plan=search_plan,
            lexical_hits=lexical_hits,
            chunk_lexical_hits=chunk_lexical_hits,
        )
    )
    if (
        not exact_title_hits
        and query.use_lexical
        and (search_plan.use_paper_lexical or sparse_passage_paper_fallback)
    ):
        lexical_hits = trace.call(
            "search_papers",
            repository.search_papers,
            release.graph_run_id,
            _paper_lexical_query_text(
                query,
                passage_fallback=sparse_passage_paper_fallback,
            ),
            limit=query.rerank_topn,
            scope_corpus_ids=scope_corpus_ids or None,
            use_title_similarity=(
                False if sparse_passage_paper_fallback else query.use_title_similarity
            ),
            use_title_candidate_lookup=(
                False
                if sparse_passage_paper_fallback
                else query.use_title_candidate_lookup
            ),
        )

    # Dense query, semantic neighbors, entity seeds, relation seeds, and
    # initial candidate fusion happen later in the same function.
```

**What to preserve**:

- Release resolution first.
- Query normalization and plan derivation before retrieval.
- Title anchors before broader search.
- Chunk lexical first for passage queries.
- Paper lexical fallback only when passage evidence is empty or weak.

---

## 8. Candidate Fusion: Union Channels Without Recomputing Work

Candidate union happens in one pure helper rather than being reimplemented in
multiple stages.

**Source**:
- [`engine/app/rag/retrieval_fusion.py`](../../engine/app/rag/retrieval_fusion.py)

```python
def merge_candidate_papers(
    *,
    lexical_hits: list[PaperEvidenceHit],
    chunk_lexical_hits: list[PaperEvidenceHit],
    selected_context_hits: list[PaperEvidenceHit],
    entity_seed_hits: list[PaperEvidenceHit],
    relation_seed_hits: list[PaperEvidenceHit],
    citation_seed_hits: list[PaperEvidenceHit],
    semantic_seed_hits: list[PaperEvidenceHit],
    semantic_neighbors: list[GraphSignal],
    dense_query_hits: list[PaperEvidenceHit] | None = None,
) -> list[PaperEvidenceHit]:
    by_corpus_id: dict[int, PaperEvidenceHit] = {hit.corpus_id: hit for hit in lexical_hits}

    for hit in chunk_lexical_hits:
        existing = by_corpus_id.get(hit.corpus_id)
        if existing is None:
            by_corpus_id[hit.corpus_id] = hit
            continue
        existing.chunk_lexical_score = max(
            existing.chunk_lexical_score,
            hit.chunk_lexical_score,
        )
        if hit.chunk_snippet and (
            not existing.chunk_snippet
            or hit.chunk_lexical_score >= existing.chunk_lexical_score
        ):
            existing.chunk_snippet = hit.chunk_snippet
            existing.chunk_ordinal = hit.chunk_ordinal

    for hit in selected_context_hits:
        existing = by_corpus_id.get(hit.corpus_id)
        if existing is None:
            by_corpus_id[hit.corpus_id] = hit
            continue
        existing.selected_context_score = max(
            existing.selected_context_score,
            hit.selected_context_score,
        )

    for hit in dense_query_hits or []:
        existing = by_corpus_id.get(hit.corpus_id)
        if existing is None:
            by_corpus_id[hit.corpus_id] = hit
            continue
        existing.dense_score = max(existing.dense_score, hit.dense_score)

    # Entity, relation, citation, and semantic scores merge the same way.
    return list(by_corpus_id.values())
```

**Why this matters**:

- The paper is the unit of identity.
- Each retrieval lane contributes scores and snippets to the same paper object.
- The runtime avoids redundant candidate objects and repeated hydration.

---

## 9. Repository Boundary: Read-Only Protocol Plus Runtime Session Control

The service depends on a protocol, not on SQL or on a driver directly.

**Source**:
- [`engine/app/rag/repository.py`](../../engine/app/rag/repository.py)

### 9.1 Repository protocol

```python
class RagRepository(Protocol):
    """Read-only repository contract used by the service."""

    def resolve_graph_release(self, graph_release_id: str) -> GraphRelease: ...
    def resolve_query_entity_terms(
        self,
        *,
        query_phrases: Sequence[str],
        limit: int = 5,
    ) -> list[str]: ...
    def resolve_selected_corpus_id(...): ...
    def resolve_scope_corpus_ids(...): ...
    def search_papers(...): ...
    def search_exact_title_papers(...): ...
    def search_selected_title_papers(...): ...
    def search_chunk_papers(...): ...
    def search_entity_papers(...): ...
    def fetch_papers_by_corpus_ids(...): ...
    def search_query_embedding_papers(...): ...
    def fetch_known_scoped_papers_by_corpus_ids(...): ...
    def search_relation_papers(...): ...
    def fetch_citation_contexts(...): ...
    def fetch_entity_matches(...): ...
    def fetch_relation_matches(...): ...
    def fetch_species_profiles(...): ...
    def fetch_references(...): ...
    def fetch_assets(...): ...
    def fetch_semantic_neighbors(...): ...
```

### 9.2 PostgreSQL adapter and search session pinning

```python
class PostgresRagRepository(...):
    def __init__(
        self,
        connect: Callable[..., object] | None = None,
        *,
        chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    ):
        self._connect_factory = connect or db.pooled
        self._chunk_version_key = chunk_version_key
        self._disable_session_jit = settings.rag_runtime_disable_jit
        self._bound_connection: ContextVar[Any | None] = ContextVar(
            f"rag_repository_connection_{id(self)}",
            default=None,
        )

    def _connect(self):
        active_connection = self._bound_connection.get()
        if active_connection is not None:
            return _PinnedConnectionContext(active_connection)
        return self._connect_factory()

    def _configure_search_session(self, cur: Any) -> None:
        if self._disable_session_jit:
            cur.execute("SET LOCAL jit = off")

    @contextmanager
    def search_session(self) -> Iterator[None]:
        active_connection = self._bound_connection.get()
        if active_connection is not None:
            yield
            return

        with self._connect_factory() as conn:
            with conn.cursor() as cur:
                self._configure_search_session(cur)
            token = self._bound_connection.set(conn)
            try:
                yield
            finally:
                self._bound_connection.reset(token)
```

**Why this matters**:

- The service can be tested against any repository implementation.
- Runtime-scoped DB behavior, including `SET LOCAL jit = off`, is centralized.
- Multiple SQL calls in one search share a pinned connection and consistent
  session settings.

---

## 10. Dense Retrieval: Query Embeddings Live Behind An Adapter

Dense retrieval is optional and adapterized. The runtime does not couple itself
to Hugging Face internals.

**Source**:
- [`engine/app/rag/query_embedding.py`](../../engine/app/rag/query_embedding.py)

```python
class Specter2AdhocQueryEmbedder:
    """AllenAI SPECTER2 ad-hoc query encoder aligned to SPECTER2 paper embeddings."""

    def encode(self, text: str) -> list[float] | None:
        query_text = text.strip()
        if not query_text:
            return None

        if not self.initialize():
            return None

        tokenizer, model, device = self._runtime_components()

        import torch
        import torch.nn.functional as F

        encoded = tokenizer(
            query_text,
            max_length=self._max_length,
            padding=False,
            truncation=True,
            return_tensors="pt",
        )
        encoded = {key: value.to(device) for key, value in encoded.items()}
        with torch.inference_mode():
            outputs = model(**encoded)
        pooled = outputs.last_hidden_state[:, 0, :]
        normalized = F.normalize(pooled, p=2, dim=1)
        return normalized[0].detach().cpu().tolist()


@lru_cache(maxsize=1)
def get_query_embedder() -> RagQueryEmbedder:
    if not settings.rag_dense_query_enabled:
        return NoopQueryEmbedder()
    return Specter2AdhocQueryEmbedder(
        base_model_name=settings.rag_dense_query_base_model,
        adapter_name=settings.rag_dense_query_adapter_name,
        cache_dir=str(settings.rag_model_cache_path),
        max_length=settings.rag_dense_query_max_length,
        use_gpu=settings.rag_dense_query_use_gpu,
    )
```

**What to preserve**:

- Query embeddings are lazy-loaded and cacheable.
- The runtime can swap the embedder without rewriting search orchestration.
- Dense retrieval can be disabled cleanly with a no-op implementation.

---

## 11. Optional Biomedical Reranking: Top-N Only

The reranker is deliberately bounded. It refines a shortlist; it does not
replace the retrieval stack.

**Source**:
- [`engine/app/rag/biomedical_reranking.py`](../../engine/app/rag/biomedical_reranking.py)

```python
def apply_biomedical_rerank(
    paper_hits: list[PaperEvidenceHit],
    *,
    query_text: str,
    reranker: RagBiomedicalReranker,
    topn: int,
) -> BiomedicalRerankOutcome:
    """Assign reranker-derived article relevance over a bounded top-N window."""

    for hit in paper_hits:
        hit.biomedical_rerank_score = 0.0

    if topn <= 1:
        return BiomedicalRerankOutcome(
            applied=False,
            candidate_count=min(len(paper_hits), max(topn, 0)),
            promoted_count=0,
            reranked_window_corpus_ids=[],
        )

    def _candidate_text(hit: PaperEvidenceHit) -> str:
        return article_text(
            title=hit.title,
            abstract=hit.chunk_snippet or hit.abstract or hit.tldr,
        )

    candidate_hits = [
        hit
        for hit in paper_hits[:topn]
        if _candidate_text(hit)
    ]
    if len(candidate_hits) <= 1 or not query_text.strip():
        return BiomedicalRerankOutcome(
            applied=False,
            candidate_count=len(candidate_hits),
            promoted_count=0,
            reranked_window_corpus_ids=[hit.corpus_id for hit in candidate_hits],
        )

    scores = reranker.score_pairs(
        [
            [query_text, _candidate_text(hit)]
            for hit in candidate_hits
        ]
    )

    reranked = sorted(
        zip(candidate_hits, scores, strict=True),
        key=lambda item: (item[1], item[0].fused_score, item[0].corpus_id),
        reverse=True,
    )
    for new_index, (hit, _score) in enumerate(reranked):
        hit.biomedical_rerank_score = _normalized_rank_score(new_index, len(reranked))
```

**Why this matters**:

- The reranker is applied after retrieval, not instead of retrieval.
- It only pays model cost for a bounded top-N window.
- It writes one additional score back into the same `PaperEvidenceHit` objects.

---

## 12. Final Ranking: All Signals Meet In One Function

The final ranking stage is centralized in `rank_paper_hits`.

**Source**:
- [`engine/app/rag/ranking.py`](../../engine/app/rag/ranking.py)

```python
def rank_paper_hits(
    paper_hits: list[PaperEvidenceHit],
    *,
    citation_hits: dict[int, list[CitationContextHit]],
    entity_hits: dict[int, list[EntityMatchedPaperHit]],
    relation_hits: dict[int, list[RelationMatchedPaperHit]],
    species_profiles: Mapping[int, PaperSpeciesProfile] | None = None,
    evidence_intent: EvidenceIntent | None = None,
    channel_rankings: Mapping[RetrievalChannel, Mapping[int, int]] | None = None,
    query_text: str | None = None,
    retrieval_profile: QueryRetrievalProfile = QueryRetrievalProfile.GENERAL,
    clinical_intent: ClinicalQueryIntent = ClinicalQueryIntent.GENERAL,
) -> list[PaperEvidenceHit]:
    """Fuse baseline channel signals into a final paper rank."""

    channel_rankings = channel_rankings or {}
    species_profiles = species_profiles or {}
    score_profile = _ranking_profile(retrieval_profile)
    ranked: list[PaperEvidenceHit] = []
    for hit in paper_hits:
        direct_support = has_direct_retrieval_support(
            paper=hit,
            retrieval_profile=retrieval_profile,
        )
        paper_citation_hits = citation_hits.get(hit.corpus_id, [])
        paper_entity_hits = entity_hits.get(hit.corpus_id, [])
        paper_relation_hits = relation_hits.get(hit.corpus_id, [])

        hit.citation_boost = max(...)
        hit.entity_score = max(...)
        hit.relation_score = max(...)
        hit.intent_score, matched_intent_cues = _intent_affinity(...)
        hit.citation_intent_score, matched_citation_intents = _citation_intent_affinity(...)
        hit.publication_type_score, matched_publication_types = _publication_type_affinity(hit)
        hit.evidence_quality_score, evidence_quality_reasons = _evidence_quality_affinity(hit)
        hit.clinical_prior_score, clinical_prior_reasons = score_clinical_prior(...)
        hit.title_anchor_score = compute_title_anchor_score(...)
        hit.passage_alignment_score = _passage_alignment_affinity(...)

        channel_fusion_score = (
            _rrf_score(lexical_rank, weight=...)
            + _rrf_score(chunk_lexical_rank, weight=...)
            + _rrf_score(dense_rank, weight=...)
            + _rrf_score(entity_rank, weight=...)
            + _rrf_score(relation_rank, weight=...)
            + _rrf_score(semantic_rank, weight=...)
        )

        if retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP and not direct_support:
            citation_score = 0.0
            dense_score *= 0.1

        hit.fused_score = (
            channel_fusion_score
            + (hit.title_similarity * score_profile.title_similarity_weight)
            + (hit.chunk_lexical_score * score_profile.chunk_lexical_weight)
            + (hit.title_anchor_score * score_profile.title_anchor_weight)
            + (hit.selected_context_score * score_profile.selected_context_weight)
            + (citation_score * score_profile.citation_weight)
            + (hit.citation_intent_score * score_profile.citation_intent_weight)
            + (hit.entity_score * score_profile.entity_weight)
            + (hit.relation_score * score_profile.relation_weight)
            + (dense_score * score_profile.dense_weight)
            + (hit.publication_type_score * score_profile.publication_type_weight)
            + (hit.evidence_quality_score * score_profile.evidence_quality_weight)
            + (hit.clinical_prior_score * score_profile.clinical_prior_weight)
            + (hit.intent_score * score_profile.intent_weight)
            + (hit.biomedical_rerank_score * score_profile.biomedical_rerank_weight)
            + (hit.passage_alignment_score * score_profile.passage_alignment_weight)
            + _direct_match_adjustment(...)
        )

    ranked.sort(key=lambda item: _rank_sort_key(item, retrieval_profile), reverse=True)
```

**Why this matters**:

- Retrieval channels do not directly determine the final order.
- RRF is only one layer in the score.
- Publication-type priors, evidence-quality priors, clinical priors, intent
  affinity, and passage alignment all enter here, centrally.

---

## 13. Finalization: From Ranked Papers To Bundles, Answers, And Grounding

`finalize_search_result` is the second half of the runtime. It enriches the
candidate set, ranks it, builds bundles, then optionally builds answers and
grounding.

**Source**:
- [`engine/app/rag/search_finalize.py`](../../engine/app/rag/search_finalize.py)

```python
def finalize_search_result(
    *,
    retrieval: SearchRetrievalState,
    repository: RagRepository,
    biomedical_reranker: RagBiomedicalReranker,
    warehouse_grounder: object | None,
    trace: RuntimeTraceCollector,
    started: float,
) -> RagSearchResult:
    query = retrieval.query
    release = retrieval.release

    citation_hits = repository.fetch_citation_contexts(...)
    citation_seed_scores = derive_citation_seed_scores(...)
    citation_seed_hits = repository.fetch_papers_by_corpus_ids(...)

    paper_hits = merge_candidate_papers(
        lexical_hits=retrieval.lexical_hits,
        chunk_lexical_hits=retrieval.chunk_lexical_hits,
        selected_context_hits=[],
        dense_query_hits=retrieval.dense_query_hits,
        entity_seed_hits=retrieval.entity_seed_hits,
        relation_seed_hits=retrieval.relation_seed_hits,
        citation_seed_hits=citation_seed_hits,
        semantic_seed_hits=retrieval.semantic_seed_hits,
        semantic_neighbors=retrieval.semantic_neighbors,
    )
    paper_hits = apply_selected_context_hits(...)

    channel_rankings = build_channel_rankings(...)
    preliminary_ranked_hits = rank_paper_hits(
        paper_hits,
        citation_hits=citation_hits,
        entity_hits={},
        relation_hits={},
        evidence_intent=query.evidence_intent,
        query_text=query.query,
        retrieval_profile=query.retrieval_profile,
        channel_rankings=channel_rankings,
    )

    if biomedical_rerank_requested:
        biomedical_rerank_outcome = apply_biomedical_rerank(...)
        if biomedical_rerank_outcome.applied:
            preliminary_ranked_hits = rank_paper_hits(...)

    enrichment_corpus_ids = entity_relation_candidate_ids(...)
    entity_hits = repository.fetch_entity_matches(...)
    relation_hits = repository.fetch_relation_matches(...)
    species_profiles = repository.fetch_species_profiles(...)

    ranked_hits = rank_paper_hits(
        paper_hits,
        citation_hits=citation_hits,
        entity_hits=entity_hits,
        relation_hits=relation_hits,
        species_profiles=species_profiles,
        evidence_intent=query.evidence_intent,
        query_text=query.query,
        retrieval_profile=query.retrieval_profile,
        clinical_intent=ranking_clinical_intent,
        channel_rankings=channel_rankings,
    )
    top_hits = ranked_hits[: query.k]

    references = repository.fetch_references(top_corpus_ids)
    assets = repository.fetch_assets(top_corpus_ids)
    bundles = assemble_evidence_bundles(...)
    graph_signals = merge_graph_signals(...)

    answer_payload = build_baseline_answer_payload(
        bundles,
        evidence_intent=query.evidence_intent,
        query_text=query.normalized_query,
        query_profile=query.retrieval_profile,
        selected_corpus_id=retrieval.selected_corpus_id,
    )

    grounded_answer = None
    if warehouse_grounder and answer and answer_corpus_ids:
        grounded_answer = warehouse_grounder(
            corpus_ids=answer_corpus_ids,
            segment_texts=list(answer_payload.segment_texts),
            segment_corpus_ids=list(answer_payload.segment_corpus_ids),
            trace=trace,
        )
```

**What to preserve**:

- Shortlist enrichment happens after initial candidate collection.
- Final ranking happens twice when bounded reranking is enabled:
  once before reranking, once after reranker scores are written back.
- Bundles, graph signals, answer payload, and grounded answer are separate
  products built from the same ranked paper set.

---

## 14. Answer Selection: Top Ranked Papers And Grounding Papers Are Related But Not Identical

The answer builder chooses which bundles ground the answer. That is not always
the same thing as “take the top two papers”.

**Source**:
- [`engine/app/rag/answer.py`](../../engine/app/rag/answer.py)

```python
def build_baseline_answer_payload(
    bundles: list[EvidenceBundle],
    *,
    evidence_intent: EvidenceIntent | None = None,
    max_items: int = 2,
    query_text: str | None = None,
    query_profile: QueryRetrievalProfile = QueryRetrievalProfile.GENERAL,
    selected_corpus_id: int | None = None,
) -> BaselineAnswerPayload:
    """Return the baseline answer text plus per-bundle grounding segments."""

    grounding_bundles = select_answer_grounding_bundles(
        bundles,
        max_items=max_items,
        query_text=query_text,
        query_profile=query_profile,
        selected_corpus_id=selected_corpus_id,
    )
    if not grounding_bundles:
        return BaselineAnswerPayload(text=None, model=None)

    heading = _answer_heading(evidence_intent)
    lines: list[str] = []
    segment_corpus_ids: list[int | None] = [None]
    for bundle in grounding_bundles:
        title = bundle.paper.title or f"Paper {bundle.paper.corpus_id}"
        year = f" ({bundle.paper.year})" if bundle.paper.year else ""
        snippet = _bundle_grounding_snippet(bundle)
        lines.append(f"{title}{year}: {snippet}")
        segment_corpus_ids.append(bundle.paper.corpus_id)

    return BaselineAnswerPayload(
        text=f"{heading}\n\n" + "\n\n".join(lines),
        model=DEFAULT_ANSWER_MODEL,
        segment_texts=(heading, *lines),
        segment_corpus_ids=tuple(segment_corpus_ids),
        grounding_corpus_ids=tuple(bundle.paper.corpus_id for bundle in grounding_bundles),
    )
```

```python
def select_answer_grounding_bundles(
    bundles: list[EvidenceBundle],
    *,
    max_items: int = 2,
    query_text: str | None = None,
    query_profile: QueryRetrievalProfile = QueryRetrievalProfile.GENERAL,
    selected_corpus_id: int | None = None,
) -> list[EvidenceBundle]:
    if query_profile == QueryRetrievalProfile.PASSAGE_LOOKUP:
        _append_selected_bundle(
            selected,
            remaining,
            _select_chunk_anchor_bundle(
                remaining,
                query_text=query_text,
            ),
        )
    elif (
        query_profile == QueryRetrievalProfile.TITLE_LOOKUP
        and selected_corpus_id is not None
    ):
        _append_selected_bundle(
            selected,
            remaining,
            _select_bundle_by_corpus_id(remaining, selected_corpus_id),
        )
    else:
        _append_selected_bundle(selected, remaining, bundles[0])

    query_anchor = _select_query_anchor_bundle(
        remaining,
        query_text=query_text,
    )
    _append_selected_bundle(selected, remaining, query_anchor)
```

**Why this matters**:

- The answer layer is not a blind projection of final ranking.
- Passage queries want direct chunk anchors.
- Title queries often want the selected or directly matched paper.
- This is the start of the “objective mismatch” seam between paper retrieval and
  answer-supporting evidence.

---

## 15. Grounding Runtime Gate: Only Ground When Coverage Exists

Grounding is guarded at runtime. The system does not pretend chunk-backed
citations exist when the warehouse is incomplete.

**Source**:
- [`engine/app/rag/grounded_runtime.py`](../../engine/app/rag/grounded_runtime.py)

```python
class GroundedAnswerRuntimeStatus(ParseContractModel):
    enabled: bool
    chunk_version_key: str
    missing_tables: list[str] = Field(default_factory=list)
    has_chunk_version: bool = False
    covered_corpus_ids: list[int] = Field(default_factory=list)
    missing_corpus_ids: list[int] = Field(default_factory=list)


def build_grounded_answer_from_runtime(
    *,
    corpus_ids: Sequence[int],
    segment_texts: Sequence[str],
    segment_corpus_ids: Sequence[int | None] | None = None,
    limit_per_paper: int = 1,
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    connect=None,
    trace: RuntimeTraceCollector | None = None,
) -> GroundedAnswerRecord | None:
    normalized_corpus_ids = _normalize_corpus_ids(corpus_ids)
    if not normalized_corpus_ids:
        return None

    connect_fn = connect or db.pooled
    with connect_fn() as conn, conn.cursor() as cur:
        runtime_status = _get_runtime_status_with_cursor(
            cursor=cur,
            corpus_ids=normalized_corpus_ids,
            chunk_version_key=chunk_version_key,
        )
        if runtime_status.missing_tables or not runtime_status.has_chunk_version:
            return None
        if not runtime_status.covered_corpus_ids:
            return None

        citation_rows, entity_rows = fetch_chunk_grounding_rows(
            corpus_ids=runtime_status.covered_corpus_ids,
            cursor=cur,
            chunk_version_key=chunk_version_key,
            limit_per_paper=limit_per_paper,
        )
        structural_rows = fetch_chunk_structural_rows(
            corpus_ids=[
                corpus_id
                for corpus_id in runtime_status.covered_corpus_ids
                if corpus_id not in packet_corpus_ids
            ],
            cursor=cur,
            chunk_version_key=chunk_version_key,
        )

    return build_grounded_answer_from_warehouse_rows(
        citation_rows=citation_rows,
        entity_rows=entity_rows,
        segment_texts=segment_texts,
        segment_corpus_ids=segment_corpus_ids,
        corpus_order=runtime_status.covered_corpus_ids,
        structural_rows=structural_rows,
        trace=trace,
    )
```

**What to preserve**:

- Grounding is explicitly coverage-gated.
- Missing chunk tables or missing chunk versions disable grounding cleanly.
- Citation/entity packets and structural fallback packets are both fed into one
  warehouse grounding builder.

---

## 16. Grounding Packet Assembly: Warehouse Rows To Inline Citations

The runtime does not build citations ad hoc from text. It converts canonical
warehouse rows into packet objects.

**Source**:
- [`engine/app/rag/warehouse_grounding.py`](../../engine/app/rag/warehouse_grounding.py)

```python
def build_grounded_answer_from_warehouse_rows(
    *,
    citation_rows: Sequence[dict],
    entity_rows: Sequence[dict],
    segment_texts: Sequence[str],
    segment_corpus_ids: Sequence[int | None] | None = None,
    corpus_order: Sequence[int] | None = None,
    structural_rows: Sequence[dict] = (),
    trace: RuntimeTraceCollector | None = None,
) -> GroundedAnswerRecord | None:
    """Build a grounded answer from already-fetched warehouse rows."""

    if not citation_rows and not entity_rows and not structural_rows:
        return None

    grouped_entities = _group_entity_packet_entries(entity_rows)

    packets = []
    packet_keys_with_packets: set[tuple[int, int, int | None]] = set()
    for row in citation_rows:
        citation = PaperCitationMentionRow.model_validate(
            {
                key: row[key]
                for key in PaperCitationMentionRow.model_fields
            }
        )
        block, sentence = _build_block_and_sentence_from_row(
            row,
            block_ordinal_key="canonical_block_ordinal",
            sentence_ordinal_key="canonical_sentence_ordinal",
        )
        packet_key = (
            citation.corpus_id,
            citation.canonical_block_ordinal,
            citation.canonical_sentence_ordinal,
        )
        packet_keys_with_packets.add(packet_key)
        packets.append(
            build_cited_span_packet(
                block=block,
                sentence=sentence,
                citation_rows=[citation],
                entity_rows=grouped_entities.get(packet_key, {}).get("entities", []),
            )
        )

    if grouped_entities:
        for packet_key, entry in grouped_entities.items():
            if packet_key in packet_keys_with_packets:
                continue
            packets.append(
                build_cited_span_packet(
                    block=entry["block"],
                    sentence=entry["sentence"],
                    citation_rows=[],
                    entity_rows=entry["entities"],
                )
            )

    if structural_rows:
        packets.extend(
            _build_structural_packets_from_rows(
                structural_rows=structural_rows,
                segment_texts=segment_texts,
                segment_corpus_ids=segment_corpus_ids,
                covered_corpus_ids={packet.corpus_id for packet in packets},
            )
        )
```

**Why this matters**:

- Citation packets are canonical objects, not string fragments.
- Entity-only packets can exist when citation packets are absent.
- Structural fallback packets preserve grounding coverage even when explicit
  citation/entity rows are sparse.

---

## 17. Canonical Parse Contract: One Structural Model For All Sources

Offline ingest starts by projecting every source into one common parser contract.

**Source**:
- [`engine/app/rag_ingest/source_parsers.py`](../../engine/app/rag_ingest/source_parsers.py)

```python
@dataclass(slots=True)
class ParsedPaperSource:
    """Normalized parser output for one source document."""

    document: PaperDocumentRecord
    sections: list[PaperSectionRecord] = field(default_factory=list)
    blocks: list[PaperBlockRecord] = field(default_factory=list)
    sentences: list[PaperSentenceRecord] = field(default_factory=list)
    references: list[PaperReferenceEntryRecord] = field(default_factory=list)
    citations: list[PaperCitationMentionRecord] = field(default_factory=list)
    entities: list[PaperEntityMentionRecord] = field(default_factory=list)
```

**Why this matters**:

- All downstream stages consume one shape.
- Source-specific parser logic ends here.
- Chunking, alignment, and warehouse writing do not need to know whether the
  original data came from S2 abstract, S2ORC, or BioCXML.

---

## 18. Source Adapters: S2 Abstract Bootstrap, S2ORC Full Text, BioCXML Overlay

### 18.1 S2 abstract bootstrap

**Source**:
- [`engine/app/rag_ingest/source_parsers.py`](../../engine/app/rag_ingest/source_parsers.py)

```python
def parse_s2_paper_abstract(
    *,
    corpus_id: int,
    title_text: str | None,
    abstract_text: str,
    source_revision: str,
    parser_version: str,
    sentence_segmenter: SentenceSegmenter | None = None,
    paper_id: str | None = None,
    text_availability: str | None = None,
) -> ParsedPaperSource:
    """Build a canonical abstract-only S2 source when fulltext is not yet hydrated."""

    normalized_abstract = abstract_text.strip()
    if not normalized_abstract:
        raise ValueError("S2 paper abstract text must be non-empty")

    document = PaperDocumentRecord(
        corpus_id=corpus_id,
        source_system=ParseSourceSystem.S2ORC_V2,
        source_revision=source_revision,
        source_document_key=str(corpus_id),
        source_plane=SourcePlane.FRONT_MATTER,
        parser_version=parser_version,
        raw_attrs_json=raw_attrs,
        title=normalized_title,
        source_availability="abstract",
    )
    sections = [
        PaperSectionRecord(
            corpus_id=corpus_id,
            source_system=ParseSourceSystem.S2ORC_V2,
            source_revision=source_revision,
            source_document_key=str(corpus_id),
            source_plane=SourcePlane.BODY,
            parser_version=parser_version,
            raw_attrs_json={"ingest_lane": "s2_papers_abstract"},
            source_start_offset=0,
            source_end_offset=len(normalized_abstract),
            text=normalized_abstract,
            section_ordinal=1,
            section_role=SectionRole.ABSTRACT,
            display_label="Abstract",
        )
    ]
```

**Why this matters**:

- The runtime can ingest abstract-only records before full text is hydrated.
- Even abstract-only data enters the same canonical structure.
- This keeps the warehouse contract stable across hydration depth.

### 18.2 S2ORC full-text parser

```python
def parse_s2orc_row(
    row: dict[str, Any],
    *,
    source_revision: str,
    parser_version: str,
    sentence_segmenter: SentenceSegmenter | None = None,
) -> ParsedPaperSource:
    """Parse one S2ORC v2 row into normalized parse-contract records."""

    corpus_id = int(row["corpusid"])
    body = row.get("body") or {}
    bibliography = row.get("bibliography") or {}
    body_text = body.get("text") or ""
    body_annotations = body.get("annotations") or {}

    document = PaperDocumentRecord(
        corpus_id=corpus_id,
        source_system=ParseSourceSystem.S2ORC_V2,
        source_revision=source_revision,
        source_document_key=str(corpus_id),
        source_plane=SourcePlane.BODY,
        parser_version=parser_version,
        raw_attrs_json={"openaccessinfo": row.get("openaccessinfo")},
        title=title_text,
        source_availability="full_text",
    )

    sections: list[PaperSectionRecord] = []
    section_headers = sorted(
        _decode_annotation_group(body_annotations.get("section_header")),
        key=lambda item: (item["start"], item["end"]),
    )
    paragraphs = sorted(
        _decode_annotation_group(body_annotations.get("paragraph")),
        key=lambda item: (item["start"], item["end"]),
    )

    for item in section_headers:
        header_text = _clean_source_section_label(raw_header_text)
        section_role = _normalize_section_role(header_text=header_text)
        if _should_skip_source_section_header(header_text, section_role=section_role):
            continue
        sections.append(PaperSectionRecord(...))

    blocks: list[PaperBlockRecord] = []
    for ordinal, item in enumerate(paragraphs):
        start, end = trimmed_span
        text = _span_text(body_text, start, end)
        section_ordinal, section_role = resolve_section_for_span(start)
        blocks.append(
            PaperBlockRecord(
                corpus_id=corpus_id,
                source_system=ParseSourceSystem.S2ORC_V2,
                ...,
                text=text,
                block_ordinal=ordinal,
                section_ordinal=section_ordinal,
                block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
                section_role=section_role,
                is_retrieval_default=_is_retrieval_default_section(section_role),
            )
        )
```

**Why this matters**:

- S2ORC is the preferred primary structural/citation spine.
- Section headers, paragraphs, references, citations, and segmented sentences all
  become canonical rows in one pass.
- Retrieval-default eligibility is computed here, once.

### 18.3 BioCXML parser

```python
def parse_biocxml_document(
    xml_text: str,
    *,
    source_revision: str,
    parser_version: str,
    corpus_id: int | None = None,
    corpus_id_resolver: CorpusIdResolver | None = None,
    sentence_segmenter: SentenceSegmenter | None = None,
) -> ParsedPaperSource:
    """Parse one BioCXML document into normalized parse-contract records."""

    document_elem, document_id = _parse_biocxml_document_elem(xml_text)
    if corpus_id is None and corpus_id_resolver is not None:
        corpus_id = corpus_id_resolver(document_id)

    title_text = _select_bioc_document_title(document_elem)
    document = PaperDocumentRecord(
        corpus_id=corpus_id,
        source_system=ParseSourceSystem.BIOCXML,
        source_revision=source_revision,
        source_document_key=document_id,
        source_plane=SourcePlane.FRONT_MATTER,
        parser_version=parser_version,
        raw_attrs_json={},
        title=title_text,
        source_availability="full_text",
    )

    def ensure_section(...):
        ...

    for passage in document_elem.findall("passage"):
        infons = {
            child.attrib.get("key"): (child.text or "") for child in passage.findall("infon")
        }
        passage_type = infons.get("type")
        section_type = infons.get("section_type")
        passage_text = passage.findtext("text") or ""

        normalized_section_role = _normalize_section_role(
            header_text=passage_text if passage_type and passage_type.startswith("title") else None,
            section_type=section_type,
        )

        if passage_type and passage_type.startswith("title"):
            ensure_section(..., force_new=True)
            continue

        block_kind = _normalize_block_kind_from_bioc(passage_type)
        if passage_type == "ref" or section_role == SectionRole.REFERENCE:
            references.append(PaperReferenceEntryRecord(...))
            continue

        if block_kind is None:
            continue
        blocks.append(PaperBlockRecord(...))
        _append_segmented_sentences(...)
        entities.extend(_build_bioc_entity_rows(...))
```

**Why this matters**:

- BioCXML contributes biomedical entities and structured passage annotations.
- It can also act as fallback structure when S2ORC is missing or weak.
- It still emits the same canonical shape as the S2-based parsers.

---

## 19. Source Precedence: One Primary Structural Source, Optional Overlays

Source precedence prevents ordinal drift.

**Source**:
- [`engine/app/rag/source_selection.py`](../../engine/app/rag/source_selection.py)

```python
@dataclass(frozen=True, slots=True)
class GroundingSourcePlan:
    primary_source: ParsedPaperSource
    annotation_sources: tuple[ParsedPaperSource, ...]
    primary_reason: str


def select_primary_text_source(
    sources: Sequence[ParsedPaperSource],
) -> tuple[ParsedPaperSource, str]:
    if not sources:
        raise ValueError("select_primary_text_source requires at least one parsed source")

    profiles = {id(source): profile_parsed_source(source) for source in sources}

    preferred_s2orc = next(
        (
            source
            for source in sources
            if profiles[id(source)].source_system == ParseSourceSystem.S2ORC_V2
        ),
        None,
    )
    if preferred_s2orc is not None and _is_viable_s2orc_primary(profiles[id(preferred_s2orc)]):
        return preferred_s2orc, "preferred_s2orc_viable"

    ranked_sources = sorted(
        sources,
        key=lambda source: _fallback_primary_rank(profiles[id(source)]),
        reverse=True,
    )
    primary_source = ranked_sources[0]
    return primary_source, "fallback_structural_best"


def build_grounding_source_plan(
    sources: Sequence[ParsedPaperSource],
) -> GroundingSourcePlan:
    primary_source, primary_reason = select_primary_text_source(sources)
    primary_corpus_id = primary_source.document.corpus_id
    profiles = {id(source): profile_parsed_source(source) for source in sources}
    annotation_sources = tuple(
        source
        for source in sources
        if source is not primary_source
        and source.document.corpus_id == primary_corpus_id
        and profiles[id(source)].has_annotation_value
    )
    return GroundingSourcePlan(
        primary_source=primary_source,
        annotation_sources=annotation_sources,
        primary_reason=primary_reason,
    )
```

**Why this matters**:

- One structural source defines canonical ordinals.
- Other useful sources become annotation overlays.
- This keeps alignment and grounding deterministic.

---

## 20. Chunk Policy: Chunks Are Derived Serving Rows, Not Canonical Facts

Chunking policy is versioned explicitly.

**Source**:
- [`engine/app/rag_ingest/chunk_policy.py`](../../engine/app/rag_ingest/chunk_policy.py)

```python
DEFAULT_CHUNK_VERSION_KEY = "default-structural-v1"
DEFAULT_TEXT_NORMALIZATION_VERSION = "canonical-text-v1"
DEFAULT_TARGET_TOKEN_BUDGET = 256
DEFAULT_HARD_MAX_TOKENS = 384

DEFAULT_INCLUDED_SECTION_ROLES: tuple[SectionRole, ...] = (
    SectionRole.ABSTRACT,
    SectionRole.INTRODUCTION,
    SectionRole.METHODS,
    SectionRole.RESULTS,
    SectionRole.DISCUSSION,
    SectionRole.CONCLUSION,
    SectionRole.SUPPLEMENT,
    SectionRole.OTHER,
)

DEFAULT_INCLUDED_BLOCK_KINDS: tuple[PaperBlockKind, ...] = (
    PaperBlockKind.NARRATIVE_PARAGRAPH,
    PaperBlockKind.FIGURE_CAPTION,
    PaperBlockKind.TABLE_CAPTION,
    PaperBlockKind.TABLE_BODY_TEXT,
)


def build_default_chunk_version(
    *,
    source_revision_keys: Sequence[str],
    parser_version: str,
    embedding_model: str | None = None,
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
) -> PaperChunkVersionRecord:
    """Return the sanctioned first chunk-version policy."""

    tokenizer_name, tokenizer_version = default_chunk_tokenizer_metadata(
        embedding_model=embedding_model
    )
    return PaperChunkVersionRecord(
        chunk_version_key=chunk_version_key,
        source_revision_keys=_sorted_unique_strings(source_revision_keys),
        parser_version=parser_version,
        text_normalization_version=DEFAULT_TEXT_NORMALIZATION_VERSION,
        sentence_source_policy=[
            SentenceSegmentationSource.S2ORC_ANNOTATION,
            SentenceSegmentationSource.STANZA_BIOMEDICAL,
            SentenceSegmentationSource.SYNTOK,
            SentenceSegmentationSource.DETERMINISTIC_FALLBACK,
        ],
        included_section_roles=list(DEFAULT_INCLUDED_SECTION_ROLES),
        included_block_kinds=list(DEFAULT_INCLUDED_BLOCK_KINDS),
        caption_merge_policy=CaptionMergePolicy.STRUCTURAL_CONTEXT,
        tokenizer_name=tokenizer_name,
        tokenizer_version=tokenizer_version,
        target_token_budget=DEFAULT_TARGET_TOKEN_BUDGET,
        hard_max_tokens=DEFAULT_HARD_MAX_TOKENS,
        sentence_overlap_policy=SentenceOverlapPolicy.NONE,
        embedding_model=embedding_model,
        retrieval_default_only=True,
    )
```

**Why this matters**:

- Chunking can evolve without changing canonical document structure.
- Version keys make runtime grounding and backfill behavior explicit.
- Token budget, overlap, and included block kinds are policy, not parser facts.

---

## 21. Chunk Assembly: Build Chunks From Canonical Blocks And Sentences

The chunker runs over canonical block and sentence rows, not over raw source files.

**Source**:
- [`engine/app/rag_ingest/chunking.py`](../../engine/app/rag_ingest/chunking.py)

```python
def assemble_structural_chunks(
    *,
    version: PaperChunkVersionRecord,
    blocks: list[PaperBlockRecord],
    sentences: list[PaperSentenceRecord],
    sections: Sequence[SectionLike] | None = None,
    token_counter: Callable[[str], int] | None = None,
    token_budgeter: ChunkTokenBudgeter | None = None,
) -> ChunkAssemblyResult:
    """Assemble derived retrieval chunks from canonical spans."""

    active_token_budgeter = token_budgeter or build_chunk_token_budgeter(
        tokenizer_name=version.tokenizer_name,
        embedding_model=version.embedding_model,
    )
    sentence_rows_by_block: dict[int, list[PaperSentenceRecord]] = {}
    for sentence in sorted(sentences, key=lambda item: (item.block_ordinal, item.sentence_ordinal)):
        if (
            version.sentence_source_policy
            and sentence.segmentation_source not in version.sentence_source_policy
        ):
            continue
        sentence_rows_by_block.setdefault(sentence.block_ordinal, []).append(sentence)

    def block_retrieval_text(block: PaperBlockRecord) -> str:
        sentence_text = " ".join(
            sentence.text.strip()
            for sentence in sentence_rows_by_block.get(block.block_ordinal, [])
            if sentence.text.strip()
        ).strip()
        if sentence_text:
            return sentence_text
        return block.text.strip()

    eligible_blocks = []
    for block in sorted(blocks, key=lambda item: (item.section_ordinal, item.block_ordinal)):
        if block.section_role not in version.included_section_roles:
            continue
        if block.block_kind not in version.included_block_kinds:
            continue
        if version.retrieval_default_only and not block.is_retrieval_default:
            continue
        if not block_retrieval_text(block):
            continue
        eligible_blocks.append(block)

    result = ChunkAssemblyResult()
    section_contexts = build_section_contexts(list(sections or []))
    block_class_cache: dict[int, NarrativeBlockClass] = {}

    def narrative_block_class(block: PaperBlockRecord) -> NarrativeBlockClass:
        cached = block_class_cache.get(block.block_ordinal)
        if cached is not None:
            return cached
        block_class = classify_narrative_block(
            block=block,
            section_context=section_contexts.get(block.section_ordinal),
            token_budgeter=active_token_budgeter,
        )
        block_class_cache[block.block_ordinal] = block_class
        return block_class

    # The remainder of the function builds block slices, bridges weak context,
    # appends chunk rows, and emits chunk-member lineage rows.
```

**What to preserve**:

- Chunks are derived from canonical blocks and sentences.
- Sentence-source policy filters sentence rows before chunk assembly.
- Retrieval-default gating is applied once here, centrally.
- Chunk lineage stays attached to canonical block/sentence ordinals.

---

## 22. Warehouse Write Batches: Canonical Rows First, Chunks Second

The write-batch builder converts a grounding plan into rows for the warehouse.

**Source**:
- [`engine/app/rag_ingest/write_batch_builder.py`](../../engine/app/rag_ingest/write_batch_builder.py)

```python
def build_write_batch_from_grounding_plan(
    plan: GroundingSourcePlan,
    *,
    source_citation_keys: Sequence[str] | None = None,
    chunk_version: PaperChunkVersionRecord | None = None,
) -> RagWarehouseWriteBatch:
    primary = plan.primary_source
    corpus_id = primary.document.corpus_id
    citations, entities = build_aligned_mention_rows_from_plan(
        plan,
        source_citation_keys=source_citation_keys,
    )
    references = [
        PaperReferenceEntryRow(
            corpus_id=reference.corpus_id,
            reference_ordinal=reference.reference_ordinal,
            source_reference_key=reference.source_reference_key,
            text=reference.text,
            matched_paper_id=reference.matched_paper_id,
            matched_corpus_id=reference.matched_corpus_id,
        )
        for reference in primary.references
    ]
    citations = _sanitize_citation_reference_links(
        citations,
        references=references,
    )

    batch = RagWarehouseWriteBatch(
        documents=[
            PaperDocumentRow(
                corpus_id=corpus_id,
                title=primary.document.title,
                language=primary.document.language,
                source_availability=primary.document.source_availability,
                primary_source_system=primary.document.source_system,
            )
        ],
        document_sources=_build_document_source_rows(plan),
        sections=[PaperSectionRow(...) for section in primary.sections],
        blocks=[PaperBlockRow(...) for block in primary.blocks],
        sentences=[PaperSentenceRow(...) for sentence in primary.sentences],
        references=references,
        citations=citations,
        entities=entities,
    )
    if chunk_version is None:
        return batch
    return extend_write_batch_with_structural_chunks(
        batch,
        chunk_version=chunk_version,
    )
```

**Why this matters**:

- Canonical rows are written from the primary structural source.
- Citation/entity mention rows are aligned rows, not parser-local offsets.
- Chunk rows are appended as derived serving rows, not mixed into the canonical
  source-writing logic.

---

## 23. Warehouse Writer: Persist Grounding Plans, Not Random Source Objects

The writer ingests `GroundingSourcePlan`, not arbitrary parser output.

**Source**:
- [`engine/app/rag_ingest/warehouse_writer.py`](../../engine/app/rag_ingest/warehouse_writer.py)

```python
class RagWarehouseWriter:
    """Build and persist canonical warehouse rows from parsed source inputs."""

    def __init__(self, repository: RagWarehouseBatchWriter | None = None):
        self._repository = repository or PostgresRagWriteRepository()

    def ingest_grounding_plan(
        self,
        plan: GroundingSourcePlan,
        *,
        source_citation_keys: Sequence[str] | None = None,
        chunk_version: PaperChunkVersionRecord | None = None,
        replace_existing: bool = False,
    ) -> RagWarehouseIngestResult:
        batch = build_write_batch_from_grounding_plan(
            plan,
            source_citation_keys=source_citation_keys,
            chunk_version=chunk_version,
        )
        execution = self._repository.apply_write_batch(
            batch,
            replace_existing=replace_existing,
        )
        return RagWarehouseIngestResult(
            corpus_id=plan.primary_source.document.corpus_id,
            primary_source_system=plan.primary_source.document.source_system,
            primary_reason=plan.primary_reason,
            annotation_source_systems=[
                source.document.source_system for source in plan.annotation_sources
            ],
            batch_total_rows=execution.total_rows,
            written_rows=execution.written_rows,
            deferred_stage_names=[
                stage.stage for stage in execution.stages if stage.status == "deferred"
            ],
        )
```

**Why this matters**:

- The precedence decision is already resolved before writing starts.
- Write execution returns structured ingest metadata.
- Deferred stages are visible as part of the ingest result contract.

---

## 24. Runtime Evaluation: Treat Latency And Grounding As First-Class Outputs

The evaluation harness is part of the architecture. It builds a live service,
runs cases, captures routing state, and stores per-case stage timings and
grounding coverage.

**Source**:
- [`engine/app/rag_ingest/runtime_eval_execution.py`](../../engine/app/rag_ingest/runtime_eval_execution.py)

### 24.1 Build a runtime service for evaluation

```python
def build_runtime_service(
    *,
    chunk_version_key: str,
    connect: Callable[..., object] | None = None,
) -> RagService:
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    warehouse_grounder = partial(
        build_grounded_answer_from_runtime,
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    return RagService(repository=repository, warehouse_grounder=warehouse_grounder)
```

### 24.2 Evaluate query cases

```python
def evaluate_runtime_query_cases(
    *,
    graph_release_id: str,
    chunk_version_key: str,
    cases: Sequence[RuntimeEvalQueryCase],
    k: int = 5,
    rerank_topn: int = 10,
    use_lexical: bool = True,
    use_dense_query: bool = True,
    connect: Callable[..., object] | None = None,
    service: RagService | None = None,
) -> list[RuntimeEvalCaseResult]:
    active_service = service or build_runtime_service(
        chunk_version_key=chunk_version_key,
        connect=connect,
    )
    results: list[RuntimeEvalCaseResult] = []

    for case in cases:
        request = build_runtime_eval_request(
            graph_release_id=graph_release_id,
            case=case,
            k=k,
            rerank_topn=rerank_topn,
            use_lexical=use_lexical,
            use_dense_query=use_dense_query,
        )
        internal_result = active_service.search_result(
            request,
            include_debug_trace=True,
        )
        response = serialize_search_result(internal_result)
        debug_trace = internal_result.debug_trace if internal_result is not None else {}
        session_flags = debug_trace.get("session_flags", {})
        route_signature = _route_signature(session_flags)
        top_corpus_ids = [bundle.paper.corpus_id for bundle in response.evidence_bundles]

        results.append(
            RuntimeEvalCaseResult(
                corpus_id=case.corpus_id,
                query_family=case.query_family,
                query=case.query,
                evidence_bundle_count=len(response.evidence_bundles),
                top_corpus_ids=top_corpus_ids,
                answer_present=bool(response.answer),
                grounded_answer_present=response.grounded_answer is not None,
                stage_durations_ms=debug_trace.get("stage_durations_ms", {}),
                stage_call_counts=debug_trace.get("stage_call_counts", {}),
                candidate_counts=debug_trace.get("candidate_counts", {}),
                session_flags=session_flags,
                route_signature=route_signature,
                service_duration_ms=float(internal_result.duration_ms),
            )
        )
    return results
```

**Why this matters**:

- Evaluation runs the real runtime service, not a synthetic approximation.
- Route signatures and stage timings are part of the measurable contract.
- Grounding presence, answer linkage, and latency are all captured per case.

---

## 25. If You Had To Recreate This Pipeline, Implement In This Order

### 25.1 Runtime

1. Recreate the request and response transport contracts.
2. Recreate `build_query`.
3. Recreate `RetrievalSearchPlan` and `build_search_plan`.
4. Recreate the `RagRepository` protocol.
5. Recreate `PostgresRagRepository.search_session`.
6. Recreate lexical title precheck, chunk lexical, paper lexical fallback, dense
   query, semantic neighbor, entity seed, and relation seed retrieval lanes.
7. Recreate `merge_candidate_papers`.
8. Recreate `rank_paper_hits`.
9. Recreate `build_baseline_answer_payload`.
10. Recreate `build_grounded_answer_from_runtime`.

### 25.2 Ingest

1. Recreate `ParsedPaperSource`.
2. Recreate S2 abstract, S2ORC, and BioCXML adapters.
3. Recreate `select_primary_text_source` and `build_grounding_source_plan`.
4. Recreate mention alignment into canonical block/sentence ordinals.
5. Recreate `build_default_chunk_version`.
6. Recreate `assemble_structural_chunks`.
7. Recreate `build_write_batch_from_grounding_plan`.
8. Recreate `RagWarehouseWriter`.

### 25.3 Validation

1. Recreate `build_runtime_service`.
2. Recreate `evaluate_runtime_query_cases`.
3. Preserve debug traces, stage durations, candidate counts, and route signatures.

---

## 26. The Non-Negotiable Architectural Rules

If an agent copies only the code snippets but misses these rules, it will
recreate the wrong system.

1. Papers are the primary retrieval identity; chunks are a retrieval channel and
   a grounding surface.
2. Canonical structure lives in normalized warehouse rows, not in runtime parsing.
3. One primary structural source defines ordinals; other sources are overlays.
4. Retrieval routing is query-shape-aware.
5. Expensive dense and reranker paths are bounded and optional.
6. Final ranking is centralized.
7. Grounding is coverage-gated.
8. Evaluation is part of the architecture.

That is the shortest accurate description of the implementation shape.
