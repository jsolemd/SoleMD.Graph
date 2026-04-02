"""Launch an engine job detached from the current terminal session."""

from __future__ import annotations

import argparse
import json
import subprocess
from collections.abc import Sequence
from pathlib import Path


def launch_detached_job(
    *,
    command: Sequence[str],
    cwd: Path,
    log_path: Path,
    pid_path: Path | None = None,
) -> dict[str, object]:
    normalized_command = [str(part) for part in command if str(part)]
    if not normalized_command:
        raise ValueError("command is required")

    normalized_cwd = cwd.resolve()
    normalized_log_path = log_path.resolve()
    normalized_log_path.parent.mkdir(parents=True, exist_ok=True)
    if pid_path is not None:
        pid_path = pid_path.resolve()
        pid_path.parent.mkdir(parents=True, exist_ok=True)

    with normalized_log_path.open("ab") as log_handle:
        process = subprocess.Popen(  # noqa: S603
            normalized_command,
            cwd=str(normalized_cwd),
            stdin=subprocess.DEVNULL,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True,
        )

    if pid_path is not None:
        pid_path.write_text(f"{process.pid}\n")

    return {
        "pid": process.pid,
        "cwd": str(normalized_cwd),
        "log_path": str(normalized_log_path),
        "pid_path": str(pid_path) if pid_path is not None else None,
        "command": normalized_command,
    }


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run an engine command detached with stdout/stderr redirected to a log file.",
    )
    parser.add_argument("--cwd", type=Path, default=Path.cwd())
    parser.add_argument("--log-path", type=Path, required=True)
    parser.add_argument("--pid-path", type=Path, default=None)
    parser.add_argument(
        "command",
        nargs=argparse.REMAINDER,
        help="Command to execute. Prefix with -- to separate launcher args from the child command.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    command = list(args.command)
    if command and command[0] == "--":
        command = command[1:]
    result = launch_detached_job(
        command=command,
        cwd=args.cwd,
        log_path=args.log_path,
        pid_path=args.pid_path,
    )
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
