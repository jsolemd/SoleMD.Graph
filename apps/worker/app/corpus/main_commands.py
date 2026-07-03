from __future__ import annotations

import asyncio
import os

from app.config import settings
from app.corpus.cli import (
    enqueue_corpus_quality_audit_request,
    enqueue_corpus_selection_phase_requests,
    enqueue_corpus_selection_request,
    enqueue_evidence_wave_request,
    enqueue_selection_summary_refresh_request,
    parse_corpus_quality_audit_request,
    parse_corpus_selection_request,
    parse_evidence_wave_request,
    parse_selection_summary_refresh_request,
)
from app.corpus.quality_audit import run_corpus_quality_audit
from app.corpus.runtime import (
    dispatch_evidence_wave as run_evidence_wave_dispatch,
    run_corpus_selection,
)
from app.corpus.summary_refresh import run_selection_summary_refresh
from app.db import open_pools


CORPUS_COMMANDS = frozenset(
    {
        "enqueue-corpus-selection",
        "dispatch-corpus-selection",
        "run-corpus-selection-now",
        "enqueue-selection-summary-refresh",
        "run-selection-summary-refresh-now",
        "enqueue-corpus-quality-audit",
        "run-corpus-quality-audit-now",
        "enqueue-evidence-wave",
        "run-evidence-wave-now",
    }
)


def add_corpus_command_parsers(subparsers) -> None:
    enqueue_corpus_selection_parser = subparsers.add_parser(
        "enqueue-corpus-selection",
        help="Validate and enqueue one release-pair corpus-selection request.",
    )
    _add_corpus_selection_args(enqueue_corpus_selection_parser)

    dispatch_corpus_selection_parser = subparsers.add_parser(
        "dispatch-corpus-selection",
        help="Validate and enqueue the dispatch-triggered corpus-selection payload.",
    )
    _add_corpus_selection_args(dispatch_corpus_selection_parser)

    run_corpus_selection_parser = subparsers.add_parser(
        "run-corpus-selection-now",
        help="Run one release-pair corpus-selection request directly in-process.",
    )
    _add_corpus_selection_args(run_corpus_selection_parser)

    enqueue_summary_refresh_parser = subparsers.add_parser(
        "enqueue-selection-summary-refresh",
        help=(
            "Validate and enqueue a post-enrichment refresh for one published "
            "corpus-selection summary."
        ),
    )
    _add_selection_summary_refresh_args(enqueue_summary_refresh_parser)

    run_summary_refresh_parser = subparsers.add_parser(
        "run-selection-summary-refresh-now",
        help=(
            "Run a post-enrichment refresh for one published corpus-selection "
            "summary directly in-process."
        ),
    )
    _add_selection_summary_refresh_args(run_summary_refresh_parser)

    enqueue_quality_audit_parser = subparsers.add_parser(
        "enqueue-corpus-quality-audit",
        help="Validate and enqueue one corpus quality-audit snapshot.",
    )
    _add_quality_audit_args(enqueue_quality_audit_parser)

    run_quality_audit_parser = subparsers.add_parser(
        "run-corpus-quality-audit-now",
        help="Run one corpus quality-audit snapshot directly in-process.",
    )
    _add_quality_audit_args(run_quality_audit_parser)

    enqueue_evidence_wave_parser = subparsers.add_parser(
        "enqueue-evidence-wave",
        help="Validate and enqueue one mapped-paper evidence child wave.",
    )
    _add_evidence_wave_args(enqueue_evidence_wave_parser)

    run_evidence_wave_parser = subparsers.add_parser(
        "run-evidence-wave-now",
        help="Run one mapped-paper evidence child wave directly in-process.",
    )
    _add_evidence_wave_args(run_evidence_wave_parser)


def handle_corpus_command(args, broker) -> int | None:
    if args.command not in CORPUS_COMMANDS:
        return None
    if args.command in {"enqueue-corpus-selection", "dispatch-corpus-selection"}:
        request = parse_corpus_selection_request(
            s2_release_tag=args.s2_release_tag,
            pt3_release_tag=args.pt3_release_tag,
            selector_version=args.selector_version,
            force_new_run=args.force_new_run,
            trigger="manual" if args.command == "enqueue-corpus-selection" else "dispatch",
            requested_by=args.requested_by,
            phase_allowlist=args.phases,
        )
        if args.command == "dispatch-corpus-selection":
            enqueue_corpus_selection_phase_requests(request)
        else:
            enqueue_corpus_selection_request(request)
        broker.close()
        return 0
    if args.command == "run-corpus-selection-now":
        request = parse_corpus_selection_request(
            s2_release_tag=args.s2_release_tag,
            pt3_release_tag=args.pt3_release_tag,
            selector_version=args.selector_version,
            force_new_run=args.force_new_run,
            trigger="manual",
            requested_by=args.requested_by,
            phase_allowlist=args.phases,
        )
        print(asyncio.run(_run_corpus_selection(request)))
        return 0
    if args.command == "enqueue-selection-summary-refresh":
        request = _parse_selection_summary_refresh_args(args)
        enqueue_selection_summary_refresh_request(request)
        broker.close()
        return 0
    if args.command == "run-selection-summary-refresh-now":
        request = _parse_selection_summary_refresh_args(args)
        print(asyncio.run(_run_selection_summary_refresh(request)))
        return 0
    if args.command == "enqueue-corpus-quality-audit":
        request = _parse_quality_audit_args(args)
        enqueue_corpus_quality_audit_request(request)
        broker.close()
        return 0
    if args.command == "run-corpus-quality-audit-now":
        request = _parse_quality_audit_args(args)
        print(asyncio.run(_run_corpus_quality_audit(request)))
        return 0
    if args.command == "enqueue-evidence-wave":
        request = _parse_evidence_wave_args(args)
        enqueue_evidence_wave_request(request)
        broker.close()
        return 0
    if args.command == "run-evidence-wave-now":
        request = _parse_evidence_wave_args(args)
        print(asyncio.run(_run_evidence_wave_dispatch(request)))
        return 0
    return None


def _add_corpus_selection_args(parser) -> None:
    parser.add_argument("s2_release_tag")
    parser.add_argument("pt3_release_tag")
    parser.add_argument("selector_version")
    parser.add_argument("--force-new-run", action="store_true")
    parser.add_argument("--requested-by", default=os.environ.get("USER"))
    parser.add_argument("--phase", action="append", dest="phases", default=None)


def _add_selection_summary_refresh_args(parser) -> None:
    parser.add_argument("corpus_selection_run_id")
    parser.add_argument("--s2-graph-enrichment-run-id", default=None)
    parser.add_argument("--pubmed-metadata-fetch-run-id", default=None)
    parser.add_argument("--requested-by", default=os.environ.get("USER"))


def _add_quality_audit_args(parser) -> None:
    parser.add_argument("corpus_selection_run_id")
    parser.add_argument("--requested-by", default=os.environ.get("USER"))
    parser.add_argument("--sample-size", type=int, default=12)


def _add_evidence_wave_args(parser) -> None:
    parser.add_argument("s2_release_tag")
    parser.add_argument("pt3_release_tag")
    parser.add_argument("selector_version")
    parser.add_argument("--wave-policy-key", default="evidence_missing_pmc_bioc")
    parser.add_argument("--force-new-run", action="store_true")
    parser.add_argument("--requested-by", default=os.environ.get("USER"))
    parser.add_argument("--max-papers", type=int, default=None)


def _parse_selection_summary_refresh_args(args):
    return parse_selection_summary_refresh_request(
        corpus_selection_run_id=args.corpus_selection_run_id,
        requested_by=args.requested_by,
        s2_graph_enrichment_run_id=args.s2_graph_enrichment_run_id,
        pubmed_metadata_fetch_run_id=args.pubmed_metadata_fetch_run_id,
    )


def _parse_quality_audit_args(args):
    return parse_corpus_quality_audit_request(
        corpus_selection_run_id=args.corpus_selection_run_id,
        requested_by=args.requested_by,
        sample_size=args.sample_size,
    )


def _parse_evidence_wave_args(args):
    return parse_evidence_wave_request(
        s2_release_tag=args.s2_release_tag,
        pt3_release_tag=args.pt3_release_tag,
        selector_version=args.selector_version,
        wave_policy_key=args.wave_policy_key,
        force_new_run=args.force_new_run,
        requested_by=args.requested_by,
        max_papers=args.max_papers,
    )


async def _run_corpus_selection(request) -> str:
    pools = await open_pools(settings, names=("ingest_write",))
    try:
        return await run_corpus_selection(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=settings,
        )
    finally:
        await pools.close()


async def _run_selection_summary_refresh(request) -> str:
    pools = await open_pools(settings, names=("ingest_write",))
    try:
        return await run_selection_summary_refresh(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=settings,
        )
    finally:
        await pools.close()


async def _run_corpus_quality_audit(request) -> str:
    pools = await open_pools(settings, names=("ingest_write",))
    try:
        return await run_corpus_quality_audit(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=settings,
        )
    finally:
        await pools.close()


async def _run_evidence_wave_dispatch(request) -> str:
    pools = await open_pools(settings, names=("ingest_write",))
    try:
        return await run_evidence_wave_dispatch(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=settings,
        )
    finally:
        await pools.close()
