"""Final enrichment, ranking, and response assembly for runtime search."""

from __future__ import annotations

from datetime import UTC, datetime
from time import perf_counter
from uuid import uuid4

from app.config import settings
from app.langfuse_config import SPAN_RAG_FINALIZE, observe
from app.langfuse_config import get_langfuse as _get_langfuse
from app.rag.answer import build_baseline_answer_payload
from app.rag.biomedical_reranking import RagBiomedicalReranker, apply_biomedical_rerank
from app.rag.bundle import assemble_evidence_bundles, merge_graph_signals
from app.rag.clinical_priors import should_apply_clinical_priors
from app.rag.models import (
    PaperEvidenceHit,
    RagSearchResult,
    RetrievalChannelHit,
    RetrievalChannelResult,
)
from app.rag.ranking import rank_paper_hits
from app.rag.repository import RagRepository
from app.rag.retrieval_fusion import (
    build_channel_rankings,
    build_entity_channel_hits,
    build_relation_channel_hits,
    derive_citation_seed_scores,
    merge_candidate_papers,
)
from app.rag.retrieval_policy import (
    biomedical_rerank_decision,
    citation_context_candidate_ids,
    entity_relation_candidate_ids,
    should_expand_citation_frontier,
    should_fetch_missing_citation_contexts,
    should_prefetch_citation_contexts,
)
from app.rag.runtime_trace import RuntimeTraceCollector
from app.rag.search_retrieval import (
    SearchRetrievalState,
    apply_cited_context_hits,
    apply_selected_context_hits,
)
from app.rag.search_support import callable_supports_kwarg
from app.rag.types import (
    DEFAULT_RETRIEVAL_VERSION,
    RETRIEVAL_CHANNEL_ORDER,
    ClinicalQueryIntent,
    RetrievalChannel,
    RetrievalScope,
)


def _compute_evidence_flags(
    *,
    top_hits: list[PaperEvidenceHit],
    species_profiles: dict[int, object],
    grounded_answer: object | None,
    bundles: list[object],
) -> dict[str, bool]:
    """Compute thin typed evidence applicability flags from existing signals."""
    flags: dict[str, bool] = {}

    if not top_hits:
        return flags

    top_corpus_ids = [hit.corpus_id for hit in top_hits]

    # direct_passage_support / indirect_only
    has_passage_support = False
    if grounded_answer is not None:
        cited_spans = getattr(grounded_answer, "cited_spans", [])
        has_passage_support = len(cited_spans) > 0
    flags["direct_passage_support"] = has_passage_support
    flags["indirect_only"] = not has_passage_support and len(bundles) > 0

    # species flags — check species_profiles for top hits
    if species_profiles:
        resolved_profiles = [
            species_profiles[cid]
            for cid in top_corpus_ids
            if cid in species_profiles
        ]
        if resolved_profiles:
            all_nonhuman = all(
                getattr(p, "human_mentions", 0) == 0
                and getattr(p, "nonhuman_mentions", 0) > 0
                for p in resolved_profiles
            )
            flags["nonhuman_only"] = all_nonhuman
            flags["species_unresolved"] = False
        else:
            flags["nonhuman_only"] = False
            flags["species_unresolved"] = True
    else:
        flags["nonhuman_only"] = False
        flags["species_unresolved"] = True

    # null_finding_present — check top bundle titles/snippets
    _NULL_FINDING_SIGNALS = (
        "no significant",
        "no difference",
        "not significant",
        "failed to show",
        "no effect",
        "no benefit",
        "did not improve",
        "no association",
        "no evidence",
        "nonsignificant",
        "non-significant",
        "negative trial",
        "negative result",
    )
    null_finding = False
    for bundle in bundles[:3]:  # Check top 3 bundles only
        title = getattr(getattr(bundle, "paper", None), "title", "") or ""
        snippet = getattr(bundle, "snippet", "") or ""
        combined = (title + " " + snippet).lower()
        if any(signal in combined for signal in _NULL_FINDING_SIGNALS):
            null_finding = True
            break
    flags["null_finding_present"] = null_finding

    # grounding depth classification
    grounding_depth = "none"
    if grounded_answer is not None:
        cited_spans = getattr(grounded_answer, "cited_spans", [])
        if cited_spans:
            has_body_spans = any(
                getattr(span, "section_role", None)
                not in (None, "abstract", "front_matter")
                for span in cited_spans
            )
            grounding_depth = "fulltext" if has_body_spans else "abstract"
    flags["grounding_depth_fulltext"] = grounding_depth == "fulltext"
    flags["grounding_depth_abstract"] = grounding_depth == "abstract"
    flags["grounding_depth_none"] = grounding_depth == "none"

    return flags


def _paper_id_for_corpus(corpus_id: int, paper_hits: list[PaperEvidenceHit]) -> str | None:
    for paper in paper_hits:
        if paper.corpus_id == corpus_id:
            return paper.paper_id
    return None


def _channel_result(
    channel: RetrievalChannel,
    hits: list[RetrievalChannelHit],
) -> RetrievalChannelResult:
    return RetrievalChannelResult(channel=channel, hits=hits)


def _empty_channel_results() -> list[RetrievalChannelResult]:
    return [_channel_result(channel, []) for channel in RETRIEVAL_CHANNEL_ORDER]


@observe(name=SPAN_RAG_FINALIZE)
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
    query_text = query.focused_query or query.query
    release = retrieval.release
    if not retrieval.initial_paper_hits:
        return RagSearchResult(
            request_id=str(uuid4()),
            generated_at=datetime.now(UTC),
            duration_ms=(perf_counter() - started) * 1000,
            retrieval_version=DEFAULT_RETRIEVAL_VERSION,
            query=query,
            graph_release=release,
            bundles=[],
            graph_signals=[],
            channels=_empty_channel_results(),
            answer=None,
            answer_model=None,
            debug_trace=trace.as_debug_trace(),
            evidence_flags={},
        )

    initial_corpus_ids = [hit.corpus_id for hit in retrieval.initial_paper_hits]
    citation_context_ids = (
        citation_context_candidate_ids(
            paper_hits=retrieval.initial_paper_hits,
            retrieval_profile=query.retrieval_profile,
            rerank_topn=query.rerank_topn,
            query_text=query_text,
            lexical_hits=retrieval.lexical_hits,
            cited_corpus_ids=query.cited_corpus_ids,
            selected_direct_anchor=retrieval.selected_direct_anchor,
        )
        if should_prefetch_citation_contexts(
            query=query,
            lexical_hits=retrieval.lexical_hits,
            chunk_lexical_hits=retrieval.chunk_lexical_hits,
        )
        else []
    )
    trace.record_count("citation_context_ids", len(citation_context_ids))
    citation_hits = (
        trace.call(
            "fetch_citation_contexts_initial",
            repository.fetch_citation_contexts,
            citation_context_ids,
            query=query_text,
        )
        if citation_context_ids
        else {}
    )
    trace.record_count("citation_hit_papers", len(citation_hits))
    allowed_scope_ids = (
        set(retrieval.scope_corpus_ids)
        if query.scope_mode == RetrievalScope.SELECTION_ONLY
        else None
    )
    expand_citation_frontier = should_expand_citation_frontier(
        query_text=query_text,
        lexical_hits=retrieval.lexical_hits,
        search_plan=retrieval.search_plan,
    )
    citation_seed_scores = (
        trace.call(
            "derive_citation_seed_scores",
            derive_citation_seed_scores,
            citation_hits=citation_hits,
            existing_corpus_ids=set(initial_corpus_ids),
            allowed_corpus_ids=allowed_scope_ids,
            limit=query.rerank_topn,
        )
        if expand_citation_frontier
        else {}
    )
    citation_seed_hits = (
        trace.call(
            "fetch_citation_seed_papers",
            repository.fetch_papers_by_corpus_ids,
            release.graph_run_id,
            list(citation_seed_scores),
        )
        if citation_seed_scores
        else []
    )
    trace.record_count("citation_seed_hits", len(citation_seed_hits))
    for hit in citation_seed_hits:
        hit.citation_boost = max(
            hit.citation_boost,
            citation_seed_scores.get(hit.corpus_id, 0.0),
        )
    paper_hits = trace.call(
        "merge_final_candidates",
        merge_candidate_papers,
        lexical_hits=retrieval.lexical_hits,
        chunk_lexical_hits=retrieval.chunk_lexical_hits,
        selected_context_hits=[],
        cited_context_hits=[],
        dense_query_hits=retrieval.dense_query_hits,
        entity_seed_hits=retrieval.entity_seed_hits,
        relation_seed_hits=retrieval.relation_seed_hits,
        citation_seed_hits=citation_seed_hits,
        semantic_seed_hits=retrieval.semantic_seed_hits,
        semantic_neighbors=retrieval.semantic_neighbors,
    )
    paper_hits = trace.call(
        "apply_selected_context_final",
        apply_selected_context_hits,
        repository=repository,
        paper_hits=paper_hits,
        selected_corpus_id=retrieval.selected_corpus_id,
        search_plan=retrieval.search_plan,
    )
    paper_hits = trace.call(
        "apply_cited_context_final",
        apply_cited_context_hits,
        repository=repository,
        paper_hits=paper_hits,
        cited_corpus_ids=query.cited_corpus_ids,
        search_plan=retrieval.search_plan,
    )
    trace.record_count("paper_hits", len(paper_hits))

    channel_rankings = trace.call(
        "build_channel_rankings",
        build_channel_rankings,
        lexical_hits=retrieval.lexical_hits,
        chunk_lexical_hits=retrieval.chunk_lexical_hits,
        dense_query_hits=retrieval.dense_query_hits,
        entity_seed_hits=retrieval.entity_seed_hits,
        relation_seed_hits=retrieval.relation_seed_hits,
        semantic_neighbors=retrieval.semantic_neighbors,
    )
    preliminary_ranked_hits = trace.call(
        "rank_preliminary_hits",
        rank_paper_hits,
        paper_hits,
        citation_hits=citation_hits,
        entity_hits={},
        relation_hits={},
        evidence_intent=query.evidence_intent,
        requested_publication_types=query.metadata_hints.requested_publication_types,
        query_text=query_text,
        retrieval_profile=query.retrieval_profile,
        channel_rankings=channel_rankings,
    )
    biomedical_reranker_status = getattr(
        biomedical_reranker,
        "runtime_status",
        lambda: {},
    )()
    biomedical_rerank_window = min(
        query.rerank_topn,
        settings.rag_live_biomedical_reranker_topn,
    )
    biomedical_rerank_requested, biomedical_rerank_reason = biomedical_rerank_decision(
        query=query,
        selected_corpus_id=retrieval.selected_corpus_id,
        ranked_papers=preliminary_ranked_hits,
        enabled=bool(biomedical_reranker_status.get("enabled", False)),
    )
    trace.record_flags(
        {
            "biomedical_rerank_requested": biomedical_rerank_requested,
            "biomedical_rerank_reason": biomedical_rerank_reason,
            "biomedical_rerank_topn": biomedical_rerank_window,
            "biomedical_reranker_enabled": biomedical_reranker_status.get(
                "enabled", False
            ),
            "biomedical_reranker_ready": biomedical_reranker_status.get("ready", False),
            "biomedical_reranker_backend": biomedical_reranker_status.get(
                "backend", "unknown"
            ),
        }
    )
    if biomedical_rerank_requested:
        biomedical_rerank_outcome = trace.call(
            "biomedical_rerank",
            apply_biomedical_rerank,
            preliminary_ranked_hits,
            query_text=query_text,
            reranker=biomedical_reranker,
            topn=biomedical_rerank_window,
        )
        trace.record_counts(
            {
                "biomedical_rerank_candidates": biomedical_rerank_outcome.candidate_count,
                "biomedical_rerank_promotions": biomedical_rerank_outcome.promoted_count,
            }
        )
        trace.record_flags(
            {
                "biomedical_rerank_applied": biomedical_rerank_outcome.applied,
                "biomedical_rerank_window_corpus_ids": (
                    biomedical_rerank_outcome.reranked_window_corpus_ids
                ),
                "biomedical_reranker_device": biomedical_reranker_status.get("device"),
            }
        )
        if biomedical_rerank_outcome.applied:
            preliminary_ranked_hits = trace.call(
                "rank_preliminary_hits_biomedical",
                rank_paper_hits,
                    preliminary_ranked_hits,
                    citation_hits=citation_hits,
                    entity_hits={},
                    relation_hits={},
                    evidence_intent=query.evidence_intent,
                    requested_publication_types=query.metadata_hints.requested_publication_types,
                    query_text=query_text,
                    retrieval_profile=query.retrieval_profile,
                    channel_rankings=channel_rankings,
            )

    enrichment_corpus_ids = entity_relation_candidate_ids(
        ranked_papers=preliminary_ranked_hits,
        retrieval_profile=query.retrieval_profile,
        k=query.k,
        rerank_topn=query.rerank_topn,
        query_text=query_text,
        lexical_hits=retrieval.lexical_hits,
        cited_corpus_ids=query.cited_corpus_ids,
        selected_corpus_id=retrieval.selected_corpus_id,
        selected_direct_anchor=retrieval.selected_direct_anchor,
    )
    trace.record_count("preliminary_ranked_hits", len(preliminary_ranked_hits))
    trace.record_count("enrichment_corpus_ids", len(enrichment_corpus_ids))
    clinical_prior_requested = (
        settings.rag_live_clinical_priors_enabled
        and should_apply_clinical_priors(query.clinical_intent)
    )
    trace.record_flags(
        {
            "clinical_query_intent": query.clinical_intent,
            "clinical_prior_requested": clinical_prior_requested,
        }
    )
    expanded_citation_hits = (
        trace.call(
            "fetch_citation_contexts_expanded",
            repository.fetch_citation_contexts,
            [hit.corpus_id for hit in citation_seed_hits],
            query=query_text,
        )
        if citation_seed_hits
        else {}
    )
    if expanded_citation_hits:
        citation_hits = {**citation_hits, **expanded_citation_hits}

    entity_hits = trace.call(
        "fetch_entity_matches",
        repository.fetch_entity_matches,
        enrichment_corpus_ids,
        entity_terms=retrieval.entity_enrichment_terms,
    )
    relation_hits = trace.call(
        "fetch_relation_matches",
        repository.fetch_relation_matches,
        enrichment_corpus_ids,
        relation_terms=query.relation_terms,
    )
    fetch_species_profiles = getattr(repository, "fetch_species_profiles", None)
    species_profiles = (
        trace.call(
            "fetch_species_profiles",
            fetch_species_profiles,
            enrichment_corpus_ids,
        )
        if clinical_prior_requested and callable(fetch_species_profiles)
        else {}
    )
    trace.record_count("entity_hit_papers", len(entity_hits))
    trace.record_count("relation_hit_papers", len(relation_hits))
    trace.record_count("species_profile_papers", len(species_profiles))
    ranking_clinical_intent = (
        query.clinical_intent
        if clinical_prior_requested
        else ClinicalQueryIntent.GENERAL
    )
    ranked_hits = trace.call(
        "rank_final_hits",
        rank_paper_hits,
        paper_hits,
        citation_hits=citation_hits,
        entity_hits=entity_hits,
        relation_hits=relation_hits,
        species_profiles=species_profiles,
        evidence_intent=query.evidence_intent,
        requested_publication_types=query.metadata_hints.requested_publication_types,
        query_text=query_text,
        retrieval_profile=query.retrieval_profile,
        clinical_intent=ranking_clinical_intent,
        channel_rankings=channel_rankings,
    )
    top_hits = ranked_hits[: query.k]
    top_corpus_ids = [hit.corpus_id for hit in top_hits]
    trace.record_count("ranked_hits", len(ranked_hits))
    trace.record_count("top_hits", len(top_hits))

    missing_citation_context_ids = (
        [
            corpus_id
            for corpus_id in citation_context_candidate_ids(
                paper_hits=top_hits,
                retrieval_profile=query.retrieval_profile,
                rerank_topn=query.rerank_topn,
                query_text=query_text,
                lexical_hits=retrieval.lexical_hits,
                cited_corpus_ids=query.cited_corpus_ids,
                selected_direct_anchor=retrieval.selected_direct_anchor,
            )
            if corpus_id not in citation_hits
        ]
        if should_fetch_missing_citation_contexts(
            retrieval_profile=query.retrieval_profile,
            precise_title_resolution=retrieval.precise_title_resolution,
            top_hits=top_hits,
        )
        else []
    )
    if missing_citation_context_ids:
        citation_hits = {
            **citation_hits,
            **trace.call(
                "fetch_citation_contexts_missing_top_hits",
                repository.fetch_citation_contexts,
                missing_citation_context_ids,
                query=query_text,
            ),
        }

    references = trace.call(
        "fetch_references",
        repository.fetch_references,
        top_corpus_ids,
    )
    authors = trace.call(
        "fetch_authors",
        repository.fetch_authors,
        top_corpus_ids,
    )
    assets = trace.call(
        "fetch_assets",
        repository.fetch_assets,
        top_corpus_ids,
    )
    bundles = trace.call(
        "assemble_evidence_bundles",
        assemble_evidence_bundles,
        top_hits,
        citation_hits=citation_hits,
        entity_hits=entity_hits,
        relation_hits=relation_hits,
        authors=authors,
        references=references,
        assets=assets,
    )
    graph_signals = trace.call(
        "merge_graph_signals",
        merge_graph_signals,
        bundles,
        evidence_intent=query.evidence_intent,
        semantic_neighbors=retrieval.semantic_neighbors,
    )
    trace.record_count("bundle_count", len(bundles))
    trace.record_count("graph_signal_count", len(graph_signals))
    answer_payload = (
        trace.call(
            "build_answer_payload",
            build_baseline_answer_payload,
            bundles,
            evidence_intent=query.evidence_intent,
            query_text=query.normalized_query,
            query_profile=query.retrieval_profile,
            selected_corpus_id=retrieval.selected_corpus_id,
        )
        if query.generate_answer
        else None
    )
    answer = answer_payload.text if answer_payload else None
    answer_model = answer_payload.model if answer_payload else None
    answer_corpus_ids = (
        list(answer_payload.grounding_corpus_ids)
        if answer_payload is not None
        else []
    )
    trace.record_count("answer_corpus_ids", len(answer_corpus_ids))
    grounded_answer = None
    if warehouse_grounder and answer and answer_corpus_ids:
        grounded_answer_kwargs = {
            "corpus_ids": answer_corpus_ids,
            "segment_texts": (
                list(answer_payload.segment_texts)
                if answer_payload and answer_payload.segment_texts
                else [answer]
            ),
            "segment_corpus_ids": (
                list(answer_payload.segment_corpus_ids)
                if answer_payload and answer_payload.segment_corpus_ids
                else None
            ),
        }
        if callable_supports_kwarg(warehouse_grounder, "trace"):
            grounded_answer_kwargs["trace"] = trace
        grounded_answer = trace.call(
            "build_grounded_answer",
            warehouse_grounder,
            **grounded_answer_kwargs,
        )

    channels = [
        _channel_result(
            RetrievalChannel.LEXICAL,
            [
                RetrievalChannelHit(
                    corpus_id=paper.corpus_id,
                    paper_id=paper.paper_id,
                    score=paper.lexical_score,
                    reasons=["Matched title/abstract query terms"],
                )
                for paper in retrieval.lexical_hits[: query.k]
            ],
        ),
        _channel_result(
            RetrievalChannel.CHUNK_LEXICAL,
            [
                RetrievalChannelHit(
                    corpus_id=paper.corpus_id,
                    paper_id=paper.paper_id,
                    score=paper.chunk_lexical_score,
                    reasons=[paper.chunk_snippet or "Matched retrieval-default chunk text"],
                )
                for paper in retrieval.chunk_lexical_hits[: query.k]
            ],
        ),
        _channel_result(
            RetrievalChannel.DENSE_QUERY,
            [
                RetrievalChannelHit(
                    corpus_id=paper.corpus_id,
                    paper_id=paper.paper_id,
                    score=paper.dense_score,
                    reasons=["Matched SPECTER2 ad-hoc dense query"],
                )
                for paper in retrieval.dense_query_hits[: query.k]
            ],
        ),
        _channel_result(
            RetrievalChannel.ENTITY_MATCH,
            build_entity_channel_hits(
                entity_seed_hits=retrieval.entity_seed_hits,
                entity_hits=entity_hits,
                paper_hits=paper_hits,
                entity_terms=retrieval.entity_enrichment_terms,
            ),
        ),
        _channel_result(
            RetrievalChannel.RELATION_MATCH,
            build_relation_channel_hits(
                relation_seed_hits=retrieval.relation_seed_hits,
                relation_hits=relation_hits,
                paper_hits=paper_hits,
                relation_terms=query.relation_terms,
            ),
        ),
        _channel_result(
            RetrievalChannel.CITATION_CONTEXT,
            [
                RetrievalChannelHit(
                    corpus_id=item.corpus_id,
                    paper_id=_paper_id_for_corpus(item.corpus_id, paper_hits),
                    score=item.score,
                    reasons=[item.context_text[:120]],
                )
                for hits in citation_hits.values()
                for item in hits
            ],
        ),
        _channel_result(
            RetrievalChannel.SEMANTIC_NEIGHBOR,
            [
                RetrievalChannelHit(
                    corpus_id=item.corpus_id,
                    paper_id=item.paper_id,
                    score=item.score,
                    reasons=[item.reason or "Semantic neighbor"],
                )
                for item in retrieval.semantic_neighbors
            ],
        ),
    ]
    evidence_flags = _compute_evidence_flags(
        top_hits=top_hits,
        species_profiles=species_profiles,
        grounded_answer=grounded_answer,
        bundles=bundles,
    )
    debug = trace.as_debug_trace()
    result = RagSearchResult(
        request_id=str(uuid4()),
        generated_at=datetime.now(UTC),
        duration_ms=(perf_counter() - started) * 1000,
        retrieval_version=DEFAULT_RETRIEVAL_VERSION,
        query=query,
        graph_release=release,
        bundles=bundles,
        graph_signals=graph_signals,
        channels=channels,
        answer_corpus_ids=answer_corpus_ids,
        answer=answer,
        answer_model=answer_model,
        grounded_answer=grounded_answer,
        debug_trace=debug,
        evidence_flags=evidence_flags,
    )

    try:
        client = _get_langfuse()
        top_corpus_ids = [b.paper.corpus_id for b in bundles[:5]] if bundles else []
        client.update_current_span(
            output={
                "top_corpus_ids": top_corpus_ids,
                "bundle_count": len(bundles),
                "answer_model": answer_model,
                "answer_present": answer is not None,
                "grounded_answer_present": grounded_answer is not None,
                "answer_corpus_ids": answer_corpus_ids,
                "duration_ms": result.duration_ms,
            },
            metadata={
                "stage_durations_ms": debug.get("stage_durations_ms", {}),
                "candidate_counts": debug.get("candidate_counts", {}),
            },
        )
    except Exception:
        pass

    return result
