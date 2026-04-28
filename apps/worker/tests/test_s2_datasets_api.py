from __future__ import annotations

import io
import json
from urllib.error import HTTPError

from app.ingest.s2_datasets_api import SemanticScholarDatasetsClient
from app.ingest.s2_diff import plan_s2_diffs
from app.config import settings


class _Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_exc_info):
        self.close()


class _Opener:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def open(self, request, *, timeout):
        self.requests.append((request, timeout))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return _Response(json.dumps(response).encode("utf-8"))


def test_s2_datasets_client_uses_key_headers_and_parses_diffs() -> None:
    opener = _Opener(
        [
            {
                "dataset": "papers",
                "start_release": "2026-03-10",
                "end_release": "2026-04-07",
                "diffs": [
                    {
                        "from_release": "2026-03-10",
                        "to_release": "2026-04-07",
                        "update_files": ["https://example.test/update.jsonl.gz"],
                        "delete_files": ["https://example.test/delete.jsonl.gz"],
                    }
                ],
            }
        ]
    )
    client = SemanticScholarDatasetsClient(
        base_url="https://api.semanticscholar.org/datasets/v1",
        api_key="test-key",
        user_agent="SoleMD.Graph/test",
        timeout_seconds=12.0,
        max_attempts=1,
        opener=opener,
    )

    report = client.get_diffs(
        start_release_id="2026-03-10",
        end_release_id="latest",
        dataset_name="papers",
    )

    request, timeout = opener.requests[0]
    assert timeout == 12.0
    assert request.headers["X-api-key"] == "test-key"
    assert request.headers["User-agent"] == "SoleMD.Graph/test"
    assert request.full_url.endswith("/diffs/2026-03-10/to/latest/papers")
    assert report.dataset == "papers"
    assert report.end_release == "2026-04-07"
    assert report.diffs[0].update_files == ("https://example.test/update.jsonl.gz",)
    assert report.diffs[0].delete_files == ("https://example.test/delete.jsonl.gz",)


def test_s2_datasets_client_retries_retry_after_responses() -> None:
    opener = _Opener(
        [
            HTTPError(
                "https://api.semanticscholar.org/datasets/v1/release/",
                429,
                "too many requests",
                {"Retry-After": "0"},
                None,
            ),
            ["2026-03-10", "2026-04-07"],
        ]
    )
    client = SemanticScholarDatasetsClient(
        base_url="https://api.semanticscholar.org/datasets/v1",
        api_key=None,
        user_agent="SoleMD.Graph/test",
        timeout_seconds=12.0,
        max_attempts=2,
        opener=opener,
        sleep=lambda _seconds: None,
    )

    assert client.list_releases() == ("2026-03-10", "2026-04-07")
    assert len(opener.requests) == 2


def test_plan_s2_diffs_defaults_to_core_raw_families() -> None:
    opener = _Opener(
        [["2026-03-10", "2026-04-07"]]
        + [
            {
                "dataset": dataset,
                "start_release": "2026-03-10",
                "end_release": "2026-04-07",
                "diffs": [
                    {
                        "from_release": "2026-03-10",
                        "to_release": "2026-04-07",
                        "update_files": [f"https://example.test/{dataset}/update.jsonl.gz"],
                        "delete_files": [],
                    }
                ],
            }
            for dataset in ("publication-venues", "authors", "papers", "abstracts")
        ]
    )
    client = SemanticScholarDatasetsClient(
        base_url="https://api.semanticscholar.org/datasets/v1",
        api_key=None,
        user_agent="SoleMD.Graph/test",
        timeout_seconds=12.0,
        max_attempts=1,
        opener=opener,
    )

    report = plan_s2_diffs(
        settings,
        start_release="2026-03-10",
        end_release="latest",
        client=client,
    )

    assert report.end_release == "2026-04-07"
    assert [(item.family, item.dataset) for item in report.families] == [
        ("publication_venues", "publication-venues"),
        ("authors", "authors"),
        ("papers", "papers"),
        ("abstracts", "abstracts"),
    ]


def test_plan_s2_diffs_rejects_unknown_families() -> None:
    client = SemanticScholarDatasetsClient(
        base_url="https://api.semanticscholar.org/datasets/v1",
        api_key=None,
        user_agent="SoleMD.Graph/test",
        timeout_seconds=12.0,
        max_attempts=1,
        opener=_Opener([]),
    )

    try:
        plan_s2_diffs(
            settings,
            start_release="2026-03-10",
            end_release="latest",
            family_allowlist=("not_a_family",),
            client=client,
        )
    except ValueError as exc:
        assert "not_a_family" in str(exc)
    else:
        raise AssertionError("unknown family should fail before calling the S2 API")


def test_plan_s2_diffs_returns_noop_when_latest_is_current_release() -> None:
    opener = _Opener([["2026-03-03", "2026-03-10"]])
    client = SemanticScholarDatasetsClient(
        base_url="https://api.semanticscholar.org/datasets/v1",
        api_key=None,
        user_agent="SoleMD.Graph/test",
        timeout_seconds=12.0,
        max_attempts=1,
        opener=opener,
    )

    report = plan_s2_diffs(
        settings,
        start_release="2026-03-10",
        end_release="latest",
        family_allowlist=("papers",),
        client=client,
    )

    assert report.start_release == "2026-03-10"
    assert report.end_release == "2026-03-10"
    assert [(item.family, len(item.diff_report.diffs)) for item in report.families] == [
        ("papers", 0)
    ]
    assert len(opener.requests) == 1
