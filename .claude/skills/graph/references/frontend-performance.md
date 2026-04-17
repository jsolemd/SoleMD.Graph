# Frontend Performance Contract

Agent-facing performance rules for SoleMD.Graph frontend and browser runtime.

Use this reference when touching `features/graph/**`, DuckDB bootstrap,
selection/scope resolution, panel orchestration, or graph-loading paths. Keep
this contract here instead of recreating it in human-facing docs.

## Core Rules

1. Native-first runtime
- Prefer built-in platform capabilities before JS-side orchestration.
- Keep Cosmograph behind `features/graph/cosmograph/**`.
- Keep Tiptap behind `features/graph/tiptap/**`.

2. One canonical query/state path
- Selection, scope, and graph projection intent resolve through shared layers.
- Do not rebuild selection/scope logic independently per panel or prompt surface.

3. Zero redundant DuckDB work
- Hot-path tables load once per active DuckDB session.
- Hidden panels do not trigger warmup queries.
- Do not reread parquet when a canonical local table already exists.

4. Reuse one live session
- Same checksum means same active session.
- Do not reopen DuckDB because of remounts, rerenders, or Fast Refresh.

5. Local-first hot data
- `base_points` and `base_clusters` are hot-path assets.
- Optional heavy relations stay lazy unless they are on the first-paint path.

6. No hidden hydration penalties
- Keep `use client` boundaries small.
- Lazy-load noncritical chrome and panels.
- Prompt/evidence stream callbacks must be idempotent for the same response.

7. Centralize performance-sensitive contracts
- Shared table names, scope semantics, and cache keys belong in shared modules.

8. Measure before and after
- Verify request counts, HEAD probes, and remote parquet reads were reduced.
- Prefer structural fixes over debounce-only masking.

9. Regressions require tests
- Startup, bootstrap, selection, and repeated-interaction changes need tests.

## Anti-Patterns

- Panel-local selection logic.
- Hidden-panel prefetch on mount.
- Reopening DuckDB to paper over invalidation.
- Bypassing graph, duckdb, or tiptap adapter boundaries.
- Second implementation paths instead of replacing the first.

## Review Questions

- Did this eliminate repeated work?
- Is the hot path local and shared?
- Did the change preserve one canonical implementation?
- Was the result verified with tests or runtime inspection?

## References

- `../SKILL.md` for graph ownership and companion-skill routing
