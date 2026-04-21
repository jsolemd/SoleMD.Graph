from __future__ import annotations

from uuid import UUID

import asyncpg
import pytest

from app.corpus.errors import CorpusWaveAlreadyPublished
from app.corpus.models import DispatchEvidenceWaveRequest, StartCorpusSelectionRequest
from app.corpus.runtime import dispatch_evidence_wave, run_corpus_selection
from app.db import open_pools
from app.ingest.models import StartReleaseRequest
from app.ingest.runtime import run_release_ingest
from corpus_test_support import (
    fetch_selection_run as _fetch_selection_run,
    fetch_selection_summary_rows as _fetch_selection_summary_rows,
    fetch_wave_members as _fetch_wave_members,
    latest_selection_run_id as _latest_selection_run_id,
    paper_ids_for_corpus_ids as _paper_ids_for_corpus_ids,
    seed_existing_paper_identity as _seed_existing_paper_identity,
    seed_selection_fixture as _seed_selection_fixture,
    seed_stale_release_scope_corpus_assignment as _seed_stale_release_scope_corpus_assignment,
    summary_count as _summary_count,
)
from corpus_release_support import (
    write_sample_pt3_release as _write_sample_pt3_release,
    write_sample_s2_release as _write_sample_s2_release,
)
from helpers import write_jsonl_gz, write_manifest
from telemetry_test_support import metric_sample_value


@pytest.mark.asyncio
async def test_corpus_selection_runtime_resumes_failed_run_deterministically(
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
    monkeypatch,
) -> None:
    runtime_settings = runtime_settings_factory(ingest_dsn=warehouse_dsns["ingest"])
    await _seed_selection_fixture(warehouse_dsns["admin"])

    failure_state = {"raised": False}
    original_refresh = __import__(
        "app.corpus.selection_runtime",
        fromlist=["provenance"],
    ).provenance.refresh_selection_summary

    async def fail_once(*args, **kwargs):
        if not failure_state["raised"]:
            failure_state["raised"] = True
            raise RuntimeError("summary failed once")
        return await original_refresh(*args, **kwargs)

    monkeypatch.setattr(
        "app.corpus.selection_runtime.provenance.refresh_selection_summary",
        fail_once,
    )

    request = StartCorpusSelectionRequest(
        s2_release_tag="s2-2026-04-01",
        pt3_release_tag="pt3-2026-04-01",
        selector_version="selector-v1",
        requested_by="tester",
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        with pytest.raises(RuntimeError, match="summary failed once"):
            await run_corpus_selection(
                request,
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
        failed_run_id = await _latest_selection_run_id(warehouse_dsns["admin"])
        failed_row = await _fetch_selection_run(warehouse_dsns["admin"], failed_run_id)
        assert failed_row["status"] == 8
        assert failed_row["phases_completed"] == [
            "assets",
            "corpus_admission",
            "mapped_promotion",
            "corpus_baseline_materialization",
            "mapped_surface_materialization",
        ]
        assert await _summary_count(warehouse_dsns["admin"], failed_run_id) == 0

        resumed_run_id = UUID(
            await run_corpus_selection(
                request,
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
        )
    finally:
        await pools.close()

    assert resumed_run_id == failed_run_id

    published_row = await _fetch_selection_run(warehouse_dsns["admin"], resumed_run_id)
    assert published_row["status"] == 7
    assert published_row["phases_completed"] == [
        "assets",
        "corpus_admission",
        "mapped_promotion",
        "corpus_baseline_materialization",
        "mapped_surface_materialization",
        "selection_summary",
    ]

    summary_rows = await _fetch_selection_summary_rows(warehouse_dsns["admin"], resumed_run_id)
    assert summary_rows == [
        ("S2-101", "mapped", "journal_and_vocab"),
        ("S2-102", "mapped", "pattern_match"),
        ("S2-103", "corpus", "vocab_entity_match"),
        ("S2-104", "retired", "selection_retired"),
        ("S2-105", "mapped", "vocab_entity_match"),
        ("S2-106", "mapped", "vocab_entity_match"),
        ("S2-107", "mapped", "vocab_entity_match"),
    ]

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.papers") == 6
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_text") == 6
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_authors") == 5
        assert await admin_connection.fetchval("SELECT count(*) FROM pubtator.entity_annotations") == 4
        assert await admin_connection.fetchval("SELECT count(*) FROM pubtator.relations") == 1
        assert await admin_connection.fetchval("SELECT count(*) FROM solemd.paper_citations") == 0
        assert [
            row["s2_paper_id"]
            for row in await admin_connection.fetch(
                """
                SELECT papers.s2_paper_id
                FROM solemd.papers papers
                ORDER BY papers.s2_paper_id
                """
            )
        ] == [
            "S2-101",
            "S2-102",
            "S2-103",
            "S2-105",
            "S2-106",
            "S2-107",
        ]
        assert [
            row["s2_paper_id"]
            for row in await admin_connection.fetch(
                """
                SELECT papers.s2_paper_id
                FROM solemd.paper_authors paper_authors
                JOIN solemd.papers papers
                  ON papers.corpus_id = paper_authors.corpus_id
                ORDER BY papers.s2_paper_id
                """
            )
        ] == [
            "S2-101",
            "S2-102",
            "S2-105",
            "S2-106",
            "S2-107",
        ]
        assert [
            row["s2_paper_id"]
            for row in await admin_connection.fetch(
                """
                SELECT papers.s2_paper_id
                FROM pubtator.entity_annotations annotations
                JOIN solemd.papers papers
                  ON papers.corpus_id = annotations.corpus_id
                ORDER BY papers.s2_paper_id
                """
            )
        ] == [
            "S2-101",
            "S2-105",
            "S2-106",
            "S2-107",
        ]
        assert [
            row["s2_paper_id"]
            for row in await admin_connection.fetch(
                """
                SELECT papers.s2_paper_id
                FROM pubtator.relations relations
                JOIN solemd.papers papers
                  ON papers.corpus_id = relations.corpus_id
                ORDER BY papers.s2_paper_id
                """
            )
        ] == ["S2-106"]
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_corpus_wave_dispatch_is_idempotent_and_targets_mapped_subset(
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
    monkeypatch,
) -> None:
    runtime_settings = runtime_settings_factory(ingest_dsn=warehouse_dsns["ingest"])
    await _seed_selection_fixture(warehouse_dsns["admin"])

    selection_request = StartCorpusSelectionRequest(
        s2_release_tag="s2-2026-04-01",
        pt3_release_tag="pt3-2026-04-01",
        selector_version="selector-v1",
        requested_by="selector",
    )
    sent: list[tuple[int, str | None]] = []
    configure_calls: list[tuple[object, tuple[str, ...] | None]] = []

    def fake_send_evidence_enqueue(*, corpus_id: int, requested_by: str | None) -> None:
        sent.append((corpus_id, requested_by))

    def fake_configure_broker(worker_settings=None, *, pool_names=None):
        configure_calls.append((worker_settings, pool_names))
        return None

    monkeypatch.setattr(
        "app.corpus.wave_runtime._send_evidence_enqueue",
        fake_send_evidence_enqueue,
    )
    monkeypatch.setattr(
        "app.corpus.wave_runtime.configure_broker",
        fake_configure_broker,
    )

    wave_request = DispatchEvidenceWaveRequest(
        s2_release_tag="s2-2026-04-01",
        pt3_release_tag="pt3-2026-04-01",
        selector_version="selector-v1",
        wave_policy_key="evidence_missing_pmc_bioc",
        requested_by="dispatcher",
        max_papers=1,
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        selection_run_id = UUID(
            await run_corpus_selection(
                selection_request,
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
        )
        wave_run_id = UUID(
            await dispatch_evidence_wave(
                wave_request,
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
        )
        with pytest.raises(CorpusWaveAlreadyPublished):
            await dispatch_evidence_wave(
                wave_request,
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
    finally:
        await pools.close()

    sent_paper_ids = await _paper_ids_for_corpus_ids(warehouse_dsns["admin"], [corpus_id for corpus_id, _ in sent])
    assert [(sent_paper_ids[corpus_id], requested_by) for corpus_id, requested_by in sent] == [
        ("S2-106", "dispatcher")
    ]
    assert configure_calls == [(runtime_settings, ("ingest_write",))]

    wave_members = await _fetch_wave_members(warehouse_dsns["admin"], wave_run_id)
    assert wave_members == [("S2-106", 1, True)]

    summary_rows = await _fetch_selection_summary_rows(warehouse_dsns["admin"], selection_run_id)
    assert ("S2-101", "mapped", "journal_and_vocab") in summary_rows
    assert ("S2-105", "mapped", "vocab_entity_match") in summary_rows
    assert ("S2-106", "mapped", "vocab_entity_match") in summary_rows


@pytest.mark.asyncio
async def test_end_to_end_ingest_selection_and_dispatch(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
    monkeypatch,
) -> None:
    s2_release_tag = "2026-05-01"
    pt3_release_tag = "2026-05-01"
    s2_root = tmp_path / "semantic-scholar"
    pt_root = tmp_path / "pubtator"
    await _write_sample_s2_release(s2_root, release_tag=s2_release_tag)
    await _write_sample_pt3_release(pt_root, release_tag=pt3_release_tag)

    runtime_settings = runtime_settings_factory(
        semantic_scholar_dir=s2_root,
        pubtator_dir=pt_root,
        ingest_dsn=warehouse_dsns["ingest"],
    )

    before_selection_runs = metric_sample_value(
        "corpus_selection_runs_total",
        {"selector_version": "selector-v1", "outcome": "published"},
    )
    before_summary_rows = metric_sample_value(
        "corpus_selection_summary_rows_total",
        {"selector_version": "selector-v1"},
    )
    before_wave_runs = metric_sample_value(
        "corpus_wave_runs_total",
        {
            "wave_policy_key": "evidence_missing_pmc_bioc",
            "selector_version": "selector-v1",
            "outcome": "published",
        },
    )
    before_wave_members = metric_sample_value(
        "corpus_wave_members_selected_total",
        {
            "wave_policy_key": "evidence_missing_pmc_bioc",
            "selector_version": "selector-v1",
        },
    )
    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        await run_release_ingest(
            StartReleaseRequest(
                source_code="s2",
                release_tag=s2_release_tag,
                requested_by="tester",
                family_allowlist=("publication_venues", "papers", "abstracts", "citations"),
            ),
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
        await run_release_ingest(
            StartReleaseRequest(
                source_code="pt3",
                release_tag=pt3_release_tag,
                requested_by="tester",
                family_allowlist=("bioconcepts",),
            ),
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )

        sent: list[int] = []
        configure_calls: list[tuple[object, tuple[str, ...] | None]] = []

        def fake_send_evidence_enqueue(*, corpus_id: int, requested_by: str | None) -> None:
            del requested_by
            sent.append(corpus_id)

        def fake_configure_broker(worker_settings=None, *, pool_names=None):
            configure_calls.append((worker_settings, pool_names))
            return None

        monkeypatch.setattr(
            "app.corpus.wave_runtime._send_evidence_enqueue",
            fake_send_evidence_enqueue,
        )
        monkeypatch.setattr(
            "app.corpus.wave_runtime.configure_broker",
            fake_configure_broker,
        )

        selection_run_id = UUID(
            await run_corpus_selection(
                StartCorpusSelectionRequest(
                    s2_release_tag=s2_release_tag,
                    pt3_release_tag=pt3_release_tag,
                    selector_version="selector-v1",
                    requested_by="tester",
                ),
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
        )
        wave_run_id = UUID(
            await dispatch_evidence_wave(
                DispatchEvidenceWaveRequest(
                    s2_release_tag=s2_release_tag,
                    pt3_release_tag=pt3_release_tag,
                    selector_version="selector-v1",
                    wave_policy_key="evidence_missing_pmc_bioc",
                    requested_by="tester",
                    max_papers=1,
                ),
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
        )
    finally:
        await pools.close()

    assert metric_sample_value(
        "corpus_selection_runs_total",
        {"selector_version": "selector-v1", "outcome": "published"},
    ) == before_selection_runs + 1
    assert metric_sample_value(
        "corpus_selection_summary_rows_total",
        {"selector_version": "selector-v1"},
    ) > before_summary_rows
    assert metric_sample_value(
        "corpus_pipeline_stage_papers",
        {
            "selector_version": "selector-v1",
            "s2_release_tag": s2_release_tag,
            "pt3_release_tag": pt3_release_tag,
            "stage": "raw",
        },
    ) == 2
    assert metric_sample_value(
        "corpus_pipeline_stage_papers",
        {
            "selector_version": "selector-v1",
            "s2_release_tag": s2_release_tag,
            "pt3_release_tag": pt3_release_tag,
            "stage": "corpus",
        },
    ) == 2
    assert metric_sample_value(
        "corpus_pipeline_stage_papers",
        {
            "selector_version": "selector-v1",
            "s2_release_tag": s2_release_tag,
            "pt3_release_tag": pt3_release_tag,
            "stage": "mapped",
        },
    ) == 2
    assert metric_sample_value(
        "corpus_wave_runs_total",
        {
            "wave_policy_key": "evidence_missing_pmc_bioc",
            "selector_version": "selector-v1",
            "outcome": "published",
        },
    ) == before_wave_runs + 1
    assert metric_sample_value(
        "corpus_wave_members_selected_total",
        {
            "wave_policy_key": "evidence_missing_pmc_bioc",
            "selector_version": "selector-v1",
        },
    ) > before_wave_members
    assert metric_sample_value(
        "corpus_evidence_policy_papers",
        {
            "wave_policy_key": "evidence_missing_pmc_bioc",
            "selector_version": "selector-v1",
            "s2_release_tag": s2_release_tag,
            "pt3_release_tag": pt3_release_tag,
            "stage": "evidence_cohort",
        },
    ) == 1
    assert metric_sample_value(
        "corpus_evidence_policy_papers",
        {
            "wave_policy_key": "evidence_missing_pmc_bioc",
            "selector_version": "selector-v1",
            "s2_release_tag": s2_release_tag,
            "pt3_release_tag": pt3_release_tag,
            "stage": "evidence_satisfied",
        },
    ) == 0
    assert metric_sample_value(
        "corpus_evidence_policy_papers",
        {
            "wave_policy_key": "evidence_missing_pmc_bioc",
            "selector_version": "selector-v1",
            "s2_release_tag": s2_release_tag,
            "pt3_release_tag": pt3_release_tag,
            "stage": "evidence_backlog",
        },
    ) == 1
    assert metric_sample_value(
        "corpus_evidence_policy_papers",
        {
            "wave_policy_key": "evidence_missing_pmc_bioc",
            "selector_version": "selector-v1",
            "s2_release_tag": s2_release_tag,
            "pt3_release_tag": pt3_release_tag,
            "stage": "evidence_selected",
        },
    ) == 1

    summary_rows = await _fetch_selection_summary_rows(warehouse_dsns["admin"], selection_run_id)
    assert summary_rows == [
        ("101", "mapped", "journal_and_vocab"),
        ("102", "mapped", "pattern_match"),
    ]
    wave_members = await _fetch_wave_members(warehouse_dsns["admin"], wave_run_id)
    assert wave_members == [("101", 1, True)]
    sent_paper_ids = await _paper_ids_for_corpus_ids(warehouse_dsns["admin"], sent)
    assert [sent_paper_ids[corpus_id] for corpus_id in sent] == ["101"]
    assert configure_calls == [(runtime_settings, ("ingest_write",))]

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        summary_metrics = await admin_connection.fetchrow(
            """
            SELECT summary.reference_out_count, summary.influential_reference_count
            FROM solemd.paper_selection_summary summary
            JOIN solemd.papers papers
              ON papers.corpus_id = summary.corpus_id
            WHERE summary.corpus_selection_run_id = $1
              AND papers.s2_paper_id = '101'
            """,
            selection_run_id,
        )
        assert summary_metrics is not None
        assert summary_metrics["reference_out_count"] == 1
        assert summary_metrics["influential_reference_count"] == 1
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_corpus_materialization_resolves_venue_by_normalized_name_fallback(
    tmp_path: Path,
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    s2_release_tag = "2026-05-02"
    pt3_release_tag = "2026-05-02"
    s2_root = tmp_path / "semantic-scholar"
    pt_root = tmp_path / "pubtator"
    release_dir = s2_root / "releases" / s2_release_tag

    publication_venues_dir = release_dir / "publication-venues"
    authors_dir = release_dir / "authors"
    papers_dir = release_dir / "papers"
    abstracts_dir = release_dir / "abstracts"
    citations_dir = release_dir / "citations"

    venues_path = publication_venues_dir / "publication-venues-0000.jsonl.gz"
    authors_path = authors_dir / "authors-0000.jsonl.gz"
    papers_path = papers_dir / "papers-0000.jsonl.gz"
    abstracts_path = abstracts_dir / "abstracts-0000.jsonl.gz"
    citations_path = citations_dir / "citations-0000.jsonl.gz"

    write_jsonl_gz(
        venues_path,
        [
            {"id": "venue-1", "issn": None, "name": "Journal of Affective Disorders"},
            {"id": "venue-2", "issn": None, "name": "Journal of Affective Disorders"},
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
                "title": "Amyloid beta in depression",
                "venue": "Journal of Affective Disorders",
                "year": 2026,
                "publicationdate": "2026-05-02",
                "isopenaccess": True,
                "publicationvenueid": "venue-2",
                "externalids": {"PubMed": "60101", "DOI": "10.1000/p101"},
                "authors": [{"authorId": "author-1", "name": "Ada Ingest"}],
            }
        ],
    )
    write_jsonl_gz(
        abstracts_path,
        [{"corpusid": 101, "abstract": "Amyloid beta abstract."}],
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
        release_dir / "manifests" / "publication-venues.manifest.json",
        dataset="publication-venues",
        release_tag=s2_release_tag,
        output_dir=publication_venues_dir,
        file_names=[venues_path.name],
    )
    write_manifest(
        release_dir / "manifests" / "authors.manifest.json",
        dataset="authors",
        release_tag=s2_release_tag,
        output_dir=authors_dir,
        file_names=[authors_path.name],
    )
    write_manifest(
        release_dir / "manifests" / "papers.manifest.json",
        dataset="papers",
        release_tag=s2_release_tag,
        output_dir=papers_dir,
        file_names=[papers_path.name],
    )
    write_manifest(
        release_dir / "manifests" / "abstracts.manifest.json",
        dataset="abstracts",
        release_tag=s2_release_tag,
        output_dir=abstracts_dir,
        file_names=[abstracts_path.name],
    )
    write_manifest(
        release_dir / "manifests" / "citations.manifest.json",
        dataset="citations",
        release_tag=s2_release_tag,
        output_dir=citations_dir,
        file_names=[citations_path.name],
    )
    await _write_sample_pt3_release(pt_root, release_tag=pt3_release_tag)

    runtime_settings = runtime_settings_factory(
        semantic_scholar_dir=s2_root,
        pubtator_dir=pt_root,
        ingest_dsn=warehouse_dsns["ingest"],
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        await run_release_ingest(
            StartReleaseRequest(
                source_code="s2",
                release_tag=s2_release_tag,
                requested_by="tester",
                family_allowlist=("publication_venues", "authors", "papers", "abstracts", "citations"),
            ),
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
        await run_release_ingest(
            StartReleaseRequest(
                source_code="pt3",
                release_tag=pt3_release_tag,
                requested_by="tester",
                family_allowlist=("bioconcepts",),
            ),
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
        await run_corpus_selection(
            StartCorpusSelectionRequest(
                s2_release_tag=s2_release_tag,
                pt3_release_tag=pt3_release_tag,
                selector_version="selector-v1-normalized-venue",
                requested_by="tester",
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
            SELECT papers.venue_id
            FROM solemd.papers papers
            WHERE papers.s2_paper_id = '101'
            """
        ) is not None
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_evidence_wave_policy_excludes_old_mapped_papers_and_keeps_rule_hits(
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
    monkeypatch,
) -> None:
    runtime_settings = runtime_settings_factory(ingest_dsn=warehouse_dsns["ingest"])
    await _seed_selection_fixture(warehouse_dsns["admin"])

    sent: list[int] = []

    def fake_send_evidence_enqueue(*, corpus_id: int, requested_by: str | None) -> None:
        del requested_by
        sent.append(corpus_id)

    monkeypatch.setattr(
        "app.corpus.wave_runtime._send_evidence_enqueue",
        fake_send_evidence_enqueue,
    )
    monkeypatch.setattr(
        "app.corpus.wave_runtime.configure_broker",
        lambda *args, **kwargs: None,
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        await run_corpus_selection(
            StartCorpusSelectionRequest(
                s2_release_tag="s2-2026-04-01",
                pt3_release_tag="pt3-2026-04-01",
                selector_version="selector-v1-policy",
                requested_by="tester",
            ),
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
        wave_run_id = UUID(
            await dispatch_evidence_wave(
                DispatchEvidenceWaveRequest(
                    s2_release_tag="s2-2026-04-01",
                    pt3_release_tag="pt3-2026-04-01",
                    selector_version="selector-v1-policy",
                    wave_policy_key="evidence_missing_pmc_bioc",
                    requested_by="tester",
                    max_papers=10,
                ),
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
        )
    finally:
        await pools.close()

    wave_members = await _fetch_wave_members(warehouse_dsns["admin"], wave_run_id)
    assert [paper_id for paper_id, _, _ in wave_members] == ["S2-106", "S2-101", "S2-105"]
    assert "S2-107" not in [paper_id for paper_id, _, _ in wave_members]

    sent_paper_ids = await _paper_ids_for_corpus_ids(warehouse_dsns["admin"], sent)
    assert [sent_paper_ids[corpus_id] for corpus_id in sent] == ["S2-106", "S2-101", "S2-105"]


@pytest.mark.asyncio
async def test_corpus_selection_reuses_existing_canonical_identity_by_pmid(
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    runtime_settings = runtime_settings_factory(ingest_dsn=warehouse_dsns["ingest"])
    await _seed_selection_fixture(warehouse_dsns["admin"])
    await _seed_existing_paper_identity(
        warehouse_dsns["admin"],
        corpus_id=900001,
        s2_paper_id="legacy-manual",
        pmid=50103,
        pmc_id="PMC900001",
    )
    await _seed_stale_release_scope_corpus_assignment(
        warehouse_dsns["admin"],
        paper_id="S2-103",
        stale_corpus_id=900099,
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        run_id = UUID(
            await run_corpus_selection(
                StartCorpusSelectionRequest(
                    s2_release_tag="s2-2026-04-01",
                    pt3_release_tag="pt3-2026-04-01",
                    selector_version="selector-v1-pmid-reuse",
                    requested_by="tester",
                ),
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
        )
    finally:
        await pools.close()

    summary_rows = await _fetch_selection_summary_rows(warehouse_dsns["admin"], run_id)
    assert ("S2-103", "corpus", "vocab_entity_match") in summary_rows

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        raw_corpus_id = await admin_connection.fetchval(
            """
            SELECT corpus_id
            FROM solemd.s2_papers_raw
            WHERE paper_id = 'S2-103'
            """
        )
        assert raw_corpus_id == 900001
        canonical_s2_paper_id = await admin_connection.fetchval(
            """
            SELECT s2_paper_id
            FROM solemd.papers
            WHERE corpus_id = 900001
            """
        )
        assert canonical_s2_paper_id == "S2-103"
    finally:
        await admin_connection.close()
