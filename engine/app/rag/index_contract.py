"""Deferred warehouse index matrix for the future RAG substrate."""

from __future__ import annotations

from enum import StrEnum

from pydantic import Field, model_validator

from app.rag.parse_contract import ParseContractModel


class RagIndexMethod(StrEnum):
    BTREE = "btree"
    GIN = "gin"


class IndexBuildPhase(StrEnum):
    INITIAL_SCHEMA = "initial_schema"
    POST_LOAD = "post_load"
    RETRIEVAL_READY = "retrieval_ready"


class IndexRole(StrEnum):
    STRUCTURAL_LOOKUP = "structural_lookup"
    LINEAGE_LOOKUP = "lineage_lookup"
    GROUNDING_LOOKUP = "grounding_lookup"
    LEXICAL_FALLBACK = "lexical_fallback"
    SERVING_LOOKUP = "serving_lookup"


class RagIndexSpec(ParseContractModel):
    name: str
    table_name: str
    method: RagIndexMethod
    role: IndexRole
    build_phase: IndexBuildPhase
    key_columns: list[str] = Field(default_factory=list)
    include_columns: list[str] = Field(default_factory=list)
    expression_sql: str | None = None
    predicate_sql: str | None = None
    concurrent_if_live: bool = False
    rationale: str

    @model_validator(mode="after")
    def validate_spec(self) -> "RagIndexSpec":
        if not self.name:
            raise ValueError("name must not be empty")
        if not self.table_name:
            raise ValueError("table_name must not be empty")
        if not self.key_columns and not self.expression_sql:
            raise ValueError("either key_columns or expression_sql must be present")
        if self.expression_sql and self.key_columns:
            raise ValueError("expression_sql and key_columns are mutually exclusive")
        if self.build_phase == IndexBuildPhase.POST_LOAD and not self.concurrent_if_live:
            raise ValueError("post-load indexes must be marked concurrent_if_live")
        return self


DENSE_RETRIEVAL_BOUNDARY = (
    "Do not plan pgvector ANN indexes on canonical warehouse span tables in the "
    "first contract. PostgreSQL owns structural lookup, provenance, bounded "
    "grounding, and lexical fallback. First-pass dense retrieval remains a "
    "future Qdrant concern."
)


def build_index_matrix() -> list[RagIndexSpec]:
    """Return the deferred warehouse index matrix."""

    return [
        RagIndexSpec(
            name="idx_paper_sections_parent",
            table_name="paper_sections",
            method=RagIndexMethod.BTREE,
            role=IndexRole.STRUCTURAL_LOOKUP,
            build_phase=IndexBuildPhase.INITIAL_SCHEMA,
            key_columns=["corpus_id", "parent_section_ordinal"],
            rationale="Supports section hierarchy reconstruction and parent-child traversal.",
        ),
        RagIndexSpec(
            name="idx_paper_blocks_section",
            table_name="paper_blocks",
            method=RagIndexMethod.BTREE,
            role=IndexRole.STRUCTURAL_LOOKUP,
            build_phase=IndexBuildPhase.INITIAL_SCHEMA,
            key_columns=["corpus_id", "section_ordinal", "block_ordinal"],
            rationale="Supports bounded block lookup inside one paper section.",
        ),
        RagIndexSpec(
            name="idx_paper_blocks_retrieval_default",
            table_name="paper_blocks",
            method=RagIndexMethod.BTREE,
            role=IndexRole.SERVING_LOOKUP,
            build_phase=IndexBuildPhase.INITIAL_SCHEMA,
            key_columns=["corpus_id", "section_role", "block_kind"],
            predicate_sql="is_retrieval_default",
            rationale="Supports fast filtering to default retrieval-eligible block classes.",
        ),
        RagIndexSpec(
            name="idx_paper_sentences_block",
            table_name="paper_sentences",
            method=RagIndexMethod.BTREE,
            role=IndexRole.GROUNDING_LOOKUP,
            build_phase=IndexBuildPhase.INITIAL_SCHEMA,
            key_columns=["corpus_id", "block_ordinal", "sentence_ordinal"],
            rationale="Supports sentence grounding lookup within one canonical block.",
        ),
        RagIndexSpec(
            name="idx_paper_reference_entries_source_key",
            table_name="paper_reference_entries",
            method=RagIndexMethod.BTREE,
            role=IndexRole.LINEAGE_LOOKUP,
            build_phase=IndexBuildPhase.INITIAL_SCHEMA,
            key_columns=["corpus_id", "source_reference_key"],
            rationale="Supports citation-mention to bibliography-entry resolution inside one paper.",
        ),
        RagIndexSpec(
            name="idx_paper_reference_entries_matched_corpus",
            table_name="paper_reference_entries",
            method=RagIndexMethod.BTREE,
            role=IndexRole.LINEAGE_LOOKUP,
            build_phase=IndexBuildPhase.INITIAL_SCHEMA,
            key_columns=["matched_corpus_id"],
            predicate_sql="matched_corpus_id IS NOT NULL",
            concurrent_if_live=False,
            rationale="Supports reverse lookup from matched cited paper to bibliography entries.",
        ),
        RagIndexSpec(
            name="idx_paper_citation_mentions_canonical_span",
            table_name="paper_citation_mentions",
            method=RagIndexMethod.BTREE,
            role=IndexRole.GROUNDING_LOOKUP,
            build_phase=IndexBuildPhase.INITIAL_SCHEMA,
            key_columns=["corpus_id", "canonical_block_ordinal", "canonical_sentence_ordinal"],
            predicate_sql="canonical_block_ordinal IS NOT NULL",
            rationale="Supports citation mention lookup for grounded spans.",
        ),
        RagIndexSpec(
            name="idx_paper_citation_mentions_source_key",
            table_name="paper_citation_mentions",
            method=RagIndexMethod.BTREE,
            role=IndexRole.LINEAGE_LOOKUP,
            build_phase=IndexBuildPhase.INITIAL_SCHEMA,
            key_columns=["corpus_id", "source_citation_key"],
            rationale="Supports source-local citation mention resolution and replay.",
        ),
        RagIndexSpec(
            name="idx_paper_citation_mentions_matched_corpus_lookup",
            table_name="paper_citation_mentions",
            method=RagIndexMethod.BTREE,
            role=IndexRole.LINEAGE_LOOKUP,
            build_phase=IndexBuildPhase.POST_LOAD,
            key_columns=["matched_corpus_id", "corpus_id"],
            predicate_sql="matched_corpus_id IS NOT NULL",
            concurrent_if_live=True,
            rationale="Supports cited-paper to citing-paper expansion without scanning all mention rows.",
        ),
        RagIndexSpec(
            name="idx_paper_entity_mentions_concept",
            table_name="paper_entity_mentions",
            method=RagIndexMethod.BTREE,
            role=IndexRole.GROUNDING_LOOKUP,
            build_phase=IndexBuildPhase.INITIAL_SCHEMA,
            key_columns=["concept_namespace", "concept_id", "corpus_id"],
            predicate_sql="concept_namespace IS NOT NULL AND concept_id IS NOT NULL",
            rationale="Supports concept-normalized entity lookup and query-time biasing.",
        ),
        RagIndexSpec(
            name="idx_paper_entity_mentions_canonical_span",
            table_name="paper_entity_mentions",
            method=RagIndexMethod.BTREE,
            role=IndexRole.GROUNDING_LOOKUP,
            build_phase=IndexBuildPhase.INITIAL_SCHEMA,
            key_columns=["corpus_id", "canonical_block_ordinal", "canonical_sentence_ordinal"],
            predicate_sql="canonical_block_ordinal IS NOT NULL",
            rationale="Supports aligned entity rendering inside cited spans.",
        ),
        RagIndexSpec(
            name="idx_paper_chunks_lookup",
            table_name="paper_chunks",
            method=RagIndexMethod.BTREE,
            role=IndexRole.SERVING_LOOKUP,
            build_phase=IndexBuildPhase.INITIAL_SCHEMA,
            key_columns=["chunk_version_key", "corpus_id"],
            rationale="Supports chunk lookup within one versioned serving policy.",
        ),
        RagIndexSpec(
            name="idx_paper_chunk_members_block",
            table_name="paper_chunk_members",
            method=RagIndexMethod.BTREE,
            role=IndexRole.SERVING_LOOKUP,
            build_phase=IndexBuildPhase.INITIAL_SCHEMA,
            key_columns=["corpus_id", "canonical_block_ordinal"],
            rationale="Supports block-to-chunk lineage resolution.",
        ),
        RagIndexSpec(
            name="idx_paper_chunk_members_sentence",
            table_name="paper_chunk_members",
            method=RagIndexMethod.BTREE,
            role=IndexRole.SERVING_LOOKUP,
            build_phase=IndexBuildPhase.INITIAL_SCHEMA,
            key_columns=["corpus_id", "canonical_block_ordinal", "canonical_sentence_ordinal"],
            predicate_sql="canonical_sentence_ordinal IS NOT NULL",
            rationale="Supports sentence-to-chunk lineage resolution.",
        ),
        RagIndexSpec(
            name="idx_paper_blocks_search_tsv",
            table_name="paper_blocks",
            method=RagIndexMethod.GIN,
            role=IndexRole.LEXICAL_FALLBACK,
            build_phase=IndexBuildPhase.POST_LOAD,
            expression_sql="search_tsv",
            concurrent_if_live=True,
            rationale="Supports lexical fallback over canonical blocks after load and normalization are stable.",
        ),
        RagIndexSpec(
            name="idx_paper_chunks_search_tsv",
            table_name="paper_chunks",
            method=RagIndexMethod.GIN,
            role=IndexRole.LEXICAL_FALLBACK,
            build_phase=IndexBuildPhase.POST_LOAD,
            expression_sql="search_tsv",
            concurrent_if_live=True,
            rationale="Supports lexical fallback over served chunk text when dense retrieval is unavailable or needs fusion.",
        ),
    ]
