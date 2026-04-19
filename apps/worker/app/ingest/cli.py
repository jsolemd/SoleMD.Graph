from __future__ import annotations

from collections.abc import Iterable

from app.actors.ingest import start_release
from app.ingest.models import StartReleaseRequest


def parse_manual_release_request(
    *,
    source_code: str,
    release_tag: str,
    force_new_run: bool,
    requested_by: str | None,
    family_allowlist: list[str] | None,
    max_files_per_family: int | None,
    max_records_per_file: int | None,
) -> StartReleaseRequest:
    return StartReleaseRequest.model_validate(
        {
            "source_code": source_code,
            "release_tag": release_tag,
            "force_new_run": force_new_run,
            "trigger": "manual",
            "requested_by": requested_by,
            "family_allowlist": family_allowlist,
            "max_files_per_family": max_files_per_family,
            "max_records_per_file": max_records_per_file,
        }
    )


def parse_dispatch_manifest_request(
    *,
    source_code: str,
    release_tag: str,
    requested_by: str | None,
    family_allowlist: list[str] | None,
    max_files_per_family: int | None,
    max_records_per_file: int | None,
) -> StartReleaseRequest:
    return StartReleaseRequest.model_validate(
        {
            "source_code": source_code,
            "release_tag": release_tag,
            "trigger": "manifest",
            "requested_by": requested_by,
            "family_allowlist": family_allowlist,
            "max_files_per_family": max_files_per_family,
            "max_records_per_file": max_records_per_file,
        }
    )


def enqueue_release_request(request: StartReleaseRequest) -> None:
    start_release.send(**request.model_dump(mode="json"))


def dispatch_manifest_requests(requests: Iterable[StartReleaseRequest]) -> None:
    for request in requests:
        enqueue_release_request(request)
