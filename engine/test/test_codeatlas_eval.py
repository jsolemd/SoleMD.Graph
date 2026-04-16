from __future__ import annotations

import json

from app.codeatlas_eval.benchmark_suite import (
    build_required_doc_libraries,
    build_solemd_graph_foundation_benchmark,
)
from app.codeatlas_eval.models import (
    CodeAtlasBenchmark,
    CodeAtlasBenchmarkCase,
    CodeAtlasEvalSurface,
    RequiredDocLibrary,
)
from app.codeatlas_eval.runner import evaluate_benchmark, sync_required_doc_libraries


class FakeCodeAtlasClient:
    def __init__(
        self,
        *,
        tool_payloads: dict[str, dict],
        health_payload: dict | None = None,
    ) -> None:
        self.tool_payloads = tool_payloads
        self.health_payload = health_payload or {
            "projects": {
                "solemd.graph": {
                    "status": "healthy",
                    "indexed_chunks": 512,
                }
            }
        }
        self.project = "solemd.graph"
        self.base_url = "http://localhost:8100"
        self.calls: list[tuple[str, dict]] = []

    def health(self) -> dict:
        return self.health_payload

    def call_tool(self, name: str, arguments: dict | None = None) -> dict:
        normalized_arguments = arguments or {}
        self.calls.append((name, normalized_arguments))
        key = json.dumps(
            {"tool_name": name, "arguments": normalized_arguments},
            sort_keys=True,
        )
        try:
            return self.tool_payloads[key]
        except KeyError as exc:
            raise AssertionError(f"Unexpected tool call {name} {normalized_arguments}") from exc


def _tool_key(name: str, arguments: dict) -> str:
    return json.dumps({"tool_name": name, "arguments": arguments}, sort_keys=True)


def test_build_foundation_benchmark_covers_repo_and_docs_surfaces() -> None:
    benchmark = build_solemd_graph_foundation_benchmark()

    assert benchmark.benchmark_key == "solemd_graph_codeatlas_foundation_v2"
    assert {case.lane for case in benchmark.cases} >= {
        "repo-health",
        "repo-frontend",
        "repo-runtime",
        "repo-backend",
        "repo-graph-context",
        "docs-catalog",
        "docs-frontend",
        "docs-runtime",
        "docs-backend",
    }
    assert any(case.surface == CodeAtlasEvalSurface.REPO for case in benchmark.cases)
    assert any(case.surface == CodeAtlasEvalSurface.DOCS for case in benchmark.cases)
    assert {
        library.library_id for library in benchmark.required_doc_libraries
    } >= {
        "/duckdb/duckdb-web",
        "/duckdb/duckdb-wasm",
        "/pgvector/pgvector",
    }


def test_evaluate_benchmark_flags_index_empty_and_missing_repo_hits() -> None:
    benchmark = CodeAtlasBenchmark(
        benchmark_key="test",
        benchmark_source="unit test",
        cases=[
            CodeAtlasBenchmarkCase(
                case_id="index-empty",
                lane="repo-health",
                surface=CodeAtlasEvalSurface.SERVICE,
                description="Index must not be empty.",
                tool_name="index_status",
                arguments={"action": "status", "output": "json"},
                min_indexed_chunks=100,
                forbidden_drift_signals=["index_empty"],
            ),
            CodeAtlasBenchmarkCase(
                case_id="search-token",
                lane="repo-frontend",
                surface=CodeAtlasEvalSurface.REPO,
                description="CSS token should resolve to the canonical file.",
                tool_name="search_code",
                arguments={
                    "query": "--mode-accent-subtle",
                    "mode": "literal",
                    "output": "json",
                },
                min_total=1,
                expected_file_paths=["app/styles/tokens.css"],
                expected_recommended_start_file="app/styles/tokens.css",
                expected_first_result_file="app/styles/tokens.css",
            ),
        ],
    )
    client = FakeCodeAtlasClient(
        tool_payloads={
            _tool_key(
                "index_status",
                {"action": "status", "output": "json"},
            ): {
                "status": "success",
                "payload": {
                    "scope": {"indexed_chunks": 0},
                    "health": {"drift_signals": ["index_empty"]},
                },
            },
            _tool_key(
                "search_code",
                {"query": "--mode-accent-subtle", "mode": "literal", "output": "json"},
            ): {
                "status": "no_match",
                "payload": {"results": [], "total": 0},
            },
        }
    )

    report = evaluate_benchmark(client=client, benchmark=benchmark)

    assert report.summary.total_cases == 2
    assert report.summary.failed_cases == 2
    assert report.summary.by_lane["repo-health"].failed_cases == 1
    assert report.summary.by_lane["repo-frontend"].failed_cases == 1
    assert any(
        "forbidden drift signals present" in reason
        for reason in report.cases[0].failure_reasons
    )
    assert any(
        "expected any file path" in reason or "expected total>=" in reason
        for reason in report.cases[1].failure_reasons
    )


def test_sync_required_doc_libraries_queues_missing_syncable_repos() -> None:
    libraries = [
        RequiredDocLibrary(
            library_id="/mantinedev/mantine",
            name="Mantine",
        ),
        RequiredDocLibrary(
            library_id="/duckdb/duckdb-web",
            name="DuckDB",
            repo="duckdb/duckdb-web",
            docs_path="docs",
            syncable=True,
        ),
        RequiredDocLibrary(
            library_id="/pgvector/pgvector",
            name="pgvector",
            repo="pgvector/pgvector",
            branch="master",
            syncable=True,
        ),
    ]
    client = FakeCodeAtlasClient(
        health_payload={
            "projects": {
                "solemd.graph": {
                    "status": "healthy",
                    "indexed_chunks": 512,
                }
            },
            "docs": {
                "libraries": [
                    {
                        "library_id": "/mantinedev/mantine",
                        "repo": "mantinedev/mantine",
                    }
                ]
            },
        },
        tool_payloads={
            _tool_key(
                "add_doc_library",
                {
                    "repo": "duckdb/duckdb-web",
                    "name": "DuckDB",
                    "branch": "main",
                    "docs_path": "docs",
                    "output": "json",
                },
            ): {"status": "success", "payload": {}},
            _tool_key(
                "add_doc_library",
                {
                    "repo": "pgvector/pgvector",
                    "name": "pgvector",
                    "branch": "master",
                    "output": "json",
                },
            ): {"status": "success", "payload": {}},
        }
    )

    sync_report = sync_required_doc_libraries(client=client, libraries=libraries)

    assert sync_report.total_libraries == 3
    assert sync_report.present_count == 1
    assert sync_report.queued_count == 2
    assert sync_report.add_failed_count == 0
    assert {record.library_id for record in sync_report.records if record.state == "queued"} == {
        "/duckdb/duckdb-web",
        "/pgvector/pgvector",
    }


def test_evaluate_benchmark_reuses_identical_tool_calls() -> None:
    shared_arguments = {
        "query": "PostgresRagRepository",
        "mode": "literal",
        "output": "json",
    }
    benchmark = CodeAtlasBenchmark(
        benchmark_key="cache-test",
        benchmark_source="unit test",
        cases=[
            CodeAtlasBenchmarkCase(
                case_id="first",
                lane="repo-backend",
                surface=CodeAtlasEvalSurface.REPO,
                description="First lookup.",
                tool_name="search_code",
                arguments=shared_arguments,
                min_total=1,
                expected_file_paths=["engine/app/rag/repository.py"],
                expected_recommended_start_file="engine/app/rag/repository.py",
                expected_first_result_file="engine/app/rag/repository.py",
            ),
            CodeAtlasBenchmarkCase(
                case_id="second",
                lane="repo-backend",
                surface=CodeAtlasEvalSurface.REPO,
                description="Second lookup with identical arguments.",
                tool_name="search_code",
                arguments=shared_arguments,
                min_total=1,
                expected_file_paths=["engine/app/rag/repository.py"],
                expected_recommended_start_file="engine/app/rag/repository.py",
                expected_first_result_file="engine/app/rag/repository.py",
            ),
        ],
    )
    client = FakeCodeAtlasClient(
        tool_payloads={
            _tool_key("search_code", shared_arguments): {
                "status": "success",
                "payload": {
                    "recommended_start": {"file": "engine/app/rag/repository.py"},
                    "results": [{"file": "engine/app/rag/repository.py"}],
                    "total": 1,
                },
            }
        }
    )

    report = evaluate_benchmark(client=client, benchmark=benchmark)

    assert report.summary.failed_cases == 0
    assert len(client.calls) == 1


def test_evaluate_benchmark_flags_navigation_drift_from_canonical_owner() -> None:
    benchmark = CodeAtlasBenchmark(
        benchmark_key="navigation-owner-test",
        benchmark_source="unit test",
        cases=[
            CodeAtlasBenchmarkCase(
                case_id="owner-start",
                lane="repo-runtime",
                surface=CodeAtlasEvalSurface.REPO,
                description="Literal search should start at the owner file.",
                tool_name="search_code",
                arguments={
                    "query": "useCosmographConfig",
                    "mode": "literal",
                    "output": "json",
                },
                min_total=1,
                expected_file_paths=["features/graph/cosmograph/hooks/use-cosmograph-config.ts"],
                expected_recommended_start_file="features/graph/cosmograph/hooks/use-cosmograph-config.ts",
                expected_first_result_file="features/graph/cosmograph/hooks/use-cosmograph-config.ts",
            ),
        ],
    )
    client = FakeCodeAtlasClient(
        tool_payloads={
            _tool_key(
                "search_code",
                {"query": "useCosmographConfig", "mode": "literal", "output": "json"},
            ): {
                "status": "success",
                "payload": {
                    "recommended_start": {"file": "features/graph/cosmograph/GraphRenderer.tsx"},
                    "results": [{"file": "features/graph/cosmograph/GraphRenderer.tsx"}],
                    "total": 1,
                },
            }
        }
    )

    report = evaluate_benchmark(client=client, benchmark=benchmark)

    assert report.summary.failed_cases == 1
    assert any(
        "expected recommended_start_file=" in reason
        for reason in report.cases[0].failure_reasons
    )
    assert any(
        "expected first_result_file=" in reason for reason in report.cases[0].failure_reasons
    )


def test_build_required_doc_libraries_marks_repo_managed_docs_syncable() -> None:
    libraries = build_required_doc_libraries()

    assert any(
        library.library_id == "/duckdb/duckdb-web" and library.syncable
        for library in libraries
    )
    assert any(
        library.library_id == "/duckdb/duckdb-wasm" and library.syncable
        for library in libraries
    )
    assert any(
        library.library_id == "/pgvector/pgvector" and library.syncable
        for library in libraries
    )
    assert any(
        library.library_id == "/pgvector/pgvector" and library.branch == "master"
        for library in libraries
    )
