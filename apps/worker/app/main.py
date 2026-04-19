from __future__ import annotations

import argparse
import asyncio
import json
from collections.abc import Sequence
import os

import dramatiq

from app.broker import configure_broker
from app.config import settings
from app.db import build_pool_specs, probe_postgres_target, probe_redis_target


broker = configure_broker()

from app.ingest.cli import (
    dispatch_manifest_requests,
    enqueue_release_request,
    parse_dispatch_manifest_request,
    parse_manual_release_request,
)


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
    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
