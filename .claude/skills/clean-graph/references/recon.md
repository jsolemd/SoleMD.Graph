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

1. `graph_overview()` to orient around communities, hubs, and dead-code signals
2. `find_patterns(pattern="reuse_candidates")` and `find_clones()` to avoid duplicate work
3. `search_code()` or `inspect_symbol()` to find the live entry surface
4. `file_context()`, `dependents()`, `analyze_impact()`, or `slice_build()` to measure blast radius
5. `search_docs()` or Context7 when native-platform capability or third-party API behavior matters

## When To Go Deeper

Use `slice_build()` when work spans multiple modules or the area is unfamiliar.

Use `dependents(max_depth>=2)` or `analyze_impact()` when the touched surface is
shared, central, or likely to have broad callers.

Use `find_patterns(pattern="orphan_exports")` when cleanup should remove dead
surfaces, not just fix live ones.

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
