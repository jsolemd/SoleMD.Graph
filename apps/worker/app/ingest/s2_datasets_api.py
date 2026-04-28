from __future__ import annotations

from dataclasses import dataclass
from email.utils import parsedate_to_datetime
import json
import random
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin
from urllib.request import Request, build_opener

from app.config import Settings


_RETRY_STATUS_CODES = frozenset({429, 500, 502, 503, 504})


class SemanticScholarDatasetsApiError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class S2DatasetDiff:
    from_release: str
    to_release: str
    update_files: tuple[str, ...]
    delete_files: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class S2DatasetDiffReport:
    dataset: str
    start_release: str
    end_release: str
    diffs: tuple[S2DatasetDiff, ...]
    api_url: str

    @property
    def payload_checksum(self) -> str:
        import hashlib

        payload = {
            "dataset": self.dataset,
            "start_release": self.start_release,
            "end_release": self.end_release,
            "diffs": [
                {
                    "from_release": item.from_release,
                    "to_release": item.to_release,
                    "update_files": item.update_files,
                    "delete_files": item.delete_files,
                }
                for item in self.diffs
            ],
        }
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()

    def to_jsonable(self) -> dict[str, Any]:
        return {
            "dataset": self.dataset,
            "start_release": self.start_release,
            "end_release": self.end_release,
            "api_url": self.api_url,
            "payload_checksum": self.payload_checksum,
            "diffs": [
                {
                    "from_release": item.from_release,
                    "to_release": item.to_release,
                    "update_file_count": len(item.update_files),
                    "delete_file_count": len(item.delete_files),
                    "update_files": item.update_files,
                    "delete_files": item.delete_files,
                }
                for item in self.diffs
            ],
        }


class SemanticScholarDatasetsClient:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None,
        user_agent: str,
        timeout_seconds: float,
        max_attempts: int,
        opener: Any | None = None,
        sleep=time.sleep,
    ) -> None:
        self._base_url = base_url.rstrip("/") + "/"
        self._api_key = api_key.strip() if api_key else None
        self._user_agent = user_agent
        self._timeout_seconds = timeout_seconds
        self._max_attempts = max(1, max_attempts)
        self._opener = opener or build_opener()
        self._sleep = sleep

    @classmethod
    def from_settings(cls, settings: Settings) -> "SemanticScholarDatasetsClient":
        return cls(
            base_url=settings.semantic_scholar_api_base_url,
            api_key=settings.semantic_scholar_api_key,
            user_agent=settings.semantic_scholar_api_user_agent,
            timeout_seconds=settings.semantic_scholar_api_timeout_seconds,
            max_attempts=settings.semantic_scholar_api_max_attempts,
        )

    def list_releases(self) -> tuple[str, ...]:
        payload = self._request_json("release/")
        if not isinstance(payload, list):
            raise SemanticScholarDatasetsApiError("S2 release list response was not a list")
        return tuple(str(item) for item in payload)

    def get_release(self, release_id: str) -> dict[str, Any]:
        payload = self._request_json(f"release/{quote(release_id, safe='')}")
        if not isinstance(payload, dict):
            raise SemanticScholarDatasetsApiError("S2 release response was not an object")
        return payload

    def get_dataset(self, release_id: str, dataset_name: str) -> dict[str, Any]:
        payload = self._request_json(
            f"release/{quote(release_id, safe='')}/dataset/{quote(dataset_name, safe='')}"
        )
        if not isinstance(payload, dict):
            raise SemanticScholarDatasetsApiError("S2 dataset response was not an object")
        return payload

    def get_diffs(
        self,
        *,
        start_release_id: str,
        end_release_id: str,
        dataset_name: str,
    ) -> S2DatasetDiffReport:
        path = (
            f"diffs/{quote(start_release_id, safe='')}/to/"
            f"{quote(end_release_id, safe='')}/{quote(dataset_name, safe='')}"
        )
        api_url = self.diff_url(
            start_release_id=start_release_id,
            end_release_id=end_release_id,
            dataset_name=dataset_name,
        )
        payload = self._request_json(path)
        if not isinstance(payload, dict):
            raise SemanticScholarDatasetsApiError("S2 diff response was not an object")
        diffs = payload.get("diffs")
        if not isinstance(diffs, list):
            raise SemanticScholarDatasetsApiError("S2 diff response missing diffs list")
        parsed_diffs: list[S2DatasetDiff] = []
        for item in diffs:
            if not isinstance(item, dict):
                raise SemanticScholarDatasetsApiError("S2 diff item was not an object")
            parsed_diffs.append(
                S2DatasetDiff(
                    from_release=str(item["from_release"]),
                    to_release=str(item["to_release"]),
                    update_files=_coerce_url_tuple(item.get("update_files"), "update_files"),
                    delete_files=_coerce_url_tuple(item.get("delete_files"), "delete_files"),
                )
            )
        return S2DatasetDiffReport(
            dataset=str(payload.get("dataset") or dataset_name),
            start_release=str(payload.get("start_release") or start_release_id),
            end_release=str(payload.get("end_release") or end_release_id),
            diffs=tuple(parsed_diffs),
            api_url=api_url,
        )

    def latest_release_id(self) -> str:
        releases = self.list_releases()
        if not releases:
            raise SemanticScholarDatasetsApiError("S2 release list is empty")
        return releases[-1]

    def diff_url(
        self,
        *,
        start_release_id: str,
        end_release_id: str,
        dataset_name: str,
    ) -> str:
        path = (
            f"diffs/{quote(start_release_id, safe='')}/to/"
            f"{quote(end_release_id, safe='')}/{quote(dataset_name, safe='')}"
        )
        return urljoin(self._base_url, path)

    def _request_json(self, path: str) -> Any:
        url = urljoin(self._base_url, path)
        request = Request(
            url,
            headers=self._headers(),
            method="GET",
        )
        last_error: Exception | None = None
        for attempt_index in range(self._max_attempts):
            try:
                with self._opener.open(request, timeout=self._timeout_seconds) as response:
                    return json.loads(response.read().decode("utf-8"))
            except HTTPError as exc:
                last_error = exc
                if exc.code not in _RETRY_STATUS_CODES or attempt_index == self._max_attempts - 1:
                    raise SemanticScholarDatasetsApiError(
                        f"S2 Datasets API request failed with HTTP {exc.code}: {url}"
                    ) from exc
                self._sleep(self._retry_delay(attempt_index, exc.headers.get("Retry-After")))
            except URLError as exc:
                last_error = exc
                if attempt_index == self._max_attempts - 1:
                    raise SemanticScholarDatasetsApiError(
                        f"S2 Datasets API request failed: {url}"
                    ) from exc
                self._sleep(self._retry_delay(attempt_index, None))
            except json.JSONDecodeError as exc:
                raise SemanticScholarDatasetsApiError(
                    f"S2 Datasets API response was not valid JSON: {url}"
                ) from exc
        raise SemanticScholarDatasetsApiError(f"S2 Datasets API request failed: {url}") from last_error

    def _headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/json",
            "User-Agent": self._user_agent,
        }
        if self._api_key:
            headers["x-api-key"] = self._api_key
        return headers

    @staticmethod
    def _retry_delay(attempt_index: int, retry_after: str | None) -> float:
        if retry_after:
            try:
                return min(120.0, max(0.0, float(retry_after)))
            except ValueError:
                try:
                    parsed = parsedate_to_datetime(retry_after)
                except (TypeError, ValueError):
                    parsed = None
                if parsed is not None:
                    return min(120.0, max(0.0, parsed.timestamp() - time.time()))
        backoff = min(60.0, 2.0**attempt_index)
        return backoff + random.uniform(0.0, min(1.0, backoff / 2.0))


def _coerce_url_tuple(value: object, field_name: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise SemanticScholarDatasetsApiError(f"S2 diff field {field_name} was not a list")
    return tuple(str(item) for item in value)
