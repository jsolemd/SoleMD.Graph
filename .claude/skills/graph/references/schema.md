# Graph Schema Reference

## Node Labels

### File

Primary label with secondary labels based on language/type:
`PythonFile`, `TypeScriptFile`, `JavaScriptFile`, `MarkdownFile`, `ConfigFile`, `TestFile`.

| Property | Type | Description |
|----------|------|-------------|
| `project` | string | Project identifier (e.g., `solemd.graph`) |
| `path` | string | Relative file path from project root |
| `name` | string | Filename |
| `language` | string | Detected language |
| `file_type` | string | File classification |
| `is_test` | boolean | Whether this is a test file |
| `community_id` | integer | Leiden community cluster ID |
| `community_label` | string | Human-readable community name (directory-derived) |

Secondary labels are validated against a **frozen allowlist** to prevent Cypher injection.

### Function

| Property | Type | Description |
|----------|------|-------------|
| `project` | string | Project identifier |
| `path` | string | File path containing the function |
| `name` | string | Function/method name |
| `line_number` | integer | Line number in source file |
| `cyclomatic_complexity` | integer | McCabe complexity score |
| `is_test` | boolean | Whether this is a test function |
| `class_context` | string | Enclosing class name (if method) |
| `pagerank_score` | float | Transitive importance via PageRank |
| `betweenness_score` | float | Architectural bottleneck score |
| `importance_score` | float | Composite importance (pagerank + betweenness) |
| `calls_in_degree` | integer | Number of callers |
| `calls_out_degree` | integer | Number of callees |
| `community_id` | integer | Leiden community cluster ID |
| `community_label` | string | Human-readable community name |

### Class

| Property | Type | Description |
|----------|------|-------------|
| `project` | string | Project identifier |
| `path` | string | File path containing the class |
| `name` | string | Class name |
| `parent_classes` | list[string] | Inherited class names |
| `community_id` | integer | Leiden community cluster ID |
| `community_label` | string | Human-readable community name |

### Module

Represents external imports (not part of the indexed project).

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Module name (e.g., `numpy`, `asyncio`) |

### Directory

| Property | Type | Description |
|----------|------|-------------|
| `project` | string | Project identifier |
| `path` | string | Directory path |
| `name` | string | Directory name |

## Relationships

| Relationship | Source | Target | Description |
|-------------|--------|--------|-------------|
| `CONTAINS` | Directory/File | File/Function/Class | Structural containment |
| `CALLS` | Function | Function | Function call edges |
| `IMPORTS` | File | File/Module | Import dependencies |
| `INHERITS` | Class | Class | Class inheritance |
