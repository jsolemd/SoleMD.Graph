from __future__ import annotations

import argparse
import asyncio
import json
from collections.abc import Sequence
import os

import dramatiq

from app.broker import configure_broker
from app.config import settings
from app.db import build_pool_specs, open_pools, probe_postgres_target, probe_redis_target
from app.telemetry.bootstrap import prepare_worker_metrics_environment


prepare_worker_metrics_environment(settings, scope="cli", clean_on_boot=False)
broker = configure_broker(metrics_scope="cli")

from app.ingest.cli import (
    dispatch_manifest_requests,
    enqueue_release_request,
    parse_dispatch_manifest_request,
    parse_manual_release_request,
)
from app.corpus.cli import (
    enqueue_corpus_selection_request,
    enqueue_evidence_wave_request,
    parse_corpus_selection_request,
    parse_evidence_wave_request,
)
from app.corpus.runtime import (
    dispatch_evidence_wave as run_evidence_wave_dispatch,
    run_corpus_selection,
)
from app.evidence.cli import enqueue_paper_text_request, parse_paper_text_request
from app.evidence.runtime import acquire_paper_text


async def run_startup_check() -> int:
    pool_specs = build_pool_specs(settings)
    dsn_map = {
        "warehouse_ingest": (
            settings.warehouse_dsn_ingest,
            pool_specs["ingest_write"].statement_cache_size
            if "ingest_write" in pool_specs
            else 0,
        ),
        "warehouse_read": (
            settings.warehouse_dsn_read,
            pool_specs["warehouse_read"].statement_cache_size
            if "warehouse_read" in pool_specs
            else 0,
        ),
        "warehouse_admin": (
            settings.warehouse_dsn_admin,
            settings.admin_statement_cache_size,
        ),
    }
    if settings.serve_dsn_read and "serve_read" in pool_specs:
        dsn_map["serve_read"] = (
            settings.serve_dsn_read,
            pool_specs["serve_read"].statement_cache_size,
        )
    if settings.serve_dsn_admin and "admin" in pool_specs:
        dsn_map["serve_admin"] = (
            settings.serve_dsn_admin,
            pool_specs["admin"].statement_cache_size,
        )
    checks = await asyncio.gather(
        *(
            probe_redis_target(
                target,
                redis_url=settings.redis_url,
                timeout=settings.worker_startup_timeout_seconds,
            )
            if target.name == "redis"
            else probe_postgres_target(
                target,
                dsn=dsn_map[target.name][0] or "",
                timeout=settings.worker_startup_timeout_seconds,
                statement_cache_size=dsn_map[target.name][1],
            )
            for target in settings.startup_targets
        )
    )
    status = "ready" if all(check["ok"] for check in checks) else "not_ready"
    payload = {
        "status": status,
        "service": settings.service_name,
        "checks": checks,
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if status == "ready" else 1


@dramatiq.actor(queue_name="system")
def startup_probe() -> None:
    return None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="SoleMD.Graph worker bootstrap")
    subparsers = parser.add_subparsers(dest="command", required=False)

    subparsers.add_parser("check", help="Run the worker startup probe.")

    enqueue_parser = subparsers.add_parser(
        "enqueue-release",
        help="Validate and enqueue one release-level ingest request.",
    )
    enqueue_parser.add_argument("source_code", choices=("s2", "pt3"))
    enqueue_parser.add_argument("release_tag")
    enqueue_parser.add_argument("--force-new-run", action="store_true")
    enqueue_parser.add_argument("--requested-by", default=os.environ.get("USER"))
    enqueue_parser.add_argument("--max-files-per-family", type=int, default=None)
    enqueue_parser.add_argument("--max-records-per-file", type=int, default=None)
    enqueue_parser.add_argument("--family", action="append", dest="families", default=None)

    manifest_parser = subparsers.add_parser(
        "dispatch-manifest",
        help="Validate manifest-discovered releases and enqueue the shared ingest payload.",
    )
    manifest_parser.add_argument("source_code", choices=("s2", "pt3"))
    manifest_parser.add_argument("release_tag")
    manifest_parser.add_argument("--requested-by", default=os.environ.get("USER"))
    manifest_parser.add_argument("--max-files-per-family", type=int, default=None)
    manifest_parser.add_argument("--max-records-per-file", type=int, default=None)
    manifest_parser.add_argument("--family", action="append", dest="families", default=None)

    enqueue_evidence_text_parser = subparsers.add_parser(
        "enqueue-evidence-text",
        help="Validate and enqueue one paper-level targeted evidence-text acquisition request.",
    )
    enqueue_evidence_text_parser.add_argument("corpus_id", type=int)
    enqueue_evidence_text_parser.add_argument("--force-refresh", action="store_true")
    enqueue_evidence_text_parser.add_argument(
        "--requested-by",
        default=os.environ.get("USER"),
    )

    run_evidence_text_parser = subparsers.add_parser(
        "run-evidence-text-now",
        help="Run one paper-level targeted evidence-text acquisition directly in-process.",
    )
    run_evidence_text_parser.add_argument("corpus_id", type=int)
    run_evidence_text_parser.add_argument("--force-refresh", action="store_true")
    run_evidence_text_parser.add_argument(
        "--requested-by",
        default=os.environ.get("USER"),
    )

    enqueue_corpus_selection_parser = subparsers.add_parser(
        "enqueue-corpus-selection",
        help="Validate and enqueue one release-pair corpus-selection request.",
    )
    enqueue_corpus_selection_parser.add_argument("s2_release_tag")
    enqueue_corpus_selection_parser.add_argument("pt3_release_tag")
    enqueue_corpus_selection_parser.add_argument("selector_version")
    enqueue_corpus_selection_parser.add_argument("--force-new-run", action="store_true")
    enqueue_corpus_selection_parser.add_argument(
        "--requested-by",
        default=os.environ.get("USER"),
    )
    enqueue_corpus_selection_parser.add_argument(
        "--phase",
        action="append",
        dest="phases",
        default=None,
    )

    dispatch_corpus_selection_parser = subparsers.add_parser(
        "dispatch-corpus-selection",
        help="Validate and enqueue the dispatch-triggered corpus-selection payload.",
    )
    dispatch_corpus_selection_parser.add_argument("s2_release_tag")
    dispatch_corpus_selection_parser.add_argument("pt3_release_tag")
    dispatch_corpus_selection_parser.add_argument("selector_version")
    dispatch_corpus_selection_parser.add_argument("--force-new-run", action="store_true")
    dispatch_corpus_selection_parser.add_argument(
        "--requested-by",
        default=os.environ.get("USER"),
    )
    dispatch_corpus_selection_parser.add_argument(
        "--phase",
        action="append",
        dest="phases",
        default=None,
    )

    run_corpus_selection_parser = subparsers.add_parser(
        "run-corpus-selection-now",
        help="Run one release-pair corpus-selection request directly in-process.",
    )
    run_corpus_selection_parser.add_argument("s2_release_tag")
    run_corpus_selection_parser.add_argument("pt3_release_tag")
    run_corpus_selection_parser.add_argument("selector_version")
    run_corpus_selection_parser.add_argument("--force-new-run", action="store_true")
    run_corpus_selection_parser.add_argument(
        "--requested-by",
        default=os.environ.get("USER"),
    )
    run_corpus_selection_parser.add_argument(
        "--phase",
        action="append",
        dest="phases",
        default=None,
    )

    enqueue_evidence_wave_parser = subparsers.add_parser(
        "enqueue-evidence-wave",
        help="Validate and enqueue one mapped-paper evidence child wave.",
    )
    enqueue_evidence_wave_parser.add_argument("s2_release_tag")
    enqueue_evidence_wave_parser.add_argument("pt3_release_tag")
    enqueue_evidence_wave_parser.add_argument("selector_version")
    enqueue_evidence_wave_parser.add_argument(
        "--wave-policy-key",
        default="evidence_missing_pmc_bioc",
    )
    enqueue_evidence_wave_parser.add_argument("--force-new-run", action="store_true")
    enqueue_evidence_wave_parser.add_argument(
        "--requested-by",
        default=os.environ.get("USER"),
    )
    enqueue_evidence_wave_parser.add_argument("--max-papers", type=int, default=None)

    run_evidence_wave_parser = subparsers.add_parser(
        "run-evidence-wave-now",
        help="Run one mapped-paper evidence child wave directly in-process.",
    )
    run_evidence_wave_parser.add_argument("s2_release_tag")
    run_evidence_wave_parser.add_argument("pt3_release_tag")
    run_evidence_wave_parser.add_argument("selector_version")
    run_evidence_wave_parser.add_argument(
        "--wave-policy-key",
        default="evidence_missing_pmc_bioc",
    )
    run_evidence_wave_parser.add_argument("--force-new-run", action="store_true")
    run_evidence_wave_parser.add_argument(
        "--requested-by",
        default=os.environ.get("USER"),
    )
    run_evidence_wave_parser.add_argument("--max-papers", type=int, default=None)

    parser.set_defaults(command="check")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "check":
        return asyncio.run(run_startup_check())
    if args.command == "enqueue-release":
        request = parse_manual_release_request(
            source_code=args.source_code,
            release_tag=args.release_tag,
            force_new_run=args.force_new_run,
            requested_by=args.requested_by,
            family_allowlist=args.families,
            max_files_per_family=args.max_files_per_family,
            max_records_per_file=args.max_records_per_file,
        )
        enqueue_release_request(request)
        broker.close()
        return 0
    if args.command == "dispatch-manifest":
        request = parse_dispatch_manifest_request(
            source_code=args.source_code,
            release_tag=args.release_tag,
            requested_by=args.requested_by,
            family_allowlist=args.families,
            max_files_per_family=args.max_files_per_family,
            max_records_per_file=args.max_records_per_file,
        )
        dispatch_manifest_requests((request,))
        broker.close()
        return 0
    if args.command == "enqueue-evidence-text":
        request = parse_paper_text_request(
            corpus_id=args.corpus_id,
            force_refresh=args.force_refresh,
            requested_by=args.requested_by,
        )
        enqueue_paper_text_request(request)
        broker.close()
        return 0
    if args.command == "run-evidence-text-now":
        request = parse_paper_text_request(
            corpus_id=args.corpus_id,
            force_refresh=args.force_refresh,
            requested_by=args.requested_by,
        )

        async def _run() -> str:
            pools = await open_pools(settings, names=("ingest_write",))
            try:
                return await acquire_paper_text(
                    request,
                    ingest_pool=pools.get("ingest_write"),
                    runtime_settings=settings,
                )
            finally:
                await pools.close()

        print(asyncio.run(_run()))
        return 0
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

        async def _run() -> str:
            pools = await open_pools(settings, names=("ingest_write",))
            try:
                return await run_corpus_selection(
                    request,
                    ingest_pool=pools.get("ingest_write"),
                    runtime_settings=settings,
                )
            finally:
                await pools.close()

        print(asyncio.run(_run()))
        return 0
    if args.command == "enqueue-evidence-wave":
        request = parse_evidence_wave_request(
            s2_release_tag=args.s2_release_tag,
            pt3_release_tag=args.pt3_release_tag,
            selector_version=args.selector_version,
            wave_policy_key=args.wave_policy_key,
            force_new_run=args.force_new_run,
            requested_by=args.requested_by,
            max_papers=args.max_papers,
        )
        enqueue_evidence_wave_request(request)
        broker.close()
        return 0
    if args.command == "run-evidence-wave-now":
        request = parse_evidence_wave_request(
            s2_release_tag=args.s2_release_tag,
            pt3_release_tag=args.pt3_release_tag,
            selector_version=args.selector_version,
            wave_policy_key=args.wave_policy_key,
            force_new_run=args.force_new_run,
            requested_by=args.requested_by,
            max_papers=args.max_papers,
        )

        async def _run() -> str:
            pools = await open_pools(settings, names=("ingest_write",))
            try:
                return await run_evidence_wave_dispatch(
                    request,
                    ingest_pool=pools.get("ingest_write"),
                    runtime_settings=settings,
                )
            finally:
                await pools.close()

        print(asyncio.run(_run()))
        return 0
    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
