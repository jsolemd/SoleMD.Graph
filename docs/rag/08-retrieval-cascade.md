# 08 — Retrieval Cascade

> **Status**: locked for the cascade shape — five named stages
> (Stage 0 query encoding → Stage 1 lane fusion → Stage 2 cross-encoder
> rerank → Stage 3 parent-child promotion → Stage 4 grounding
> dereference), the request/response contract for `POST /api/retrieve`,
> the active-run resolution rule, the lane-choosing heuristic, the
> filter-pushdown rule, and the failure-class taxonomy. Microdesign
> values (per-stage millisecond budgets, top-N at each stage, Redis
> query-vector cache TTL, cross-encoder batch size, `ef_search` per
> lane, OpenTelemetry / Langfuse span field set) are **provisional
> until the first sample cascade run** validates them on real
> production-shape traffic.
>
> **Date**: 2026-04-16
>
> **Scope**: the engine-side request-time orchestrator that turns one
> user query into a ranked, grounded list of papers (and, for the
> evidence lane, evidence-unit hits carrying sentence/block
> coordinates). Owns the FastAPI
> handler `POST /api/retrieve`, the five Pydantic models in
> `engine/app/models/retrieval/`, the asyncpg-on-`serve_read` reads,
> the OpenSearch hybrid call, the GPU-side MedCPT encoder + cross-
> encoder calls, the bounded FDW dereference, and the cascade-level
> Langfuse trace. **Does not** own:
>
> - OpenSearch index mappings, ingest pipelines, search pipelines,
>   bulk-load mechanics, alias-swap cutover — `07-opensearch-plane.md`.
> - Cohort lifecycle, projection mechanics, active-pointer write
>   semantics — `04-projection-contract.md`.
> - Serve schema (cards, profiles, control tables, FDW contract) —
>   `03-serve-schema.md`.
> - Warehouse grounding spine (`paper_evidence_units`,
>   `paper_sentences`, etc.) — `02-warehouse-schema.md`.
> - Pool topology, Pydantic-at-the-boundary helpers, FastAPI lifespan,
>   Dramatiq actor patterns — `06-async-stack.md`.
> - Observability dashboards, alert rules, Prometheus exporters —
>   `10-observability.md`. This doc emits the requirements; `10`
>   surfaces them.
> - LLM-side answer synthesis (the cascade returns ranked grounded
>   papers; an LLM generator above this layer is out of scope today).
>
> **Schema authority**: PG-native authority for the `RankedPaper` /
> `EvidenceHit` Pydantic models, the FastAPI handler, and the
> orchestrator under `engine/app/retrieval/`. Engine code there
> derives from this doc.

## Purpose

Define the four-stage cascade so every consumer — Next.js search UI,
RAG benchmark suite (`research-distilled §6`), Langfuse evaluator —
resolves request shape, lane choice, latency budget, failure mode,
and observability hooks against the same contract.

Eight load-bearing properties:

1. **One endpoint, one wire contract.** `POST /api/retrieve` returns a
   list of `RankedPaper` plus a Langfuse `trace_id` and a per-stage
   timing dict. Streaming and multi-turn are explicit non-goals today
   (§2.4). (§2)
2. **Four engine-orchestrated stages.** Stage 0 query encode (engine /
   GPU) → Stage 1 lane fusion in OpenSearch (cite `07 §5`) → Stage 2
   cross-encoder rerank (engine / GPU) → Stage 3 parent-child promotion
   (engine / CPU) → Stage 4 grounding dereference (engine / FDW). Each
   stage is a named function on a single orchestrator object. (§3–§7)
3. **Active-run resolution is a single fetch at request start.** One
   `SELECT … FROM solemd.active_runtime_pointer`; the captured triple
   `(serving_run_id, graph_run_id, api_projection_run_id)` is carried
   through the request and never re-read mid-cascade. Pointer flips
   between requests are invisible to in-flight requests; new requests
   pick up new state. (§9)
4. **Lane choice is explicit and cheap.** `lane='paper'` is the
   default and covers warm + hot via the `paper_index` `tier` field;
   `lane='evidence'` implies `hot_only=True` and targets
   `evidence_index` for hot-only evidence-unit retrieval with
   sentence/block-coordinated grounding. (§10)
5. **Filters push down to OpenSearch.** Engine never re-filters
   results pulled from OpenSearch. The `07 §5.6` filter contract is
   trusted; the cascade's job is ranking, not policy enforcement on
   already-returned candidates. (§11)
6. **Failure classes are explicit, not ad-hoc.** Five named failure
   classes (`encoder_unavailable`, `opensearch_unavailable`,
   `fdw_unavailable`, `pointer_unavailable`, `cross_encoder_unavailable`)
   each have a deterministic recovery path that is testable. The
   cascade never silently degrades — every degraded response carries a
   structured flag the client can render. (§12)
7. **Caching is bounded and observable.** Redis query-vector cache
   keyed by `hash(query_text + encoder_revision)`, 1 h TTL, single
   purpose (cold-encode amortization). No multi-stage cache, no
   per-paper cache, no LLM-output cache. (§13)
8. **One Langfuse trace, five spans.** Every cascade emits one trace
   with five named spans (Stage 0–4). Per-span input size, output
   size, latency, model versions, redacted query. Cascade-level
   redaction is a hard contract; PHI never leaves the engine
   process. (§15)

## §0 Conventions delta from `06` / `07`

Inherits every convention from `00`, `02 §0`, `03 §0`, `04 §0`,
`06 §0`, `07 §0`, and `research-distilled §6`. The cascade adds:

| Concern | This doc adds |
|---|---|
| **Stage naming** | `Stage 0 — Query Encoding`, `Stage 1 — Lane Fusion`, `Stage 2 — Cross-Encoder Rerank`, `Stage 3 — Parent-Child Promotion`, `Stage 4 — Grounding Dereference`. The names are load-bearing — Langfuse spans, Prometheus labels, structured-log events, and the per-stage timing dict in the response all key off them. **locked**. |
| **Per-stage span shape** | Every stage emits one Langfuse span with a fixed field set (§15.2). Cross-stage joins (cohort drift, encoder revision drift) are reconstructable from spans alone — no separate join table needed in observability. **locked** for the field set; **provisional** for exact attribute names. |
| **Lane-choosing heuristic rule** | `lane='paper'` is the always-default; the engine never auto-promotes a request to `lane='evidence'`. Caller opt-in is the only path. The rule is explicit so the request shape stays predictable. (§10) **locked**. |
| **Graceful-degradation failure-class taxonomy** | Five named classes + a deterministic recovery path per class (§12). No "best effort" silent degradation — every degraded response carries a flag. **locked**. |
| **Cohort stability within a request** | Active-pointer triple captured once at request start; the request completes against that snapshot even if `04 §3.5` flips the pointer mid-flight. Next request sees the new pointer. No mid-request re-resolution. (§9) **locked**. |

## §1 Identity / boundary types

No new identity types. The cascade composes existing identities:

| Identity | Source doc | Cascade role |
|---|---|---|
| `corpus_id` BIGINT | `02 §2` | `RankedPaper.corpus_id`; `_id` of `paper_index` docs (`07 §1`); join key into `paper_api_cards` / `paper_api_profiles` (`03 §4.2`); join key into `warehouse_grounding.paper_sentences` (`03 §3.2`). |
| `evidence_key` UUIDv5 | `02 §2` | `EvidenceHit.evidence_key`; `_id` of `evidence_index` docs (`07 §1`); join key into `warehouse_grounding.paper_evidence_units` (`03 §3.3`). Content-bound, so OpenSearch hits resolve cleanly across a cohort cutover. |
| `serving_run_id` UUIDv7 | `03 §2` | Request-scoped snapshot variable; emitted on every Langfuse span and on every structured log event for cross-cohort drift diagnosis (`04 §11.1` cohort-drift audit). |
| `graph_run_id` UUIDv7 | `03 §2` | Request-scoped snapshot; surfaced on `RankedPaper.paper_api_card.current_graph_run_id` for client-side graph-aware rendering. |
| `api_projection_run_id` UUIDv7 | `03 §2` | Request-scoped snapshot; logged for "which projection cycle's cards were served" audit. Not in the response body — debug surface only. |
| `chunk_version_key` UUIDv7 | `02 §2` | Carried on `EvidenceHit` for grounding-version audit; the FDW dereference uses `evidence_key` directly per `07 §9`. |

The `RankedPaper` and `EvidenceHit` Pydantic v2 models live under
`engine/app/models/retrieval/` per `06 §4.4` directory conventions
(one file per family). Full models in §2.

## §2 Request / response schema

Full Pydantic v2 models. Every model is `frozen=True` per `06 §4.5`
hot-path performance rule. Field order is MAXALIGN-irrelevant
(in-memory only) but is grouped by logical family for readability.

### 2.1 Request — `RetrieveRequest`

```python
# engine/app/models/retrieval/request.py
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator


class RetrievalFilter(BaseModel):
    """Inline filter shape; mirrors `07 §14.1 PaperFilter` /
    `07 §14.3 EvidenceFilter`. Engine builds the OpenSearch wire
    payload from this single Pydantic model so paper-lane and
    evidence-lane filters never drift (§11)."""
    model_config = ConfigDict(frozen=True)

    publication_year_gte: int | None = Field(default=None, ge=1500, le=2100)
    publication_year_lte: int | None = Field(default=None, ge=1500, le=2100)
    is_retracted:         bool | None = False        # default excludes retracted
    package_tier_in:      list[int] | None = None    # legacy product-tier (orthogonal to warm/hot)
    venue_in:             list[str] | None = None    # `paper_index.venue_display` keyword
    concept_ids_any:      list[int] | None = None    # OR semantics over concept_ids[_top]
    corpus_ids_in:        list[int] | None = None    # parent-restrict; evidence-lane only


class RetrieveRequest(BaseModel):
    """POST /api/retrieve body."""
    model_config = ConfigDict(frozen=True, extra="forbid")

    query_text:    str = Field(min_length=1, max_length=2048)
    k:             int = Field(default=10, ge=1, le=100)            # final ranked-paper count
    lane:          Literal["paper", "evidence"] = "paper"
    hot_only:      bool = False                                     # implies tier_in=[2]
    filter:        RetrievalFilter = RetrievalFilter()
    cohort_id:     int | None = None                                # explicit cohort pin; default = active

    # Diagnostic / power-user knobs (default off):
    explain:       bool = False                                     # benchmark/debug only: asks OpenSearch for rank-breakdown payloads on the debug pipeline plus rerank-score payloads
    skip_rerank:   bool = False                                     # debug: skip Stage 2; useful for A/B vs no-rerank baseline
    ef_search_override: int | None = Field(default=None, ge=10, le=2000)

    @model_validator(mode="after")
    def _enforce_lane_invariants(self) -> "RetrieveRequest":
        # lane='evidence' implies hot_only=True (07 §3.3 / §10).
        if self.lane == "evidence" and not self.hot_only:
            object.__setattr__(self, "hot_only", True)
        # corpus_ids_in is evidence-lane only.
        if self.lane == "paper" and self.filter.corpus_ids_in is not None:
            raise ValueError("corpus_ids_in is only valid for lane='evidence'")
        return self
```

### 2.2 Response — `RetrieveResponse`

```python
# engine/app/models/retrieval/response.py
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict

from app.models.serve.projection import PaperApiCard


class EvidenceHit(BaseModel):
    """One evidence-unit hit carrying sentence/block coordinates.
    Only present on lane='evidence'."""
    model_config = ConfigDict(frozen=True)

    evidence_key:           UUID
    sentence_range:         tuple[int, int]            # (sentence_start_ordinal, sentence_end_ordinal)
    chunk_text:             str                        # evidence-unit text surface, dereferenced from warehouse via FDW (§7)
    chunk_rerank_score:     float                      # MedCPT cross-encoder score (Stage 2)
    section_role:           int                        # smallint enum from 02 §0.10 registry
    grounding_degraded:     bool = False               # True if FDW dereference partially failed (§12.3)


class RankedPaper(BaseModel):
    """One ranked paper. The cascade output unit."""
    model_config = ConfigDict(frozen=True)

    corpus_id:      int
    rank:           int                                 # 1-indexed; matches list order
    rerank_score:   float                               # Stage 2 calibrated cross-encoder score
    rrf_score:      float                               # Stage 1 OpenSearch RRF score (07 §5.1)
    paper_api_card: PaperApiCard                        # 03 §4.2 narrow row; PG-projected
    grounding_level: Literal["paper", "evidence"]       # "paper" = paper-level support only; "evidence" = at least one resolved EvidenceHit
    evidence_hits:  list[EvidenceHit] | None = None     # only for lane='evidence'; ≤ 3 per paper (§6)
    grounding_degraded: bool = False                    # mirrors per-paper degradation flag


class CascadeTimings(BaseModel):
    """Per-stage wall-clock; ms with one decimal."""
    model_config = ConfigDict(frozen=True)

    stage_0_query_encoding_ms:        float
    stage_1_lane_fusion_ms:           float
    stage_2_cross_encoder_rerank_ms:  float
    stage_3_parent_child_promotion_ms: float
    stage_4_grounding_dereference_ms: float
    total_ms:                         float


class RetrieveResponse(BaseModel):
    """POST /api/retrieve response body."""
    model_config = ConfigDict(frozen=True)

    ranked:           list[RankedPaper]
    trace_id:         UUID                              # Langfuse trace id for the cascade
    cascade_timings:  CascadeTimings
    serving_run_id:   UUID                              # active-pointer snapshot (§9)
    lane:             Literal["paper", "evidence"]
    grounding_level:  Literal["paper", "evidence"]      # strongest grounding level present in the ranked packet
    degraded:         dict[str, bool] = {}              # e.g. {"dense_lane_skipped": True, "cross_encoder_skipped": True}
```

Grounding-level rule:

- `RankedPaper.grounding_level = "evidence"` when the paper has at
  least one resolved `EvidenceHit` after Stage 4.
- `RankedPaper.grounding_level = "paper"` for warm-tier paper support
  and for degraded evidence-lane rows that fell back to card-only
  support.
- `RetrieveResponse.grounding_level` is the strongest grounding level
  present in the ranked packet: `"evidence"` if any ranked paper is
  evidence-grounded, otherwise `"paper"`.

### 2.3 FastAPI handler

```python
# engine/app/api/routes/retrieval.py
from fastapi import APIRouter, HTTPException
from app.api.dependencies import ServeReadPool       # 06 §5.2 Annotated[Pool, Depends]
from app.models.retrieval.request  import RetrieveRequest
from app.models.retrieval.response import RetrieveResponse
from app.retrieval.cascade import RetrievalCascade
from app.opensearch.client import os_client
from app.retrieval.query_encoder  import query_encoder       # MedCPT-Query-Encoder, GPU-resident
from app.retrieval.cross_encoder  import cross_encoder       # MedCPT-Cross-Encoder, GPU-resident
from app.retrieval.cache import redis_query_cache            # §13
from app.observability.langfuse import langfuse_trace        # §15

router = APIRouter()


@router.post("/api/retrieve", response_model=RetrieveResponse)
async def retrieve(req: RetrieveRequest, pool: ServeReadPool) -> RetrieveResponse:
    """Five-stage cascade. See 08 §3–§7."""
    cascade = RetrievalCascade(
        serve_read_pool=pool,
        os=os_client(),
        query_encoder=query_encoder,
        cross_encoder=cross_encoder,
        cache=redis_query_cache,
        tracer=langfuse_trace,
    )
    try:
        return await cascade.run(req)
    except CascadeFatal as e:
        # Only fatal classes raise (e.g. opensearch_unavailable).
        # All recoverable classes return a degraded RetrieveResponse.
        raise HTTPException(status_code=e.http_status, detail=e.error_class) from e
```

### 2.4 Explicit non-goals (deferred)

- **Streaming responses (SSE / WebSocket).** Cascade end-to-end is
  ~200–400 ms p95; streaming complexity isn't worth shaving the first
  paint when total budget is sub-second. **deferred** — revisit when
  end-to-end latency exceeds 1 s or LLM-side answer synthesis lands
  on top of the cascade.
- **Multi-turn / conversational memory.** Each request is independent;
  the cascade has no notion of session, history, or carry-over filters.
  **deferred** — owned by a future LLM-orchestration layer above the
  cascade, not by the cascade itself.
- **User-specific ranking signals.** No user data plane exists today
  per `00 §6` deferred Better Auth plan; no per-user weights, saved-
  papers boost, or follow signals. **deferred** — when `13-auth.md`
  lands.
- **Cross-lane fusion in one request.** `lane='paper'` and
  `lane='evidence'` are independent calls today. A combined call that
  fuses paper-lane and evidence-lane hits in one response is
  **deferred** — caller can issue both in parallel and fuse client-
  side meanwhile.
- **Caller-supplied query vector.** All callers supply `query_text`
  only; the engine owns the encoder. Sneaking a precomputed vector
  through the request would couple callers to the encoder revision
  and break Langfuse trace consistency. **locked**.

## §3 Stage 0 — Query encoding

**Owner**: engine FastAPI process; calls into the GPU-resident
MedCPT-Query-Encoder via the engine's encoder RPC (per `07 §6.1`,
encoders live in engine FastAPI on the RTX 5090, not in OpenSearch
ML Commons). The locked baseline uses the official MedCPT asymmetry:
the query encoder for queries, the article encoder for indexed
documents. Any symmetric-query experiment is benchmark-only and does
not change this contract.

**Input**: `query_text: str`.
**Output**: `query_vector: list[float]` (768d, L2-normalized so
`07 §6.2 space_type=innerproduct` matches cosine).

### 3.1 Cache-first path

```python
# engine/app/retrieval/query_encoder.py — sketch
import hashlib
from typing import Final

import numpy as np
from app.retrieval.cache import redis_query_cache
from app.observability.metrics import metric_query_cache_hits, metric_query_cache_misses

ENCODER_REVISION: Final[str] = "medcpt-query-encoder-v1"  # bumped on model swap; see §13
CACHE_TTL_SECONDS: Final[int] = 60 * 60                  # §13 — 1 h


def _cache_key(query_text: str) -> str:
    """SHA-256 hex over (encoder_revision || '\\0' || query_text). Encoder
    revision in the key invalidates cache entries on encoder swap."""
    h = hashlib.sha256()
    h.update(ENCODER_REVISION.encode("utf-8"))
    h.update(b"\0")
    h.update(query_text.encode("utf-8"))
    return f"qvec:{h.hexdigest()}"


async def encode_query(query_text: str) -> tuple[np.ndarray, bool]:
    """Returns (768d float32 vector, cache_hit_bool). L2-normalized."""
    key = _cache_key(query_text)
    cached = await redis_query_cache.get(key)
    if cached is not None:
        metric_query_cache_hits.inc()
        return np.frombuffer(cached, dtype=np.float32), True

    metric_query_cache_misses.inc()
    # Engine GPU RPC. Synchronous on the engine side; under contention
    # with graph-build / projection, falls back to a CPU MedCPT-distill
    # variant (§12.1).
    vec = await _encode_on_gpu(query_text)             # ~30–50 ms cold
    vec = vec / np.linalg.norm(vec)                    # 07 §6.2 — L2-normalize
    await redis_query_cache.set(key, vec.astype(np.float32).tobytes(), ex=CACHE_TTL_SECONDS)
    return vec, False
```

### 3.2 Latency budget

- **Cache hit**: < 1 ms (Redis GET on shared-infra Docker network +
  `np.frombuffer`).
- **Cache miss, GPU-resident encoder, batch-of-1**: 30–50 ms.
- **Cache miss, CPU MedCPT-distill fallback** (§12.1): 100–250 ms.

The 1-hour TTL is a conservative middle ground for deterministic query
embeddings. Redis' own embedding-cache guidance allows no expiration at
all when you key by model identity, while Redis' eviction guidance
explicitly warns that TTLs that are too short show up as unnecessary
`expired_keys` and depressed hit rate. No effort is made to dedupe
near-identical queries (typo recovery, capitalization); a dedicated
query-rewrite stage above the cascade owns that. **provisional**.

### 3.3 BM25 query string

Stage 0 also produces the BM25 query string for Stage 1's lexical lane.
Today this is just `query_text` verbatim — the OpenSearch
`biomedical_text` analyzer (`07 §3.1`) handles tokenization,
lowercasing, asciifolding, synonym expansion, and stemming. The engine
does **not** pre-tokenize — that would diverge from the index-time
analyzer and silently break recall on synonym-heavy queries.

If a future query-rewrite stage (deferred) lands above the cascade, it
emits the rewritten BM25 string into the same field; the cascade does
not concern itself with rewriting policy.

## §4 Stage 1 — Lane fusion (delegate to `07 §5`)

**Owner**: OpenSearch cluster (single-node `graph-opensearch` per
`07 §2`); the engine sends the request and consumes the response.

**Input**: `query_text` (BM25 lane) + `query_vector` (dense lane) +
`RetrievalFilter` (engine builds the wire payload per `07 §5.6` filter
contract) + `lane` (`paper` → `paper_index_live`; `evidence` →
`evidence_index_live`).
**Output**: top-200 candidates (paper lane) or top-100 candidates
(evidence lane), already RRF-fused inside OpenSearch via the
`solemd_hybrid_rrf` search pipeline (`07 §5.1`).

### 4.1 Wire shape

The engine constructs the wire payload from `engine/app/opensearch/queries.py`
(per `07 §14`). Request is one HTTP POST per lane; the cascade only
issues one (no cross-lane fan-out at Stage 1 — that happens client-side
or via a future combined-lane request, deferred per §2.4).

```python
# engine/app/retrieval/cascade.py — Stage 1 sketch
from app.opensearch.queries import build_paper_lane_request, build_evidence_lane_request

async def _stage_1_lane_fusion(self, req, query_vector, snapshot):
    if req.lane == "paper":
        os_req = build_paper_lane_request(
            query_text=req.query_text,
            query_vector=query_vector.tolist(),
            k=200,
            ef_search=req.ef_search_override or 100,
            filter=req.filter,
            tier_in=[2] if req.hot_only else [1, 2],          # §10
            search_pipeline="solemd_hybrid_rrf",
        )
        os_resp = await self.os.search(
            index="paper_index_live", body=os_req,           # 07 §0 — alias only
        )
        return _parse_paper_lane_response(os_resp)
    else:                                                     # lane='evidence'
        os_req = build_evidence_lane_request(
            query_text=req.query_text,
            query_vector=query_vector.tolist(),
            k=100,
            ef_search=req.ef_search_override or 100,
            filter=req.filter,
            search_pipeline="solemd_hybrid_rrf",
        )
        os_resp = await self.os.search(
            index="evidence_index_live", body=os_req,
        )
        return _parse_evidence_lane_response(os_resp)
```

### 4.2 What this stage does NOT do

- **No engine-side fusion.** RRF runs inside OpenSearch via the
  `score-ranker-processor` (`07 §5.1`). Engine never sees BM25 and
  KNN rank-breakdown payloads separately unless `req.explain=True`
  on the benchmark/debug pipeline.
- **No re-filtering.** Filters applied at index-time on OpenSearch are
  trusted (§11). Engine doesn't re-check `is_retracted`,
  `publication_year`, or `tier` on the returned candidates.
- **No enrichment.** OpenSearch returns ID + score + a small set of
  routing fields per `07 §5.3 _source` (e.g. `package_tier`,
  `evidence_priority_score`). Card-shaped fields come from PG via
  `paper_api_cards` at Stage 4.

### 4.3 Latency budget

Per `07 §13` (engine FastAPI hot-path budget):

- Paper-lane hybrid retrieve: < 50 ms p95.
- Evidence-lane hybrid retrieve: < 100 ms p95 (smaller index, but
  cross-encoder rerank consumes more candidates).

End-to-end Stage 1: 50–150 ms typical. Outliers triggered by:
- Cold k-NN graph (post-cutover, before `_warmup` per `07 §7.4`).
- `circuit_breaking_exception` on the k-NN sub-query (§12.5 → BM25-only
  fallback).
- Pathological filter selectivity that pushes the engine helper onto its
  locally-benchmarked fallback path per `07 §5.6`.

## §5 Stage 2 — Cross-encoder rerank

**Owner**: engine FastAPI process; calls into the GPU-resident
MedCPT-Cross-Encoder.

**Input**: top-30 of Stage 1's output (paper lane: 30 best papers;
evidence lane: 30 best chunks). Each candidate carries `query_text` +
the candidate's reranking text (paper title+abstract for paper lane;
chunk_text for evidence lane).
**Output**: top-30 reordered with calibrated cross-encoder relevance
scores (`real`-precision, monotonic with relevance).

### 5.1 Why top-30, not top-200

MedCPT-Cross-Encoder runs at ~50× the per-pair cost of bi-encoder
retrieval (`07 §6.1` — the reason cross-encoder lives engine-side, not
in OpenSearch). At 80 ms p95 GPU budget on the RTX 5090, top-30 is the
sweet spot:

- **Top-30 throughput**: one batch on the 5090 (batch=32 with one
  pad slot), ~80 ms.
- **Top-100**: ~3 batches → ~250 ms; would blow the cascade budget.
- **Top-10**: under-uses the bi-encoder's recall headroom from Stage 1.

Community retrieve-and-rerank guidance often reranks on the order of
100 candidates, but that is a generic quality-first default, not a
host-specific latency budget. On this workstation, top-30 is the local
latency-shaped starting point for a sub-second biomedical cascade: it
fits one batch on the RTX 5090 while still leaving headroom above
top-10. **provisional** — revisit after first benchmark suite run.

### 5.2 Sketch

```python
# engine/app/retrieval/cross_encoder.py — sketch
from dataclasses import dataclass
import numpy as np

CROSS_ENCODER_TOP_N = 30        # §5.1; provisional


@dataclass(frozen=True, slots=True)
class RerankCandidate:
    doc_id: str                  # corpus_id (paper lane) or evidence_key (evidence lane)
    rerank_text: str             # paper title+abstract (paper lane) or chunk_text (evidence lane)
    rrf_score: float             # Stage 1 RRF score; carried for response


async def rerank(query_text: str,
                 candidates: list[RerankCandidate]) -> list[tuple[str, float]]:
    """Returns [(doc_id, calibrated_score), ...] reordered descending."""
    top = candidates[:CROSS_ENCODER_TOP_N]
    pairs = [(query_text, c.rerank_text) for c in top]
    scores = await _score_on_gpu(pairs)              # batched GPU call
    ranked = sorted(zip(top, scores), key=lambda t: -t[1])
    return [(c.doc_id, float(s)) for c, s in ranked]
```

The "rerank text" for the paper lane is `display_title + ' ' +
abstract` from the `paper_api_profiles` row (PG-projected per
`03 §4.2`); engine fetches it in a single batched query before invoking
the cross-encoder. For evidence lane, `chunk_text` comes back from
OpenSearch in `_source` (`07 §3.3`) so no extra PG round-trip is
needed.

Engine calls a single PK-keyed batch query against `paper_api_profiles`
on `serve_read`:

```sql
SELECT corpus_id, full_title, abstract
FROM solemd.paper_api_profiles
WHERE corpus_id = ANY($1::bigint[])
```

`corpus_id` count is bounded at 30 (= `CROSS_ENCODER_TOP_N`). This
fetch is amortized into the Stage 2 latency budget.

### 5.3 Latency budget

- **Paper lane** (rerank text fetch + batched cross-encoder):
  - PG fetch: 5–10 ms (PK-keyed `ANY($1)` against
    `paper_api_profiles`).
  - GPU cross-encoder, batch=32: 70–120 ms.
  - Total: 80–200 ms.
- **Evidence lane** (chunk_text already in OpenSearch hit):
  - GPU cross-encoder, batch=32: 70–120 ms.
  - Total: 80–150 ms.

`req.skip_rerank=True` short-circuits this stage entirely; Stage 1
order is preserved. Used by the benchmark suite to measure the
cross-encoder's marginal lift (`research-distilled §6` — locked
decision: cross-encoder rerank as standard cascade stage, not optional).

### 5.4 Calibration

Cross-encoder scores are **not** probabilities — they're logits
(MedCPT-Cross-Encoder regression head). The cascade does not normalize
to [0, 1] today; consumers (UI sort, downstream LLM filter) are
documented to treat `rerank_score` as monotonic with relevance, not as
a probability. **provisional** — if downstream consumers grow that need
calibration, add a sigmoid + temperature pass after the GPU score.

## §6 Stage 3 — Parent-child promotion

**Owner**: engine FastAPI process; pure Python in-memory operation.

**Input**: top-30 reranked candidates from Stage 2.
**Output**: top-`k` `RankedPaper` skeletons (corpus_id + scores +
optional `EvidenceHit` list).

### 6.1 Paper lane

Trivial: top-30 reranked papers are already paper-keyed. Slice to top-`k`
(default 10), assign `rank` 1..k, package as `RankedPaper` skeletons.
`evidence_hits` is `None`.

### 6.2 Evidence lane

Top-30 reranked candidates are chunks; multiple chunks can come from
the same paper. Promotion rule:

1. Group chunks by `corpus_id`.
2. For each parent paper, take its top-3 chunks by `chunk_rerank_score`.
3. Compute parent `rerank_score` = max of its retained chunks'
   `rerank_score` (monotonic; matches user intent "the best evidence
   for this paper").
4. Compute parent `rrf_score` = max of its retained chunks' `rrf_score`.
5. Sort parents by `rerank_score` desc; take top-`k`.
6. For each retained parent, build `RankedPaper` with `evidence_hits`
   = its retained ≤3 chunks ordered by `chunk_rerank_score` desc.

**Why max, not mean.** Mean penalizes papers with one strong piece of
evidence and many weak; max matches "best citation" intent. Sum
over-rewards papers that happen to surface multiple near-duplicate
chunks. This is also aligned with the common MaxP-style document
promotion baseline in passage retrieval, while richer aggregation
schemes tend to help more when relevance is spread across a long
document rather than concentrated in one strong passage. Locked at max
for v1; if benchmark shows a top-1 conversion gap, revisit.
**provisional**.

**Why ≤3 evidence hits per paper.** UI affordance — the side panel
shows up to 3 grounded sentences per result. More evidence hits per
paper just
increase response payload without rendering benefit. Locked at 3 today;
operator-tunable as a per-request override is **deferred**.

### 6.3 Sketch

```python
# engine/app/retrieval/cascade.py — Stage 3 sketch
from collections import defaultdict
from app.models.retrieval.response import RankedPaper, EvidenceHit

CHUNKS_PER_PAPER_MAX = 3        # §6.2

async def _stage_3_parent_child_promotion(
    self, req, reranked, stage1_hits_by_id,
) -> list[RankedPaper]:
    if req.lane == "paper":
        # reranked = [(corpus_id, calibrated_score), ...]
        slice_ = reranked[: req.k]
        return [
            RankedPaper(
                corpus_id=int(doc_id),
                rank=i + 1,
                rerank_score=score,
                rrf_score=stage1_hits_by_id[doc_id].rrf_score,
                paper_api_card=None,                 # filled at Stage 4 join (§7.3)
                evidence_hits=None,
            )
            for i, (doc_id, score) in enumerate(slice_)
        ]

    # lane='evidence'
    by_paper: dict[int, list[tuple[str, float]]] = defaultdict(list)
    for ev_key, score in reranked:
        hit = stage1_hits_by_id[ev_key]
        by_paper[hit.corpus_id].append((ev_key, score))

    parents = []
    for corpus_id, chunks in by_paper.items():
        chunks.sort(key=lambda t: -t[1])
        retained = chunks[:CHUNKS_PER_PAPER_MAX]
        parent_rerank = max(s for _, s in retained)
        parent_rrf    = max(stage1_hits_by_id[k].rrf_score for k, _ in retained)
        parents.append((corpus_id, parent_rerank, parent_rrf, retained))

    parents.sort(key=lambda t: -t[1])
    parents = parents[: req.k]
    # Convert; chunk_text + sentence_range filled at Stage 4 (§7).
    return [
        RankedPaper(
            corpus_id=corpus_id, rank=i + 1,
            rerank_score=parent_rerank, rrf_score=parent_rrf,
            paper_api_card=None,
            evidence_hits=[
                EvidenceHit(
                    evidence_key=ev_key,
                    sentence_range=(0, 0),                    # filled at Stage 4
                    chunk_text="",                            # filled at Stage 4
                    chunk_rerank_score=score,
                    section_role=stage1_hits_by_id[ev_key].section_role,
                )
                for ev_key, score in retained
            ],
        )
        for i, (corpus_id, parent_rerank, parent_rrf, retained) in enumerate(parents)
    ]
```

### 6.4 Latency budget

1–5 ms. Pure CPU dict / sort over ≤ 30 candidates. Negligible against
GPU stages.

## §7 Stage 4 — Grounding dereference

**Owner**: engine FastAPI process; reads PG via the `serve_read` pool.
Two parallel reads:

1. **Card hydration** — for every `RankedPaper` (both lanes), fetch
   the matching `paper_api_cards` row.
2. **Evidence dereference** — for evidence lane only, fetch
   `paper_evidence_units` + `paper_sentences` ranges via the FDW
   contract (`03 §3.3`), bounded ≤ 256 keys per call and ≤ 1
   `corpus_id` per call.

### 7.1 Card hydration

Single batched query on `paper_api_cards`:

```sql
SELECT * FROM solemd.paper_api_cards
WHERE corpus_id = ANY($1::bigint[])
```

Bounded at `req.k` (≤ 100). Index-only scan against
`idx_paper_api_cards_list` (`03 §4.2`) when `current_graph_run_id` is
set; PK lookup otherwise. Engine joins the result back onto the
`RankedPaper` skeletons by `corpus_id`.

If a `corpus_id` returned by OpenSearch isn't present in
`paper_api_cards`, the cascade logs `cards_missing_for_ranked_corpus`
and drops that paper from the response. This indicates cohort drift
(`04 §11.1`) — the OpenSearch index was built from a different
projection generation than the active `paper_api_cards`. The drop is
preferred over surfacing a half-rendered card; the structured event is
the alert.

### 7.2 Evidence dereference (evidence lane only)

Two PG calls per parent paper, both batched:

```sql
-- 1. Resolve evidence_key → canonical coordinates (03 §3.3)
SELECT evidence_key, corpus_id, section_ordinal, block_ordinal,
       sentence_start_ordinal, sentence_end_ordinal, section_role
FROM warehouse_grounding.paper_evidence_units
WHERE evidence_key = ANY($1::uuid[])    -- bounded ≤ 256

-- 2. Fetch chunk text (one call per parent paper to honor 03 §3.3
--    "≤ 1 corpus_id per FDW query" hard policy)
SELECT corpus_id, sentence_ordinal, text
FROM warehouse_grounding.paper_sentences
WHERE corpus_id = $1
  AND sentence_ordinal BETWEEN $2 AND $3
```

The second call fans out across at most `req.k` papers (≤ 100). Each
call is independent — engine launches them concurrently with
`asyncio.gather` and a per-paper `serve_read.acquire()`. Per-paper
sentence ranges are tight (≤ 64 sentences per `03 §3.3` engine
default), so each call is sub-10 ms.

Strict enforcement of `≤ 1 corpus_id per FDW query` is per
`03 §3.3` — architecture rule, not tunable. Multi-paper sentence
fetches across the FDW boundary are forbidden regardless of
configuration.

### 7.3 Sketch

```python
# engine/app/retrieval/cascade.py — Stage 4 sketch
import asyncio

async def _stage_4_grounding_dereference(
    self, req, ranked, snapshot,
) -> list[RankedPaper]:
    async with self.serve_read_pool.acquire() as conn:
        cards = await self._fetch_cards_batch(conn, [r.corpus_id for r in ranked])
    by_id = {c.corpus_id: c for c in cards}

    if req.lane == "paper":
        # Card hydration only.
        return [
            r.model_copy(update={
                "paper_api_card": by_id[r.corpus_id],
                "grounding_level": "paper",
            })
            for r in ranked if r.corpus_id in by_id
        ]

    # lane='evidence' — card hydration + per-paper FDW dereference.
    # Fan out one task per parent (per-paper FDW guard, 03 §3.3).
    async def hydrate_paper(parent: RankedPaper) -> RankedPaper:
        if parent.corpus_id not in by_id:
            return None
        evidence_keys = [h.evidence_key for h in parent.evidence_hits]
        try:
            units = await self._resolve_evidence_units(evidence_keys)   # one FDW call
            text_by_key = await self._fetch_sentences_for_paper(
                parent.corpus_id, units,                                # one FDW call per paper
            )
            updated_hits = [
                h.model_copy(update={
                    "sentence_range": (units[h.evidence_key].sentence_start_ordinal,
                                       units[h.evidence_key].sentence_end_ordinal),
                    "chunk_text":     text_by_key[h.evidence_key],
                    "section_role":   units[h.evidence_key].section_role,
                })
                for h in parent.evidence_hits if h.evidence_key in text_by_key
            ]
            return parent.model_copy(update={
                "paper_api_card": by_id[parent.corpus_id],
                "evidence_hits":  updated_hits,
                "grounding_level": "evidence" if updated_hits else "paper",
                "grounding_degraded": len(updated_hits) < len(parent.evidence_hits),
            })
        except FDWUnavailable:
            # 03 §3.4 / 12.3 — return paper-level result with empty evidence hits.
            return parent.model_copy(update={
                "paper_api_card": by_id[parent.corpus_id],
                "evidence_hits":  [],
                "grounding_level": "paper",
                "grounding_degraded": True,
            })

    hydrated = await asyncio.gather(*(hydrate_paper(r) for r in ranked))
    return [r for r in hydrated if r is not None]
```

### 7.4 Latency budget

- **Card hydration**: 5–10 ms (one PK/`ANY` batched query).
- **Evidence dereference**: 10–30 ms total (`req.k` per-paper FDW
  calls in parallel; FDW round trip ~5–15 ms each on warm warehouse;
  cold-warehouse path triggers §12.3 degraded shape).

If warehouse is down (the typical state per `00 §1` cold-default), the
cascade short-circuits Stage 4 evidence dereference per `03 §3.4`:
returns paper-level cards plus `evidence_hits=[]` and
`grounding_degraded=True` per paper. **Card hydration always
succeeds** because `paper_api_cards` lives on serve, not warehouse.

## §8 Latency budget — per stage and end-to-end

Concrete millisecond targets at 68 GB host, RTX 5090. Provisional until
first sample cascade run; baselines for `10-observability.md` SLOs.

| Stage | Path | Cold | Hot |
|---|---|---:|---:|
| 0 | Query encoding (cache miss, GPU) | 30–50 ms | — |
| 0 | Query encoding (cache hit) | — | < 1 ms |
| 0 | Query encoding (CPU fallback, §12.1) | 100–250 ms | — |
| 1 | OpenSearch hybrid retrieve (paper lane) | < 50 ms p95 | < 30 ms typical |
| 1 | OpenSearch hybrid retrieve (evidence lane) | < 100 ms p95 | < 60 ms typical |
| 2 | Rerank text fetch (paper lane, batched PG) | 5–10 ms | 5 ms |
| 2 | Cross-encoder GPU score (batch=32) | 70–120 ms | 70 ms |
| 2 | (skip_rerank=true) | 0 ms | 0 ms |
| 3 | Parent-child promotion | 1–5 ms | 1 ms |
| 4 | Card hydration (PG, batched) | 5–10 ms | 5 ms |
| 4 | Evidence FDW dereference (≤ k papers parallel) | 10–30 ms | 10 ms |
| 4 | (warehouse down → degraded path) | 1–2 ms | 1 ms |

End-to-end:

- **Paper lane, hot encoder cache, no FDW (skip evidence)**:
  1 + 30 + 5 + 70 + 1 + 5 = **~112 ms p50**, ~180 ms p95.
- **Paper lane, cold encoder, FDW down (warm cards)**:
  50 + 50 + 5 + 120 + 1 + 5 = **~231 ms p50**.
- **Evidence lane, warm encoder cache, FDW up**:
  1 + 60 + 0 + 100 + 3 + 5 + 25 = **~194 ms p50**, ~350 ms p95.
- **Evidence lane, cold encoder, FDW up**:
  50 + 100 + 0 + 120 + 3 + 5 + 25 = **~303 ms p50**.

**Targets** (`10-observability.md` SLO baselines):

- p50 end-to-end: ≤ 200 ms.
- p95 end-to-end: ≤ 400 ms.
- p99 end-to-end: ≤ 800 ms (allows for cold encoder + cold k-NN +
  warm-up FDW concurrence).

### 8.1 Serial vs parallel

```
                                   request start
                                         │
                                         ▼
                       ┌──────────  Stage 0 (encoder)  ──────────┐
                       │  cache lookup → encode → cache write     │
                       └────────────────┬─────────────────────────┘
                                        │
                                        ▼
                       ┌──────  Stage 1 (OpenSearch hybrid)  ─────┐
                       └────────────────┬─────────────────────────┘
                                        │
                       ┌────────────────┴────────────────┐
                       │                                 │   (paper lane only)
                       ▼                                 ▼
   ┌─── Stage 2.a (PG fetch rerank text) ──┐    (no PG fetch — chunk_text in _source)
   └─────────────────┬─────────────────────┘
                     │
                     └────────► merged ────────►   Stage 2.b (cross-encoder GPU)
                                                          │
                                                          ▼
                                                     Stage 3
                                                          │
                                                          ▼
                                ┌─────────────  Stage 4  ─────────────┐
                                │   card hydration  ║  FDW dereference  │
                                │   (parallel within stage; per-paper) │
                                └────────────────────────────────────────┘
                                                          │
                                                          ▼
                                                       response
```

Stages 0 → 1 → 2 → 3 are strictly serial. Stage 2.a (PG fetch of rerank
text) runs in parallel with the start of any concurrent in-process work
but blocks Stage 2.b (cross-encoder). Stage 4's card hydration and
per-paper FDW dereference run in parallel within the stage.

### 8.2 Outlier classes

- **Cold k-NN graph** (post-cutover, `_warmup` partial): adds 100–300 ms
  to Stage 1. Recovery is automatic — `07 §7.4` warmup endpoint runs
  during cohort cutover; first ~100 queries pay cold-cache hits.
- **PG `paper_api_profiles` cold cache**: adds 10–30 ms to Stage 2.a
  rerank text fetch on the first request after a serve restart;
  `pg_prewarm` (`03 §6.5`) keeps the index hot otherwise.
- **GPU contention with graph build / projection**: forces CPU
  fallback per §12.1; cascade still completes within the budget but at
  the upper end (~300 ms p50).

## §9 Active-run resolution + cohort stability within a request

**Rule**: one fetch at request start. The captured triple is
request-scoped state; the cascade never re-reads the pointer.

### 9.1 Fetch

```python
# engine/app/retrieval/cascade.py — request snapshot
from dataclasses import dataclass
from uuid import UUID

@dataclass(frozen=True, slots=True)
class RuntimeSnapshot:
    serving_run_id:        UUID
    graph_run_id:          UUID
    api_projection_run_id: UUID
    promoted_at:           "datetime"

_POINTER_SQL = """
SELECT serving_run_id, graph_run_id, api_projection_run_id, promoted_at
  FROM solemd.active_runtime_pointer
"""

async def _fetch_runtime_snapshot(self, conn) -> RuntimeSnapshot:
    row = await conn.fetchrow(_POINTER_SQL)
    if row is None:
        raise PointerUnavailable()        # §12.4
    return RuntimeSnapshot(**dict(row))
```

The pointer table is a single-row singleton per `03 §4.3` /
`04 §3.5`. The fetch is one heap-tuple read on a tiny table — always
in cache. PG-side, the row is updated atomically inside cohort cutover
transactions (`04 §3.5`); engine sees a consistent triple, never a
torn read (PG MVCC).

### 9.2 Last-known-good cache

A tight in-process cache of the last successful pointer fetch is
maintained for ≤ 60 s. If the pointer query fails (e.g. serve
PG restart, PgBouncer hiccup), the cascade reuses the last-known-good
triple to smooth cutover-time races. After 60 s, the cascade fails
hard with `pointer_unavailable` (§12.4).

```python
# engine/app/retrieval/pointer_cache.py — sketch
import time
from dataclasses import dataclass

LAST_KNOWN_GOOD_MAX_AGE_SECONDS = 60        # §9.2; provisional


@dataclass(slots=True)
class PointerCache:
    snapshot: RuntimeSnapshot | None = None
    fetched_at: float = 0.0

    def get(self) -> RuntimeSnapshot | None:
        if self.snapshot is None:
            return None
        if (time.monotonic() - self.fetched_at) > LAST_KNOWN_GOOD_MAX_AGE_SECONDS:
            return None
        return self.snapshot

    def put(self, snapshot: RuntimeSnapshot) -> None:
        self.snapshot = snapshot
        self.fetched_at = time.monotonic()
```

The cache is per-process (FastAPI worker); not shared across processes.
Restart loses the cache, which is fine — the next request re-fetches.

### 9.3 Mid-request pointer flip

If `04 §3.5` flips the pointer mid-cascade:
- The in-flight request continues against its captured snapshot.
- OpenSearch reads use the alias `*_live` (per `07 §0` cross-cutting
  invariant 4), so it sees prior or new consistently. The §8.3
  seconds-long PG-vs-OpenSearch lag window per `07 §8.3` is bounded
  by exactly the same gap the cascade was already designed for —
  `evidence_key` is content-bound (`02 §2`), so a hit from the prior
  cohort's OpenSearch index resolves cleanly via FDW into the new
  cohort's `paper_evidence_units`.
- The next request fetches the new pointer and proceeds.

### 9.4 `cohort_id` override

If `req.cohort_id` is set (power-user / benchmark run), the cascade
asserts the named cohort is currently live (per `03 §4.3
serving_cohorts.cohort_id`) before proceeding. Mismatch raises
`CohortMismatch` (HTTP 409). Today this only validates "is this cohort
live?" — historical cohort recall (reading from a prior `_prev` set or
from a `serving_artifacts` parquet snapshot) is **deferred**.

## §10 Lane-choosing heuristic

**Rule**: caller chooses the lane. Engine never auto-promotes.

### 10.1 Default — `lane='paper'`

Covers both warm and hot tiers via the `paper_index` `tier` field
(`07 §3.2`). This is the everyday RAG path; the result is a list of
papers ranked by RRF + cross-encoder relevance. Suitable for:
- General search ("find papers about X").
- Browse-style queries.
- Any caller that doesn't need evidence-lane grounding.

### 10.2 Opt-in — `lane='evidence'`

Targets `evidence_index_live`, which is hot-tier-only by construction
(`07 §3.5`). Returns paper-level results with up to 3 evidence-unit
hits per paper, each carrying sentence coordinates for grounding.
Suitable for:
- Quote extraction ("find papers that say X about Y").
- LLM grounding pipelines that need precise citation spans.
- Evidence-comparison surfaces.

The cascade enforces `hot_only=True` automatically when `lane='evidence'`
(per §2.1 `RetrieveRequest._enforce_lane_invariants`); this is a
correctness rule, not a heuristic — `evidence_index` simply has no warm
tier to scope to.

### 10.3 Combined-lane call pattern

A caller that wants paper-lane breadth + evidence-lane depth issues
two parallel `POST /api/retrieve` calls (one per lane) and fuses
client-side. The cascade documents the pattern but does not implement
it server-side today (deferred per §2.4). Justification:

- Server-side fusion would couple two independent cohort snapshots
  into one response, complicating §9 cohort stability.
- Client-side fusion gives the caller the freedom to weight lanes
  differently (e.g., "rank by evidence-lane score, fall back to
  paper-lane for non-hot papers").
- Two parallel HTTP calls keep the cascade contract simple at the
  cost of some duplicated request work. If traces show duplicate
  Stage 0 encodes for same-query dual-lane bursts, add a small
  single-flight guard around query encoding rather than fusing the
  whole cascade server-side.

### 10.4 No automatic lane escalation

The cascade never auto-promotes a `lane='paper'` request to
`lane='evidence'` based on intent inference. Reasoning:

- Intent inference is upstream concern (query rewriter / LLM
  orchestrator), not cascade concern.
- Auto-promotion would silently change the response shape (adding
  `evidence_hits`), breaking caller assumptions.
- The evidence lane is hot-cohort-scoped — auto-promoting a query
  outside the hot cohort would silently truncate recall.

If a future query-rewriter (deferred) decides "this query needs
sentence grounding," it sets `lane='evidence'` explicitly before
calling the cascade.

## §11 Filter pushdown

**Rule**: filters push down to OpenSearch as pre-filters in the Stage 1
hybrid query. Engine never re-filters after the OpenSearch response.

### 11.1 What pushes down

Per `07 §5.6` and the `RetrievalFilter` model (§2.1):

| Filter field | OpenSearch destination | Type |
|---|---|---|
| `publication_year_gte` / `_lte` | `range` on `publication_year` | both lanes |
| `is_retracted` | `term` on `is_retracted` | both lanes |
| `package_tier_in` | `terms` on `package_tier` | both lanes |
| `venue_in` | `terms` on `venue_display` (keyword) | paper lane only |
| `concept_ids_any` | `terms` on `concept_ids_top` (paper) / `concept_ids` (evidence) | both lanes |
| `corpus_ids_in` | `terms` on `corpus_id` | evidence lane only |
| `tier_in` (derived from `lane` + `hot_only`) | `terms` on `tier` | paper lane only |

The `RetrievalFilter` Pydantic model is the single source. Current
OpenSearch supports a top-level `hybrid.filter`, and that is the
default SoleMD shape. If a compatibility helper ever emits equivalent
filter blocks into both the BM25 and k-NN subqueries, that is a local
fallback path rather than the normative contract. The single model
remains the anti-drift guard, and any duplicated shapes must still
compare equal in tests.

### 11.2 What does NOT push down

- **Cross-encoder rerank filtering**: never filter on rerank score —
  rerank score is calibrated only relative to the candidate set, not
  absolute. Engine returns top-`k` by `rerank_score`; there is no
  threshold cutoff.
- **Grounding presence**: `paper_api_cards.has_full_grounding` is not
  pushed to OpenSearch (would require denormalizing into
  `paper_index`). Filtering on grounding presence is a client-side
  concern after Stage 4 hydration.
- **Active-cohort scoping**: the engine trusts that `paper_index_live`
  / `evidence_index_live` aliases name the right cohort (§9.3,
  `07 §0` invariant 4). No explicit `serving_run_id` filter is added.

### 11.3 Selectivity fallback

Per `07 §5.6`, efficient k-NN filtering may resolve as exact
pre-filtering or approximate search with modified post-filtering
depending on OpenSearch engine behavior. If the engine helper uses a
very-selective-filter fallback, that threshold is a local benchmark
heuristic, not an upstream OpenSearch contract. The cascade just
consumes the response.

## §12 Failure & degradation classes

Five named failure classes, each with a deterministic recovery.
**Every degraded response carries a structured flag the client can
render.** No silent degradation.

### 12.1 `encoder_unavailable` — Stage 0 GPU OOM / contention

**Detection**: GPU encode call raises `torch.cuda.OutOfMemoryError`,
`RuntimeError("CUDA error")`, or exceeds a 250 ms inline timeout.
**Recovery**: fall back to a CPU MedCPT-distill variant
(MedCPT-Query-Encoder-distill, deferred CPU model card; today CPU
fallback is a stub that raises until the distill variant is wired).
**Cascade outcome**: Stage 0 succeeds at 100–250 ms; Stages 1–4
proceed normally. Response carries `degraded.encoder_cpu_fallback=True`.
**Logging**: structured event `cascade.stage_0.gpu_fallback`,
Prometheus counter `cascade_encoder_fallback_total`.

If both GPU and CPU encoders fail (e.g. CPU model not yet loaded),
the cascade falls back to **BM25-only** by passing a zero vector to
Stage 1; OpenSearch's RRF naturally weights the dense lane to zero
when no candidate is returned. Response carries
`degraded.dense_lane_skipped=True`. **provisional** until the CPU
distill variant lands.

### 12.2 `opensearch_unavailable` — Stage 1 cluster down

**Detection**: HTTP connection refused / timeout / `cluster_red` /
`index_not_found_exception` on the alias (`07 §14.5`).
**Recovery**: **none** — there is no PG-side ANN index by design
(`02 §4.6`). The cascade returns 503 with `error_class=OPENSEARCH_OFFLINE`
or `OPENSEARCH_RED`. The client should retry with backoff.
**Cascade outcome**: cascade aborts at Stage 1; no PG reads issued.
**Logging**: `cascade.stage_1.opensearch_unavailable`, Prometheus
counter `cascade_opensearch_failures_total{error_class}`.

If the failure is `circuit_breaking_exception` on the k-NN sub-query
(`07 §4.5`), the cascade retries the same request with `knn` sub-query
omitted (BM25-only; `07 §14.5`). Response carries
`degraded.dense_lane_skipped=True`. This is the only OpenSearch
failure class with an in-cascade recovery; all others surface as 503.

### 12.3 `fdw_unavailable` — Stage 4 grounding dereference partial fail

**Detection**: per-paper FDW call raises `SQLSTATE 08006 / 08001 /
57P03` (warehouse cluster down or recycling); **or** FDW call exceeds
its `statement_timeout` (`03 §3.4`); **or** specific `evidence_key`
returns 0 rows (FDW reachable, but the key doesn't resolve — typically
during the seconds-long PG-vs-OpenSearch swap-lag window per `07 §8.3`).
**Recovery**: per-paper degradation. The affected `RankedPaper` is
returned with `evidence_hits=[]` and `grounding_degraded=True`. Other
papers in the response are unaffected (per-paper FDW calls are
independent — `03 §3.3` "≤ 1 corpus_id per FDW query" hard policy
makes this granularity natural).
**Cascade outcome**: cascade succeeds; client renders papers with a
"grounding temporarily unavailable" affordance for the degraded ones.
**Logging**: `cascade.stage_4.fdw_unavailable` per affected paper,
Prometheus counter `cascade_fdw_failures_total{kind}`.

The **card hydration** sub-step never depends on FDW (cards live on
serve, not warehouse), so card-level results are always returned.
This honors the `03 §3.4` "warehouse down ≠ serve broken" contract.

### 12.4 `pointer_unavailable` — Stage 9 active-pointer query fails

**Detection**: `solemd.active_runtime_pointer` query fails (serve PG
restart, PgBouncer disconnect storm, hard timeout).
**Recovery**: §9.2 last-known-good cache covers the gap for up to
60 seconds. If the cache is also empty (cold start of the FastAPI
process), the cascade returns 503 with
`error_class=POINTER_UNAVAILABLE`.
**Cascade outcome**: hot path tolerates short serve PG hiccups;
cold-start dependency on serve PG is unavoidable.
**Logging**: `cascade.snapshot.pointer_cache_hit` /
`cascade.snapshot.pointer_unavailable`.

### 12.5 `cross_encoder_unavailable` — Stage 2 GPU OOM / fail

**Detection**: cross-encoder GPU call raises CUDA error or exceeds a
500 ms inline timeout.
**Recovery**: skip Stage 2 entirely (equivalent to `req.skip_rerank=True`).
Stage 1 RRF order is preserved; Stage 3 promotes papers by `rrf_score`
instead of `rerank_score`.
**Cascade outcome**: degraded ranking quality (no cross-encoder lift),
but the cascade succeeds. Response carries
`degraded.cross_encoder_skipped=True`.
**Logging**: `cascade.stage_2.cross_encoder_skipped`, Prometheus
counter `cascade_cross_encoder_skips_total`.

### 12.6 Failure-class summary

| Failure class | HTTP status | Cascade outcome | Response flag |
|---|---:|---|---|
| `encoder_unavailable` (CPU fallback OK) | 200 | Stage 0 succeeds slowly | `degraded.encoder_cpu_fallback=True` |
| `encoder_unavailable` (CPU also fails) | 200 | BM25-only | `degraded.dense_lane_skipped=True` |
| `opensearch_unavailable` (offline / red) | 503 | aborts at Stage 1 | n/a |
| `opensearch_unavailable` (k-NN circuit breaker) | 200 | BM25-only retry | `degraded.dense_lane_skipped=True` |
| `cross_encoder_unavailable` | 200 | Stage 2 skipped; Stage 1 order kept | `degraded.cross_encoder_skipped=True` |
| `fdw_unavailable` (per paper) | 200 | per-paper degradation | `RankedPaper.grounding_degraded=True` |
| `pointer_unavailable` (cache hit) | 200 | uses last-known-good | n/a (logged) |
| `pointer_unavailable` (cache miss) | 503 | aborts before Stage 0 | n/a |

**Locked** for the contract; **provisional** for the exact timeout
values (250 ms encoder, 500 ms cross-encoder, 60 s pointer cache).

## §13 Caching

One cache, one purpose. Bounded, observable, invalidatable.

### 13.1 Redis query-vector cache

Purpose: amortize the 30–50 ms cold encode cost across repeated
queries within one UI session.

| Property | Value |
|---|---|
| Key format | `qvec:<sha256(encoder_revision || '\0' || query_text)>` |
| Value format | `np.float32` raw bytes (768 × 4 = 3072 B) |
| TTL | 1 hour (3600 s) |
| Backing store | Redis current line (`graph-redis` per `00 §1`; see `16-version-inventory.md`) |
| Invalidation on encoder change | Encoder revision is part of the key; new revision = new cache namespace; old entries TTL out |
| Invalidation on query rewrite | None — different query text = different key by construction |
| Eviction policy | `allkeys-lru` per `09-tuning.md` Redis config |
| Per-key memory | ~3.1 KB value + ~80 B key + Redis overhead ≈ ~3.5 KB |
| Capacity headroom | At 10 000 cached vectors → ~35 MB (trivial against `graph-redis` budget) |

**locked** for the cache shape; **provisional** for the 1-hour TTL.

Reviewer flag: **1-hour TTL is easy to shorten to 5 minutes or remove
entirely in favor of eviction-only behavior.** Trade-offs:
- TTL=0: every query pays cold-encode. Total p50 jumps from ~112 ms to
  ~150 ms.
- TTL=5 min: typical UI editing burst still hits cache, but more
  repeat queries fall through unnecessarily.
- TTL=1 hour (current): long-tail recurring queries amortize further;
  risk is none today because encoder swap bumps the revision in the
  key.
- TTL=None: operationally simplest for deterministic embeddings, but
  relies entirely on Redis eviction behavior rather than time bounds.

### 13.2 What is NOT cached

- **OpenSearch results.** OpenSearch already has its own queries cache
  (`07 §3.1` `queries.cache.enabled: true`); a second cache layer in
  the engine duplicates without benefit.
- **Cross-encoder scores.** Per-(query, candidate) pair cardinality is
  too high to cache usefully; cross-encoder is GPU-cheap when not
  contended.
- **PG card hydration.** `paper_api_cards` is already covering-index +
  `pg_prewarm`-warmed (`03 §6.3`); a second layer adds invalidation
  burden without latency win.
- **FDW grounding text.** Per-paper, per-sentence-range; cache key
  cardinality is unbounded. The 24 h `_prev` retention (`04 §3.6`)
  already gives bounded reproducibility for grounding texts.
- **Cascade response.** Different `(query, k, lane, filter)` tuples
  multiply too fast; client-side / CDN cache is the right layer if
  caching is desired (deferred).
- **Active-pointer triple.** §9.2 last-known-good cache is in-process
  only; not in Redis. Pointer changes are rare and per-process is
  sufficient.

### 13.3 Per-cohort invalidation

A full serving cutover (`07 §8.3`) does not invalidate the query
vector cache because:
- Encoder revision is part of the key; encoder doesn't change at cohort
  cutover (encoder revisions bump on model swap, not cohort cycle).
- Vectors are cohort-independent (the same query produces the same
  vector regardless of which cohort is live).

If a future encoder swap is wired into the cohort cutover (e.g. tier-
specific encoders), bump `ENCODER_REVISION` in the source per §3.1 —
the deploy invalidates the cache by key namespace. **deferred**.

## §14 Concurrency & request isolation

### 14.1 Per-request state

Every cascade is a new `RetrievalCascade` instance per request. No
mutable cross-request state inside the cascade — `serve_read_pool`,
`os_client`, `query_encoder`, `cross_encoder`, `cache`, `tracer` are
shared singletons (engine startup; `06 §5.1` lifespan), but the
cascade object holds nothing mutable beyond the per-request snapshot.

### 14.2 Pool acquires

Per request:
- **`serve_read.acquire()` × 1** for the active-pointer fetch (§9.1).
- **`serve_read.acquire()` × 1** for the rerank-text PG batch (Stage 2,
  paper lane only).
- **`serve_read.acquire()` × 1** for the card-hydration batch (Stage 4).
- **`serve_read.acquire()` × `req.k`** for per-paper FDW dereference
  (Stage 4, evidence lane only; ≤ 100). `serve_read` `max=16` per
  `06 §2.1` (68 GB host) is the cap; under burst, requests queue
  rather than open new connections. `serve_read.acquire()` p99 < 2 ms
  per `06 §12` keeps the queue shallow.

Each acquire is `async with` per `06 §11.4` rule, never bare
`acquire()`. asyncpg cancellation propagation (`06 §11.4`) means
client disconnects abort the FDW reads cleanly.

### 14.3 OpenSearch HTTP

One HTTP call per Stage 1 (per `07 §read patterns`). Connection-pooled
in `engine/app/opensearch/client.py`; budget per `09-tuning.md`. No
parallel OpenSearch calls per request today (one lane = one call;
combined lane is deferred per §2.4).

### 14.4 GPU calls

Stage 0 (encoder) and Stage 2 (cross-encoder) call into the engine's
GPU process. Engine-side serialization at the GPU is the engine's
problem — the cascade treats both calls as awaitable async functions.
Under contention, the GPU runs the cascade's calls behind any in-flight
graph build / projection / RAG-inference work; the cascade's
`encoder_unavailable` / `cross_encoder_unavailable` paths (§12.1, §12.5)
cover the "GPU busy" failure mode.

### 14.5 No mid-request concurrency between requests

The cascade has no need to share state between concurrent requests
(no leader election, no rate limiter beyond pool sizing). Each request
independent. This is what makes scaling out the FastAPI process count
trivial when needed.

## §15 Observability hooks

This doc emits the requirements `10-observability.md` must surface for
the cascade.

### 15.1 One Langfuse trace, five spans per cascade

```python
# engine/app/observability/langfuse.py — sketch (consumes 06 §10.3 patterns)
import structlog
from langfuse import Langfuse, observe

# One trace per cascade. Each Stage emits one span via @observe.
# Trace metadata: trace_id (UUIDv7), serving_run_id, lane, query_text_hash, ...
```

### 15.2 Per-span fields

Every stage emits one Langfuse span with the following attributes
(field names provisional; `10-observability.md` finalizes):

| Span | Attribute | Source / shape |
|---|---|---|
| All | `serving_run_id` | snapshot.serving_run_id |
| All | `cohort_id` | resolved from active pointer |
| All | `lane` | req.lane |
| All | `grounding_level` | response grounding level (`paper` / `evidence`) |
| All | `redacted_query` | sha256 of query_text (no plaintext PHI) |
| All | `latency_ms` | per-stage wall-clock |
| Stage 0 | `encoder_revision` | ENCODER_REVISION constant |
| Stage 0 | `cache_hit` | bool |
| Stage 0 | `cpu_fallback` | bool |
| Stage 1 | `os_index_name` | resolved from alias (`paper_index_live` → underlying) |
| Stage 1 | `candidate_count` | length of returned candidates (≤ 200 paper, ≤ 100 evidence) |
| Stage 1 | `total_hits` | OpenSearch `total.value` |
| Stage 1 | `pre_filter_active` | bool (from `07 §5.6` selectivity fallback) |
| Stage 1 | `score_breakdown` | optional `list[ScoreBreakdownEntry]` when benchmark/search-pipeline runs enable both `req.explain=True` and the OpenSearch debug pipeline (`normalization` + `hybrid_score_explanation`); per-entry `{corpus_id, bm25_rank, dense_rank, rrf_score}` is a SoleMD.Graph normalization for lane-fusion analysis, not a live raw-score decomposition |
| Stage 2 | `cross_encoder_revision` | constant |
| Stage 2 | `top_n` | CROSS_ENCODER_TOP_N |
| Stage 2 | `skipped` | bool (req.skip_rerank or §12.5) |
| Stage 2 | `rerank_scores` | optional `list[RerankEntry]` when `req.explain=True`; per-entry `{corpus_id, rerank_score}` for rerank-lift analysis |
| Stage 3 | `parent_count` | number of unique parents after promotion |
| Stage 3 | `evidence_hits_per_paper_max` | constant 3 |
| Stage 4 | `cards_hydrated` | int |
| Stage 4 | `cards_missing` | int (cohort drift signal) |
| Stage 4 | `evidence_units_resolved` | int |
| Stage 4 | `evidence_units_failed` | int |
| Stage 4 | `paper_grounded_results` | int |
| Stage 4 | `evidence_grounded_results` | int |
| Stage 4 | `fdw_degraded_papers` | int |
| Stage 4 | `grounding_roundtrip_failures` | optional `list[evidence_key]`; FDW-unresolved evidence keys for round-trip-success analysis |

Trace-level fields: `trace_id`, `serving_run_id`, `graph_run_id`,
`api_projection_run_id`, `lane`, `grounding_level`, `k`,
`total_latency_ms`, `degraded` flags, HTTP status. PHI-safe: query
text is hashed, not transmitted to Langfuse.

### 15.3 Prometheus metrics

Required counters / histograms / gauges:

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `cascade_request_duration_seconds` | histogram | `lane`, `outcome` | end-to-end latency |
| `cascade_stage_duration_seconds` | histogram | `stage`, `lane` | per-stage latency |
| `cascade_encoder_fallback_total` | counter | `kind` (`cpu`, `bm25_only`) | §12.1 fallback rate |
| `cascade_opensearch_failures_total` | counter | `error_class` | §12.2 |
| `cascade_cross_encoder_skips_total` | counter | `kind` (`req`, `gpu_fail`) | §12.5 |
| `cascade_fdw_failures_total` | counter | `kind` (`unavailable`, `key_unresolved`) | §12.3 |
| `cascade_pointer_cache_hits_total` | counter | (none) | §9.2 |
| `cascade_pointer_cache_misses_total` | counter | (none) | §9.2 |
| `query_vector_cache_hits_total` | counter | (none) | §13.1 |
| `query_vector_cache_misses_total` | counter | (none) | §13.1 |
| `cascade_degraded_responses_total` | counter | `degradation_kind` | rolled-up degradation rate |
| `cascade_card_drift_papers_total` | counter | (none) | Stage 4 cards_missing — cohort drift signal |

### 15.4 Structured log events

JSON log lines on stderr per `06 §10.3`; Alloy → Loki. Required
events:

- `cascade.request.received` — `trace_id`, `lane`, `k`,
  `query_text_hash`, `client_ip` (if available, redacted to /24).
- `cascade.snapshot.fetched` — `trace_id`, `serving_run_id`,
  `pointer_cache_hit`.
- `cascade.stage_0.cache_hit` / `cascade.stage_0.cache_miss`.
- `cascade.stage_0.gpu_fallback` — `error_class`.
- `cascade.stage_1.opensearch_called` — `index`, `took_ms`,
  `candidate_count`.
- `cascade.stage_1.opensearch_unavailable` — `error_class`,
  `http_status`.
- `cascade.stage_2.rerank_complete` — `top_n`, `gpu_ms`.
- `cascade.stage_2.cross_encoder_skipped` — `reason`.
- `cascade.stage_3.promotion_complete` — `parent_count`,
  `chunks_per_parent_avg`.
- `cascade.stage_4.cards_hydrated` — `count`, `missing`.
- `cascade.stage_4.fdw_unavailable` — `corpus_id`, `error_class`.
- `cascade.response.sent` — `trace_id`, `total_latency_ms`,
  `degraded`, `http_status`.

`10-observability.md` routes these into Grafana panels and alert
rules.

### 15.5 Sample Langfuse trace payload

```json
{
  "id": "0192a4f8-9b3e-7c10-8a42-3f9e2d8e7c4a",
  "name": "cascade.retrieve",
  "input": { "query_text_hash": "9c7e…", "lane": "evidence", "k": 10 },
  "metadata": {
    "serving_run_id": "0192a4f0-7d10-7220-a44e-0c1d8a9b2f30",
    "graph_run_id":   "0192a4ec-1100-7720-9ab0-1e2f3c4d5e6f",
    "api_projection_run_id": "0192a4f7-2200-7330-bc40-2f3e4d5c6b7a",
    "cohort_id": 12,
    "encoder_revision": "medcpt-query-encoder-v1",
    "cross_encoder_revision": "medcpt-cross-encoder-v1"
  },
  "spans": [
    { "name": "stage_0_query_encoding", "latency_ms": 0.8,  "cache_hit": true,  "cpu_fallback": false },
    {
      "name": "stage_1_lane_fusion",
      "latency_ms": 64.2,
      "candidate_count": 100,
      "total_hits": 4382,
      "pre_filter_active": true,
      "score_breakdown": [
        { "corpus_id": 12345, "bm25_rank": 1, "dense_rank": 4, "rrf_score": 0.0317 },
        { "corpus_id": 67890, "bm25_rank": 7, "dense_rank": 1, "rrf_score": 0.0309 }
      ]
    },
    {
      "name": "stage_2_cross_encoder_rerank",
      "latency_ms": 102.7,
      "top_n": 30,
      "skipped": false,
      "rerank_scores": [
        { "corpus_id": 12345, "rerank_score": 8.42 },
        { "corpus_id": 67890, "rerank_score": 7.95 }
      ]
    },
    { "name": "stage_3_parent_child_promotion", "latency_ms": 2.1, "parent_count": 10, "evidence_hits_per_paper_max": 3 },
    { "name": "stage_4_grounding_dereference", "latency_ms": 24.5, "cards_hydrated": 10, "cards_missing": 0,
      "evidence_units_resolved": 27, "evidence_units_failed": 1, "fdw_degraded_papers": 1,
      "grounding_roundtrip_failures": ["0192a501-4400-7d10-ae90-5f6a7b8c9d10"] }
  ],
  "output": { "ranked_count": 10, "degraded": { "evidence_partial": true } }
}
```

## Cross-cutting invariants

1. **One cascade orchestrator class.** All stages in
   `engine/app/retrieval/cascade.py`; `RetrievalCascade.run()` is the
   sole public entry. Lint rule: no other module may import
   `RetrievalCascade.{_stage_*}` private methods.
2. **Active-pointer fetched once per request.** `RetrievalCascade.run`
   captures `RuntimeSnapshot` once; downstream stages receive it as a
   dataclass — never re-read.
3. **No cross-cohort reads.** Every stage uses the captured snapshot's
   `serving_run_id`; OpenSearch alias resolves to a single underlying
   index for the call's duration.
4. **One Langfuse trace per request.** All five spans nest under one
   trace; `trace_id` returned in the response.
5. **Caller never supplies vectors.** `RetrieveRequest` has no
   `query_vector` field; engine owns encoding (§2.4).
6. **Filters duplicate across BM25 and k-NN sub-queries via one
   model.** `engine/app/opensearch/queries.py` is the only generator;
   lint rule asserts both sub-query filter blocks compare equal.
7. **`evidence_key` lookups are bounded.** `≤ 256` per FDW call,
   `≤ 1 corpus_id` per call (`03 §3.3` hard policy). Engine enforces
   before SQL.
8. **Degraded responses carry flags.** No silent degradation; every
   degradation surface is observable in the response and in Langfuse.
9. **Cross-encoder rerank top-N is a constant.** `CROSS_ENCODER_TOP_N`
   in source; not request-tunable beyond `req.skip_rerank=True`.
10. **No engine-side fusion.** RRF runs in OpenSearch only; engine
    never reweights BM25 vs dense outside the search pipeline.
11. **Live hybrid semantics stay rank-based.** The production path
    interprets Stage 1 as ranked candidate output. Any normalization-
    based score breakdown belongs to benchmark/debug runs only and must
    not be described as the live production combiner.

## Write patterns

**None.** The cascade is a pure read path. The only writes the request
issues are:
- Redis `SET` to seed the query-vector cache (§3.1) — write to cache,
  not to PG.
- Langfuse trace publication (§15) — write to Langfuse, not to PG.
- Prometheus metric increments (§15.3) — process-local, scraped externally.

No PG writes, no OpenSearch writes, no warehouse writes. The cascade
is purely consumptive of `06 §6.3` `serve_read` pool (and `04 §3.5`
projection-built tables) plus `07 §5` OpenSearch reads plus FDW reads
via `03 §3` plus the engine's GPU encoders.

## Read patterns

End-to-end trace of one cascade request (paper lane, hot encoder
cache, FDW up):

```
1. POST /api/retrieve {query_text="…", lane="paper", k=10}
        │
        ▼
2. RetrievalCascade.run(req)
        │
        ▼
3. serve_read.acquire() × 1
   → SELECT … FROM solemd.active_runtime_pointer       (§9.1)
   → snapshot = RuntimeSnapshot(serving_run_id, …)
        │
        ▼
4. Stage 0 — query encode
   → cache.get(qvec:<sha256>)                           (§13.1)
   → cache hit → np.frombuffer
   (≤ 1 ms)
        │
        ▼
5. Stage 1 — OpenSearch hybrid
   → POST paper_index_live/_search?search_pipeline=solemd_hybrid_rrf
     (07 §5.3 wire shape; tier_in=[1,2]; filters from RetrievalFilter)
   → 200 candidates with rrf_score and routing fields
   (50 ms typical)
        │
        ▼
6. Stage 2.a — rerank text fetch
   → serve_read.acquire() × 1
   → SELECT corpus_id, full_title, abstract
       FROM solemd.paper_api_profiles
      WHERE corpus_id = ANY($1::bigint[])               (top-30)
   (5 ms)
        │
        ▼
7. Stage 2.b — cross-encoder
   → GPU batch=32 score 30 (query, paper) pairs
   → ranked top-30 by calibrated_score
   (80 ms)
        │
        ▼
8. Stage 3 — parent-child promotion
   → slice top-10; assign rank
   (1 ms)
        │
        ▼
9. Stage 4 — card hydration
   → serve_read.acquire() × 1
   → SELECT * FROM solemd.paper_api_cards
      WHERE corpus_id = ANY($1::bigint[])               (10 ids)
   → join cards onto RankedPaper skeletons
   (5 ms)
        │
        ▼
10. RetrieveResponse(ranked=[…], trace_id=…, cascade_timings=…)
        │
        ▼
11. Langfuse trace publish (async; doesn't block response)
        │
        ▼
12. response → client
   (total: ~140 ms; well under 200 ms p50 target)
```

For the evidence lane, steps 5–9 differ:
- Step 5 calls `evidence_index_live` and returns 100 candidates with
  `evidence_key`, `corpus_id`, sentence-coordinate fields, and
  `chunk_text` in `_source`.
- Step 6 is skipped (chunk_text already in `_source`).
- Step 7 cross-encodes (query, chunk_text) pairs.
- Step 8 promotes chunks → parents (max-aggregate; ≤ 3 chunks/paper).
- Step 9 adds per-paper FDW dereference for `paper_evidence_units` +
  `paper_sentences` (per `03 §3.3`); fans out across `req.k` papers
  in parallel; each paper-level call is independent so partial FDW
  failure degrades per paper.

## §N Decisions — locked / provisional / deferred

### Locked now

| Decision | Rationale |
|---|---|
| Five-stage cascade: Stage 0 query encode → Stage 1 lane fusion (OpenSearch) → Stage 2 cross-encoder rerank → Stage 3 parent-child promotion → Stage 4 grounding dereference | Mirrors the canonical biomedical RAG cascade (`research-distilled §6`, MedCPT card); each stage has a single owner and a single failure class. |
| One endpoint, one wire contract: `POST /api/retrieve` with `RetrieveRequest` / `RetrieveResponse` | Streaming and multi-turn deferred per §2.4; no scope creep. |
| Pydantic v2 models with `frozen=True` and `extra="forbid"` for both request and response | `06 §4.5` hot-path performance rule + boundary contract. |
| `lane='paper'` default; `lane='evidence'` opt-in implies `hot_only=True` automatically | `07 §3.5` evidence-index-is-hot-only; explicit caller intent (§10). |
| Caller never supplies query vector; engine owns encoding | `07 §6` encoder placement; trace consistency. |
| Active-pointer fetched once per request; cohort stable for the request's duration; in-process last-known-good cache (60 s) | `04 §3.5` pointer atomicity; mid-request flips invisible (§9). |
| Cross-encoder top-30; `CROSS_ENCODER_TOP_N` is a source constant | Sweet-spot for sub-second cascade on RTX 5090; over-30 blows the budget (§5.1). |
| Parent-child promotion: max-aggregate per parent; ≤ 3 evidence hits per paper | UI affordance + correctness for "best evidence per paper" (§6.2). |
| Filters push down to OpenSearch as pre-filters; engine never re-filters | `07 §5.6`; `RetrievalFilter` is the single source for top-level `hybrid.filter` on the default path (§11.1). |
| FDW dereference bounded ≤ 256 evidence_keys per call, ≤ 1 corpus_id per call | `03 §3.3` hard schema policy; engine enforces before SQL (§7.2). |
| Card hydration always runs against `paper_api_cards` (serve), independent of warehouse availability | `03 §3.4` "warehouse down ≠ serve broken" (§7.4). |
| Five named failure classes with deterministic recovery; every degraded response carries a structured flag | No silent degradation; clients can render the right affordance (§12). |
| Redis query-vector cache: SHA-256 key over `(encoder_revision, query_text)`; 1 h TTL; np.float32 raw bytes | One cache, one purpose; bounded; encoder-revision keying invalidates on model swap (§13.1). |
| OpenSearch is the only retrieval substrate; no PG-side ANN fallback | `02 §4.6` and `07 §0`; consistent with split topology. |
| One Langfuse trace per request with five named spans (Stage 0–4); `serving_run_id` on every span | Cohort-drift / encoder-revision attribution from spans alone (§15.1). |
| Redacted query in Langfuse (sha256 hash, no plaintext) | PHI-safety: query text never leaves the engine process to a third-party trace store. |
| Engine never auto-promotes a query to `lane='evidence'` | Caller-explicit lane choice; auto-promotion would silently change response shape and recall (§10.4). |
| Combined-lane (paper + evidence in one request) is client-side concern; cascade is single-lane per request | Server-side fusion couples cohort snapshots; client-side fusion gives caller weighting freedom (§10.3). |
| No mid-request mutation of the cascade orchestrator; `RetrievalCascade` is per-request, singletons are read-only | Concurrency safety by construction (§14.1). |
| `req.skip_rerank` is a debug knob, not a recommended production path | Stage 2 is the canonical conversion improvement per `research-distilled §6`. |

### Provisional (revisit after first sample cascade run)

| Decision | Revisit trigger |
|---|---|
| Cross-encoder top-N = 30 | Recall@10 / hit@1 measurement on benchmark suite; raise to 50 if rerank ceiling is reached. |
| Chunks per paper max = 3 | Real UI shape; if side-panel renders 5+ chunks comfortably, raise. |
| Parent aggregate = max(chunk_rerank_score) | Test mean / sum / log-sum-exp on benchmark hit@1. |
| Redis query-vector cache TTL = 1 h | Repeat-query distribution from production traffic; easy to shorten to 5 min or remove TTL entirely if eviction-only behavior proves cleaner. |
| Per-stage latency budgets in §8 | First sample build measurement at 14 M-paper scale. |
| `ef_search=100` default; per-request override band 10–2000 | OpenSearch recall/latency tuning (`07 §4.4`). |
| Last-known-good pointer cache TTL = 60 s | Real serve-PG flap rate; tighten if PG is rock-solid. |
| GPU encoder fallback timeout = 250 ms | Real GPU-contention measurement against graph build / projection. |
| Cross-encoder fallback timeout = 500 ms | Same as above. |
| `cards_missing_for_ranked_corpus` is a hard drop (paper omitted from response) | If observability shows non-zero baseline drift, switch to "render with placeholder + flag" instead. |
| Calibration of `rerank_score` (raw logits, not probability) | Downstream consumer demand; sigmoid + temperature is a one-line addition. |
| `req.k` upper bound = 100 | Real client demand; raise if a power-user shape needs it. |
| Stage 2 rerank text source: `paper_api_profiles.full_title + abstract` | Test against title-only or abstract-only on benchmark. |

### Deferred (trigger-gated)

| Decision | Trigger |
|---|---|
| Streaming response (SSE) | End-to-end p95 > 1 s, or LLM-side answer synthesis lands above the cascade. |
| Multi-turn / conversational state | LLM-orchestration layer above the cascade lands. |
| User-specific ranking signals (saved papers, follows) | `13-auth.md` + user-data plane lands. |
| Combined-lane request (server-side paper+evidence fusion) | Real client demand; today client-side fusion is the recommended path. |
| Auto-promotion from `lane='paper'` to `lane='evidence'` based on intent | Query-rewriter / LLM intent-classification layer lands above the cascade. |
| Caller-supplied query vector | Hard "no" today; would couple callers to encoder revision. |
| Historical cohort recall (`cohort_id` resolves to a retired cohort) | Operator reproducibility / time-travel debugging. Today only live cohort is allowed. |
| Per-cohort encoder revisions (tier-specific encoders) | Quality measurement shows tier-specific encoders close a measurable gap. |
| Cross-encoder calibration (sigmoid + temperature) | Downstream consumer (LLM filter) needs probability semantics. |
| LLM-output cache | LLM answer synthesis layer lands; cache is at that layer, not the cascade. |
| OpenSearch-result cache layer in engine | OpenSearch's own queries cache (`07 §3.1`) proves insufficient. |
| Cascade-response CDN cache | Public-facing read traffic justifies edge caching. |
| Per-request `evidence_hits_per_paper_max` override | UI shape demands it. |
| Native Server-Sent-Events FastAPI handler | Same trigger as streaming above. |
| Two-pass rerank (cheap reranker on top-100, expensive on top-10) | Cross-encoder budget at top-30 stops being adequate; today single-pass is enough. |
| ColBERTv2 late-interaction sidecar after Stage 2 | `07 §13` deferred; only after MedCPT cascade is live and SPLADE doesn't close the gap. |
| Per-paper rerank context window beyond `title + abstract` (e.g. include top-3 chunks for warm papers) | Recall@10 measurement shows abstract-only loses on long papers. |
| Server-side query rewriter ahead of Stage 0 | Misspelling / synonym handling proves insufficient at OpenSearch analyzer level. |

## Open items

Forward-tracked; none block subsequent docs:

- **Encoder choice for paper lane (Query vs Article).** §3 leaves it to
  the engine; per `07 §6 Open items` reviewer flag, the default is
  Article for paper docs. If recall measurement on the cascade benchmark
  suite shows Query-Encoder is better on the paper lane (asymmetric vs
  symmetric retrieval), swap. Affects `ENCODER_REVISION` and the cache
  namespace (§13.1).
- **CPU MedCPT-distill fallback model.** §12.1 names it; the actual
  weights / quantization / inference path is **not yet specified**.
  Today the CPU fallback is a stub that raises; until distill lands,
  GPU OOM cascades to BM25-only (§12.1).
- **`degraded` response field shape.** §2.2 declares it as
  `dict[str, bool]`. If observability needs structured per-degradation
  metadata (timestamps, error codes), upgrade to a Pydantic model.
  Today flat-bool dict is enough.
- **Per-paper concurrent FDW call cap.** §14.2 sizes against `req.k ≤ 100`
  and `serve_read max=16`. If `req.k=100` evidence-lane requests prove
  to saturate the pool, add a per-request semaphore (e.g. ≤ 8 in-flight
  FDW calls per cascade) that pipelines instead of fanning out.
  Provisional bound; defer until measured.
- **Combined error class for "everything degraded."** Today the
  response can carry multiple `degraded` flags simultaneously
  (e.g., `dense_lane_skipped` + `cross_encoder_skipped` +
  `evidence_partial`). Worth a single `degradation_severity` enum?
  Defer until observability needs it.
- **Cross-cohort `evidence_key` resolution audit.** §9.3 / `07 §9`
  promise content-bound `evidence_key` makes cohort-cross-resolution
  safe. Wire a periodic audit that re-derives `evidence_key` from
  warehouse and asserts the OpenSearch hits round-trip cleanly. Defer
  to `10-observability.md`.
- **Reviewer flag**: cross-encoder top-30 + evidence-hits-per-paper-max=3 is
  the local latency/UI-shaped default, not a universal cascade
  constant. Community retrieve-and-rerank examples often rerank closer
  to top-100; we start at 30 here because of the host budget and widen
  only if benchmark lift justifies the extra GPU cost.

## Upstream amendments needed (none required)

This doc fits the existing 00–07 contracts without amendment:

- **02-warehouse-schema.md**: no change. `paper_evidence_units` already
  exposes the `section_role` field used by `EvidenceHit`.
- **03-serve-schema.md**: no change. `paper_api_cards` and
  `paper_api_profiles` carry the fields the cascade needs;
  `active_runtime_pointer` is the read source for §9.
- **04-projection-contract.md**: no change. The cascade reads only
  live tables; no projection-write touch.
- **06-async-stack.md**: no change. The cascade uses `serve_read` pool
  per §6.3 and `Annotated[Pool, Depends]` per §5.2.
- **07-opensearch-plane.md**: no change. The cascade consumes the
  §14 wire contract verbatim; alias-only access per §0 invariant 4.

The single judgement call worth flagging is the query-vector cache TTL
(§13.1). Redis' own embedding-cache guidance permits no expiration at
all, and Redis' eviction guidance warns that TTLs that are too short
show up as unnecessary expirations. The 1-hour value here is a
conservative middle ground, not a hard best-practice constant.

No contradictions discovered with `00–07` or `research-distilled.md`.
