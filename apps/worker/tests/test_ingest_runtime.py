from __future__ import annotations

import asyncio
from pathlib import Path

import asyncpg
import pytest

from app.db import open_pools
from app.ingest.models import StartReleaseRequest
from app.ingest.runtime import run_release_ingest
from app.ingest.sources import pubtator, semantic_scholar
from helpers import write_jsonl_gz, write_manifest, write_tar_gz, write_tsv_gz


@pytest.mark.asyncio
async def test_s2_sample_ingest_writes_canonical_rows(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-03-10"
    s2_root = tmp_path / "semantic-scholar"
    release_dir = s2_root / "releases" / release_tag

    publication_venues_dir = release_dir / "publication-venues"
    authors_dir = release_dir / "authors"
    papers_dir = release_dir / "papers"
    abstracts_dir = release_dir / "abstracts"
    s2orc_dir = release_dir / "s2orc_v2"

    venues_path = publication_venues_dir / "publication-venues-0000.jsonl.gz"
    authors_path = authors_dir / "authors-0000.jsonl.gz"
    papers_path = papers_dir / "papers-0000.jsonl.gz"
    abstracts_path = abstracts_dir / "abstracts-0000.jsonl.gz"
    s2orc_path = s2orc_dir / "s2orc_v2-0000.jsonl.gz"

    write_jsonl_gz(
        venues_path,
        [
            {
                "id": "venue-1",
                "issn": "1234-5678",
                "name": "Journal of Warehouse Tests",
            }
        ],
    )
    write_jsonl_gz(
        authors_path,
        [
            {
                "authorid": "author-1",
                "name": "Ada Ingest",
                "externalids": {"ORCID": "0000-0000-0000-0001"},
            }
        ],
    )
    write_jsonl_gz(
        papers_path,
        [
            {
                "corpusid": 101,
                "title": "Release-safe ingest worker lane",
                "venue": "Journal of Warehouse Tests",
                "year": 2026,
                "publicationdate": "2026-03-10",
                "isopenaccess": True,
                "publicationvenueid": "venue-1",
                "externalids": {
                    "PubMed": "12345",
                    "DOI": "10.1000/ingest-test",
                    "PubMedCentral": "PMC12345",
                },
                "authors": [
                    {
                        "authorId": "author-1",
                        "name": "Ada Ingest",
                    }
                ],
                "openaccessinfo": {
                    "url": "https://example.test/fulltext.pdf",
                    "status": "open",
                },
            }
        ],
    )
    write_jsonl_gz(
        abstracts_path,
        [
            {
                "corpusid": 101,
                "abstract": "This release proves the first warehouse ingest lane.",
            }
        ],
    )
    s2orc_text = "Methods. We load the release. Results. Rows land in the warehouse."
    write_jsonl_gz(
        s2orc_path,
        [
            {
                "corpusid": 101,
                "body": {
                    "text": s2orc_text,
                    "annotations": {
                        "paragraph": [
                            {
                                "start": 0,
                                "end": len(s2orc_text),
                            }
                        ]
                    },
                },
            }
        ],
    )

    write_manifest(
        release_dir / "manifests" / "publication-venues.manifest.json",
        dataset="publication-venues",
        release_tag=release_tag,
        output_dir=publication_venues_dir,
        file_names=[venues_path.name],
    )
    write_manifest(
        release_dir / "manifests" / "authors.manifest.json",
        dataset="authors",
        release_tag=release_tag,
        output_dir=authors_dir,
        file_names=[authors_path.name],
    )
    write_manifest(
        release_dir / "manifests" / "papers.manifest.json",
        dataset="papers",
        release_tag=release_tag,
        output_dir=papers_dir,
        file_names=[papers_path.name],
    )
    write_manifest(
        release_dir / "manifests" / "abstracts.manifest.json",
        dataset="abstracts",
        release_tag=release_tag,
        output_dir=abstracts_dir,
        file_names=[abstracts_path.name],
    )
    write_manifest(
        release_dir / "manifests" / "s2orc_v2.manifest.json",
        dataset="s2orc_v2",
        release_tag=release_tag,
        output_dir=s2orc_dir,
        file_names=[s2orc_path.name],
    )

    runtime_settings = runtime_settings_factory(
        semantic_scholar_dir=s2_root,
        ingest_dsn=warehouse_dsns["ingest"],
    )
    request = StartReleaseRequest(
        source_code="s2",
        release_tag=release_tag,
        requested_by="tester",
        family_allowlist=("publication_venues", "authors", "papers", "abstracts", "s2orc_v2"),
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        ingest_run_id = await run_release_ingest(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        ingest_row = await admin_connection.fetchrow(
            """
            SELECT status, families_loaded, last_loaded_family
            FROM solemd.ingest_runs
            WHERE ingest_run_id = $1
            """,
            ingest_run_id,
        )
        assert ingest_row is not None
        assert ingest_row["status"] == 5
        assert ingest_row["families_loaded"] == [
            "publication_venues",
            "authors",
            "papers",
            "abstracts",
            "s2orc_v2",
        ]
        assert ingest_row["last_loaded_family"] == "s2orc_v2"

        paper_row = await admin_connection.fetchrow(
            """
            SELECT
                papers.pmid,
                papers.doi_norm,
                paper_text.title,
                paper_text.abstract,
                paper_text.text_availability,
                paper_documents.source_revision
            FROM solemd.papers papers
            JOIN solemd.paper_text paper_text
              ON paper_text.corpus_id = papers.corpus_id
            JOIN solemd.paper_documents paper_documents
              ON paper_documents.corpus_id = papers.corpus_id
            WHERE papers.s2_paper_id = '101'
            """,
        )
        assert paper_row is not None
        assert paper_row["pmid"] == 12345
        assert paper_row["doi_norm"] == "10.1000/ingest-test"
        assert paper_row["title"] == "Release-safe ingest worker lane"
        assert paper_row["abstract"] == "This release proves the first warehouse ingest lane."
        assert paper_row["text_availability"] == 2
        assert paper_row["source_revision"] == release_tag

        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_authors") == 1
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_sections") == 1
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_blocks") == 1
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_sentences") >= 1
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_s2_citations_resume_is_deterministic(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-01-01"
    s2_root = tmp_path / "semantic-scholar"
    release_dir = s2_root / "releases" / release_tag
    citations_dir = release_dir / "citations"
    citations_path = citations_dir / "citations-0000.jsonl.gz"
    write_jsonl_gz(
        citations_path,
        [
            {
                "citationid": 1,
                "citingcorpusid": 101,
                "citedcorpusid": 202,
                "isinfluential": False,
                "intents": None,
            },
            {
                "citationid": 2,
                "citingcorpusid": 303,
                "citedcorpusid": None,
                "isinfluential": True,
                "intents": ["background"],
            },
        ],
    )
    write_manifest(
        release_dir / "manifests" / "citations.manifest.json",
        dataset="citations",
        release_tag=release_tag,
        output_dir=citations_dir,
        file_names=[citations_path.name],
    )

    runtime_settings = runtime_settings_factory(
        semantic_scholar_dir=s2_root,
        ingest_dsn=warehouse_dsns["ingest"],
    )
    request = StartReleaseRequest(
        source_code="s2",
        release_tag=release_tag,
        requested_by="tester",
        family_allowlist=("citations",),
    )
    plan = semantic_scholar.build_plan(runtime_settings, request)
    assert plan.family_names == ("citations",)

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        first_run_id = await run_release_ingest(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM solemd.s2_paper_references_raw"
        ) == 2
        await admin_connection.execute(
            """
            UPDATE solemd.ingest_runs
            SET status = 2,
                completed_at = NULL,
                families_loaded = ARRAY['citations']::text[]
            WHERE ingest_run_id = $1
            """,
            first_run_id,
        )
    finally:
        await admin_connection.close()

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        resumed_run_id = await run_release_ingest(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        assert resumed_run_id == first_run_id
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM solemd.s2_paper_references_raw"
        ) == 2
        assert await admin_connection.fetchval(
            "SELECT status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
            first_run_id,
        ) == 5
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_pubtator_relations_resume_is_deterministic(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-02-02"
    pt_root = tmp_path / "pubtator"
    release_dir = pt_root / "releases" / release_tag
    relations_path = release_dir / "relation2pubtator3.gz"
    write_tsv_gz(
        relations_path,
        ["12345\tassociate\tChemical|MESH:D000001\tDisease|MESH:D000002"],
    )
    write_manifest(
        release_dir / "manifests" / "relation2pubtator3.gz.manifest.json",
        dataset="relation2pubtator3.gz",
        release_tag=release_tag,
        output_dir=release_dir,
        file_names=[relations_path.name],
    )

    runtime_settings = runtime_settings_factory(
        pubtator_dir=pt_root,
        ingest_dsn=warehouse_dsns["ingest"],
    )
    request = StartReleaseRequest(
        source_code="pt3",
        release_tag=release_tag,
        requested_by="tester",
        family_allowlist=("relations",),
    )
    plan = pubtator.build_plan(runtime_settings, request)
    assert plan.family_names == ("relations",)

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        corpus_id = await admin_connection.fetchval(
            "INSERT INTO solemd.corpus (admission_reason) VALUES ('test') RETURNING corpus_id"
        )
        await admin_connection.execute(
            """
            INSERT INTO solemd.papers (corpus_id, pmid, s2_paper_id)
            VALUES ($1, 12345, '12345')
            """,
            corpus_id,
        )
    finally:
        await admin_connection.close()

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        first_run_id = await run_release_ingest(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.relations_stage"
        ) == 1
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.relations"
        ) == 1
        relation_stage = await admin_connection.fetchrow(
            """
            SELECT relation_type, subject_entity_id, object_entity_id, subject_type, object_type
            FROM pubtator.relations_stage
            WHERE pmid = 12345
            """
        )
        assert relation_stage is not None
        assert relation_stage["relation_type"] == 1
        assert relation_stage["subject_entity_id"] == "Chemical|MESH:D000001"
        assert relation_stage["object_entity_id"] == "Disease|MESH:D000002"
        assert relation_stage["subject_type"] == 3
        assert relation_stage["object_type"] == 2

        relation_canonical = await admin_connection.fetchrow(
            """
            SELECT relation_type, subject_entity_id, object_entity_id, subject_type, object_type
            FROM pubtator.relations
            WHERE pmid = 12345
            """
        )
        assert relation_canonical is not None
        assert relation_canonical["relation_type"] == 1
        assert relation_canonical["subject_entity_id"] == "Chemical|MESH:D000001"
        assert relation_canonical["object_entity_id"] == "Disease|MESH:D000002"
        assert relation_canonical["subject_type"] == 3
        assert relation_canonical["object_type"] == 2
        await admin_connection.execute(
            """
            UPDATE solemd.ingest_runs
            SET status = 2,
                completed_at = NULL,
                families_loaded = ARRAY['relations']::text[]
            WHERE ingest_run_id = $1
            """,
            first_run_id,
        )
    finally:
        await admin_connection.close()

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        resumed_run_id = await run_release_ingest(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        assert resumed_run_id == first_run_id
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.relations"
        ) == 1
        assert await admin_connection.fetchval(
            "SELECT status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
            first_run_id,
        ) == 5
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_pubtator_biocxml_relations_prefer_xml_and_resume_cleanly(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-02-03"
    pt_root = tmp_path / "pubtator"
    release_dir = pt_root / "releases" / release_tag
    biocxml_dir = release_dir / "biocxml"
    biocxml_path = biocxml_dir / "BioCXML.0.tar.gz"
    relations_path = release_dir / "relation2pubtator3.gz"

    write_tar_gz(
        biocxml_path,
        members={
            "sample.BioC.XML": """
<collection>
  <document>
    <id>12345</id>
    <passage>
      <offset>0</offset>
      <text>Aspirin relieved headache.</text>
      <annotation id="A1">
        <infon key="type">Chemical</infon>
        <infon key="identifier">Chemical|MESH:D000001</infon>
        <location offset="0" length="7" />
        <text>Aspirin</text>
      </annotation>
      <annotation id="A2">
        <infon key="type">Disease</infon>
        <infon key="identifier">Disease|MESH:D000002</infon>
        <location offset="17" length="8" />
        <text>headache</text>
      </annotation>
      <annotation id="A3">
        <infon key="type">Gene</infon>
        <infon key="identifier">NCBIGene:1</infon>
        <location offset="bad" length="4" />
        <text>bad</text>
      </annotation>
      <relation id="R1">
        <infon key="type">Association</infon>
        <infon key="role1">Chemical|MESH:D000001</infon>
        <infon key="role2">Disease|MESH:D000002</infon>
      </relation>
    </passage>
  </document>
</collection>
""".strip()
        },
    )
    write_tsv_gz(
        relations_path,
        ["12345\tassociate\tChemical|MESH:D000001\tDisease|MESH:D000002"],
    )
    write_manifest(
        release_dir / "manifests" / "biocxml.manifest.json",
        dataset="biocxml",
        release_tag=release_tag,
        output_dir=biocxml_dir,
        file_names=[biocxml_path.name],
    )
    write_manifest(
        release_dir / "manifests" / "relation2pubtator3.gz.manifest.json",
        dataset="relation2pubtator3.gz",
        release_tag=release_tag,
        output_dir=release_dir,
        file_names=[relations_path.name],
    )

    runtime_settings = runtime_settings_factory(
        pubtator_dir=pt_root,
        ingest_dsn=warehouse_dsns["ingest"],
    )
    request = StartReleaseRequest(
        source_code="pt3",
        release_tag=release_tag,
        requested_by="tester",
        family_allowlist=("biocxml", "relations"),
    )
    plan = pubtator.build_plan(runtime_settings, request)
    assert plan.family_names == ("biocxml", "relations")

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        corpus_id = await admin_connection.fetchval(
            "INSERT INTO solemd.corpus (admission_reason) VALUES ('test') RETURNING corpus_id"
        )
        await admin_connection.execute(
            """
            INSERT INTO solemd.papers (corpus_id, pmid, s2_paper_id)
            VALUES ($1, 12345, '12345')
            """,
            corpus_id,
        )
    finally:
        await admin_connection.close()

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        first_run_id = await run_release_ingest(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.entity_annotations_stage"
        ) == 2
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.entity_annotations"
        ) == 2
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.relations_stage"
        ) == 2
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.relations"
        ) == 1

        relation_stage_counts = await admin_connection.fetch(
            """
            SELECT relation_source, count(*) AS row_count
            FROM pubtator.relations_stage
            GROUP BY relation_source
            ORDER BY relation_source
            """
        )
        assert [(row["relation_source"], row["row_count"]) for row in relation_stage_counts] == [
            (1, 1),
            (2, 1),
        ]

        canonical_relation = await admin_connection.fetchrow(
            """
            SELECT relation_source, subject_entity_id, object_entity_id, subject_type, object_type
            FROM pubtator.relations
            WHERE pmid = 12345
            """
        )
        assert canonical_relation is not None
        assert canonical_relation["relation_source"] == 1
        assert canonical_relation["subject_entity_id"] == "Chemical|MESH:D000001"
        assert canonical_relation["object_entity_id"] == "Disease|MESH:D000002"
        assert canonical_relation["subject_type"] == 3
        assert canonical_relation["object_type"] == 2

        entity_rows = await admin_connection.fetch(
            """
            SELECT start_offset, end_offset, concept_id_raw
            FROM pubtator.entity_annotations
            WHERE pmid = 12345
            ORDER BY start_offset
            """
        )
        assert [(row["start_offset"], row["end_offset"], row["concept_id_raw"]) for row in entity_rows] == [
            (0, 7, "Chemical|MESH:D000001"),
            (17, 25, "Disease|MESH:D000002"),
        ]

        await admin_connection.execute(
            """
            UPDATE solemd.ingest_runs
            SET status = 2,
                completed_at = NULL,
                families_loaded = ARRAY['biocxml', 'relations']::text[]
            WHERE ingest_run_id = $1
            """,
            first_run_id,
        )
    finally:
        await admin_connection.close()

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        resumed_run_id = await run_release_ingest(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        assert resumed_run_id == first_run_id
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.entity_annotations"
        ) == 2
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.relations"
        ) == 1
        assert await admin_connection.fetchval(
            "SELECT relation_source FROM pubtator.relations WHERE pmid = 12345"
        ) == 1
        assert await admin_connection.fetchval(
            "SELECT status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
            first_run_id,
        ) == 5
    finally:
        await admin_connection.close()
