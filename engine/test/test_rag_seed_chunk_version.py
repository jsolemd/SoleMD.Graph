from __future__ import annotations

from app.rag_ingest.chunk_seed import ChunkSeedResult
from db.scripts.seed_default_chunk_version import seed_default_chunk_version


def test_seed_default_chunk_version_reports_execution_state_from_runner():
    class FakeSeeder:
        def seed_default(
            self,
            *,
            source_revision_keys,
            parser_version,
            embedding_model=None,
            chunk_version_key=None,
        ):
            assert source_revision_keys == ["biocxml:2026-03-21", "s2orc_v2:2026-03-10"]
            assert parser_version == "parser-v1"
            assert embedding_model == "text-embedding-3-large"
            assert chunk_version_key is None
            return ChunkSeedResult(
                chunk_version_key="default-structural-v1",
                source_revision_keys=["biocxml:2026-03-21", "s2orc_v2:2026-03-10"],
                batch_total_rows=1,
                written_rows=1,
                deferred_stage_names=[],
            )

    report = seed_default_chunk_version(
        source_revision_keys=["biocxml:2026-03-21", "s2orc_v2:2026-03-10"],
        parser_version="parser-v1",
        embedding_model="text-embedding-3-large",
        runner=FakeSeeder(),
    )

    assert report.chunk_version_key == "default-structural-v1"
    assert report.batch_total_rows == 1
    assert report.written_rows == 1
    assert report.executed is True


def test_seed_default_chunk_version_reports_deferred_when_runtime_table_missing():
    class FakeSeeder:
        def seed_default(
            self,
            *,
            source_revision_keys,
            parser_version,
            embedding_model=None,
            chunk_version_key=None,
        ):
            return ChunkSeedResult(
                chunk_version_key="default-structural-v1",
                source_revision_keys=list(source_revision_keys),
                batch_total_rows=1,
                written_rows=0,
                deferred_stage_names=["chunk_versions"],
            )

    report = seed_default_chunk_version(
        source_revision_keys=["s2orc_v2:2026-03-10"],
        parser_version="parser-v1",
        runner=FakeSeeder(),
    )

    assert report.executed is False
    assert report.deferred_stage_names == ["chunk_versions"]


def test_seed_default_chunk_version_allows_preview_key_override():
    class FakeSeeder:
        def seed_default(
            self,
            *,
            source_revision_keys,
            parser_version,
            embedding_model=None,
            chunk_version_key=None,
        ):
            assert source_revision_keys == ["s2orc_v2:2026-03-10"]
            assert parser_version == "mixed:parser-v1,parser-v2"
            assert embedding_model is None
            assert chunk_version_key == "preview-stanza-hybrid-v1"
            return ChunkSeedResult(
                chunk_version_key=chunk_version_key,
                source_revision_keys=list(source_revision_keys),
                batch_total_rows=1,
                written_rows=1,
                deferred_stage_names=[],
            )

    report = seed_default_chunk_version(
        source_revision_keys=["s2orc_v2:2026-03-10"],
        parser_version="mixed:parser-v1,parser-v2",
        chunk_version_key="preview-stanza-hybrid-v1",
        runner=FakeSeeder(),
    )

    assert report.chunk_version_key == "preview-stanza-hybrid-v1"
