from __future__ import annotations

import argparse
import asyncio
import json
from collections.abc import Sequence

import dramatiq

from app.broker import configure_broker
from app.config import settings
from app.db import probe_postgres_target, probe_redis_target


broker = configure_broker()


async def run_startup_check() -> int:
    dsn_map = {
        "serve_read": (settings.serve_dsn_read, 0),
        "serve_admin": (settings.serve_dsn_admin, settings.admin_statement_cache_size),
        "warehouse_ingest": (settings.warehouse_dsn_ingest, 0),
        "warehouse_read": (settings.warehouse_dsn_read, settings.admin_statement_cache_size),
        "warehouse_admin": (settings.warehouse_dsn_admin, settings.admin_statement_cache_size),
    }
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
    parser.add_argument(
        "command",
        nargs="?",
        choices=("check",),
        default="check",
        help="Run the worker startup probe.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return asyncio.run(run_startup_check())


if __name__ == "__main__":
    raise SystemExit(main())
