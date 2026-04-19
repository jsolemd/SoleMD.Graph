from __future__ import annotations

import io
import gzip
import json
from pathlib import Path
import tarfile


def write_jsonl_gz(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt") as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")


def write_tsv_gz(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt") as handle:
        for line in lines:
            handle.write(line + "\n")


def write_tar_gz(path: Path, *, members: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(path, "w:gz") as archive:
        for member_name, content in members.items():
            data = content.encode("utf-8")
            info = tarfile.TarInfo(name=member_name)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))


def write_manifest(path: Path, *, dataset: str, release_tag: str, output_dir: Path, file_names: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "dataset": dataset,
        "release_id": release_tag,
        "source": f"test://{dataset}",
        "output_dir": str(output_dir),
        "verification_method": "test",
        "generated_at": "2026-04-18T00:00:00+00:00",
        "file_count": len(file_names),
        "files": [
            {
                "name": file_name,
                "bytes": (output_dir / file_name).stat().st_size,
                "verified": True,
            }
            for file_name in file_names
        ],
    }
    path.write_text(json.dumps(payload, indent=2) + "\n")
