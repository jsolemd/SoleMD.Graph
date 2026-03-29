"""Internal domain models for the evidence and RAG baseline."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.rag.types import (
    CitationDirection,
    EvidenceIntent,
    GraphSignalKind,
    NodeLayer,
    RetrievalChannel,
)


@dataclass(slots=True)
class PaperRetrievalQuery:
    """Normalized retrieval query used by the service and repository."""

    graph_release_id: str
    query: str
    normalized_query: str
    entity_terms: list[str] = field(default_factory=list)
    relation_terms: list[str] = field(default_factory=list)
    selected_layer_key: NodeLayer | None = None
    selected_node_id: str | None = None
    selected_paper_id: str | None = None
    selected_cluster_id: int | None = None
    evidence_intent: EvidenceIntent | None = None
    k: int = 6
    rerank_topn: int = 18
    use_lexical: bool = True
    generate_answer: bool = True


@dataclass(frozen=True, slots=True)
class GraphRelease:
    """Resolved graph release metadata for evidence requests."""

    graph_release_id: str
    graph_run_id: str
    bundle_checksum: str | None
    graph_name: str
    is_current: bool


@dataclass(slots=True)
class PaperEvidenceHit:
    """Paper-level retrieval hit used as the bundle spine."""

    corpus_id: int
    paper_id: str | None
    semantic_scholar_paper_id: str | None
    title: str | None
    journal_name: str | None
    year: int | None
    doi: str | None
    pmid: int | None
    pmcid: str | None
    abstract: str | None
    tldr: str | None
    text_availability: str | None
    is_open_access: bool | None
    citation_count: int | None = None
    reference_count: int | None = None
    lexical_score: float = 0.0
    title_similarity: float = 0.0
    citation_boost: float = 0.0
    entity_score: float = 0.0
    relation_score: float = 0.0
    semantic_score: float = 0.0
    fused_score: float = 0.0
    rank: int = 0
    matched_channels: list[RetrievalChannel] = field(default_factory=list)
    match_reasons: list[str] = field(default_factory=list)


@dataclass(slots=True)
class CitationContextHit:
    """Citation-context evidence associated with a paper."""

    corpus_id: int
    citation_id: int | None
    direction: CitationDirection
    neighbor_corpus_id: int | None
    context_text: str
    neighbor_paper_id: str | None = None
    intents: list[str] = field(default_factory=list)
    score: float = 0.0


@dataclass(slots=True)
class EntityMatchedPaperHit:
    """Entity match metadata for a paper."""

    corpus_id: int
    entity_type: str
    concept_id: str
    matched_terms: list[str] = field(default_factory=list)
    score: float = 0.0


@dataclass(slots=True)
class RelationMatchedPaperHit:
    """Relation match metadata for a paper."""

    corpus_id: int
    relation_type: str
    subject_type: str
    subject_id: str
    object_type: str
    object_id: str
    score: float = 0.0


@dataclass(slots=True)
class PaperReferenceRecord:
    """Reference summary attached to an evidence bundle."""

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


@dataclass(slots=True)
class PaperAssetRecord:
    """Asset summary attached to an evidence bundle."""

    corpus_id: int
    asset_id: int
    asset_kind: str
    remote_url: str | None = None
    storage_path: str | None = None
    access_status: str | None = None
    license: str | None = None
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(slots=True)
class RetrievalChannelHit:
    """One paper returned by an individual retrieval channel."""

    corpus_id: int
    paper_id: str | None
    score: float
    reasons: list[str] = field(default_factory=list)


@dataclass(slots=True)
class RetrievalChannelResult:
    """Top hits returned for a retrieval channel."""

    channel: RetrievalChannel
    hits: list[RetrievalChannelHit] = field(default_factory=list)


@dataclass(slots=True)
class GraphSignal:
    """Graph-lighting signal derived from evidence or neighbor retrieval."""

    corpus_id: int
    paper_id: str | None
    signal_kind: GraphSignalKind
    channel: RetrievalChannel
    score: float
    rank: int
    reason: str | None = None
    matched_terms: list[str] = field(default_factory=list)


@dataclass(slots=True)
class EvidenceBundle:
    """Assembled evidence bundle for one paper."""

    paper: PaperEvidenceHit
    score: float
    rank: int
    snippet: str | None = None
    matched_channels: list[RetrievalChannel] = field(default_factory=list)
    match_reasons: list[str] = field(default_factory=list)
    rank_features: dict[str, float] = field(default_factory=dict)
    citation_contexts: list[CitationContextHit] = field(default_factory=list)
    entity_hits: list[EntityMatchedPaperHit] = field(default_factory=list)
    relation_hits: list[RelationMatchedPaperHit] = field(default_factory=list)
    references: list[PaperReferenceRecord] = field(default_factory=list)
    assets: list[PaperAssetRecord] = field(default_factory=list)


@dataclass(slots=True)
class RagSearchResult:
    """Internal response object before Pydantic serialization."""

    request_id: str
    generated_at: datetime
    duration_ms: float
    retrieval_version: str
    query: PaperRetrievalQuery
    graph_release: GraphRelease
    bundles: list[EvidenceBundle]
    graph_signals: list[GraphSignal]
    channels: list[RetrievalChannelResult]
    answer: str | None = None
    answer_model: str | None = None
