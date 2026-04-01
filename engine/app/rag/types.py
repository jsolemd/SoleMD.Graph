"""Shared enums and constants for evidence retrieval."""

from __future__ import annotations

from enum import StrEnum


class NodeLayer(StrEnum):
    """Graph layer names carried through the evidence API."""

    PAPER = "paper"
    CHUNK = "chunk"


class RetrievalChannel(StrEnum):
    """Retrieval channels currently exposed by the baseline service."""

    LEXICAL = "lexical"
    CHUNK_LEXICAL = "chunk_lexical"
    DENSE_QUERY = "dense_query"
    ENTITY_MATCH = "entity_match"
    RELATION_MATCH = "relation_match"
    CITATION_CONTEXT = "citation_context"
    SEMANTIC_NEIGHBOR = "semantic_neighbor"


class GraphSignalKind(StrEnum):
    """Graph highlight signal families returned by the engine."""

    ENTITY_MATCH = "entity_match"
    RELATION_MATCH = "relation_match"
    CITATION_NEIGHBOR = "citation_neighbor"
    SEMANTIC_NEIGHBOR = "semantic_neighbor"
    ANSWER_EVIDENCE = "answer_evidence"
    ANSWER_SUPPORT = "answer_support"
    ANSWER_REFUTE = "answer_refute"


class CitationDirection(StrEnum):
    """Citation edge direction relative to the matched paper."""

    INCOMING = "incoming"
    OUTGOING = "outgoing"


class EvidenceIntent(StrEnum):
    """Explicit evidence intents for future Ask/Create support/refute flows."""

    SUPPORT = "support"
    REFUTE = "refute"
    BOTH = "both"


class RetrievalScope(StrEnum):
    """How broadly the backend should search for evidence."""

    GLOBAL = "global"
    SELECTION_ONLY = "selection_only"


class QueryRetrievalProfile(StrEnum):
    """Query-shape profiles used to tune runtime retrieval and ranking."""

    TITLE_LOOKUP = "title_lookup"
    PASSAGE_LOOKUP = "passage_lookup"
    GENERAL = "general"


DEFAULT_RETRIEVAL_VERSION = "baseline-postgres-v1"
DEFAULT_GRAPH_NAME = "living_graph"
DEFAULT_GRAPH_CACHE_CONTROL = "no-store"
DEFAULT_ANSWER_MODEL = "baseline-extractive-v1"

RETRIEVAL_CHANNEL_ORDER = (
    RetrievalChannel.LEXICAL,
    RetrievalChannel.CHUNK_LEXICAL,
    RetrievalChannel.DENSE_QUERY,
    RetrievalChannel.ENTITY_MATCH,
    RetrievalChannel.RELATION_MATCH,
    RetrievalChannel.CITATION_CONTEXT,
    RetrievalChannel.SEMANTIC_NEIGHBOR,
)

GRAPH_SIGNAL_ORDER = (
    GraphSignalKind.ANSWER_EVIDENCE,
    GraphSignalKind.ANSWER_SUPPORT,
    GraphSignalKind.ANSWER_REFUTE,
    GraphSignalKind.ENTITY_MATCH,
    GraphSignalKind.RELATION_MATCH,
    GraphSignalKind.CITATION_NEIGHBOR,
    GraphSignalKind.SEMANTIC_NEIGHBOR,
)
