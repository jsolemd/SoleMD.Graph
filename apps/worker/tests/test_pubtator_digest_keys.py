from __future__ import annotations

from pathlib import Path

import asyncpg
import pytest

from app.db import open_pools
from app.ingest.models import StartReleaseRequest
from app.ingest.runtime import run_release_ingest
from helpers import write_manifest, write_tsv_gz


@pytest.mark.asyncio
async def test_pubtator_digest_keys_accept_long_source_identifiers(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    release_tag = "2026-02-08"
    pt_root = tmp_path / "pubtator"
    release_dir = pt_root / "releases" / release_tag
    bioconcepts_path = release_dir / "bioconcepts2pubtator3.gz"
    relations_path = release_dir / "relation2pubtator3.gz"

    long_concept_id = "MESH:" + ("D000001;" * 420)
    long_subject_id = "Chemical|" + ("MESH:D000001;" * 300)
    long_object_id = "Disease|" + ("MESH:D000002;" * 300)

    write_tsv_gz(
        bioconcepts_path,
        [
            f"12345\tChemical\t{long_concept_id}\tAspirin\tPubTator3",
            f"12345\tChemical\t{long_concept_id}\tAspirin alternate\tPubTator3",
        ],
    )
    write_tsv_gz(
        relations_path,
        [
            f"12345\tassociate\t{long_subject_id}\t{long_object_id}",
            f"12345\tassociate\t{long_subject_id}\t{long_object_id}",
        ],
    )
    write_manifest(
        release_dir / "manifests" / "bioconcepts2pubtator3.gz.manifest.json",
        dataset="bioconcepts2pubtator3.gz",
        release_tag=release_tag,
        output_dir=release_dir,
        file_names=[bioconcepts_path.name],
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
        family_allowlist=("bioconcepts", "relations"),
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
        entity_row = await admin_connection.fetchrow(
            """
            SELECT count(*) AS row_count, max(concept_id_raw) AS concept_id_raw
            FROM pubtator.entity_annotations_stage
            """
        )
        relation_row = await admin_connection.fetchrow(
            """
            SELECT
                count(*) AS row_count,
                max(subject_entity_id) AS subject_entity_id,
                max(object_entity_id) AS object_entity_id
            FROM pubtator.relations_stage
            """
        )
        assert entity_row is not None
        assert relation_row is not None
        assert entity_row["row_count"] == 1
        assert entity_row["concept_id_raw"] == long_concept_id
        assert relation_row["row_count"] == 1
        assert relation_row["subject_entity_id"] == long_subject_id
        assert relation_row["object_entity_id"] == long_object_id
        assert await admin_connection.fetchval(
            "SELECT status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
            ingest_run_id,
        ) == 5
    finally:
        await admin_connection.close()
