from __future__ import annotations

from datetime import UTC, datetime
import hashlib
import json
import logging
from uuid import UUID


LOGGER = logging.getLogger(__name__)

CORPUS_SELECTION_STATUS_STARTED = 1
CORPUS_SELECTION_STATUS_ASSETS = 2
CORPUS_SELECTION_STATUS_CORPUS_ADMISSION = 3
CORPUS_SELECTION_STATUS_MAPPED_PROMOTION = 4
CORPUS_SELECTION_STATUS_CANONICAL_MATERIALIZATION = 5
CORPUS_SELECTION_STATUS_SELECTION_SUMMARY = 6
CORPUS_SELECTION_STATUS_PUBLISHED = 7
CORPUS_SELECTION_STATUS_FAILED = 8

CORPUS_WAVE_STATUS_STARTED = 1
CORPUS_WAVE_STATUS_MEMBER_SELECTION = 2
CORPUS_WAVE_STATUS_ENQUEUE = 3
CORPUS_WAVE_STATUS_PUBLISHED = 4
CORPUS_WAVE_STATUS_FAILED = 5


def digest_payload(payload: dict) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def emit_event(event_name: str, **fields: object) -> None:
    LOGGER.info("%s %s", event_name, json.dumps(fields, sort_keys=True, default=_json_default))


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _json_default(value: object) -> str:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    return str(value)
