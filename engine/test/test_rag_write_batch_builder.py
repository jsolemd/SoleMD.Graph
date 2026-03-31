from __future__ import annotations

import json

from app.rag.parse_contract import (
    PaperBlockKind,
    ParseSourceSystem,
    SectionRole,
    SentenceSegmentationSource,
)
from app.rag.serving_contract import (
    CaptionMergePolicy,
    PaperChunkVersionRecord,
    SentenceOverlapPolicy,
)
from app.rag.source_selection import build_grounding_source_plan
from app.rag_ingest.source_parsers import parse_biocxml_document, parse_s2orc_row
from app.rag_ingest.write_batch_builder import (
    build_write_batch_from_grounding_plan,
    estimate_write_batch_bytes_from_grounding_plan,
    estimate_write_batch_rows_from_grounding_plan,
    merge_write_batches,
)


def _build_s2orc_source():
    body_text = "Results\nMelatonin reduced delirium incidence [1]. Sleep quality improved."
    bibliography_text = "1. Example trial paper."
    row = {
        "corpusid": 12345,
        "title": "Example trial",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": {
                "section_header": json.dumps(
                    [
                        {
                            "start": 0,
                            "end": len("Results"),
                            "attributes": {"n": "1."},
                        }
                    ]
                ),
                "paragraph": json.dumps([{"start": 8, "end": len(body_text), "attributes": {}}]),
                "sentence": json.dumps(
                    [
                        {"start": 8, "end": 48, "attributes": {}},
                        {"start": 49, "end": len(body_text), "attributes": {}},
                    ]
                ),
                "bib_ref": json.dumps(
                    [
                        {
                            "start": 45,
                            "end": 48,
                            "attributes": {
                                "ref_id": "b1",
                                "matched_paper_id": "S2:paper-1",
                            },
                        }
                    ]
                ),
            },
        },
        "bibliography": {
            "text": bibliography_text,
            "annotations": {
                "bib_entry": json.dumps(
                    [
                        {
                            "start": 0,
                            "end": len(bibliography_text),
                            "attributes": {"id": "b1", "matched_paper_id": "S2:paper-1"},
                        }
                    ]
                )
            },
        },
    }
    return parse_s2orc_row(row, source_revision="2026-03-10", parser_version="parser-v1")


def _build_s2orc_source_with_unresolved_bib_ref():
    body_text = "Results\nMelatonin reduced delirium incidence [1]. Sleep quality improved."
    row = {
        "corpusid": 24680,
        "title": "Unresolved bibliography example",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": {
                "section_header": json.dumps(
                    [
                        {
                            "start": 0,
                            "end": len("Results"),
                            "attributes": {"n": "1."},
                        }
                    ]
                ),
                "paragraph": json.dumps([{"start": 8, "end": len(body_text), "attributes": {}}]),
                "sentence": json.dumps(
                    [
                        {"start": 8, "end": 48, "attributes": {}},
                        {"start": 49, "end": len(body_text), "attributes": {}},
                    ]
                ),
                "bib_ref": json.dumps(
                    [
                        {
                            "start": 45,
                            "end": 48,
                            "attributes": {
                                "ref_id": "missing-ref",
                                "matched_paper_id": "S2:paper-1",
                            },
                        }
                    ]
                ),
            },
        },
        "bibliography": {"text": "", "annotations": {"bib_entry": json.dumps([])}},
    }
    return parse_s2orc_row(row, source_revision="2026-03-10", parser_version="parser-v1")


def _build_bioc_overlay():
    xml_text = """
    <collection>
      <document>
        <id>12345</id>
        <passage>
          <infon key="type">title_1</infon>
          <infon key="section_type">RESULTS</infon>
          <offset>0</offset>
          <text>Results</text>
        </passage>
        <passage>
          <infon key="type">paragraph</infon>
          <infon key="section_type">RESULTS</infon>
          <offset>8</offset>
          <text>Melatonin reduced delirium incidence.</text>
          <annotation>
            <infon key="type">Chemical</infon>
            <infon key="identifier">MESH:D008550</infon>
            <location offset="8" length="10" />
            <text>Melatonin</text>
          </annotation>
        </passage>
      </document>
    </collection>
    """
    return parse_biocxml_document(
        xml_text, source_revision="2026-03-21", parser_version="parser-v1"
    )


def test_build_write_batch_from_grounding_plan_emits_core_rows_and_aligned_mentions():
    plan = build_grounding_source_plan([_build_s2orc_source(), _build_bioc_overlay()])

    batch = build_write_batch_from_grounding_plan(
        plan,
        source_citation_keys=["b1"],
    )

    assert batch.documents[0].primary_source_system == ParseSourceSystem.S2ORC_V2
    assert len(batch.document_sources) == 2
    assert batch.document_sources[0].is_primary_text_source is True
    assert len(batch.sections) == 1
    assert len(batch.blocks) == 1
    assert len(batch.sentences) >= 2
    assert len(batch.references) == 1
    assert len(batch.citations) == 1
    assert len(batch.entities) == 1
    assert batch.entities[0].concept_namespace == "mesh"
    assert batch.entities[0].concept_id == "D008550"


def test_build_write_batch_preserves_primary_source_entities_when_bioc_is_primary():
    plan = build_grounding_source_plan([_build_bioc_overlay()])

    batch = build_write_batch_from_grounding_plan(plan)

    assert batch.documents[0].primary_source_system == ParseSourceSystem.BIOCXML
    assert len(batch.entities) == 1
    assert batch.entities[0].text == "Melatonin"


def test_estimate_write_batch_rows_from_grounding_plan_matches_current_non_chunk_batch_shape():
    plan = build_grounding_source_plan([_build_s2orc_source(), _build_bioc_overlay()])

    estimated = estimate_write_batch_rows_from_grounding_plan(plan)
    batch = build_write_batch_from_grounding_plan(plan)

    actual = (
        len(batch.documents)
        + len(batch.document_sources)
        + len(batch.sections)
        + len(batch.blocks)
        + len(batch.sentences)
        + len(batch.references)
        + len(batch.citations)
        + len(batch.entities)
    )

    assert estimated == actual


def test_estimate_write_batch_bytes_from_grounding_plan_grows_with_more_structural_content():
    base_plan = build_grounding_source_plan([_build_s2orc_source()])
    richer_plan = build_grounding_source_plan([_build_s2orc_source(), _build_bioc_overlay()])

    base_estimate = estimate_write_batch_bytes_from_grounding_plan(base_plan)
    richer_estimate = estimate_write_batch_bytes_from_grounding_plan(richer_plan)

    assert base_estimate > 0
    assert richer_estimate > base_estimate


def test_build_write_batch_from_grounding_plan_can_append_structural_chunks():
    plan = build_grounding_source_plan([_build_s2orc_source(), _build_bioc_overlay()])
    chunk_version = PaperChunkVersionRecord(
        chunk_version_key="default-v1",
        source_revision_keys=["s2orc_v2:2026-03-10", "biocxml:2026-03-21"],
        parser_version="parser-v1",
        text_normalization_version="norm-v1",
        sentence_source_policy=[
            SentenceSegmentationSource.S2ORC_ANNOTATION,
            SentenceSegmentationSource.DETERMINISTIC_FALLBACK,
        ],
        included_section_roles=[SectionRole.RESULTS],
        included_block_kinds=[PaperBlockKind.NARRATIVE_PARAGRAPH],
        caption_merge_policy=CaptionMergePolicy.STANDALONE,
        tokenizer_name="simple",
        target_token_budget=256,
        hard_max_tokens=384,
        sentence_overlap_policy=SentenceOverlapPolicy.NONE,
    )

    batch = build_write_batch_from_grounding_plan(plan, chunk_version=chunk_version)

    assert [version.chunk_version_key for version in batch.chunk_versions] == ["default-v1"]
    assert len(batch.chunks) == 1
    assert batch.chunks[0].chunk_version_key == "default-v1"
    assert batch.chunks[0].corpus_id == 12345
    assert len(batch.chunk_members) == 2


def test_build_write_batch_from_grounding_plan_drops_unresolved_reference_link_from_citation():
    plan = build_grounding_source_plan([_build_s2orc_source_with_unresolved_bib_ref()])

    batch = build_write_batch_from_grounding_plan(plan)

    assert len(batch.references) == 0
    assert len(batch.citations) == 1
    assert batch.citations[0].source_reference_key is None
    assert batch.citations[0].source_citation_key == "missing-ref"


def test_merge_write_batches_combines_distinct_corpus_batches():
    first_plan = build_grounding_source_plan([_build_s2orc_source(), _build_bioc_overlay()])
    second_source = parse_s2orc_row(
        {
            "corpusid": 67890,
            "title": "Second trial",
            "openaccessinfo": {"license": "CC-BY"},
            "body": {
                "text": "Results\nDexmedetomidine improved sleep.",
                "annotations": {
                    "section_header": json.dumps(
                        [{"start": 0, "end": len("Results"), "attributes": {}}]
                    ),
                    "paragraph": json.dumps(
                        [
                            {
                                "start": 8,
                                "end": len("Results\nDexmedetomidine improved sleep."),
                                "attributes": {},
                            }
                        ]
                    ),
                    "sentence": json.dumps(
                        [
                            {
                                "start": 8,
                                "end": len("Results\nDexmedetomidine improved sleep."),
                                "attributes": {},
                            }
                        ]
                    ),
                    "bib_ref": json.dumps([]),
                },
            },
            "bibliography": {"text": "", "annotations": {"bib_entry": json.dumps([])}},
        },
        source_revision="2026-03-10",
        parser_version="parser-v1",
    )
    second_plan = build_grounding_source_plan([second_source])

    merged = merge_write_batches(
        [
            build_write_batch_from_grounding_plan(first_plan),
            build_write_batch_from_grounding_plan(second_plan),
        ]
    )

    assert sorted(row.corpus_id for row in merged.documents) == [12345, 67890]
    assert len(merged.blocks) == 2
