from __future__ import annotations

import json

from app.rag.chunk_policy import (
    DEFAULT_CHUNK_VERSION_KEY,
    build_default_chunk_version,
    build_default_chunk_version_for_sources,
)
from app.rag.parse_contract import PaperBlockKind, SectionRole
from app.rag.source_parsers import parse_biocxml_document, parse_s2orc_row


def _build_s2orc_source():
    body_text = (
        "Results\n"
        "Melatonin reduced delirium incidence [1]. Sleep quality improved."
    )
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
                "paragraph": json.dumps(
                    [{"start": 8, "end": len(body_text), "attributes": {}}]
                ),
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
                            "attributes": {"ref_id": "b1"},
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
                            "attributes": {"id": "b1"},
                        }
                    ]
                )
            },
        },
    }
    return parse_s2orc_row(
        row, source_revision="2026-03-10", parser_version="parser-v1"
    )


def _build_bioc_overlay():
    xml_text = """
    <collection>
      <document>
        <id>12345</id>
        <passage>
          <infon key="type">paragraph</infon>
          <infon key="section_type">RESULTS</infon>
          <offset>8</offset>
          <text>Melatonin reduced delirium incidence.</text>
        </passage>
      </document>
    </collection>
    """
    return parse_biocxml_document(
        xml_text, source_revision="2026-03-21", parser_version="parser-v1"
    )


def test_build_default_chunk_version_uses_canonical_policy_defaults():
    version = build_default_chunk_version(
        source_revision_keys=["biocxml:2026-03-21", "s2orc_v2:2026-03-10"],
        parser_version="parser-v1",
    )

    assert version.chunk_version_key == DEFAULT_CHUNK_VERSION_KEY
    assert version.included_section_roles == [
        SectionRole.ABSTRACT,
        SectionRole.INTRODUCTION,
        SectionRole.METHODS,
        SectionRole.RESULTS,
        SectionRole.DISCUSSION,
        SectionRole.CONCLUSION,
        SectionRole.SUPPLEMENT,
        SectionRole.OTHER,
    ]
    assert version.included_block_kinds == [
        PaperBlockKind.NARRATIVE_PARAGRAPH,
        PaperBlockKind.FIGURE_CAPTION,
        PaperBlockKind.TABLE_CAPTION,
        PaperBlockKind.TABLE_BODY_TEXT,
    ]
    assert version.source_revision_keys == [
        "biocxml:2026-03-21",
        "s2orc_v2:2026-03-10",
    ]


def test_build_default_chunk_version_for_sources_uses_primary_parser_and_unique_revisions():
    version = build_default_chunk_version_for_sources(
        [_build_bioc_overlay(), _build_s2orc_source()],
        embedding_model="text-embedding-3-large",
    )

    assert version.chunk_version_key == DEFAULT_CHUNK_VERSION_KEY
    assert version.parser_version == "parser-v1"
    assert version.embedding_model == "text-embedding-3-large"
    assert version.source_revision_keys == [
        "biocxml:2026-03-21",
        "s2orc_v2:2026-03-10",
    ]
