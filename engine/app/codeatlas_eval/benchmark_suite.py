"""Repo-owned CodeAtlas dogfood benchmark for SoleMD.Graph."""

from __future__ import annotations

from collections.abc import Iterable

from app.codeatlas_eval.models import (
    CodeAtlasBenchmark,
    CodeAtlasBenchmarkCase,
    CodeAtlasEvalSurface,
    RequiredDocLibrary,
)


def build_required_doc_libraries() -> tuple[RequiredDocLibrary, ...]:
    return (
        RequiredDocLibrary(
            library_id="/mantinedev/mantine",
            name="Mantine",
        ),
        RequiredDocLibrary(
            library_id="/vercel/next.js",
            name="Next.js",
        ),
        RequiredDocLibrary(
            library_id="/tailwindlabs/tailwindcss.com",
            name="Tailwind CSS",
        ),
        RequiredDocLibrary(
            library_id="/reactjs/react.dev",
            name="React",
        ),
        RequiredDocLibrary(
            library_id="/codeatlas/cosmograph",
            name="Cosmograph",
        ),
        RequiredDocLibrary(
            library_id="/fastapi/fastapi",
            name="FastAPI",
        ),
        RequiredDocLibrary(
            library_id="/duckdb/duckdb-web",
            name="DuckDB",
            repo="duckdb/duckdb-web",
            docs_path="docs",
            description="DuckDB database and SQL docs",
            syncable=True,
        ),
        RequiredDocLibrary(
            library_id="/duckdb/duckdb-wasm",
            name="DuckDB-Wasm",
            repo="duckdb/duckdb-wasm",
            description="DuckDB-Wasm browser runtime docs",
            syncable=True,
        ),
        RequiredDocLibrary(
            library_id="/pgvector/pgvector",
            name="pgvector",
            repo="pgvector/pgvector",
            branch="master",
            description="pgvector PostgreSQL extension docs",
            syncable=True,
        ),
        RequiredDocLibrary(
            library_id="/codeatlas/1password-developer",
            name="1Password Developer Docs",
        ),
    )


def build_solemd_graph_foundation_benchmark(
    *,
    lanes: Iterable[str] | None = None,
) -> CodeAtlasBenchmark:
    required_doc_libraries = list(build_required_doc_libraries())
    required_library_ids = [library.library_id for library in required_doc_libraries]
    selected_lanes = set(lanes or [])
    cases = [
        CodeAtlasBenchmarkCase(
            case_id="index-status-not-empty",
            lane="repo-health",
            surface=CodeAtlasEvalSurface.SERVICE,
            description="CodeAtlas repo index must be populated for solemd.graph.",
            tool_name="index_status",
            arguments={"action": "status", "output": "json"},
            min_indexed_chunks=100,
            forbidden_drift_signals=["index_empty"],
            tags=["repo", "health"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="search-css-mode-accent-subtle",
            lane="repo-frontend",
            surface=CodeAtlasEvalSurface.REPO,
            description="Literal CSS token lookup should land on the canonical token file.",
            tool_name="search_code",
            arguments={
                "query": "--mode-accent-subtle",
                "mode": "literal",
                "detail": "card",
                "output": "json",
            },
            min_total=1,
            expected_file_paths=["app/styles/tokens.css"],
            expected_recommended_start_file="app/styles/tokens.css",
            expected_first_result_file="app/styles/tokens.css",
            tags=["frontend", "css", "tokens"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="search-mantine-theme-provider",
            lane="repo-frontend",
            surface=CodeAtlasEvalSurface.REPO,
            description="Mantine theme wiring should be discoverable from the provider symbol.",
            tool_name="search_code",
            arguments={
                "query": "MantineThemeProvider",
                "mode": "literal",
                "detail": "card",
                "output": "json",
            },
            min_total=1,
            expected_file_paths=["components/MantineThemeProvider.tsx"],
            expected_recommended_start_file="components/MantineThemeProvider.tsx",
            expected_first_result_file="components/MantineThemeProvider.tsx",
            tags=["frontend", "mantine"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="search-duckdb-browser-entry",
            lane="repo-runtime",
            surface=CodeAtlasEvalSurface.REPO,
            description="DuckDB-Wasm entrypoint wiring should be discoverable from the bundler constant.",
            tool_name="search_code",
            arguments={
                "query": "DUCKDB_BROWSER_ENTRY",
                "mode": "literal",
                "detail": "card",
                "output": "json",
            },
            min_total=1,
            expected_file_paths=["next.config.ts"],
            expected_recommended_start_file="next.config.ts",
            expected_first_result_file="next.config.ts",
            tags=["runtime", "duckdb", "frontend"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="search-remote-attachment-provider",
            lane="repo-runtime",
            surface=CodeAtlasEvalSurface.REPO,
            description="DuckDB remote attachment ownership should resolve to the adapter file.",
            tool_name="search_code",
            arguments={
                "query": "remoteGraphPaperAttachmentProvider",
                "mode": "literal",
                "detail": "card",
                "output": "json",
            },
            min_total=1,
            expected_file_paths=["features/graph/duckdb/remote-attachment.ts"],
            expected_recommended_start_file="features/graph/duckdb/remote-attachment.ts",
            expected_first_result_file="features/graph/duckdb/remote-attachment.ts",
            tags=["runtime", "duckdb", "adapter"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="search-cosmograph-config",
            lane="repo-runtime",
            surface=CodeAtlasEvalSurface.REPO,
            description="Cosmograph adapter configuration should resolve inside the adapter boundary.",
            tool_name="search_code",
            arguments={
                "query": "useCosmographConfig",
                "mode": "literal",
                "detail": "card",
                "output": "json",
            },
            min_total=1,
            expected_file_paths=["features/graph/cosmograph/hooks/use-cosmograph-config.ts"],
            expected_recommended_start_file="features/graph/cosmograph/hooks/use-cosmograph-config.ts",
            expected_first_result_file="features/graph/cosmograph/hooks/use-cosmograph-config.ts",
            tags=["runtime", "cosmograph", "adapter"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="search-postgres-rag-repository",
            lane="repo-backend",
            surface=CodeAtlasEvalSurface.REPO,
            description="Backend repository ownership should resolve from the class name.",
            tool_name="search_code",
            arguments={
                "query": "PostgresRagRepository",
                "mode": "literal",
                "detail": "card",
                "output": "json",
            },
            min_total=1,
            expected_file_paths=["engine/app/rag/repository.py"],
            expected_recommended_start_file="engine/app/rag/repository.py",
            expected_first_result_file="engine/app/rag/repository.py",
            tags=["backend", "rag", "repository"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="search-retrieve-search-state",
            lane="repo-backend",
            surface=CodeAtlasEvalSurface.REPO,
            description="Retrieval orchestration should resolve from the core function name.",
            tool_name="search_code",
            arguments={
                "query": "retrieve_search_state",
                "mode": "literal",
                "detail": "card",
                "output": "json",
            },
            min_total=1,
            expected_file_paths=["engine/app/rag/search_retrieval.py"],
            expected_recommended_start_file="engine/app/rag/search_retrieval.py",
            expected_first_result_file="engine/app/rag/search_retrieval.py",
            tags=["backend", "rag", "retrieval"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="file-context-tokens",
            lane="repo-graph-context",
            surface=CodeAtlasEvalSurface.REPO,
            description="File context should expose chunks for the canonical CSS token file.",
            tool_name="file_context",
            arguments={
                "file_path": "app/styles/tokens.css",
                "include_imports": True,
                "output": "json",
            },
            min_chunk_count=1,
            tags=["repo", "graph", "css"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="file-context-rag-repository",
            lane="repo-graph-context",
            surface=CodeAtlasEvalSurface.REPO,
            description="File context should expose chunks for the backend RAG repository.",
            tool_name="file_context",
            arguments={
                "file_path": "engine/app/rag/repository.py",
                "include_imports": True,
                "output": "json",
            },
            min_chunk_count=1,
            tags=["repo", "graph", "backend"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="required-doc-libraries-present",
            lane="docs-catalog",
            surface=CodeAtlasEvalSurface.DOCS,
            description="SoleMD.Graph must have all critical frontend/runtime/backend docs libraries registered.",
            tool_name=None,
            expected_status=None,
            expected_library_ids=required_library_ids,
            tags=["docs", "catalog"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="resolve-duckdb-library",
            lane="docs-runtime",
            surface=CodeAtlasEvalSurface.DOCS,
            description="DuckDB should resolve as a first-class docs library for this repo.",
            tool_name="resolve_library_id",
            arguments={"library_name": "DuckDB", "output": "json"},
            expected_library_id="/duckdb/duckdb-web",
            tags=["docs", "duckdb"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="resolve-pgvector-library",
            lane="docs-backend",
            surface=CodeAtlasEvalSurface.DOCS,
            description="pgvector should resolve as a first-class docs library for this repo.",
            tool_name="resolve_library_id",
            arguments={"library_name": "pgvector", "output": "json"},
            expected_library_id="/pgvector/pgvector",
            tags=["docs", "pgvector"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="search-mantine-action-icon-docs",
            lane="docs-frontend",
            surface=CodeAtlasEvalSurface.DOCS,
            description="Mantine docs search should return ActionIcon styling guidance.",
            tool_name="search_docs",
            arguments={
                "library_id": "/mantinedev/mantine",
                "query": "ActionIcon styles and theme tokens",
                "limit": 4,
                "output": "json",
            },
            min_total=1,
            tags=["docs", "frontend", "mantine"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="search-cosmograph-camera-docs",
            lane="docs-runtime",
            surface=CodeAtlasEvalSurface.DOCS,
            description="Cosmograph docs search should return camera or selection API material.",
            tool_name="search_docs",
            arguments={
                "library_id": "/codeatlas/cosmograph",
                "query": "camera transform selection adapter API",
                "limit": 4,
                "output": "json",
            },
            min_total=1,
            tags=["docs", "runtime", "cosmograph"],
        ),
        CodeAtlasBenchmarkCase(
            case_id="search-fastapi-di-docs",
            lane="docs-backend",
            surface=CodeAtlasEvalSurface.DOCS,
            description="FastAPI docs search should return dependency-injection guidance for async services.",
            tool_name="search_docs",
            arguments={
                "library_id": "/fastapi/fastapi",
                "query": "dependency injection async database session patterns",
                "limit": 4,
                "output": "json",
            },
            min_total=1,
            tags=["docs", "backend", "fastapi"],
        ),
    ]
    if selected_lanes:
        cases = [case for case in cases if case.lane in selected_lanes]
    return CodeAtlasBenchmark(
        benchmark_key="solemd_graph_codeatlas_foundation_v2",
        benchmark_source=(
            "Repo-owned CodeAtlas dogfood benchmark spanning CSS tokens, Mantine, "
            "DuckDB-Wasm, Cosmograph, backend RAG search, and required docs coverage."
        ),
        cases=cases,
        required_doc_libraries=required_doc_libraries,
    )
