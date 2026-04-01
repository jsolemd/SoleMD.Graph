"""Pydantic request and response schemas for the evidence baseline."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.rag.serving_contract import (
    AnswerSegment,
    CitedSpanPacket,
    InlineCitationAnchor,
)
from app.rag.types import (
    DEFAULT_GRAPH_CACHE_CONTROL,
    DEFAULT_GRAPH_NAME,
    DEFAULT_RETRIEVAL_VERSION,
    CitationDirection,
    EvidenceIntent,
    GraphSignalKind,
    NodeLayer,
    RetrievalScope,
    RetrievalChannel,
)


class RagSchema(BaseModel):
    """Shared Pydantic configuration."""

    model_config = ConfigDict(extra="forbid", use_enum_values=True)


class ResponseMeta(RagSchema):
    request_id: str
    generated_at: datetime
    duration_ms: int
    cache_control: str = DEFAULT_GRAPH_CACHE_CONTROL
    retrieval_version: str = DEFAULT_RETRIEVAL_VERSION


class GraphContext(RagSchema):
    graph_release_id: str
    graph_run_id: str
    bundle_checksum: str | None = None
    graph_name: str = DEFAULT_GRAPH_NAME
    is_current: bool = False
    selected_layer_key: NodeLayer | None = None
    selected_node_id: str | None = None
    selected_graph_paper_ref: str | None = None
    selected_paper_id: str | None = None
    selection_graph_paper_refs: list[str] = Field(default_factory=list)
    selected_cluster_id: int | None = None
    scope_mode: RetrievalScope = RetrievalScope.GLOBAL


class PaperEvidenceHit(RagSchema):
    model_config = ConfigDict(extra="ignore", use_enum_values=True)

    corpus_id: int
    paper_id: str | None = None
    semantic_scholar_paper_id: str | None = None
    title: str | None = None
    journal_name: str | None = None
    year: int | None = None
    doi: str | None = None
    pmid: int | None = None
    pmcid: str | None = None
    abstract: str | None = None
    tldr: str | None = None
    text_availability: str | None = None
    is_open_access: bool | None = None
    citation_count: int | None = None
    reference_count: int | None = None


class CitationContextHit(RagSchema):
    model_config = ConfigDict(extra="ignore", use_enum_values=True)

    corpus_id: int
    citation_id: int | None = None
    direction: CitationDirection
    neighbor_corpus_id: int | None = None
    neighbor_paper_id: str | None = None
    context_text: str
    intents: list[str] = Field(default_factory=list)
    score: float


class EntityMatchedPaperHit(RagSchema):
    corpus_id: int
    entity_type: str
    concept_id: str
    matched_terms: list[str] = Field(default_factory=list)
    score: float


class RelationMatchedPaperHit(RagSchema):
    corpus_id: int
    relation_type: str
    subject_type: str
    subject_id: str
    object_type: str
    object_id: str
    score: float


class PaperReference(RagSchema):
    corpus_id: int
    reference_id: int
    reference_index: int
    title: str | None = None
    year: int | None = None
    doi: str | None = None
    pmid: str | None = None
    pmcid: str | None = None
    referenced_paper_id: str | None = None
    referenced_corpus_id: int | None = None


class PaperAsset(RagSchema):
    corpus_id: int
    asset_id: int
    asset_kind: str
    remote_url: str | None = None
    storage_path: str | None = None
    access_status: str | None = None
    license: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphSignal(RagSchema):
    corpus_id: int
    paper_id: str | None = None
    signal_kind: GraphSignalKind
    channel: RetrievalChannel
    score: float
    rank: int
    reason: str | None = None
    matched_terms: list[str] = Field(default_factory=list)


class EvidenceBundle(RagSchema):
    paper: PaperEvidenceHit
    score: float
    rank: int
    snippet: str | None = None
    matched_channels: list[RetrievalChannel] = Field(default_factory=list)
    match_reasons: list[str] = Field(default_factory=list)
    rank_features: dict[str, float] = Field(default_factory=dict)
    citation_contexts: list[CitationContextHit] = Field(default_factory=list)
    entity_hits: list[EntityMatchedPaperHit] = Field(default_factory=list)
    relation_hits: list[RelationMatchedPaperHit] = Field(default_factory=list)
    references: list[PaperReference] = Field(default_factory=list)
    assets: list[PaperAsset] = Field(default_factory=list)


class RetrievalChannelHit(RagSchema):
    corpus_id: int
    paper_id: str | None = None
    score: float
    reasons: list[str] = Field(default_factory=list)


class RetrievalChannelResult(RagSchema):
    channel: RetrievalChannel
    hits: list[RetrievalChannelHit] = Field(default_factory=list)


class GroundedAnswer(RagSchema):
    segments: list[AnswerSegment] = Field(default_factory=list)
    inline_citations: list[InlineCitationAnchor] = Field(default_factory=list)
    cited_spans: list[CitedSpanPacket] = Field(default_factory=list)
    answer_linked_corpus_ids: list[int] = Field(default_factory=list)


class RagSearchRequest(RagSchema):
    graph_release_id: str
    query: str
    selected_layer_key: NodeLayer | None = None
    selected_node_id: str | None = None
    selected_graph_paper_ref: str | None = None
    selected_paper_id: str | None = None
    selection_graph_paper_refs: list[str] = Field(default_factory=list)
    selected_cluster_id: int | None = None
    scope_mode: RetrievalScope = RetrievalScope.GLOBAL
    entity_terms: list[str] = Field(default_factory=list)
    relation_terms: list[str] = Field(default_factory=list)
    evidence_intent: EvidenceIntent | None = None
    k: int = Field(default=6, ge=1, le=50)
    rerank_topn: int = Field(default=18, ge=1, le=200)
    use_lexical: bool = True
    use_dense_query: bool = True
    generate_answer: bool = True

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("query must not be empty")
        return stripped

    @field_validator("selection_graph_paper_refs", mode="before")
    @classmethod
    def normalize_selection_graph_paper_refs(
        cls, value: list[str] | None
    ) -> list[str]:
        if value is None:
            return []
        return value

    @field_validator("scope_mode", mode="before")
    @classmethod
    def normalize_scope_mode(
        cls, value: RetrievalScope | str | None
    ) -> RetrievalScope | str:
        if value is None:
            return RetrievalScope.GLOBAL
        return value


class RagSearchResponse(RagSchema):
    meta: ResponseMeta
    graph_context: GraphContext
    query: str
    answer: str | None = None
    answer_model: str | None = None
    answer_corpus_ids: list[int] = Field(default_factory=list)
    grounded_answer: GroundedAnswer | None = None
    evidence_bundles: list[EvidenceBundle] = Field(default_factory=list)
    graph_signals: list[GraphSignal] = Field(default_factory=list)
    retrieval_channels: list[RetrievalChannelResult] = Field(default_factory=list)


PaperSummary = PaperEvidenceHit
CitationContextHitSchema = CitationContextHit
EntityMatchedPaperHitSchema = EntityMatchedPaperHit
RelationMatchedPaperHitSchema = RelationMatchedPaperHit
PaperReferenceSchema = PaperReference
PaperAssetSchema = PaperAsset
GraphSignalSchema = GraphSignal
EvidenceBundleSchema = EvidenceBundle
RetrievalChannelHitSchema = RetrievalChannelHit
RetrievalChannelResultSchema = RetrievalChannelResult
