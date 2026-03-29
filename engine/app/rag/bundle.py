"""Evidence bundle and graph-signal assembly."""

from __future__ import annotations

from collections import defaultdict

from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    EvidenceBundle,
    GraphSignal,
    PaperAssetRecord,
    PaperEvidenceHit,
    PaperReferenceRecord,
    RelationMatchedPaperHit,
)
from app.rag.types import GRAPH_SIGNAL_ORDER, GraphSignalKind, RetrievalChannel


def build_preview_text(
    paper: PaperEvidenceHit,
    citation_hits: list[CitationContextHit],
) -> str | None:
    """Build a short preview string for the current baseline UI."""

    if citation_hits:
        return citation_hits[0].context_text
    if paper.tldr:
        return paper.tldr.strip()[:320]
    if paper.abstract:
        return paper.abstract.strip()[:320]
    if paper.title:
        return paper.title
    return None


def build_bundle_graph_signals(
    paper: PaperEvidenceHit,
    citation_hits: list[CitationContextHit],
    entity_hits: list[EntityMatchedPaperHit],
    relation_hits: list[RelationMatchedPaperHit],
) -> list[GraphSignal]:
    """Derive graph-lighting signals from one paper bundle."""

    primary_channel = (
        paper.matched_channels[0]
        if paper.matched_channels
        else RetrievalChannel.LEXICAL
    )
    signals = [
        GraphSignal(
            corpus_id=paper.corpus_id,
            paper_id=paper.paper_id,
            signal_kind=GraphSignalKind.ANSWER_SUPPORT,
            channel=primary_channel,
            score=paper.fused_score,
            rank=paper.rank,
            reason="Top supporting paper for the current query",
        )
    ]

    if entity_hits:
        signals.append(
            GraphSignal(
                corpus_id=paper.corpus_id,
                paper_id=paper.paper_id,
                signal_kind=GraphSignalKind.ENTITY_MATCH,
                channel=RetrievalChannel.ENTITY_MATCH,
                score=max(item.score for item in entity_hits),
                rank=paper.rank,
                reason="Paper carries an entity match for the query",
                matched_terms=sorted({term for item in entity_hits for term in item.matched_terms}),
            )
        )

    if relation_hits:
        signals.append(
            GraphSignal(
                corpus_id=paper.corpus_id,
                paper_id=paper.paper_id,
                signal_kind=GraphSignalKind.RELATION_MATCH,
                channel=RetrievalChannel.RELATION_MATCH,
                score=max(item.score for item in relation_hits),
                rank=paper.rank,
                reason="Paper carries a relation match for the query",
                matched_terms=sorted({item.relation_type for item in relation_hits}),
            )
        )

    for item in citation_hits:
        if item.neighbor_corpus_id is None:
            continue
        signals.append(
            GraphSignal(
                corpus_id=item.neighbor_corpus_id,
                paper_id=item.neighbor_paper_id,
                signal_kind=GraphSignalKind.CITATION_NEIGHBOR,
                channel=RetrievalChannel.CITATION_CONTEXT,
                score=item.score,
                rank=paper.rank,
                reason=(
                    f"{item.direction.value.capitalize()} citation context "
                    "linked to a supporting paper"
                ),
                matched_terms=item.intents,
            )
        )
    return signals


def assemble_evidence_bundles(
    paper_hits: list[PaperEvidenceHit],
    *,
    citation_hits: dict[int, list[CitationContextHit]],
    entity_hits: dict[int, list[EntityMatchedPaperHit]],
    relation_hits: dict[int, list[RelationMatchedPaperHit]],
    references: dict[int, list[PaperReferenceRecord]],
    assets: dict[int, list[PaperAssetRecord]],
) -> list[EvidenceBundle]:
    """Assemble evidence bundles from ranked paper hits and enrichment lookups."""

    bundles: list[EvidenceBundle] = []
    for paper in paper_hits:
        paper_citation_hits = citation_hits.get(paper.corpus_id, [])
        paper_entity_hits = entity_hits.get(paper.corpus_id, [])
        paper_relation_hits = relation_hits.get(paper.corpus_id, [])
        bundles.append(
            EvidenceBundle(
                paper=paper,
                score=paper.fused_score,
                rank=paper.rank,
                snippet=build_preview_text(paper, paper_citation_hits),
                matched_channels=paper.matched_channels,
                match_reasons=paper.match_reasons,
                rank_features={
                    "lexical": paper.lexical_score,
                    "title_similarity": paper.title_similarity,
                    "citation_context": paper.citation_boost,
                    "entity_match": paper.entity_score,
                    "relation_match": paper.relation_score,
                    "semantic_neighbor": paper.semantic_score,
                },
                citation_contexts=paper_citation_hits,
                entity_hits=paper_entity_hits,
                relation_hits=paper_relation_hits,
                references=references.get(paper.corpus_id, []),
                assets=assets.get(paper.corpus_id, []),
            )
        )
    return bundles


def merge_graph_signals(
    bundles: list[EvidenceBundle],
    *,
    semantic_neighbors: list[GraphSignal] | None = None,
) -> list[GraphSignal]:
    """Merge and deduplicate graph-lighting signals across bundles."""

    best_by_key: dict[tuple[str, int], GraphSignal] = {}
    for bundle in bundles:
        for signal in build_bundle_graph_signals(
            bundle.paper,
            bundle.citation_contexts,
            bundle.entity_hits,
            bundle.relation_hits,
        ):
            key = (signal.signal_kind.value, signal.corpus_id)
            current = best_by_key.get(key)
            if current is None or signal.score > current.score:
                best_by_key[key] = signal

    for signal in semantic_neighbors or []:
        key = (signal.signal_kind.value, signal.corpus_id)
        current = best_by_key.get(key)
        if current is None or signal.score > current.score:
            best_by_key[key] = signal

    grouped: dict[GraphSignalKind, list[GraphSignal]] = defaultdict(list)
    for signal in best_by_key.values():
        grouped[signal.signal_kind].append(signal)

    merged: list[GraphSignal] = []
    for signal_kind in GRAPH_SIGNAL_ORDER:
        signals = sorted(grouped.get(signal_kind, []), key=lambda item: item.score, reverse=True)
        for index, signal in enumerate(signals, start=1):
            signal.rank = index
            merged.append(signal)
    return merged
