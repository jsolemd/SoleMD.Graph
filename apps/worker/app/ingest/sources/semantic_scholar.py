from __future__ import annotations

from collections.abc import Callable, Iterator
from datetime import date, datetime
import gzip
import hashlib
import io
import json
import re
from pathlib import Path
from typing import Any
from uuid import UUID

import asyncpg

from app.config import Settings
from app.document_schema import (
    BLOCK_KIND_PARAGRAPH,
    DOCUMENT_SOURCE_KIND_S2ORC_ANNOTATION,
    SECTION_ROLE_ABSTRACT,
    SECTION_ROLE_CONCLUSION,
    SECTION_ROLE_DISCUSSION,
    SECTION_ROLE_INTRODUCTION,
    SECTION_ROLE_METHODS,
    SECTION_ROLE_OTHER,
    SECTION_ROLE_RESULTS,
    SECTION_ROLE_SUPPLEMENT,
    SECTION_ROLE_UNKNOWN,
    SEGMENTATION_SOURCE_S2ORC_ANNOTATION,
    SOURCE_PRIORITY_S2ORC,
)
from app.document_spine import fallback_sentence_spans
from app.ingest.errors import SourceSchemaDrift
from app.ingest.manifest_registry import (
    ManifestRegistryError,
    family_specs_for_source,
    read_manifest_file_plans,
    release_manifest_checksum,
    resolve_release_dir,
)
from app.ingest.models import FamilyPlan, IngestPlan, StartReleaseRequest


_PROGRESS_REPORT_LINE_INTERVAL = 1_000


def build_plan(settings: Settings, request: StartReleaseRequest) -> IngestPlan:
    release_dir = resolve_release_dir(settings, request.source_code, request.release_tag)
    if not release_dir.exists():
        raise SourceSchemaDrift(f"missing Semantic Scholar release directory {release_dir}")

    families: list[FamilyPlan] = []
    deferred: list[str] = []
    allowlist = set(request.family_allowlist or ())
    for spec in family_specs_for_source("s2"):
        if allowlist and spec.family not in allowlist:
            continue
        if not allowlist and not spec.enabled_by_default:
            deferred.append(spec.family)
            continue
        try:
            files = read_manifest_file_plans(
                release_dir=release_dir,
                dataset=spec.datasets[0],
                max_files=request.max_files_per_family,
            )
        except ManifestRegistryError:
            if spec.required:
                raise SourceSchemaDrift(
                    f"missing required S2 dataset {spec.datasets[0]} for {request.release_tag}"
                ) from None
            deferred.append(spec.family)
            continue
        if not files:
            if spec.required:
                raise SourceSchemaDrift(
                    f"empty required S2 dataset {spec.datasets[0]} for {request.release_tag}"
                )
            deferred.append(spec.family)
            continue
        families.append(
            FamilyPlan(
                family=spec.family,
                source_datasets=spec.datasets,
                files=files,
                target_tables=_target_tables_for_family(spec.family),
            )
        )

    try:
        source_published_at = datetime.fromisoformat(request.release_tag)
    except ValueError:
        source_published_at = None

    return IngestPlan(
        source_code="s2",
        release_tag=request.release_tag,
        release_dir=release_dir,
        manifest_uri=str(release_dir / "manifests"),
        release_checksum=release_manifest_checksum(release_dir),
        source_published_at=source_published_at,
        families=tuple(families),
        deferred_families=tuple(deferred),
    )


def stream_family(
    family_name: str,
    file_path: Path,
    *,
    max_records_per_file: int | None = None,
    on_progress: Callable[[int], None] | None = None,
) -> Iterator[dict[str, Any]]:
    if family_name == "publication_venues":
        return _stream_publication_venues(file_path, max_records_per_file, on_progress=on_progress)
    if family_name == "authors":
        return _stream_authors(file_path, max_records_per_file, on_progress=on_progress)
    if family_name == "papers":
        return _stream_papers(file_path, max_records_per_file, on_progress=on_progress)
    if family_name == "abstracts":
        return _stream_abstracts(file_path, max_records_per_file, on_progress=on_progress)
    if family_name == "tldrs":
        return _stream_tldrs(file_path, max_records_per_file, on_progress=on_progress)
    if family_name == "citations":
        return _stream_citations(file_path, max_records_per_file, on_progress=on_progress)
    if family_name == "s2orc_v2":
        return _stream_s2orc_documents(file_path, max_records_per_file, on_progress=on_progress)
    raise SourceSchemaDrift(f"unsupported S2 family {family_name}")


async def promote_family(
    connection: asyncpg.Connection,
    plan: IngestPlan,
    family_name: str,
    source_release_id: int,
    ingest_run_id: UUID,
) -> None:
    del plan
    if family_name == "papers":
        await _backfill_selected_corpus_ids(
            connection,
            source_release_id,
            ingest_run_id=ingest_run_id,
        )
        return


def _target_tables_for_family(family_name: str) -> tuple[str, ...]:
    mapping = {
        "publication_venues": ("solemd.venues",),
        "authors": ("solemd.s2_authors_raw",),
        "papers": (
            "solemd.s2_papers_raw",
            "solemd.s2_paper_authors_raw",
            "solemd.s2_paper_assets_raw",
        ),
        "abstracts": ("solemd.s2_papers_raw",),
        "tldrs": ("solemd.s2_papers_raw",),
        "citations": ("solemd.s2_paper_reference_metrics_raw",),
        "s2orc_v2": ("solemd.s2orc_documents_raw",),
    }
    return mapping[family_name]


def _stream_jsonl(
    path: Path,
    max_records: int | None,
    *,
    on_progress: Callable[[int], None] | None = None,
) -> Iterator[dict[str, Any]]:
    with path.open("rb") as raw_handle:
        with gzip.GzipFile(fileobj=raw_handle, mode="rb") as compressed_handle:
            with io.TextIOWrapper(compressed_handle, encoding="utf-8") as handle:
                for index, line in enumerate(handle):
                    if on_progress is not None and index % _PROGRESS_REPORT_LINE_INTERVAL == 0:
                        on_progress(raw_handle.tell())
                    if max_records is not None and index >= max_records:
                        return
                    payload = json.loads(line)
                    if not isinstance(payload, dict):
                        raise SourceSchemaDrift(f"expected object row in {path}")
                    yield payload
        if on_progress is not None:
            on_progress(path.stat().st_size)


def _stream_publication_venues(
    path: Path,
    max_records: int | None,
    *,
    on_progress: Callable[[int], None] | None = None,
) -> Iterator[dict[str, Any]]:
    for payload in _stream_jsonl(path, max_records, on_progress=on_progress):
        if "id" not in payload or "name" not in payload:
            raise SourceSchemaDrift(f"publication-venues row missing required keys in {path}")
        yield {
            "source_venue_id": str(payload["id"]),
            "issn": _coerce_text(payload.get("issn")),
            "display_name": _coerce_text(payload.get("name")) or "Unknown venue",
        }


def _stream_authors(
    path: Path,
    max_records: int | None,
    *,
    on_progress: Callable[[int], None] | None = None,
) -> Iterator[dict[str, Any]]:
    for payload in _stream_jsonl(path, max_records, on_progress=on_progress):
        if "authorid" not in payload or "name" not in payload:
            raise SourceSchemaDrift(f"authors row missing required keys in {path}")
        external_ids = payload.get("externalids") or {}
        yield {
            "source_author_id": str(payload["authorid"]),
            "orcid": _coerce_text(external_ids.get("ORCID")) if isinstance(external_ids, dict) else None,
            "display_name": _coerce_text(payload.get("name")) or "Unknown author",
        }


def _stream_papers(
    path: Path,
    max_records: int | None,
    *,
    on_progress: Callable[[int], None] | None = None,
) -> Iterator[dict[str, Any]]:
    for payload in _stream_jsonl(path, max_records, on_progress=on_progress):
        if "corpusid" not in payload or "title" not in payload:
            raise SourceSchemaDrift(f"papers row missing required keys in {path}")
        paper_id = str(payload["corpusid"])
        external_ids = payload.get("externalids") or {}
        authors = payload.get("authors") or []
        author_rows = []
        for ordinal, author in enumerate(authors):
            if not isinstance(author, dict):
                continue
            author_rows.append(
                {
                    "paper_id": paper_id,
                    "author_ordinal": ordinal,
                    "source_author_id": _coerce_text(author.get("authorId")),
                    "name_raw": _coerce_text(author.get("name")) or "Unknown author",
                    "affiliation_raw": None,
                }
            )
        assets = []
        open_access_info = payload.get("openaccessinfo") or {}
        if isinstance(open_access_info, dict):
            asset_url = _coerce_text(open_access_info.get("url"))
            if asset_url:
                assets.append(
                    {
                        "paper_id": paper_id,
                        "asset_kind": "open_access",
                        "asset_url": asset_url,
                        "content_type": None,
                        "availability_raw": _coerce_text(open_access_info.get("status")),
                        "asset_checksum": None,
                    }
                )
        normalized_payload = json.dumps(
            {
                "corpusid": payload.get("corpusid"),
                "title": payload.get("title"),
                "venue": payload.get("venue"),
                "publicationdate": payload.get("publicationdate"),
                "isopenaccess": payload.get("isopenaccess"),
                "externalids": payload.get("externalids"),
                "publicationvenueid": payload.get("publicationvenueid"),
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        yield {
            "paper_id": paper_id,
            "source_venue_id": _coerce_text(payload.get("publicationvenueid")),
            "pmid": _coerce_int(external_ids.get("PubMed")),
            "doi_norm": _normalize_doi(external_ids.get("DOI")),
            "pmc_id": _coerce_text(external_ids.get("PubMedCentral")),
            "title": _coerce_text(payload.get("title")) or "",
            "venue_raw": _coerce_text(payload.get("venue")),
            "year": _coerce_int(payload.get("year")),
            "publication_date": _coerce_date(payload.get("publicationdate")),
            "is_open_access": bool(payload.get("isopenaccess")),
            "payload_checksum": hashlib.sha256(normalized_payload).hexdigest(),
            "authors": author_rows,
            "assets": assets,
        }


def _stream_abstracts(
    path: Path,
    max_records: int | None,
    *,
    on_progress: Callable[[int], None] | None = None,
) -> Iterator[dict[str, Any]]:
    for payload in _stream_jsonl(path, max_records, on_progress=on_progress):
        if "corpusid" not in payload or "abstract" not in payload:
            raise SourceSchemaDrift(f"abstracts row missing required keys in {path}")
        yield {"paper_id": str(payload["corpusid"]), "abstract": _coerce_text(payload.get("abstract"))}


def _stream_tldrs(
    path: Path,
    max_records: int | None,
    *,
    on_progress: Callable[[int], None] | None = None,
) -> Iterator[dict[str, Any]]:
    for payload in _stream_jsonl(path, max_records, on_progress=on_progress):
        if "corpusid" not in payload or "text" not in payload:
            raise SourceSchemaDrift(f"tldrs row missing required keys in {path}")
        yield {"paper_id": str(payload["corpusid"]), "tldr": _coerce_text(payload.get("text"))}


def _stream_citations(
    path: Path,
    max_records: int | None,
    *,
    on_progress: Callable[[int], None] | None = None,
) -> Iterator[dict[str, Any]]:
    for ordinal, payload in enumerate(_stream_jsonl(path, max_records, on_progress=on_progress)):
        if "citingcorpusid" not in payload or "citedcorpusid" not in payload:
            raise SourceSchemaDrift(f"citations row missing required keys in {path}")
        intents = _normalize_intents(payload.get("intents"))
        checksum_payload = json.dumps(
            {
                "file_name": path.name,
                "ordinal": ordinal,
                "citationid": payload.get("citationid"),
                "citingcorpusid": payload.get("citingcorpusid"),
                "citedcorpusid": payload.get("citedcorpusid"),
                "isinfluential": bool(payload.get("isinfluential")),
                "intents": intents,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        yield {
            "citing_paper_id": str(payload["citingcorpusid"]),
            "cited_paper_id": str(payload["citedcorpusid"]) if payload.get("citedcorpusid") is not None else None,
            "reference_checksum": hashlib.sha256(checksum_payload).hexdigest(),
            "linkage_status": 1,
            "is_influential": bool(payload.get("isinfluential")),
            "intent_raw": intents,
        }


def _stream_s2orc_documents(
    path: Path,
    max_records: int | None,
    *,
    on_progress: Callable[[int], None] | None = None,
) -> Iterator[dict[str, Any]]:
    for payload in _stream_jsonl(path, max_records, on_progress=on_progress):
        if "corpusid" not in payload or "body" not in payload:
            raise SourceSchemaDrift(f"s2orc_v2 row missing required keys in {path}")
        yield _parse_s2orc_document(payload)


def _parse_s2orc_document(payload: dict[str, Any]) -> dict[str, Any]:
    paper_id = str(payload["corpusid"])
    body = payload.get("body") or {}
    body_text = _coerce_text(body.get("text")) or ""
    annotations = body.get("annotations") or {}
    section_headers = sorted(_decode_annotation_group(annotations.get("section_header")), key=lambda item: (item["start"], item["end"]))
    paragraphs = sorted(_decode_annotation_group(annotations.get("paragraph")), key=lambda item: (item["start"], item["end"]))
    sentence_spans = sorted(_decode_annotation_group(annotations.get("sentence")), key=lambda item: (item["start"], item["end"]))

    sections: list[dict[str, Any]] = []
    numbering_lookup: dict[str, int] = {}
    current_role = SECTION_ROLE_OTHER
    if paragraphs and (not section_headers or paragraphs[0]["start"] < section_headers[0]["start"]):
        sections.append(
            {
                "section_ordinal": 0,
                "parent_section_ordinal": None,
                "section_role": SECTION_ROLE_OTHER,
                "numbering_token": None,
                "display_label": "Preamble",
                "source_start_offset": paragraphs[0]["start"],
            }
        )

    for item in section_headers:
        raw_label = body_text[item["start"] : item["end"]].strip()
        label = re.sub(r"\s+", " ", raw_label).strip()
        if not label:
            continue
        numbering = None
        attrs = item.get("attributes") or {}
        if isinstance(attrs, dict):
            numbering = _coerce_text(attrs.get("n"))
        section_role = _normalize_section_role(label)
        if section_role != SECTION_ROLE_OTHER:
            current_role = section_role
        ordinal = len(sections)
        parent_section = None
        if numbering:
            parent_token = numbering.rsplit(".", 1)[0] if "." in numbering else None
            if parent_token:
                parent_section = numbering_lookup.get(parent_token)
            numbering_lookup[numbering] = ordinal
        sections.append(
            {
                "section_ordinal": ordinal,
                "parent_section_ordinal": parent_section,
                "section_role": section_role if section_role != SECTION_ROLE_UNKNOWN else current_role,
                "numbering_token": numbering,
                "display_label": label[:255],
                "source_start_offset": item["start"],
            }
        )

    def section_for_offset(start_offset: int) -> dict[str, Any]:
        chosen = sections[0] if sections else {
            "section_ordinal": 0,
            "section_role": SECTION_ROLE_OTHER,
        }
        for section in sections:
            if section.get("source_start_offset", 0) <= start_offset:
                chosen = section
        return chosen

    blocks: list[dict[str, Any]] = []
    for ordinal, item in enumerate(paragraphs):
        start_offset, end_offset = item["start"], item["end"]
        text = body_text[start_offset:end_offset].strip()
        if not text:
            continue
        section = section_for_offset(start_offset)
        blocks.append(
            {
                "block_ordinal": len(blocks),
                "section_ordinal": section["section_ordinal"],
                "start_offset": start_offset,
                "end_offset": end_offset,
                "block_kind": BLOCK_KIND_PARAGRAPH,
                "section_role": section["section_role"],
                "is_retrieval_default": section["section_role"] != SECTION_ROLE_OTHER or ordinal < 5,
                "linked_asset_ref": None,
                "text": text,
            }
        )

    block_sentence_buckets: dict[int, list[dict[str, Any]]] = {}
    for sentence in sentence_spans:
        block_index = _find_block_index(blocks, sentence["start"], sentence["end"])
        if block_index is None:
            continue
        block_sentence_buckets.setdefault(block_index, []).append(sentence)

    sentences: list[dict[str, Any]] = []
    for block in blocks:
        block_spans = block_sentence_buckets.get(block["block_ordinal"])
        if not block_spans:
            block_spans = fallback_sentence_spans(block["text"], block["start_offset"])
        for sentence_ordinal, span in enumerate(block_spans):
            start_offset = span["start"]
            end_offset = span["end"]
            text = body_text[start_offset:end_offset].strip()
            if not text:
                continue
            sentences.append(
                {
                    "block_ordinal": block["block_ordinal"],
                    "sentence_ordinal": sentence_ordinal,
                    "section_ordinal": block["section_ordinal"],
                    "start_offset": start_offset,
                    "end_offset": end_offset,
                    "segmentation_source": SEGMENTATION_SOURCE_S2ORC_ANNOTATION,
                    "text": text,
                }
            )

    document_text = "\n".join(block["text"] for block in blocks)
    return {
        "paper_id": paper_id,
        "document_source_kind": DOCUMENT_SOURCE_KIND_S2ORC_ANNOTATION,
        "source_priority": SOURCE_PRIORITY_S2ORC,
        "text_hash": hashlib.sha1(document_text.encode("utf-8")).digest()[:16],
        "sections": sections,
        "blocks": blocks,
        "sentences": sentences,
    }


async def _backfill_selected_corpus_ids(
    connection: asyncpg.Connection,
    source_release_id: int,
    *,
    ingest_run_id: UUID,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.s2_papers_raw raw
        SET corpus_id = papers.corpus_id
        FROM solemd.papers papers
        WHERE raw.source_release_id = $1
          AND raw.last_seen_run_id = $2
          AND raw.paper_id = papers.s2_paper_id
          AND raw.corpus_id IS DISTINCT FROM papers.corpus_id
        """,
        source_release_id,
        ingest_run_id,
    )


def _coerce_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _coerce_int(value: object) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(str(value))
    except ValueError:
        return None


def _coerce_date(value: object) -> date | None:
    text = _coerce_text(value)
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _normalize_doi(value: object) -> str | None:
    text = _coerce_text(value)
    if not text:
        return None
    return text.lower()


def _normalize_intents(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        normalized = [str(item) for item in value if str(item).strip()]
        return ",".join(normalized) or None
    return _coerce_text(value)


def _decode_annotation_group(raw_value: object) -> list[dict[str, Any]]:
    if raw_value in (None, "", "null"):
        return []
    decoded = json.loads(raw_value) if isinstance(raw_value, str) else raw_value
    if not isinstance(decoded, list):
        return []
    results = []
    for item in decoded:
        if not isinstance(item, dict):
            continue
        results.append(
            {
                "start": int(item.get("start", 0)),
                "end": int(item.get("end", 0)),
                "attributes": item.get("attributes") if isinstance(item.get("attributes"), dict) else {},
            }
        )
    return results


def _normalize_section_role(label: str) -> int:
    normalized = re.sub(r"[^a-z0-9]+", " ", label.lower()).strip()
    if "abstract" in normalized:
        return SECTION_ROLE_ABSTRACT
    if "introduction" in normalized or normalized == "intro":
        return SECTION_ROLE_INTRODUCTION
    if "method" in normalized or "materials" in normalized:
        return SECTION_ROLE_METHODS
    if "result" in normalized:
        return SECTION_ROLE_RESULTS
    if "discussion" in normalized or "discuss" in normalized:
        return SECTION_ROLE_DISCUSSION
    if "conclusion" in normalized:
        return SECTION_ROLE_CONCLUSION
    if "supplement" in normalized:
        return SECTION_ROLE_SUPPLEMENT
    return SECTION_ROLE_OTHER


def _find_block_index(
    blocks: list[dict[str, Any]],
    start_offset: int,
    end_offset: int,
) -> int | None:
    for block in blocks:
        if block["start_offset"] <= start_offset and end_offset <= block["end_offset"]:
            return int(block["block_ordinal"])
    return None
