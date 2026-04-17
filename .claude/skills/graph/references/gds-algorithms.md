# GDS Algorithms Reference

Three Graph Data Science algorithms run after every index build. All are **project-scoped**
via Cypher projection (not global `gds.graph.project`).

## 1. PageRank on CALLS Graph

- **What**: Computes transitive importance of each function based on who calls it and how
  important those callers are.
- **Output**: `pagerank_score` on Function nodes.
- **Interpretation**: High PageRank = widely depended-upon utility function. Low PageRank =
  leaf function or entry point.
- **Projection**: Functions connected by CALLS edges, filtered to current project.

## 2. Betweenness Centrality on CALLS Graph

- **What**: Identifies functions that sit on many shortest paths between other functions.
- **Output**: `betweenness_score` on Function nodes.
- **Interpretation**: High betweenness = architectural bottleneck. Changes here have
  outsized blast radius. These are the "bridge functions" surfaced by the
  `find_bridge_functions` MCP tool.
- **Projection**: Same CALLS subgraph as PageRank.

## 3. Leiden Community Detection on CALLS + IMPORTS Graph

- **What**: Clusters functions and files into functional communities using the Leiden
  algorithm (improvement over Louvain).
- **Output**: `community_id` and `community_label` on Function, File, and Class nodes.
- **Interpretation**: Each community represents a cohesive functional area of the codebase.
- **Projection**: Functions and Files connected by CALLS and IMPORTS edges.
  **CONTAINS edges are excluded** to avoid rediscovering the directory structure.
- **Label derivation**: Community labels are derived from the most-common directory prefix
  per cluster, using APOC string functions.

## Graceful Degradation

If GDS is unavailable (not installed, license issue, plugin load failure), core indexing
still works. Centrality scores remain at zero and community assignments are skipped.
Check GDS availability with:

```cypher
RETURN gds.version()
```

---

## Key Patterns and Gotchas

### Cypher Projection for GDS

GDS algorithms use the modern **aggregation function** syntax `gds.graph.project()` in a
`RETURN` clause (the deprecated `gds.graph.project.cypher()` procedure was removed in GDS 2.x).
Project-scoping is achieved by filtering nodes with `{project: $project}` in the `MATCH`.

```cypher
-- Example: project-scoped PageRank (directed CALLS graph)
MATCH (source:Function {project: $project})-[:CALLS]->(target:Function {project: $project})
RETURN gds.graph.project('calls_graph', source, target)

-- Example: Leiden community detection (UNDIRECTED, 5-arg form)
MATCH (source {project: $project})-[r]->(target {project: $project})
WHERE type(r) IN ['CALLS', 'IMPORTS']
RETURN gds.graph.project('code_community', source, target,
  {}, {undirectedRelationshipTypes: ['*']})
```

The 5-argument form: `gds.graph.project(name, source, target, dataConfig, configuration)`.
The 4th arg is data config (labels, properties), the 5th is graph config (undirected, concurrency).

### Secondary Label Validation

Secondary labels (`PythonFile`, `TypeScriptFile`, etc.) are validated against a frozen
allowlist before being applied. This prevents Cypher injection through crafted filenames
or extensions. The allowlist is defined in `schema.py`.

### Full Rebuild on Reindex

The graph is **wiped and rebuilt** on every force reindex. There is no incremental graph
update strategy. This ensures consistency but means a full reindex can take several minutes
for large projects. Regular (non-force) reindex only updates changed files.

### Community Label Derivation

Community labels are not manually assigned. They are automatically derived from the
most-common directory prefix among all nodes in each Leiden cluster, using APOC string
functions. This gives human-readable names like "pipeline/app/extract" or
"services/api/marker" without manual curation.

### Importance Score

The `importance_score` on Function nodes is a degree-based composite:

```
importance_score = calls_in_degree * 2 + calls_out_degree
```

This gives a lightweight sortable metric favoring functions with many callers
(weighted 2x) over functions that call many others. `pagerank_score` and
`betweenness_score` are stored separately for GDS-powered analysis.
