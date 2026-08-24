# Recon Reference

Use this reference for the detailed preflight sequence that `/clean` expects
before non-trivial edits.

## Minimum Recon Contract

Before editing, answer all five questions:

1. Where does this change belong?
2. What already exists that should be reused or extended?
3. What depends on this surface now?
4. What related files, symbols, or docs constrain the change?
5. Which companion skill owns the domain details after recon?

## Default Recon Order

All RepoWise calls take `repo="graph"` for this project.

1. `get_overview()` to orient around the architecture and hubs — orientation only,
   not an authoritative current inventory
2. `find_patterns()` and `find_clones()` to avoid duplicate work
3. `search_codebase()` to find the live entry surface, then `get_symbol(id)` for one
   verified body of an id the search named
4. `get_context(targets=[...])`, `get_dependents()`, `get_blast_radius()`, or
   `build_task_slice()` to measure blast radius
5. `search_docs()` on `codeatlas-docs`, or Context7, when native-platform capability
   or third-party API behavior matters

## When To Go Deeper

Use `build_task_slice()` when work spans multiple modules or the area is unfamiliar.

Use `get_dependents()` or `get_blast_radius()` when the touched surface is shared,
central, or likely to have broad callers. `get_dependents` returns complete inbound
totals with honest pagination — a total is a total, never a sample.

Use `get_dead_code()` when cleanup should remove dead surfaces, not just fix live
ones, and `get_risk(targets)` for what history says about touching them.

Use docs search before declaring custom code a violation of the
"native solutions first" rule.

## Native API Verification Rule

Do not recommend replacing custom code with a platform-native API unless you have
verified that the API exists and fits the current version and edge cases.

Typical flow:

```text
resolve_library_id("<library>")
search_docs(library_id="<id>", query="<capability>")
```

If the project version or docs library is unclear, surface that explicitly rather
than guessing.
