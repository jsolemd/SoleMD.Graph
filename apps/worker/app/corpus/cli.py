from __future__ import annotations

from app.actors.corpus import (
    dispatch_evidence_wave,
    dispatch_selection_phases,
    refresh_selection_summary,
    run_quality_audit,
    start_selection,
)
from app.corpus.models import (
    DispatchEvidenceWaveRequest,
    StartCorpusQualityAuditRequest,
    StartCorpusSelectionRequest,
    StartSelectionSummaryRefreshRequest,
)


def parse_corpus_selection_request(
    *,
    s2_release_tag: str,
    pt3_release_tag: str,
    selector_version: str,
    force_new_run: bool,
    trigger: str,
    requested_by: str | None,
    phase_allowlist: list[str] | None,
) -> StartCorpusSelectionRequest:
    return StartCorpusSelectionRequest.model_validate(
        {
            "s2_release_tag": s2_release_tag,
            "pt3_release_tag": pt3_release_tag,
            "selector_version": selector_version,
            "force_new_run": force_new_run,
            "trigger": trigger,
            "requested_by": requested_by,
            "phase_allowlist": phase_allowlist,
        }
    )


def parse_evidence_wave_request(
    *,
    s2_release_tag: str,
    pt3_release_tag: str,
    selector_version: str,
    wave_policy_key: str,
    force_new_run: bool,
    requested_by: str | None,
    max_papers: int | None,
) -> DispatchEvidenceWaveRequest:
    return DispatchEvidenceWaveRequest.model_validate(
        {
            "s2_release_tag": s2_release_tag,
            "pt3_release_tag": pt3_release_tag,
            "selector_version": selector_version,
            "wave_policy_key": wave_policy_key,
            "force_new_run": force_new_run,
            "requested_by": requested_by,
            "max_papers": max_papers,
        }
    )


def parse_selection_summary_refresh_request(
    *,
    corpus_selection_run_id: str,
    requested_by: str | None,
    s2_graph_enrichment_run_id: str | None,
    pubmed_metadata_fetch_run_id: str | None,
) -> StartSelectionSummaryRefreshRequest:
    return StartSelectionSummaryRefreshRequest.model_validate(
        {
            "corpus_selection_run_id": corpus_selection_run_id,
            "requested_by": requested_by,
            "s2_graph_enrichment_run_id": s2_graph_enrichment_run_id,
            "pubmed_metadata_fetch_run_id": pubmed_metadata_fetch_run_id,
        }
    )


def parse_corpus_quality_audit_request(
    *,
    corpus_selection_run_id: str,
    requested_by: str | None,
    sample_size: int,
) -> StartCorpusQualityAuditRequest:
    return StartCorpusQualityAuditRequest.model_validate(
        {
            "corpus_selection_run_id": corpus_selection_run_id,
            "requested_by": requested_by,
            "sample_size": sample_size,
        }
    )


def enqueue_corpus_selection_request(request: StartCorpusSelectionRequest) -> None:
    start_selection.send(**request.model_dump(mode="json"))


def enqueue_corpus_selection_phase_requests(
    request: StartCorpusSelectionRequest,
) -> None:
    dispatch_selection_phases.send(**request.model_dump(mode="json"))


def enqueue_evidence_wave_request(request: DispatchEvidenceWaveRequest) -> None:
    dispatch_evidence_wave.send(**request.model_dump(mode="json"))


def enqueue_selection_summary_refresh_request(
    request: StartSelectionSummaryRefreshRequest,
) -> None:
    refresh_selection_summary.send(**request.model_dump(mode="json"))


def enqueue_corpus_quality_audit_request(
    request: StartCorpusQualityAuditRequest,
) -> None:
    run_quality_audit.send(**request.model_dump(mode="json"))
