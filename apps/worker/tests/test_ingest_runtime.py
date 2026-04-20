from __future__ import annotations

import asyncio
from pathlib import Path

import asyncpg
import pytest

from app.db import open_pools
from app.ingest.errors import IngestAlreadyPublished
from app.ingest.models import StartReleaseRequest
from app.ingest.runtime import run_release_ingest
from app.ingest.sources import pubtator, semantic_scholar
from helpers import write_jsonl_gz, write_manifest, write_tar_gz, write_tsv_gz
from telemetry_test_support import metric_sample_value


@pytest.mark.asyncio
async def test_s2_sample_ingest_writes_raw_rows_only(
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

    before_runs_published = metric_sample_value(
        "ingest_runs_total",
        {"source_code": "s2", "outcome": "published"},
    )
    before_loading_count = metric_sample_value(
        "ingest_phase_duration_seconds_count",
        {
            "source_code": "s2",
            "release_tag": release_tag,
            "phase": "loading",
        },
    )
    before_paper_rows = metric_sample_value(
        "ingest_family_rows_total",
        {"source_code": "s2", "family": "papers"},
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

    assert metric_sample_value(
        "ingest_runs_total",
        {"source_code": "s2", "outcome": "published"},
    ) == before_runs_published + 1
    assert metric_sample_value(
        "ingest_phase_duration_seconds_count",
        {
            "source_code": "s2",
            "release_tag": release_tag,
            "phase": "loading",
        },
    ) == before_loading_count + 1
    assert metric_sample_value(
        "ingest_family_rows_total",
        {"source_code": "s2", "family": "papers"},
    ) == before_paper_rows + 1

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
                pmid,
                doi_norm,
                title,
                abstract,
                corpus_id
            FROM solemd.s2_papers_raw
            WHERE paper_id = '101'
            """,
        )
        assert paper_row is not None
        assert paper_row["pmid"] == 12345
        assert paper_row["doi_norm"] == "10.1000/ingest-test"
        assert paper_row["title"] == "Release-safe ingest worker lane"
        assert paper_row["abstract"] == "This release proves the first warehouse ingest lane."
        assert paper_row["corpus_id"] is None

        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.s2_paper_authors_raw") == 1
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.s2orc_documents_raw") == 1
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.papers") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_text") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_authors") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_documents") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_sections") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_blocks") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_sentences") == 0
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_already_published_rerun_does_not_regress_release_status(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-01-15"
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
                "intents": ["background"],
            }
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
        before_row = await admin_connection.fetchrow(
            """
            SELECT source_release_id, release_status, source_ingested_at
            FROM solemd.source_releases
            WHERE source_name = 's2'
              AND source_release_key = $1
            """,
            release_tag,
        )
        assert before_row is not None
        assert before_row["release_status"] == "loaded"
    finally:
        await admin_connection.close()

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        with pytest.raises(IngestAlreadyPublished):
            await run_release_ingest(
                request,
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        after_row = await admin_connection.fetchrow(
            """
            SELECT source_release_id, release_status, source_ingested_at
            FROM solemd.source_releases
            WHERE source_name = 's2'
              AND source_release_key = $1
            """,
            release_tag,
        )
        assert after_row is not None
        assert after_row["source_release_id"] == before_row["source_release_id"]
        assert after_row["release_status"] == "loaded"
        assert after_row["source_ingested_at"] == before_row["source_ingested_at"]
        assert await admin_connection.fetchval(
            """
            SELECT count(*)
            FROM solemd.ingest_runs
            WHERE source_release_id = $1
            """,
            before_row["source_release_id"],
        ) == 1
        assert await admin_connection.fetchval(
            "SELECT status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
            ingest_run_id,
        ) == 5
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_force_new_run_allows_published_plan_change(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-01-16"
    s2_root = tmp_path / "semantic-scholar"
    release_dir = s2_root / "releases" / release_tag
    authors_dir = release_dir / "authors"
    citations_dir = release_dir / "citations"
    authors_path = authors_dir / "authors-0000.jsonl.gz"
    citations_path = citations_dir / "citations-0000.jsonl.gz"

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
        citations_path,
        [
            {
                "citationid": 1,
                "citingcorpusid": 101,
                "citedcorpusid": 202,
                "isinfluential": True,
                "intents": ["background"],
            }
        ],
    )
    write_manifest(
        release_dir / "manifests" / "authors.manifest.json",
        dataset="authors",
        release_tag=release_tag,
        output_dir=authors_dir,
        file_names=[authors_path.name],
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
    first_request = StartReleaseRequest(
        source_code="s2",
        release_tag=release_tag,
        requested_by="tester",
        family_allowlist=("citations",),
    )
    second_request = StartReleaseRequest(
        source_code="s2",
        release_tag=release_tag,
        requested_by="tester",
        family_allowlist=("authors", "citations"),
        force_new_run=True,
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        first_run_id = await run_release_ingest(
            first_request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        second_run_id = await run_release_ingest(
            second_request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        assert first_run_id != second_run_id
        release_row = await admin_connection.fetchrow(
            """
            SELECT source_release_id, release_status
            FROM solemd.source_releases
            WHERE source_name = 's2'
              AND source_release_key = $1
            """,
            release_tag,
        )
        assert release_row is not None
        assert release_row["release_status"] == "loaded"
        assert await admin_connection.fetchval(
            """
            SELECT count(*)
            FROM solemd.ingest_runs
            WHERE source_release_id = $1
            """,
            release_row["source_release_id"],
        ) == 2
        latest_families = await admin_connection.fetchval(
            """
            SELECT families_loaded
            FROM solemd.ingest_runs
            WHERE ingest_run_id = $1
            """,
            second_run_id,
        )
        assert latest_families == ["authors", "citations"]
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.authors") == 1
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.s2_paper_references_raw") == 1
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
        ) == 0
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
        ) == 0
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
        ) == 0
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.relations_stage"
        ) == 2
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.relations"
        ) == 0

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
        ) == 0
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.relations"
        ) == 0
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.relations WHERE pmid = 12345"
        ) == 0
        assert await admin_connection.fetchval(
            "SELECT status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
            first_run_id,
        ) == 5
    finally:
        await admin_connection.close()
