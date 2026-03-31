"""Audit RAG source-parser quality over real local S2ORC and BioC samples."""

from __future__ import annotations

import argparse
import gzip
import json
import os
import statistics
import sys
import tarfile
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from enum import StrEnum
from pathlib import Path
from typing import Any

from pydantic import Field

from app import db
from app.rag.corpus_resolution import (
    BioCDocumentIdKind,
    PostgresBioCCorpusResolver,
    normalize_bioc_document_id,
)
from app.config import settings
from app.rag.parse_contract import ParseContractModel
from app.rag.source_parsers import (
    extract_biocxml_document_id,
    parse_biocxml_document,
    parse_s2orc_row,
)


class BiocSampleMode(StrEnum):
    ARCHIVE_ORDER = "archive_order"
    SMALLEST_FIRST = "smallest_first"
    STRATIFIED_SIZE = "stratified_size"


class ParserAuditDatasetSummary(ParseContractModel):
    dataset: str
    sampled_documents: int
    parse_errors: int = 0
    sections_nonzero: int = 0
    blocks_nonzero: int = 0
    sentences_nonzero: int = 0
    references_nonzero: int = 0
    citations_nonzero: int = 0
    entities_nonzero: int = 0
    avg_sections: float = 0.0
    avg_blocks: float = 0.0
    avg_sentences: float = 0.0
    avg_references: float = 0.0
    avg_citations: float = 0.0
    avg_entities: float = 0.0
    median_sections: float = 0.0
    median_blocks: float = 0.0
    median_sentences: float = 0.0
    median_references: float = 0.0
    median_citations: float = 0.0
    median_entities: float = 0.0
    top_section_roles: list[tuple[str, int]] = Field(default_factory=list)
    top_block_kinds: list[tuple[str, int]] = Field(default_factory=list)
    extra_metrics: dict[str, object] = Field(default_factory=dict)


class ParserAuditReport(ParseContractModel):
    s2orc_v2: ParserAuditDatasetSummary
    biocxml: ParserAuditDatasetSummary


class ParsedDocumentMetrics(ParseContractModel):
    section_count: int
    block_count: int
    sentence_count: int
    reference_count: int
    citation_count: int
    entity_count: int
    section_roles: dict[str, int] = Field(default_factory=dict)
    block_kinds: dict[str, int] = Field(default_factory=dict)
    extra_metrics: dict[str, object] = Field(default_factory=dict)


def _empty_accumulator() -> dict[str, Any]:
    return {
        "section_counts": [],
        "block_counts": [],
        "sentence_counts": [],
        "reference_counts": [],
        "citation_counts": [],
        "entity_counts": [],
        "section_roles": Counter(),
        "block_kinds": Counter(),
        "matched_references": 0,
        "total_references": 0,
        "docs_with_fallback_sentences": 0,
        "entity_namespaces": Counter(),
        "resolved_corpus_ids": 0,
        "structural_fallback_documents": 0,
        "unresolved_corpus_ids": 0,
        "unresolved_document_kinds": Counter(),
    }


def _median(values: list[int]) -> float:
    return float(statistics.median(values)) if values else 0.0


def _mean(values: list[int]) -> float:
    return round(float(sum(values)) / float(len(values)), 2) if values else 0.0


def _metrics_from_parsed_doc(doc, *, dataset: str) -> ParsedDocumentMetrics:
    extra: dict[str, object] = {}
    if dataset == "s2orc_v2":
        extra = {
            "matched_references": sum(
                1
                for reference in doc.references
                if reference.matched_paper_id or reference.matched_corpus_id
            ),
            "total_references": len(doc.references),
            "has_fallback_sentences": any(
                str(sentence.segmentation_source) == "deterministic_fallback"
                for sentence in doc.sentences
            ),
        }
    elif dataset == "biocxml":
        extra = {
            "entity_namespaces": dict(
                Counter((entity.concept_namespace or "none") for entity in doc.entities)
            ),
        }

    return ParsedDocumentMetrics(
        section_count=len(doc.sections),
        block_count=len(doc.blocks),
        sentence_count=len(doc.sentences),
        reference_count=len(doc.references),
        citation_count=len(doc.citations),
        entity_count=len(doc.entities),
        section_roles=dict(Counter(str(section.section_role) for section in doc.sections)),
        block_kinds=dict(Counter(str(block.block_kind) for block in doc.blocks)),
        extra_metrics=extra,
    )


def _accumulate_metrics(accumulator: dict[str, Any], metrics: ParsedDocumentMetrics) -> None:
    accumulator["section_counts"].append(metrics.section_count)
    accumulator["block_counts"].append(metrics.block_count)
    accumulator["sentence_counts"].append(metrics.sentence_count)
    accumulator["reference_counts"].append(metrics.reference_count)
    accumulator["citation_counts"].append(metrics.citation_count)
    accumulator["entity_counts"].append(metrics.entity_count)
    accumulator["section_roles"].update(metrics.section_roles)
    accumulator["block_kinds"].update(metrics.block_kinds)
    accumulator["matched_references"] += int(metrics.extra_metrics.get("matched_references", 0))
    accumulator["total_references"] += int(metrics.extra_metrics.get("total_references", 0))
    if metrics.extra_metrics.get("has_fallback_sentences"):
        accumulator["docs_with_fallback_sentences"] += 1
    accumulator["entity_namespaces"].update(metrics.extra_metrics.get("entity_namespaces", {}))


def _merge_accumulators(target: dict[str, Any], source: dict[str, Any]) -> None:
    for key in (
        "section_counts",
        "block_counts",
        "sentence_counts",
        "reference_counts",
        "citation_counts",
        "entity_counts",
    ):
        target[key].extend(source[key])
    target["section_roles"].update(source["section_roles"])
    target["block_kinds"].update(source["block_kinds"])
    target["matched_references"] += source["matched_references"]
    target["total_references"] += source["total_references"]
    target["docs_with_fallback_sentences"] += source["docs_with_fallback_sentences"]
    target["entity_namespaces"].update(source["entity_namespaces"])
    target["resolved_corpus_ids"] += source["resolved_corpus_ids"]
    target["structural_fallback_documents"] += source["structural_fallback_documents"]
    target["unresolved_corpus_ids"] += source["unresolved_corpus_ids"]
    target["unresolved_document_kinds"].update(source["unresolved_document_kinds"])


def _finalize_summary(
    *,
    dataset: str,
    accumulator: dict[str, Any],
    parse_errors: int,
) -> ParserAuditDatasetSummary:
    section_counts = accumulator["section_counts"]
    block_counts = accumulator["block_counts"]
    sentence_counts = accumulator["sentence_counts"]
    reference_counts = accumulator["reference_counts"]
    citation_counts = accumulator["citation_counts"]
    entity_counts = accumulator["entity_counts"]

    extra_metrics: dict[str, object] = {}
    if dataset == "s2orc_v2":
        total_references = accumulator["total_references"]
        extra_metrics = {
            "matched_reference_fraction": (
                round(accumulator["matched_references"] / total_references, 4)
                if total_references
                else 0.0
            ),
            "matched_references": accumulator["matched_references"],
            "total_references": total_references,
            "docs_with_fallback_sentences": accumulator["docs_with_fallback_sentences"],
        }
    elif dataset == "biocxml":
        extra_metrics = {
            "entity_namespaces": accumulator["entity_namespaces"].most_common(10),
            "resolved_corpus_ids": accumulator["resolved_corpus_ids"],
            "structural_fallback_documents": accumulator["structural_fallback_documents"],
            "unresolved_corpus_ids": accumulator["unresolved_corpus_ids"],
            "unresolved_document_kinds": accumulator["unresolved_document_kinds"].most_common(10),
        }

    return ParserAuditDatasetSummary(
        dataset=dataset,
        sampled_documents=len(section_counts),
        parse_errors=parse_errors,
        sections_nonzero=sum(1 for count in section_counts if count > 0),
        blocks_nonzero=sum(1 for count in block_counts if count > 0),
        sentences_nonzero=sum(1 for count in sentence_counts if count > 0),
        references_nonzero=sum(1 for count in reference_counts if count > 0),
        citations_nonzero=sum(1 for count in citation_counts if count > 0),
        entities_nonzero=sum(1 for count in entity_counts if count > 0),
        avg_sections=_mean(section_counts),
        avg_blocks=_mean(block_counts),
        avg_sentences=_mean(sentence_counts),
        avg_references=_mean(reference_counts),
        avg_citations=_mean(citation_counts),
        avg_entities=_mean(entity_counts),
        median_sections=_median(section_counts),
        median_blocks=_median(block_counts),
        median_sentences=_median(sentence_counts),
        median_references=_median(reference_counts),
        median_citations=_median(citation_counts),
        median_entities=_median(entity_counts),
        top_section_roles=accumulator["section_roles"].most_common(10),
        top_block_kinds=accumulator["block_kinds"].most_common(10),
        extra_metrics=extra_metrics,
    )


def _select_evenly_spaced_paths(paths: list[Path], count: int) -> list[Path]:
    if count <= 0 or not paths:
        return []
    if count == 1:
        return [paths[0]]
    if count >= len(paths):
        return paths
    indexes = {
        round(index * (len(paths) - 1) / (count - 1))
        for index in range(count)
    }
    return [paths[index] for index in sorted(indexes)]


def _resolve_s2_shards(*, explicit_shard: Path | None, shard_count: int) -> list[Path]:
    if explicit_shard is not None:
        return [explicit_shard]
    available_shards = sorted(settings.semantic_scholar_s2orc_v2_dir_path.glob("s2orc_v2-*.jsonl.gz"))
    return _select_evenly_spaced_paths(available_shards, shard_count)


def audit_s2orc(*, limit: int, shard_paths: list[Path]) -> ParserAuditDatasetSummary:
    accumulator = _empty_accumulator()
    parse_errors = 0
    if not shard_paths or limit <= 0:
        return _finalize_summary(
            dataset="s2orc_v2",
            accumulator=accumulator,
            parse_errors=0,
        )

    shard_count = len(shard_paths)
    base_quota = limit // shard_count
    remainder = limit % shard_count

    for shard_index, shard_path in enumerate(shard_paths):
        shard_limit = base_quota + (1 if shard_index < remainder else 0)
        if shard_limit <= 0:
            continue
        shard_parsed = 0
        with gzip.open(shard_path, "rt") as handle:
            for line in handle:
                if shard_parsed >= shard_limit:
                    break
                row = json.loads(line)
                try:
                    parsed = parse_s2orc_row(
                        row,
                        source_revision=settings.s2_release_id or "unknown",
                        parser_version="parser-v1",
                    )
                    _accumulate_metrics(
                        accumulator,
                        _metrics_from_parsed_doc(parsed, dataset="s2orc_v2"),
                    )
                    shard_parsed += 1
                except Exception:
                    parse_errors += 1
                total_seen = len(accumulator["section_counts"]) + parse_errors
                if total_seen and total_seen % 25 == 0:
                    print(
                        f"[audit] s2orc processed={total_seen} parsed={len(accumulator['section_counts'])} errors={parse_errors}",
                        file=sys.stderr,
                        flush=True,
                    )

    return _finalize_summary(
        dataset="s2orc_v2",
        accumulator=accumulator,
        parse_errors=parse_errors,
    )


def _resolve_bioc_archives(
    *,
    explicit_archive: Path | None,
    archive_count: int,
) -> list[Path]:
    if explicit_archive is not None:
        return [explicit_archive]
    available_archives = sorted(settings.pubtator_biocxml_dir_path.glob("BioCXML.*.tar.gz"))
    return _select_evenly_spaced_paths(available_archives, archive_count)


def _select_bioc_member_names(
    *,
    archive_path: Path,
    limit: int,
    sample_mode: BiocSampleMode,
) -> list[str]:
    if sample_mode == BiocSampleMode.ARCHIVE_ORDER:
        selected_names: list[str] = []
        with tarfile.open(archive_path, "r|gz") as archive:
            for member in archive:
                if not member.isfile():
                    continue
                selected_names.append(member.name)
                if len(selected_names) >= limit:
                    break
        return selected_names

    with tarfile.open(archive_path, "r:gz") as archive:
        members = [member for member in archive.getmembers() if member.isfile()]
    if limit <= 0 or not members:
        return []

    sorted_members = sorted(members, key=lambda member: member.size)
    if sample_mode == BiocSampleMode.SMALLEST_FIRST:
        return [member.name for member in sorted_members[:limit]]

    if limit >= len(sorted_members):
        return [member.name for member in sorted_members]

    selected_indexes = {
        round(index * (len(sorted_members) - 1) / (limit - 1))
        for index in range(limit)
    }
    return [sorted_members[index].name for index in sorted(selected_indexes)]


def _audit_bioc_archive(
    archive_path: str,
    member_names: list[str],
) -> tuple[dict[str, Any], int]:
    selected_names = set(member_names)
    accumulator = _empty_accumulator()
    parse_errors = 0
    processed = 0
    payloads: list[tuple[str, str]] = []
    with tarfile.open(archive_path, "r|gz") as archive:
        for member in archive:
            if member.name not in selected_names or not member.isfile():
                continue
            extracted = archive.extractfile(member)
            if extracted is None:
                parse_errors += 1
                continue
            try:
                xml_text = extracted.read().decode("utf-8", errors="replace")
                payloads.append((extract_biocxml_document_id(xml_text), xml_text))
            except Exception:
                parse_errors += 1
            processed += 1
            if processed >= len(member_names):
                break

    resolver = PostgresBioCCorpusResolver(connect=db.connect)
    resolved_corpus_ids = resolver.resolve_document_ids(
        [document_id for document_id, _ in payloads]
    )
    for document_id, xml_text in payloads:
        corpus_id = resolved_corpus_ids.get(document_id)
        used_structural_fallback = False
        if corpus_id is None:
            accumulator["unresolved_corpus_ids"] += 1
            unresolved_kind, normalized_value = normalize_bioc_document_id(document_id)
            accumulator["unresolved_document_kinds"][str(unresolved_kind)] += 1
            if unresolved_kind == BioCDocumentIdKind.PMID and normalized_value.isdigit():
                corpus_id = int(normalized_value)
                used_structural_fallback = True
            else:
                continue
        try:
            parsed = parse_biocxml_document(
                xml_text,
                source_revision="raw",
                parser_version="parser-v1",
                corpus_id=corpus_id,
            )
            if used_structural_fallback:
                accumulator["structural_fallback_documents"] += 1
            else:
                accumulator["resolved_corpus_ids"] += 1
            _accumulate_metrics(
                accumulator,
                _metrics_from_parsed_doc(parsed, dataset="biocxml"),
            )
        except Exception:
            parse_errors += 1

    return accumulator, parse_errors


def audit_biocxml(
    *,
    limit: int,
    archive_paths: list[Path],
    sample_mode: BiocSampleMode,
    workers: int,
) -> ParserAuditDatasetSummary:
    accumulator = _empty_accumulator()
    parse_errors = 0
    if not archive_paths or limit <= 0:
        return _finalize_summary(
            dataset="biocxml",
            accumulator=accumulator,
            parse_errors=0,
        )

    archive_count = len(archive_paths)
    base_quota = limit // archive_count
    remainder = limit % archive_count
    work_items: list[tuple[Path, list[str]]] = []
    for archive_index, archive_path in enumerate(archive_paths):
        archive_limit = base_quota + (1 if archive_index < remainder else 0)
        if archive_limit <= 0:
            continue
        member_names = _select_bioc_member_names(
            archive_path=archive_path,
            limit=archive_limit,
            sample_mode=sample_mode,
        )
        if member_names:
            work_items.append((archive_path, member_names))

    max_workers = max(1, min(workers, len(work_items) or 1))
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_audit_bioc_archive, str(archive_path), member_names): archive_path.name
            for archive_path, member_names in work_items
        }
        for completed, future in enumerate(as_completed(futures), start=1):
            try:
                archive_accumulator, archive_errors = future.result()
            except Exception:
                parse_errors += 1
            else:
                _merge_accumulators(accumulator, archive_accumulator)
                parse_errors += archive_errors
            print(
                f"[audit] bioc archives={completed}/{len(futures)} parsed={len(accumulator['section_counts'])} errors={parse_errors}",
                file=sys.stderr,
                flush=True,
            )

    return _finalize_summary(
        dataset="biocxml",
        accumulator=accumulator,
        parse_errors=parse_errors,
    )


def audit_rag_parsers(
    *,
    s2_limit: int,
    bioc_limit: int,
    s2_shard: Path | None = None,
    bioc_archive: Path | None = None,
    s2_shard_count: int = 4,
    bioc_archive_count: int = 4,
    bioc_sample_mode: BiocSampleMode = BiocSampleMode.STRATIFIED_SIZE,
    bioc_workers: int | None = None,
) -> ParserAuditReport:
    resolved_workers = bioc_workers or min(4, max(1, os.cpu_count() or 1))
    return ParserAuditReport(
        s2orc_v2=audit_s2orc(
            limit=s2_limit,
            shard_paths=_resolve_s2_shards(
                explicit_shard=s2_shard,
                shard_count=s2_shard_count,
            ),
        ),
        biocxml=audit_biocxml(
            limit=bioc_limit,
            archive_paths=_resolve_bioc_archives(
                explicit_archive=bioc_archive,
                archive_count=bioc_archive_count,
            ),
            sample_mode=bioc_sample_mode,
            workers=resolved_workers,
        ),
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit real-data RAG parser quality.")
    parser.add_argument("--s2-limit", type=int, default=50, help="Number of S2ORC rows to sample.")
    parser.add_argument("--bioc-limit", type=int, default=50, help="Number of BioCXML documents to sample.")
    parser.add_argument(
        "--s2-shard",
        type=Path,
        default=None,
        help="Optional explicit S2ORC shard path.",
    )
    parser.add_argument(
        "--bioc-archive",
        type=Path,
        default=None,
        help="Optional explicit BioCXML tar.gz path.",
    )
    parser.add_argument(
        "--s2-shard-count",
        type=int,
        default=4,
        help="Number of S2ORC shards to spread the audit across when --s2-shard is not provided.",
    )
    parser.add_argument(
        "--bioc-archive-count",
        type=int,
        default=4,
        help="Number of BioC archives to spread the audit across when --bioc-archive is not provided.",
    )
    parser.add_argument(
        "--bioc-sample-mode",
        choices=[mode.value for mode in BiocSampleMode],
        default=BiocSampleMode.STRATIFIED_SIZE.value,
        help="How to sample BioCXML documents for the audit.",
    )
    parser.add_argument(
        "--bioc-workers",
        type=int,
        default=None,
        help="Number of worker processes for BioCXML parsing.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    report = audit_rag_parsers(
        s2_limit=args.s2_limit,
        bioc_limit=args.bioc_limit,
        s2_shard=args.s2_shard,
        bioc_archive=args.bioc_archive,
        s2_shard_count=args.s2_shard_count,
        bioc_archive_count=args.bioc_archive_count,
        bioc_sample_mode=BiocSampleMode(args.bioc_sample_mode),
        bioc_workers=args.bioc_workers,
    )
    print(report.model_dump_json(indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
