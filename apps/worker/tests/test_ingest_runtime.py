from __future__ import annotations

import asyncio
from pathlib import Path

import asyncpg
import pytest

from prometheus_client.parser import text_string_to_metric_families

from app.db import init_connection, open_pools
from app.ingest.errors import IngestAborted, IngestAlreadyInProgress, IngestAlreadyPublished
from app.ingest.models import CopyStats, FamilyPlan, FilePlan, IngestPlan, StartReleaseRequest
from app.ingest.runtime import (
    INGEST_STATUS_ABORTED,
    _open_or_resume_run,
    run_release_ingest,
)
from app.ingest.sources import pubtator, semantic_scholar
from app.telemetry.metrics import collect_metrics_text
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
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.s2_authors_raw") == 1
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.s2orc_documents_raw") == 1
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.papers") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_text") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_authors") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.authors") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_documents") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_sections") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_blocks") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_sentences") == 0
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_s2_publication_venues_tolerate_duplicate_issn_rows(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-03-11"
    s2_root = tmp_path / "semantic-scholar"
    release_dir = s2_root / "releases" / release_tag

    publication_venues_dir = release_dir / "publication-venues"
    papers_dir = release_dir / "papers"
    abstracts_dir = release_dir / "abstracts"
    citations_dir = release_dir / "citations"

    venues_path = publication_venues_dir / "publication-venues-0000.jsonl.gz"
    papers_path = papers_dir / "papers-0000.jsonl.gz"
    abstracts_path = abstracts_dir / "abstracts-0000.jsonl.gz"
    citations_path = citations_dir / "citations-0000.jsonl.gz"

    write_jsonl_gz(
        venues_path,
        [
            {
                "id": "venue-1",
                "issn": "1234-5678",
                "name": "Journal of Warehouse Tests",
            },
            {
                "id": "venue-2",
                "issn": "1234-5678",
                "name": "Journal of Warehouse Tests Alternate",
            },
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
                "publicationdate": "2026-03-11",
                "isopenaccess": True,
                "publicationvenueid": "venue-1",
                "externalids": {"PubMed": "12345"},
                "authors": [],
            }
        ],
    )
    write_jsonl_gz(
        abstracts_path,
        [{"corpusid": 101, "abstract": "This release proves the first warehouse ingest lane."}],
    )
    write_jsonl_gz(
        citations_path,
        [
            {
                "citationid": 1,
                "citingcorpusid": 101,
                "citedcorpusid": 202,
                "isinfluential": False,
                "intents": None,
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

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        await run_release_ingest(
            StartReleaseRequest(
                source_code="s2",
                release_tag=release_tag,
                requested_by="tester",
                family_allowlist=("publication_venues", "papers", "abstracts", "citations"),
            ),
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        assert await admin_connection.fetchval(
            """
            SELECT count(*)
            FROM solemd.venues
            WHERE issn = '1234-5678'
            """
        ) == 1
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_s2_publication_venues_tolerate_duplicate_normalized_name_rows(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-03-12"
    s2_root = tmp_path / "semantic-scholar"
    release_dir = s2_root / "releases" / release_tag

    publication_venues_dir = release_dir / "publication-venues"
    papers_dir = release_dir / "papers"
    abstracts_dir = release_dir / "abstracts"
    citations_dir = release_dir / "citations"

    venues_path = publication_venues_dir / "publication-venues-0000.jsonl.gz"
    papers_path = papers_dir / "papers-0000.jsonl.gz"
    abstracts_path = abstracts_dir / "abstracts-0000.jsonl.gz"
    citations_path = citations_dir / "citations-0000.jsonl.gz"

    write_jsonl_gz(
        venues_path,
        [
            {
                "id": "venue-1",
                "issn": None,
                "name": "Journal of Obstetrics and Gynaecology Research",
            },
            {
                "id": "venue-2",
                "issn": None,
                "name": "Journal of Obstetrics and Gynaecology Research",
            },
        ],
    )
    write_jsonl_gz(
        papers_path,
        [
            {
                "corpusid": 101,
                "title": "Release-safe ingest worker lane",
                "venue": "Journal of Obstetrics and Gynaecology Research",
                "year": 2026,
                "publicationdate": "2026-03-12",
                "isopenaccess": True,
                "publicationvenueid": "venue-2",
                "externalids": {"PubMed": "12345"},
                "authors": [],
            }
        ],
    )
    write_jsonl_gz(
        abstracts_path,
        [{"corpusid": 101, "abstract": "This release proves normalized-name venue handling."}],
    )
    write_jsonl_gz(
        citations_path,
        [
            {
                "citationid": 1,
                "citingcorpusid": 101,
                "citedcorpusid": 202,
                "isinfluential": False,
                "intents": None,
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

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        await run_release_ingest(
            StartReleaseRequest(
                source_code="s2",
                release_tag=release_tag,
                requested_by="tester",
                family_allowlist=("publication_venues", "papers", "abstracts", "citations"),
            ),
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        assert await admin_connection.fetchval(
            """
            SELECT count(*)
            FROM solemd.venues
            WHERE normalized_name = 'journal of obstetrics and gynaecology research'
            """
        ) == 1
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
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.authors") == 0
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.s2_authors_raw") == 1
        citation_metrics = await admin_connection.fetchrow(
            """
            SELECT
                reference_out_count,
                influential_reference_count,
                linked_reference_count,
                orphan_reference_count
            FROM solemd.s2_paper_reference_metrics_raw
            WHERE source_release_id = $1
              AND citing_paper_id = '101'
            """,
            release_row["source_release_id"],
        )
        assert citation_metrics is not None
        assert citation_metrics["reference_out_count"] == 1
        assert citation_metrics["influential_reference_count"] == 1
        assert citation_metrics["linked_reference_count"] == 1
        assert citation_metrics["orphan_reference_count"] == 0
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_force_new_run_rejects_unfinished_run(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-01-18"
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

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        first_run_id = await run_release_ingest(
            StartReleaseRequest(
                source_code="s2",
                release_tag=release_tag,
                requested_by="tester",
                family_allowlist=("citations",),
            ),
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        await admin_connection.execute(
            """
            UPDATE solemd.ingest_runs
            SET status = 2,
                completed_at = NULL
            WHERE ingest_run_id = $1
            """,
            first_run_id,
        )
    finally:
        await admin_connection.close()

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        with pytest.raises(IngestAlreadyInProgress):
            await run_release_ingest(
                StartReleaseRequest(
                    source_code="s2",
                    release_tag=release_tag,
                    requested_by="tester",
                    family_allowlist=("citations",),
                    force_new_run=True,
                ),
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
    finally:
        await pools.close()


@pytest.mark.asyncio
async def test_open_or_resume_run_reopens_terminal_row_for_resume(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
) -> None:
    release_tag = "2026-05-01"
    request = StartReleaseRequest(
        source_code="s2",
        release_tag=release_tag,
        requested_by="tester",
    )
    plan = IngestPlan(
        source_code="s2",
        release_tag=release_tag,
        release_dir=tmp_path,
        manifest_uri=f"{tmp_path}/manifests",
        release_checksum="checksum-v1",
        families=(),
    )
    plan_payload = plan.model_dump(mode="json")

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        await init_connection(admin_connection)
        source_release_id = await admin_connection.fetchval(
            """
            INSERT INTO solemd.source_releases (
                source_published_at,
                manifest_checksum,
                manifest_uri,
                source_name,
                source_release_key,
                release_status
            )
            VALUES (NULL, $1, $2, 's2', $3, 'ingesting')
            RETURNING source_release_id
            """,
            plan.release_checksum,
            plan.manifest_uri,
            release_tag,
        )
        ingest_run_id = await admin_connection.fetchval(
            """
            INSERT INTO solemd.ingest_runs (
                advisory_lock_key,
                source_release_id,
                status,
                requested_status,
                manifest_uri,
                error_message,
                completed_at,
                plan_manifest,
                phase_started_at
            )
            VALUES ($1, $2, 7, 2, $3, 'previous abort', now(), $4, $5)
            RETURNING ingest_run_id
            """,
            111,
            source_release_id,
            "/stale/manifest",
            plan_payload,
            {"started": "2026-05-01T00:00:00+00:00"},
        )

        resumed = await _open_or_resume_run(
            admin_connection,
            request=request,
            plan=plan,
            source_release_id=source_release_id,
            lock_key=222,
        )

        row = await admin_connection.fetchrow(
            """
            SELECT
                advisory_lock_key,
                status,
                requested_status,
                manifest_uri,
                error_message,
                completed_at
            FROM solemd.ingest_runs
            WHERE ingest_run_id = $1
            """,
            ingest_run_id,
        )
    finally:
        await admin_connection.close()

    assert resumed.ingest_run_id == ingest_run_id
    assert resumed.status == 7
    assert row is not None
    assert row["advisory_lock_key"] == 222
    assert row["status"] == 7
    assert row["requested_status"] is None
    assert row["manifest_uri"] == plan.manifest_uri
    assert row["error_message"] is None
    assert row["completed_at"] is None


@pytest.mark.asyncio
async def test_open_or_resume_run_ignores_deferred_family_drift(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
) -> None:
    release_tag = "2026-05-02"
    request = StartReleaseRequest(
        source_code="s2",
        release_tag=release_tag,
        requested_by="tester",
    )
    stored_plan = IngestPlan(
        source_code="s2",
        release_tag=release_tag,
        release_dir=tmp_path,
        manifest_uri=f"{tmp_path}/manifests",
        release_checksum="checksum-v1",
        families=(),
        deferred_families=(),
    )
    resumed_plan = IngestPlan(
        source_code="s2",
        release_tag=release_tag,
        release_dir=tmp_path,
        manifest_uri=f"{tmp_path}/manifests",
        release_checksum="checksum-v1",
        families=(),
        deferred_families=("tldrs", "embeddings_specter_v2", "s2orc_v2"),
    )

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        await init_connection(admin_connection)
        source_release_id = await admin_connection.fetchval(
            """
            INSERT INTO solemd.source_releases (
                source_published_at,
                manifest_checksum,
                manifest_uri,
                source_name,
                source_release_key,
                release_status
            )
            VALUES (NULL, $1, $2, 's2', $3, 'ingesting')
            RETURNING source_release_id
            """,
            stored_plan.release_checksum,
            stored_plan.manifest_uri,
            release_tag,
        )
        ingest_run_id = await admin_connection.fetchval(
            """
            INSERT INTO solemd.ingest_runs (
                advisory_lock_key,
                source_release_id,
                status,
                manifest_uri,
                plan_manifest,
                phase_started_at
            )
            VALUES ($1, $2, 2, $3, $4, $5)
            RETURNING ingest_run_id
            """,
            111,
            source_release_id,
            stored_plan.manifest_uri,
            stored_plan.model_dump(mode="json"),
            {"started": "2026-05-02T00:00:00+00:00"},
        )

        resumed = await _open_or_resume_run(
            admin_connection,
            request=request,
            plan=resumed_plan,
            source_release_id=source_release_id,
            lock_key=222,
        )

        row = await admin_connection.fetchrow(
            """
            SELECT advisory_lock_key, plan_manifest
            FROM solemd.ingest_runs
            WHERE ingest_run_id = $1
            """,
            ingest_run_id,
        )
    finally:
        await admin_connection.close()

    assert resumed.ingest_run_id == ingest_run_id
    assert row is not None
    assert row["advisory_lock_key"] == 222
    assert row["plan_manifest"]["deferred_families"] == [
        "tldrs",
        "embeddings_specter_v2",
        "s2orc_v2",
    ]


@pytest.mark.asyncio
async def test_open_or_resume_run_ignores_loaded_family_plan_drift(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
) -> None:
    release_tag = "2026-05-03"
    request = StartReleaseRequest(
        source_code="s2",
        release_tag=release_tag,
        requested_by="tester",
    )
    authors_family = FamilyPlan(
        family="authors",
        source_datasets=("authors",),
        target_tables=("solemd.s2_authors_raw",),
        files=(
            FilePlan(
                dataset="authors",
                path=tmp_path / "authors-0000.jsonl.gz",
                byte_count=10,
                content_kind="jsonl_gz",
            ),
        ),
    )
    citations_family = FamilyPlan(
        family="citations",
        source_datasets=("citations",),
        target_tables=("solemd.s2_paper_reference_metrics_raw",),
        files=(
            FilePlan(
                dataset="citations",
                path=tmp_path / "citations-0000.jsonl.gz",
                byte_count=20,
                content_kind="jsonl_gz",
            ),
        ),
    )
    stored_plan = IngestPlan(
        source_code="s2",
        release_tag=release_tag,
        release_dir=tmp_path / "old-root",
        manifest_uri=f"{tmp_path}/old-root/manifests",
        release_checksum="checksum-v1",
        families=(authors_family, citations_family),
    )
    resumed_plan = IngestPlan(
        source_code="s2",
        release_tag=release_tag,
        release_dir=tmp_path / "new-root",
        manifest_uri=f"{tmp_path}/new-root/manifests",
        release_checksum="checksum-v1",
        families=(citations_family,),
        deferred_families=("authors", "tldrs", "embeddings_specter_v2", "s2orc_v2"),
    )

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        await init_connection(admin_connection)
        source_release_id = await admin_connection.fetchval(
            """
            INSERT INTO solemd.source_releases (
                source_published_at,
                manifest_checksum,
                manifest_uri,
                source_name,
                source_release_key,
                release_status
            )
            VALUES (NULL, $1, $2, 's2', $3, 'ingesting')
            RETURNING source_release_id
            """,
            stored_plan.release_checksum,
            stored_plan.manifest_uri,
            release_tag,
        )
        ingest_run_id = await admin_connection.fetchval(
            """
            INSERT INTO solemd.ingest_runs (
                advisory_lock_key,
                source_release_id,
                status,
                families_loaded,
                last_loaded_family,
                manifest_uri,
                plan_manifest,
                phase_started_at
            )
            VALUES ($1, $2, 2, $3, 'authors', $4, $5, $6)
            RETURNING ingest_run_id
            """,
            111,
            source_release_id,
            ["authors"],
            stored_plan.manifest_uri,
            stored_plan.model_dump(mode="json"),
            {"started": "2026-05-03T00:00:00+00:00"},
        )

        resumed = await _open_or_resume_run(
            admin_connection,
            request=request,
            plan=resumed_plan,
            source_release_id=source_release_id,
            lock_key=222,
        )
    finally:
        await admin_connection.close()

    assert resumed.ingest_run_id == ingest_run_id
    assert resumed.families_loaded == ("authors",)


@pytest.mark.asyncio
async def test_open_or_resume_run_honors_pending_operator_abort(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
) -> None:
    release_tag = "2026-05-04"
    request = StartReleaseRequest(
        source_code="pt3",
        release_tag=release_tag,
        requested_by="tester",
    )
    plan = IngestPlan(
        source_code="pt3",
        release_tag=release_tag,
        release_dir=tmp_path,
        manifest_uri=f"{tmp_path}/manifests",
        release_checksum="checksum-v1",
        families=(),
    )

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        await init_connection(admin_connection)
        source_release_id = await admin_connection.fetchval(
            """
            INSERT INTO solemd.source_releases (
                source_published_at,
                manifest_checksum,
                manifest_uri,
                source_name,
                source_release_key,
                release_status
            )
            VALUES (NULL, $1, $2, 'pt3', $3, 'ingesting')
            RETURNING source_release_id
            """,
            plan.release_checksum,
            plan.manifest_uri,
            release_tag,
        )
        ingest_run_id = await admin_connection.fetchval(
            """
            INSERT INTO solemd.ingest_runs (
                advisory_lock_key,
                source_release_id,
                status,
                requested_status,
                manifest_uri,
                plan_manifest,
                phase_started_at
            )
            VALUES ($1, $2, 2, 2, $3, $4, $5)
            RETURNING ingest_run_id
            """,
            111,
            source_release_id,
            plan.manifest_uri,
            plan.model_dump(mode="json"),
            {"started": "2026-05-04T00:00:00+00:00"},
        )

        with pytest.raises(IngestAborted):
            await _open_or_resume_run(
                admin_connection,
                request=request,
                plan=plan,
                source_release_id=source_release_id,
                lock_key=222,
            )

        row = await admin_connection.fetchrow(
            """
            SELECT status, requested_status, completed_at, error_message
            FROM solemd.ingest_runs
            WHERE ingest_run_id = $1
            """,
            ingest_run_id,
        )
    finally:
        await admin_connection.close()

    assert row is not None
    assert row["status"] == INGEST_STATUS_ABORTED
    assert row["requested_status"] is None
    assert row["completed_at"] is not None
    assert "abort" in row["error_message"].lower()


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
        metric_rows = await admin_connection.fetch(
            """
            SELECT
                citing_paper_id,
                reference_out_count,
                influential_reference_count,
                linked_reference_count,
                orphan_reference_count
            FROM solemd.s2_paper_reference_metrics_raw
            ORDER BY citing_paper_id
            """
        )
        assert [tuple(row.values()) for row in metric_rows] == [
            ("101", 1, 0, 1, 0),
            ("303", 1, 1, 0, 1),
        ]
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM solemd.s2_paper_reference_metrics_stage WHERE ingest_run_id = $1",
            first_run_id,
        ) == 0
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
        metric_rows = await admin_connection.fetch(
            """
            SELECT
                citing_paper_id,
                reference_out_count,
                influential_reference_count,
                linked_reference_count,
                orphan_reference_count
            FROM solemd.s2_paper_reference_metrics_raw
            ORDER BY citing_paper_id
            """
        )
        assert [tuple(row.values()) for row in metric_rows] == [
            ("101", 1, 0, 1, 0),
            ("303", 1, 1, 0, 1),
        ]
        assert await admin_connection.fetchval(
            "SELECT status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
            first_run_id,
        ) == 5
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_s2_citations_stage_merges_overlapping_file_batches(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-01-02"
    s2_root = tmp_path / "semantic-scholar"
    release_dir = s2_root / "releases" / release_tag
    citations_dir = release_dir / "citations"
    citations_path_0 = citations_dir / "citations-0000.jsonl.gz"
    citations_path_1 = citations_dir / "citations-0001.jsonl.gz"
    write_jsonl_gz(
        citations_path_0,
        [
            {
                "citationid": 1,
                "citingcorpusid": 101,
                "citedcorpusid": 201,
                "isinfluential": True,
                "intents": None,
            },
            {
                "citationid": 2,
                "citingcorpusid": 202,
                "citedcorpusid": None,
                "isinfluential": False,
                "intents": None,
            },
            {
                "citationid": 3,
                "citingcorpusid": 101,
                "citedcorpusid": 203,
                "isinfluential": False,
                "intents": ["background"],
            },
        ],
    )
    write_jsonl_gz(
        citations_path_1,
        [
            {
                "citationid": 4,
                "citingcorpusid": 101,
                "citedcorpusid": None,
                "isinfluential": True,
                "intents": None,
            },
            {
                "citationid": 5,
                "citingcorpusid": 303,
                "citedcorpusid": 404,
                "isinfluential": False,
                "intents": None,
            },
            {
                "citationid": 6,
                "citingcorpusid": 202,
                "citedcorpusid": 205,
                "isinfluential": True,
                "intents": ["methodology"],
            },
        ],
    )
    write_manifest(
        release_dir / "manifests" / "citations.manifest.json",
        dataset="citations",
        release_tag=release_tag,
        output_dir=citations_dir,
        file_names=[citations_path_0.name, citations_path_1.name],
    )

    runtime_settings = runtime_settings_factory(
        semantic_scholar_dir=s2_root,
        ingest_dsn=warehouse_dsns["ingest"],
    ).model_copy(update={"ingest_copy_batch_rows": 1, "ingest_max_concurrent_files": 2})
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
        metric_rows = await admin_connection.fetch(
            """
            SELECT
                citing_paper_id,
                reference_out_count,
                influential_reference_count,
                linked_reference_count,
                orphan_reference_count
            FROM solemd.s2_paper_reference_metrics_raw
            ORDER BY citing_paper_id
            """
        )
        assert [tuple(row.values()) for row in metric_rows] == [
            ("101", 3, 2, 2, 1),
            ("202", 2, 1, 1, 1),
            ("303", 1, 0, 1, 0),
        ]
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM solemd.s2_paper_reference_metrics_stage WHERE ingest_run_id = $1",
            ingest_run_id,
        ) == 0
        assert await admin_connection.fetchval(
            "SELECT status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
            ingest_run_id,
        ) == 5
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_s2_citations_failed_stage_does_not_replace_final_metrics(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-01-03"
    s2_root = tmp_path / "semantic-scholar"
    release_dir = s2_root / "releases" / release_tag
    citations_dir = release_dir / "citations"
    citations_path = citations_dir / "citations-0000.jsonl.gz"
    broken_citations_path = citations_dir / "citations-0001.jsonl.gz"
    write_jsonl_gz(
        citations_path,
        [
            {
                "citationid": 1,
                "citingcorpusid": 101,
                "citedcorpusid": 202,
                "isinfluential": False,
                "intents": None,
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
        first_run_id = await run_release_ingest(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    write_jsonl_gz(
        broken_citations_path,
        [
            {
                "citationid": 2,
                "citingcorpusid": 101,
                "isinfluential": True,
                "intents": None,
            }
        ],
    )
    write_manifest(
        release_dir / "manifests" / "citations.manifest.json",
        dataset="citations",
        release_tag=release_tag,
        output_dir=citations_dir,
        file_names=[citations_path.name, broken_citations_path.name],
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        with pytest.raises(ExceptionGroup):
            await run_release_ingest(
                StartReleaseRequest(
                    source_code="s2",
                    release_tag=release_tag,
                    requested_by="tester",
                    family_allowlist=("citations",),
                    force_new_run=True,
                ),
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        metric_rows = await admin_connection.fetch(
            """
            SELECT
                citing_paper_id,
                reference_out_count,
                influential_reference_count,
                linked_reference_count,
                orphan_reference_count,
                last_seen_run_id
            FROM solemd.s2_paper_reference_metrics_raw
            ORDER BY citing_paper_id
            """
        )
        assert [
            (
                row["citing_paper_id"],
                row["reference_out_count"],
                row["influential_reference_count"],
                row["linked_reference_count"],
                row["orphan_reference_count"],
                str(row["last_seen_run_id"]),
            )
            for row in metric_rows
        ] == [("101", 1, 0, 1, 0, first_run_id)]
        failed_run_id = await admin_connection.fetchval(
            """
            SELECT ingest_run_id
            FROM solemd.ingest_runs
            WHERE ingest_run_id <> $1
              AND status = 6
            ORDER BY started_at DESC
            LIMIT 1
            """,
            first_run_id,
        )
        assert failed_run_id is not None
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM solemd.s2_paper_reference_metrics_stage WHERE ingest_run_id = $1",
            failed_run_id,
        ) == 0
    finally:
        await admin_connection.close()


def test_s2_default_plan_defers_opt_in_families(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-01-17"
    s2_root = tmp_path / "semantic-scholar"
    release_dir = s2_root / "releases" / release_tag
    publication_venues_dir = release_dir / "publication-venues"
    papers_dir = release_dir / "papers"
    abstracts_dir = release_dir / "abstracts"
    citations_dir = release_dir / "citations"

    venues_path = publication_venues_dir / "publication-venues-0000.jsonl.gz"
    papers_path = papers_dir / "papers-0000.jsonl.gz"
    abstracts_path = abstracts_dir / "abstracts-0000.jsonl.gz"
    citations_path = citations_dir / "citations-0000.jsonl.gz"

    write_jsonl_gz(
        venues_path,
        [{"id": "venue-1", "issn": "1234-5678", "name": "Journal of Warehouse Tests"}],
    )
    write_jsonl_gz(
        papers_path,
        [
            {
                "corpusid": 101,
                "title": "Release-safe ingest worker lane",
                "venue": "Journal of Warehouse Tests",
                "year": 2026,
                "publicationdate": "2026-01-17",
                "isopenaccess": True,
                "publicationvenueid": "venue-1",
                "externalids": {"PubMed": "12345"},
                "authors": [{"authorId": "author-1", "name": "Ada Ingest"}],
            }
        ],
    )
    write_jsonl_gz(
        abstracts_path,
        [{"corpusid": 101, "abstract": "This release proves the first warehouse ingest lane."}],
    )
    write_jsonl_gz(
        citations_path,
        [
            {
                "citationid": 1,
                "citingcorpusid": 101,
                "citedcorpusid": 202,
                "isinfluential": False,
                "intents": None,
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
    plan = semantic_scholar.build_plan(
        runtime_settings,
        StartReleaseRequest(
            source_code="s2",
            release_tag=release_tag,
            requested_by="tester",
        ),
    )

    assert "authors" not in plan.family_names
    assert "authors" in plan.deferred_families
    assert "tldrs" in plan.deferred_families
    assert "embeddings_specter_v2" in plan.deferred_families
    assert "s2orc_v2" in plan.deferred_families


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


@pytest.mark.asyncio
async def test_pubtator_biocxml_duplicate_stage_keys_merge_cleanly_across_shards(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-02-04"
    pt_root = tmp_path / "pubtator"
    release_dir = pt_root / "releases" / release_tag
    biocxml_dir = release_dir / "biocxml"
    shard_zero = biocxml_dir / "BioCXML.0.tar.gz"
    shard_one = biocxml_dir / "BioCXML.1.tar.gz"

    duplicate_document = """
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
      <relation id="R1">
        <infon key="type">Association</infon>
        <infon key="role1">Chemical|MESH:D000001</infon>
        <infon key="role2">Disease|MESH:D000002</infon>
      </relation>
    </passage>
  </document>
</collection>
""".strip()

    write_tar_gz(shard_zero, members={"duplicate-0.BioC.XML": duplicate_document})
    write_tar_gz(shard_one, members={"duplicate-1.BioC.XML": duplicate_document})
    write_manifest(
        release_dir / "manifests" / "biocxml.manifest.json",
        dataset="biocxml",
        release_tag=release_tag,
        output_dir=biocxml_dir,
        file_names=[shard_zero.name, shard_one.name],
    )

    runtime_settings = runtime_settings_factory(
        pubtator_dir=pt_root,
        ingest_dsn=warehouse_dsns["ingest"],
    )
    request = StartReleaseRequest(
        source_code="pt3",
        release_tag=release_tag,
        requested_by="tester",
        family_allowlist=("biocxml",),
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
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.entity_annotations_stage"
        ) == 2
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.relations_stage"
        ) == 1
        assert await admin_connection.fetchval(
            "SELECT status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
            ingest_run_id,
        ) == 5
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_pubtator_biocxml_duplicate_annotations_within_document_are_deduped(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-02-05"
    pt_root = tmp_path / "pubtator"
    release_dir = pt_root / "releases" / release_tag
    biocxml_dir = release_dir / "biocxml"
    biocxml_path = biocxml_dir / "BioCXML.0.tar.gz"

    write_tar_gz(
        biocxml_path,
        members={
            "duplicate.BioC.XML": """
<collection>
  <document>
    <id>12345</id>
    <passage>
      <offset>0</offset>
      <text>Aspirin aspirin.</text>
      <annotation id="A1">
        <infon key="type">Chemical</infon>
        <infon key="identifier">Chemical|MESH:D000001</infon>
        <location offset="0" length="7" />
        <text>Aspirin</text>
      </annotation>
      <annotation id="A1-duplicate">
        <infon key="type">Chemical</infon>
        <infon key="identifier">Chemical|MESH:D000001</infon>
        <location offset="0" length="7" />
        <text>Aspirin</text>
      </annotation>
    </passage>
  </document>
</collection>
""".strip()
        },
    )
    write_manifest(
        release_dir / "manifests" / "biocxml.manifest.json",
        dataset="biocxml",
        release_tag=release_tag,
        output_dir=biocxml_dir,
        file_names=[biocxml_path.name],
    )

    runtime_settings = runtime_settings_factory(
        pubtator_dir=pt_root,
        ingest_dsn=warehouse_dsns["ingest"],
    )
    request = StartReleaseRequest(
        source_code="pt3",
        release_tag=release_tag,
        requested_by="tester",
        family_allowlist=("biocxml",),
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
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.entity_annotations_stage"
        ) == 1
        assert await admin_connection.fetchval(
            "SELECT status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
            ingest_run_id,
        ) == 5
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_pubtator_bioconcepts_cross_type_identifiers_remain_distinct_in_stage(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-02-06"
    pt_root = tmp_path / "pubtator"
    release_dir = pt_root / "releases" / release_tag
    bioconcepts_path = release_dir / "bioconcepts2pubtator3.gz"

    write_tsv_gz(
        bioconcepts_path,
        [
            "41457071\tGene\t3906\talpha-lactalbumin\tPubTator3",
            "41457071\tSpecies\t3906\tFaba bean|faba beans|Vicia faba L.|faba bean\tPubTator3",
        ],
    )
    write_manifest(
        release_dir / "manifests" / "bioconcepts2pubtator3.gz.manifest.json",
        dataset="bioconcepts2pubtator3.gz",
        release_tag=release_tag,
        output_dir=release_dir,
        file_names=[bioconcepts_path.name],
    )

    runtime_settings = runtime_settings_factory(
        pubtator_dir=pt_root,
        ingest_dsn=warehouse_dsns["ingest"],
    )
    request = StartReleaseRequest(
        source_code="pt3",
        release_tag=release_tag,
        requested_by="tester",
        family_allowlist=("bioconcepts",),
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
        rows = await admin_connection.fetch(
            """
            SELECT pmid, entity_type, concept_id_raw, start_offset, end_offset
            FROM pubtator.entity_annotations_stage
            ORDER BY entity_type
            """
        )
        assert [(row["pmid"], row["entity_type"], row["concept_id_raw"]) for row in rows] == [
            (41457071, 1, "3906"),
            (41457071, 4, "3906"),
        ]
        assert all((row["start_offset"], row["end_offset"]) == (0, 0) for row in rows)
        assert await admin_connection.fetchval(
            "SELECT status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
            ingest_run_id,
        ) == 5
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_pubtator_relations_duplicate_rows_merge_cleanly(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-02-07"
    pt_root = tmp_path / "pubtator"
    release_dir = pt_root / "releases" / release_tag
    relations_path = release_dir / "relation2pubtator3.gz"

    write_tsv_gz(
        relations_path,
        [
            "12345\tassociate\tChemical|MESH:D000001\tDisease|MESH:D000002",
            "12345\tassociate\tChemical|MESH:D000001\tDisease|MESH:D000002",
        ],
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
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM pubtator.relations_stage"
        ) == 1
        assert await admin_connection.fetchval(
            "SELECT status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
            ingest_run_id,
        ) == 5
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_writer_failure_releases_lock_and_records_family_failure(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
    monkeypatch,
) -> None:
    release_tag = "2026-04-21"
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

    async def exploding_load_family(*args, **kwargs):
        raise RuntimeError("synthetic writer failure")

    from app.ingest.runtime import SOURCE_WRITERS
    from app.ingest.runtime import SourceWriter

    monkeypatch.setitem(
        SOURCE_WRITERS,
        "s2",
        SourceWriter(load_family=exploding_load_family),
    )

    before_failure = metric_sample_value(
        "ingest_failures_total",
        {
            "source_code": "s2",
            "phase": "loading",
            "family": "citations",
            "failure_class": "RuntimeError",
        },
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        with pytest.raises(RuntimeError, match="synthetic writer failure"):
            await run_release_ingest(
                StartReleaseRequest(
                    source_code="s2",
                    release_tag=release_tag,
                    requested_by="tester",
                    family_allowlist=("citations",),
                ),
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )

        lock_key_probe_pool = pools.get("ingest_write")
        async with lock_key_probe_pool.acquire() as connection:
            lock_key = await connection.fetchval(
                "SELECT hashtextextended($1, 0)::bigint",
                f"ingest:s2:{release_tag}",
            )
            acquired = await connection.fetchval(
                "SELECT pg_try_advisory_lock($1)", lock_key
            )
            try:
                assert acquired, "advisory lock was not released after writer failure"
            finally:
                if acquired:
                    await connection.execute(
                        "SELECT pg_advisory_unlock($1)", lock_key
                    )
    finally:
        await pools.close()

    after_failure = metric_sample_value(
        "ingest_failures_total",
        {
            "source_code": "s2",
            "phase": "loading",
            "family": "citations",
            "failure_class": "RuntimeError",
        },
    )
    assert after_failure == before_failure + 1, (
        "ingest_failures_total should carry the family label on writer failure"
    )

    for family in text_string_to_metric_families(collect_metrics_text()):
        if family.name != "worker_active_run_info":
            continue
        for sample in family.samples:
            run_label = sample.labels.get("run_label", "")
            assert not any(
                part.count("-") >= 4 and len(part) >= 32
                for part in run_label.split(":")
            ), (
                f"worker_active_run_info.run_label leaked a UUID-shaped "
                f"segment: {run_label!r}"
            )


def test_stream_biocxml_skips_members_with_null_bytes(tmp_path: Path) -> None:
    import gzip
    import io
    import tarfile

    from app.ingest.sources.pubtator import _stream_biocxml

    good_member = (
        "<collection>\n"
        "  <document>\n"
        "    <id>12345</id>\n"
        "    <passage>\n"
        "      <offset>0</offset>\n"
        "      <text>Aspirin relieved headache.</text>\n"
        '      <annotation id="A1">\n'
        '        <infon key="type">Chemical</infon>\n'
        '        <infon key="identifier">Chemical|MESH:D000001</infon>\n'
        '        <location offset="0" length="7" />\n'
        "        <text>Aspirin</text>\n"
        "      </annotation>\n"
        "    </passage>\n"
        "  </document>\n"
        "</collection>\n"
    ).encode("utf-8")
    bad_member = (
        b"<collection><document><id>999</id><passage>"
        b"<offset>0</offset><text>Corrupt\x00record</text>"
        b"</passage></document></collection>"
    )

    path = tmp_path / "BioCXML.null.tar.gz"
    with path.open("wb") as handle:
        with gzip.GzipFile(fileobj=handle, mode="wb") as gz:
            with tarfile.open(fileobj=gz, mode="w|") as archive:
                for name, data in (("good.BioC.XML", good_member), ("bad.BioC.XML", bad_member)):
                    info = tarfile.TarInfo(name=name)
                    info.size = len(data)
                    archive.addfile(info, io.BytesIO(data))

    rows = list(_stream_biocxml(path, max_records=None))

    # good member yields one entity row; bad member is skipped, not fatal.
    assert len(rows) == 1, (
        f"expected exactly one entity row from the good member; got {len(rows)}"
    )
    assert rows[0]["pmid"] == 12345
    assert rows[0]["row_kind"] == "entity"


@pytest.mark.asyncio
async def test_cancellation_marks_run_aborted_and_releases_lock(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
    monkeypatch,
) -> None:
    release_tag = "2026-04-22"
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

    async def cancelling_load_family(*args, **kwargs):
        raise asyncio.CancelledError()

    from app.ingest.runtime import SOURCE_WRITERS, SourceWriter

    monkeypatch.setitem(
        SOURCE_WRITERS,
        "s2",
        SourceWriter(load_family=cancelling_load_family),
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        with pytest.raises(asyncio.CancelledError):
            await run_release_ingest(
                StartReleaseRequest(
                    source_code="s2",
                    release_tag=release_tag,
                    requested_by="tester",
                    family_allowlist=("citations",),
                ),
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )

        ingest_pool = pools.get("ingest_write")
        async with ingest_pool.acquire() as connection:
            row = await connection.fetchrow(
                """
                SELECT ir.status, ir.completed_at, ir.error_message
                FROM solemd.ingest_runs ir
                JOIN solemd.source_releases sr USING (source_release_id)
                WHERE sr.source_name = 's2'
                  AND sr.source_release_key = $1
                ORDER BY ir.started_at DESC
                LIMIT 1
                """,
                release_tag,
            )
            assert row is not None, "expected ingest_run row for cancelled run"
            assert row["status"] == INGEST_STATUS_ABORTED, (
                f"cancelled run should be marked ABORTED; got status={row['status']}"
            )
            assert row["completed_at"] is not None, (
                "cancelled run must set completed_at (not stranded)"
            )
            assert row["error_message"], (
                "cancelled run must set error_message (not stranded empty)"
            )
            assert "cancel" in row["error_message"].lower(), (
                f"error_message should mention cancellation, got: {row['error_message']!r}"
            )

            lock_key = await connection.fetchval(
                "SELECT hashtextextended($1, 0)::bigint",
                f"ingest:s2:{release_tag}",
            )
            acquired = await connection.fetchval(
                "SELECT pg_try_advisory_lock($1)", lock_key
            )
            try:
                assert acquired, (
                    "advisory lock must be released after cancellation"
                )
            finally:
                if acquired:
                    await connection.execute(
                        "SELECT pg_advisory_unlock($1)", lock_key
                    )
    finally:
        await pools.close()


@pytest.mark.asyncio
async def test_operator_abort_during_family_load_aborts_before_family_commit(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
    monkeypatch,
) -> None:
    release_tag = "2026-04-23"
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
    ).model_copy(
        update={
            "ingest_abort_poll_interval_seconds": 0.05,
        }
    )

    async def slow_load_family(
        _pool,
        _settings,
        _request,
        plan,
        family_name,
        _source_release_id,
        _ingest_run_id,
        on_file_completed=None,
        on_rows_written=None,
        on_input_progress=None,
        on_batch_processed=None,
    ):
        file_paths = [file_plan.path for file_plan in next(item for item in plan.families if item.family == family_name).files]

        async def worker(file_path: Path) -> None:
            while True:
                if on_input_progress is not None:
                    on_input_progress(file_path, 1)
                if on_batch_processed is not None:
                    await on_batch_processed(file_path, 0)
                await asyncio.sleep(0.01)

        await asyncio.gather(*(worker(path) for path in file_paths))
        if on_file_completed is not None:
            for path in file_paths:
                on_file_completed(path, 0)
        if on_rows_written is not None:
            for path in file_paths:
                on_rows_written(path, 0)
        return CopyStats(family=family_name, row_count=0, file_count=len(file_paths))

    from app.ingest.runtime import SOURCE_WRITERS, SourceWriter

    monkeypatch.setitem(
        SOURCE_WRITERS,
        "s2",
        SourceWriter(load_family=slow_load_family),
    )

    async def request_abort() -> None:
        connection = await asyncpg.connect(warehouse_dsns["admin"])
        try:
            while True:
                row = await connection.fetchrow(
                    """
                    SELECT ir.ingest_run_id
                    FROM solemd.ingest_runs ir
                    JOIN solemd.source_releases sr USING (source_release_id)
                    WHERE sr.source_name = 's2'
                      AND sr.source_release_key = $1
                    ORDER BY ir.started_at DESC
                    LIMIT 1
                    """,
                    release_tag,
                )
                if row is not None:
                    await connection.execute(
                        """
                        UPDATE solemd.ingest_runs
                        SET requested_status = 2
                        WHERE ingest_run_id = $1
                        """,
                        row["ingest_run_id"],
                    )
                    return
                await asyncio.sleep(0.01)
        finally:
            await connection.close()

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    abort_task = asyncio.create_task(request_abort())
    try:
        with pytest.raises(IngestAborted):
            await run_release_ingest(
                StartReleaseRequest(
                    source_code="s2",
                    release_tag=release_tag,
                    requested_by="tester",
                    family_allowlist=("citations",),
                ),
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
        await abort_task

        async with pools.get("ingest_write").acquire() as connection:
            row = await connection.fetchrow(
                """
                SELECT ir.status, ir.completed_at, ir.error_message, ir.families_loaded
                FROM solemd.ingest_runs ir
                JOIN solemd.source_releases sr USING (source_release_id)
                WHERE sr.source_name = 's2'
                  AND sr.source_release_key = $1
                ORDER BY ir.started_at DESC
                LIMIT 1
                """,
                release_tag,
            )
            assert row is not None
            assert row["status"] == INGEST_STATUS_ABORTED
            assert row["completed_at"] is not None
            assert row["families_loaded"] == []
            assert "abort" in (row["error_message"] or "").lower()

            lock_key = await connection.fetchval(
                "SELECT hashtextextended($1, 0)::bigint",
                f"ingest:s2:{release_tag}",
            )
            assert await connection.fetchval(
                "SELECT pg_try_advisory_lock($1)",
                lock_key,
            )
            await connection.execute("SELECT pg_advisory_unlock($1)", lock_key)
    finally:
        abort_task.cancel()
        await asyncio.gather(abort_task, return_exceptions=True)
        await pools.close()
