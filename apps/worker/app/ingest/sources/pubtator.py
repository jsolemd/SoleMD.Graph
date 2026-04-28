from __future__ import annotations

from collections import Counter
from collections.abc import Callable, Iterator
from datetime import datetime
import gzip
import io
import logging
from pathlib import Path
import tarfile
from typing import Any
from uuid import UUID

import asyncpg
from lxml import etree

from app.config import Settings
from app.ingest.errors import SourceSchemaDrift
from app.ingest.manifest_registry import (
    ManifestRegistryError,
    family_specs_for_source,
    read_manifest_file_plans,
    release_manifest_checksum,
    resolve_release_dir,
)
from app.ingest.models import FamilyPlan, IngestPlan, StartReleaseRequest


LOGGER = logging.getLogger(__name__)
_PROGRESS_REPORT_LINE_INTERVAL = 1_000


ENTITY_TYPE_CODES = {
    "Gene": 1,
    "Disease": 2,
    "Chemical": 3,
    "Species": 4,
    "Mutation": 5,
    "CellLine": 6,
}
RELATION_TYPE_CODES = {
    "associate": 1,
    "treat": 2,
    "negative_correlate": 3,
    "cause": 4,
    "positive_correlate": 5,
    "stimulate": 6,
    "inhibit": 7,
    "cotreat": 8,
    "compare": 9,
    "interact": 10,
    "prevent": 11,
    "drug_interact": 12,
}
ENTITY_RESOURCE_BIOCXML = 1
ENTITY_RESOURCE_BIOCONCEPTS = 2
RELATION_SOURCE_BIOCXML = 1
RELATION_SOURCE_TSV = 2
_RELATION_SUBJECT_ROLES = frozenset(
    {
        "subject",
        "subj",
        "source",
        "arg1",
        "annotation1",
        "entity1",
        "node1",
        "1",
    }
)
_RELATION_OBJECT_ROLES = frozenset(
    {
        "object",
        "obj",
        "target",
        "arg2",
        "annotation2",
        "entity2",
        "node2",
        "2",
    }
)


def build_plan(settings: Settings, request: StartReleaseRequest) -> IngestPlan:
    release_dir = resolve_release_dir(settings, request.source_code, request.release_tag)
    if not release_dir.exists():
        raise SourceSchemaDrift(f"missing PubTator release directory {release_dir}")

    families: list[FamilyPlan] = []
    deferred: list[str] = []
    allowlist = set(request.family_allowlist or ())
    for spec in family_specs_for_source("pt3"):
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
                    f"missing required PubTator dataset {spec.datasets[0]} for {request.release_tag}"
                ) from None
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
        source_code="pt3",
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
    if family_name == "biocxml":
        return _stream_biocxml(file_path, max_records_per_file, on_progress=on_progress)
    if family_name == "bioconcepts":
        return _stream_bioconcepts(file_path, max_records_per_file, on_progress=on_progress)
    if family_name == "relations":
        return _stream_relations(file_path, max_records_per_file, on_progress=on_progress)
    raise SourceSchemaDrift(f"unsupported PubTator family {family_name}")


async def promote_family(
    connection: asyncpg.Connection,
    plan: IngestPlan,
    family_name: str,
    source_release_id: int,
    ingest_run_id: UUID,
) -> None:
    del plan
    if family_name in {"biocxml", "bioconcepts"}:
        resource_code = ENTITY_RESOURCE_BIOCXML if family_name == "biocxml" else ENTITY_RESOURCE_BIOCONCEPTS
        await _backfill_entity_stage_corpus_ids(
            connection,
            source_release_id,
            resource_code,
            ingest_run_id=ingest_run_id,
        )
    if family_name in {"biocxml", "relations"}:
        relation_source = (
            RELATION_SOURCE_BIOCXML if family_name == "biocxml" else RELATION_SOURCE_TSV
        )
        await _backfill_relation_stage_corpus_ids(
            connection,
            source_release_id,
            relation_source,
            ingest_run_id=ingest_run_id,
        )


def _target_tables_for_family(family_name: str) -> tuple[str, ...]:
    mapping = {
        "biocxml": (
            "pubtator.entity_annotations_stage",
            "pubtator.relations_stage",
        ),
        "bioconcepts": ("pubtator.entity_annotations_stage",),
        "relations": ("pubtator.relations_stage",),
    }
    return mapping[family_name]


def _stream_biocxml(
    path: Path,
    max_records: int | None,
    *,
    on_progress: Callable[[int], None] | None = None,
) -> Iterator[dict[str, Any]]:
    yielded = 0
    skipped = Counter[str]()
    try:
        with path.open("rb") as raw_handle:
            with gzip.GzipFile(fileobj=raw_handle, mode="rb") as compressed_handle:
                with tarfile.open(fileobj=compressed_handle, mode="r|") as archive:
                    for member in archive:
                        if on_progress is not None:
                            on_progress(raw_handle.tell())
                        if not member.isfile() or not member.name.lower().endswith(".xml"):
                            continue
                        handle = archive.extractfile(member)
                        if handle is None:
                            continue
                        try:
                            document_iter = etree.iterparse(
                                handle,
                                events=("end",),
                                tag="document",
                                recover=True,
                            )
                        except etree.XMLSyntaxError as exc:
                            skipped["member_xml_syntax_error"] += 1
                            LOGGER.warning(
                                "PubTator BioCXML member %s failed to open (%s); skipping",
                                member.name,
                                exc,
                            )
                            continue
                        while True:
                            try:
                                event = next(document_iter)
                            except StopIteration:
                                break
                            except etree.XMLSyntaxError as exc:
                                skipped["member_xml_syntax_error"] += 1
                                LOGGER.warning(
                                    "PubTator BioCXML member %s parse error "
                                    "after %d documents (%s); skipping remainder",
                                    member.name,
                                    yielded,
                                    exc,
                                )
                                break
                            _, document = event
                            try:
                                if on_progress is not None and yielded % _PROGRESS_REPORT_LINE_INTERVAL == 0:
                                    on_progress(raw_handle.tell())
                                pmid_text = (document.findtext("id") or "").strip()
                                if not pmid_text.isdigit():
                                    skipped["missing_pmid"] += 1
                                    continue
                                pmid = int(pmid_text)
                                annotation_index: dict[str, tuple[str, int]] = {}
                                seen_entities: set[tuple[int, int, str, int]] = set()
                                for passage in document.findall("passage"):
                                    for annotation in passage.findall("annotation"):
                                        infons = _extract_infons(annotation)
                                        entity_type = ENTITY_TYPE_CODES.get((infons.get("type") or "").strip())
                                        mention_text = (annotation.findtext("text") or "").strip()
                                        concept_id = _extract_pubtator_identifier(annotation, infons)
                                        if entity_type is None or not mention_text or not concept_id:
                                            skipped["annotation_missing_fields"] += 1
                                            continue
                                        annotation_ref = _annotation_reference(annotation, infons)
                                        if annotation_ref:
                                            annotation_index.setdefault(annotation_ref, (concept_id, entity_type))
                                        locations = annotation.findall("location")
                                        if not locations:
                                            skipped["annotation_missing_location"] += 1
                                            continue
                                        for location in locations:
                                            span = _location_span(location)
                                            if span is None:
                                                skipped["annotation_bad_offset"] += 1
                                                continue
                                            start_offset, end_offset = span
                                            entity_key = (
                                                start_offset,
                                                end_offset,
                                                concept_id,
                                                ENTITY_RESOURCE_BIOCXML,
                                            )
                                            if entity_key in seen_entities:
                                                continue
                                            seen_entities.add(entity_key)
                                            yield {
                                                "row_kind": "entity",
                                                "pmid": pmid,
                                                "start_offset": start_offset,
                                                "end_offset": end_offset,
                                                "entity_type": entity_type,
                                                "mention_text": mention_text,
                                                "concept_id_raw": concept_id,
                                                "resource": ENTITY_RESOURCE_BIOCXML,
                                            }
                                            yielded += 1
                                            if max_records is not None and yielded >= max_records:
                                                return

                                seen_relations: set[tuple[int, int, str, str, int]] = set()
                                for relation in _iter_relation_elements(document):
                                    relation_row = _relation_row_from_biocxml(
                                        relation,
                                        pmid=pmid,
                                        annotation_index=annotation_index,
                                    )
                                    if relation_row is None:
                                        skipped["relation_unresolved"] += 1
                                        continue
                                    relation_key = (
                                        relation_row["pmid"],
                                        relation_row["relation_type"],
                                        relation_row["subject_entity_id"],
                                        relation_row["object_entity_id"],
                                        relation_row["relation_source"],
                                    )
                                    if relation_key in seen_relations:
                                        continue
                                    seen_relations.add(relation_key)
                                    yield relation_row
                                    yielded += 1
                                    if max_records is not None and yielded >= max_records:
                                        return
                            finally:
                                _clear_parsed_element(document)
    finally:
        if on_progress is not None:
            on_progress(path.stat().st_size)
        if skipped:
            summary = ", ".join(
                f"{key}={value}" for key, value in sorted(skipped.items()) if value > 0
            )
            LOGGER.warning("PubTator BioCXML dropped source rows for %s: %s", path.name, summary)


def _stream_bioconcepts(
    path: Path,
    max_records: int | None,
    *,
    on_progress: Callable[[int], None] | None = None,
) -> Iterator[dict[str, Any]]:
    # PubTator3 ``bioconcepts2pubtator3.gz`` is the *aggregated* concept-per-paper
    # TSV. Its schema is exactly five columns:
    #   PMID \t Type \t ConceptID \t Mentions \t Resource
    # (verified against live release files; see
    # https://ftp.ncbi.nlm.nih.gov/pub/lu/PubTator3/ for the public contract).
    # There are no character offsets in this feed — unlike the BioCXML payload,
    # which carries real ``<location offset="..." length="..."/>`` spans. Earlier
    # versions of this ingester assigned ``start_offset = line_number`` as a fake
    # unique key, but that silently (a) inflated duplicates across files with
    # different line densities and (b) collided distinct annotations that
    # happened to share a line index. The stage table's unique key
    # ``(source_release_id, pmid, start_offset, end_offset, entity_type,
    # concept_id_raw, resource)`` is the correct dedupe grain for this
    # aggregated source when offsets are a constant sentinel: same paper +
    # same entity type + same concept collapses to one row, which matches the
    # live PubTator feed even when one raw identifier is reused across types
    # (for example gene vs species taxonomy ids). The database uses a digest
    # expression for the raw identifier portion of this key so pathological
    # upstream IDs do not exceed PostgreSQL's btree tuple limit. Keep offsets
    # at 0 so that the ``resource`` discriminator (bioconcepts vs biocxml)
    # cleanly partitions the stage table without overlap in the unique index.
    with path.open("rb") as raw_handle:
        with gzip.GzipFile(fileobj=raw_handle, mode="rb") as compressed_handle:
            with io.TextIOWrapper(compressed_handle, encoding="utf-8") as handle:
                for index, line in enumerate(handle):
                    if on_progress is not None and index % _PROGRESS_REPORT_LINE_INTERVAL == 0:
                        on_progress(raw_handle.tell())
                    if max_records is not None and index >= max_records:
                        return
                    parts = line.rstrip("\n").split("\t")
                    if len(parts) < 5 or not parts[0].isdigit():
                        continue
                    entity_type = ENTITY_TYPE_CODES.get(parts[1])
                    if entity_type is None:
                        continue
                    yield {
                        "pmid": int(parts[0]),
                        # Sentinel span — this feed is document-level, not
                        # mention-level. Do not use ``index``: line numbers are
                        # not character offsets and make the unique key lie.
                        "start_offset": 0,
                        "end_offset": 0,
                        "entity_type": entity_type,
                        "mention_text": parts[3],
                        "concept_id_raw": parts[2],
                        "resource": ENTITY_RESOURCE_BIOCONCEPTS,
                    }
        if on_progress is not None:
            on_progress(path.stat().st_size)


def _stream_relations(
    path: Path,
    max_records: int | None,
    *,
    on_progress: Callable[[int], None] | None = None,
) -> Iterator[dict[str, Any]]:
    # PubTator3 ``relation2pubtator3.gz`` canonical schema is
    #   PMID \t RelationType \t Entity1 \t Entity2
    # where Entity1 is the SUBJECT ("role1") and Entity2 is the OBJECT
    # ("role2") — matching the BioCXML ``<infon key="role1"/>`` /
    # ``<infon key="role2"/>`` convention emitted by the same extractor. This
    # is verified against the NCBI PubTator3 documentation at
    # https://ftp.ncbi.nlm.nih.gov/pub/lu/PubTator3/README.md. Both TSV and
    # BioCXML paths must yield identical (subject, object) orientation for
    # identical logical relations; see ``_relation_row_from_biocxml`` for the
    # BioCXML half of the contract and ``tests/test_pubtator_parse.py`` for a
    # cross-path parity test.
    with path.open("rb") as raw_handle:
        with gzip.GzipFile(fileobj=raw_handle, mode="rb") as compressed_handle:
            with io.TextIOWrapper(compressed_handle, encoding="utf-8") as handle:
                for index, line in enumerate(handle):
                    if on_progress is not None and index % _PROGRESS_REPORT_LINE_INTERVAL == 0:
                        on_progress(raw_handle.tell())
                    if max_records is not None and index >= max_records:
                        return
                    parts = line.rstrip("\n").split("\t")
                    if len(parts) < 4 or not parts[0].isdigit():
                        continue
                    relation_type = RELATION_TYPE_CODES.get(parts[1])
                    if relation_type is None:
                        continue
                    subject_type = _infer_entity_type(parts[2])
                    object_type = _infer_entity_type(parts[3])
                    yield {
                        "pmid": int(parts[0]),
                        "relation_type": relation_type,
                        "subject_entity_id": parts[2],
                        "object_entity_id": parts[3],
                        "subject_type": subject_type,
                        "object_type": object_type,
                        "relation_source": RELATION_SOURCE_TSV,
                    }
        if on_progress is not None:
            on_progress(path.stat().st_size)


def _extract_pubtator_identifier(annotation: etree._Element, infons: dict[str, str]) -> str | None:
    for key in ("identifier", "Identifier"):
        value = infons.get(key)
        if value and value != "-":
            return value
    return None


async def _backfill_entity_stage_corpus_ids(
    connection: asyncpg.Connection,
    source_release_id: int,
    resource_code: int,
    *,
    ingest_run_id: UUID,
) -> None:
    await connection.execute(
        """
        UPDATE pubtator.entity_annotations_stage stage
        SET corpus_id = papers.corpus_id
        FROM solemd.papers papers
        WHERE stage.source_release_id = $1
          AND stage.resource = $2
          AND stage.last_seen_run_id = $3
          AND stage.pmid = papers.pmid
          AND stage.corpus_id IS DISTINCT FROM papers.corpus_id
        """,
        source_release_id,
        resource_code,
        ingest_run_id,
    )


async def _backfill_relation_stage_corpus_ids(
    connection: asyncpg.Connection,
    source_release_id: int,
    relation_source_code: int,
    *,
    ingest_run_id: UUID,
) -> None:
    await connection.execute(
        """
        UPDATE pubtator.relations_stage stage
        SET corpus_id = papers.corpus_id
        FROM solemd.papers papers
        WHERE stage.source_release_id = $1
          AND stage.relation_source = $2
          AND stage.last_seen_run_id = $3
          AND stage.pmid = papers.pmid
          AND stage.corpus_id IS DISTINCT FROM papers.corpus_id
        """,
        source_release_id,
        relation_source_code,
        ingest_run_id,
    )


def _extract_infons(element: etree._Element) -> dict[str, str]:
    return {
        child.attrib.get("key") or "": (child.text or "")
        for child in element.findall("infon")
    }


def _annotation_reference(annotation: etree._Element, infons: dict[str, str]) -> str | None:
    for key in ("id", "annotation_id", "annotationId"):
        value = (infons.get(key) or "").strip()
        if value and value != "-":
            return value
    if "id" in annotation.attrib:
        value = annotation.attrib.get("id", "").strip()
        if value:
            return value
    value = (annotation.findtext("id") or "").strip()
    return value or None


def _location_span(location: etree._Element) -> tuple[int, int] | None:
    try:
        start_offset = int(location.attrib.get("offset", "0"))
        length = int(location.attrib.get("length", "0"))
    except ValueError:
        return None
    if start_offset < 0 or length < 0:
        return None
    return start_offset, start_offset + length


def _iter_relation_elements(document: etree._Element) -> Iterator[etree._Element]:
    for relation in document.findall("relation"):
        yield relation
    for passage in document.findall("passage"):
        for relation in passage.findall("relation"):
            yield relation


def _relation_row_from_biocxml(
    relation: etree._Element,
    *,
    pmid: int,
    annotation_index: dict[str, tuple[str, int]],
) -> dict[str, Any] | None:
    # BioCXML relations in PubTator3 come in two shapes that we must resolve to
    # the same (subject, object) orientation as the TSV feed — see
    # ``_stream_relations`` for the canonical contract. Shape A (modern, common):
    # ``<relation><infon key="role1">…</infon><infon key="role2">…</infon></relation>``
    # where ``role1`` == subject and ``role2`` == object. Shape B (rare, legacy):
    # ``<relation><node refid=… role="subject|subj|arg1|…"/><node refid=…
    # role="object|obj|arg2|…"/></relation>`` — roles are explicit. When Shape B
    # nodes lack role attributes we fall back to document order (first node =
    # subject) which matches the PubTator3 upstream serializer. Either path must
    # produce output identical to ``_stream_relations`` for the same logical
    # relation; the cross-path parity test lives in ``tests/test_pubtator_parse.py``.
    infons = _extract_infons(relation)
    relation_type_name = _normalize_relation_type_name(
        infons.get("type")
        or infons.get("relation type")
        or infons.get("relation_type")
        or infons.get("type-name")
    )
    relation_type = RELATION_TYPE_CODES.get(relation_type_name)
    if relation_type is None:
        return None

    resolved_nodes: list[tuple[str | None, str, int]] = []
    for node in relation.findall("node"):
        ref_id = (
            (node.attrib.get("refid") or "")
            or (node.attrib.get("ref_id") or "")
            or (node.attrib.get("ref-id") or "")
        ).strip()
        if not ref_id:
            continue
        resolved = annotation_index.get(ref_id)
        if resolved is None:
            continue
        role = _normalize_relation_role(node.attrib.get("role"))
        entity_id, entity_type = resolved
        resolved_nodes.append((role, entity_id, entity_type))
    if len(resolved_nodes) >= 2:
        subject = _select_relation_node(
            resolved_nodes,
            preferred_roles=_RELATION_SUBJECT_ROLES,
        )
        object_ = _select_relation_node(
            resolved_nodes,
            preferred_roles=_RELATION_OBJECT_ROLES,
            exclude=subject,
        )
        if subject is None:
            subject = resolved_nodes[0]
        if object_ is None:
            for candidate in resolved_nodes:
                if candidate != subject:
                    object_ = candidate
                    break
        if object_ is None:
            return None

        _, subject_entity_id, subject_type = subject
        _, object_entity_id, object_type = object_
    else:
        direct_entities = _relation_entities_from_infons(infons)
        if direct_entities is None:
            return None
        subject_entity_id, object_entity_id = direct_entities
        subject_type = _infer_entity_type(subject_entity_id)
        object_type = _infer_entity_type(object_entity_id)

    return {
        "row_kind": "relation",
        "pmid": pmid,
        "relation_type": relation_type,
        "subject_entity_id": subject_entity_id,
        "object_entity_id": object_entity_id,
        "subject_type": subject_type,
        "object_type": object_type,
        "relation_source": RELATION_SOURCE_BIOCXML,
    }


def _normalize_relation_type_name(raw_value: str | None) -> str:
    normalized = (raw_value or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "association": "associate",
    }
    return aliases.get(normalized, normalized)


def _relation_entities_from_infons(infons: dict[str, str]) -> tuple[str, str] | None:
    subject_entity_id = _first_nonempty_infon(
        infons,
        "role1",
        "arg1",
        "subject",
        "subject_id",
    )
    object_entity_id = _first_nonempty_infon(
        infons,
        "role2",
        "arg2",
        "object",
        "object_id",
    )
    if not subject_entity_id or not object_entity_id:
        return None
    return subject_entity_id, object_entity_id


def _first_nonempty_infon(infons: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        value = (infons.get(key) or "").strip()
        if value and value != "-":
            return value
    return None


def _normalize_relation_role(raw_value: str | None) -> str | None:
    normalized = (raw_value or "").strip().lower()
    if not normalized:
        return None
    return normalized.replace("-", "").replace("_", "").replace(" ", "")


def _select_relation_node(
    resolved_nodes: list[tuple[str | None, str, int]],
    *,
    preferred_roles: frozenset[str],
    exclude: tuple[str | None, str, int] | None = None,
) -> tuple[str | None, str, int] | None:
    for candidate in resolved_nodes:
        role, _, _ = candidate
        if candidate == exclude:
            continue
        if role in preferred_roles:
            return candidate
    return None


def _clear_parsed_element(element: etree._Element) -> None:
    element.clear(keep_tail=False)
    while element.getprevious() is not None:
        del element.getparent()[0]


def _infer_entity_type(identifier: str) -> int:
    explicit_type, separator, raw_identifier = identifier.partition("|")
    if separator:
        normalized_type = explicit_type.strip().lower().replace("-", "").replace("_", "").replace(" ", "")
        explicit_type_map = {
            "gene": ENTITY_TYPE_CODES["Gene"],
            "disease": ENTITY_TYPE_CODES["Disease"],
            "chemical": ENTITY_TYPE_CODES["Chemical"],
            "species": ENTITY_TYPE_CODES["Species"],
            "mutation": ENTITY_TYPE_CODES["Mutation"],
            "cellline": ENTITY_TYPE_CODES["CellLine"],
        }
        if normalized_type in explicit_type_map:
            return explicit_type_map[normalized_type]
        identifier = raw_identifier
    if identifier.startswith("MESH:"):
        return ENTITY_TYPE_CODES["Disease"]
    if identifier.startswith("NCBIGene:"):
        return ENTITY_TYPE_CODES["Gene"]
    return ENTITY_TYPE_CODES["Chemical"]
