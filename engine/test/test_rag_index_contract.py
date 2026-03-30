from __future__ import annotations

from app.rag.index_contract import (
    DENSE_RETRIEVAL_BOUNDARY,
    IndexBuildPhase,
    IndexRole,
    RagIndexMethod,
    build_index_matrix,
)


def test_build_index_matrix_includes_post_load_lexical_fallback_on_blocks_and_chunks():
    indexes = {index.name: index for index in build_index_matrix()}

    assert indexes["idx_paper_blocks_search_tsv"].build_phase == IndexBuildPhase.POST_LOAD
    assert indexes["idx_paper_blocks_search_tsv"].method == RagIndexMethod.GIN
    assert indexes["idx_paper_blocks_search_tsv"].expression_sql == "search_tsv"
    assert indexes["idx_paper_blocks_search_tsv"].concurrent_if_live is True

    assert indexes["idx_paper_chunks_search_tsv"].build_phase == IndexBuildPhase.POST_LOAD
    assert indexes["idx_paper_chunks_search_tsv"].method == RagIndexMethod.GIN
    assert indexes["idx_paper_chunks_search_tsv"].role == IndexRole.LEXICAL_FALLBACK


def test_index_matrix_keeps_sentence_table_out_of_global_lexical_fallback():
    sentence_indexes = [
        index
        for index in build_index_matrix()
        if index.table_name == "paper_sentences"
    ]

    assert all(index.role != IndexRole.LEXICAL_FALLBACK for index in sentence_indexes)


def test_index_matrix_uses_post_load_lineage_index_for_citation_reverse_lookup():
    indexes = {index.name: index for index in build_index_matrix()}
    citation_lookup = indexes["idx_paper_citation_mentions_matched_corpus_lookup"]

    assert citation_lookup.build_phase == IndexBuildPhase.POST_LOAD
    assert citation_lookup.concurrent_if_live is True
    assert citation_lookup.key_columns == ["matched_corpus_id", "corpus_id"]


def test_dense_retrieval_boundary_keeps_ann_out_of_postgres_first_contract():
    assert "Qdrant" in DENSE_RETRIEVAL_BOUNDARY
    assert "pgvector ANN indexes" in DENSE_RETRIEVAL_BOUNDARY
