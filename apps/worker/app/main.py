from __future__ import annotations

import argparse
import json
import socket
from collections.abc import Sequence

import dramatiq

from app.broker import configure_broker
from app.config import DependencyTarget, settings


broker = configure_broker()


def check_dependency(target: DependencyTarget, timeout: float) -> dict[str, object]:
    try:
        with socket.create_connection((target.host, target.port), timeout=timeout):
            return {
                "name": target.name,
                "host": target.host,
                "port": target.port,
                "ok": True,
            }
    except OSError as exc:
        return {
            "name": target.name,
            "host": target.host,
            "port": target.port,
            "ok": False,
            "error": str(exc),
        }


def run_startup_check() -> int:
    checks = [
        check_dependency(target, settings.worker_startup_timeout_seconds)
        for target in settings.startup_targets
    ]
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
    return run_startup_check()


if __name__ == "__main__":
    raise SystemExit(main())
