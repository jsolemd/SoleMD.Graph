from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from scripts.run_detached_engine_job import launch_detached_job


def test_launch_detached_job_writes_pid_and_runs_command(tmp_path: Path):
    marker_path = tmp_path / "marker.txt"
    log_path = tmp_path / "job.log"
    pid_path = tmp_path / "job.pid"
    worker_path = tmp_path / "worker.py"
    worker_path.write_text(
        "from pathlib import Path\n"
        "import sys\n"
        "Path(sys.argv[1]).write_text('ready')\n"
        "print('worker complete')\n"
    )

    result = launch_detached_job(
        command=[sys.executable, str(worker_path), str(marker_path)],
        cwd=tmp_path,
        log_path=log_path,
        pid_path=pid_path,
    )

    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline and not marker_path.exists():
        time.sleep(0.05)

    assert marker_path.read_text() == "ready"
    assert log_path.read_text().strip() == "worker complete"
    assert int(pid_path.read_text().strip()) == result["pid"]
    assert result["command"] == [sys.executable, str(worker_path), str(marker_path)]


def test_run_detached_engine_job_main_accepts_separator(tmp_path: Path):
    marker_path = tmp_path / "marker.txt"
    log_path = tmp_path / "job.log"
    pid_path = tmp_path / "job.pid"
    worker_path = tmp_path / "worker.py"
    worker_path.write_text(
        "from pathlib import Path\n"
        "import sys\n"
        "Path(sys.argv[1]).write_text('ok')\n"
    )

    command = [
        sys.executable,
        str(Path("scripts/run_detached_engine_job.py")),
        "--cwd",
        str(tmp_path),
        "--log-path",
        str(log_path),
        "--pid-path",
        str(pid_path),
        "--",
        sys.executable,
        str(worker_path),
        str(marker_path),
    ]
    completed = __import__("subprocess").run(
        command,
        cwd=Path(__file__).resolve().parents[1],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(completed.stdout)

    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline and not marker_path.exists():
        time.sleep(0.05)

    assert marker_path.read_text() == "ok"
    assert int(pid_path.read_text().strip()) == payload["pid"]
