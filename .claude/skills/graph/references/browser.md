# Neo4j Browser Visual Exploration

## GRASS Stylesheet

The custom GRASS stylesheet provides brand-color coding for visual exploration:

| Node Type | Color | Hex |
|-----------|-------|-----|
| PythonFile | Blue | `#4B8BBE` |
| TypeScriptFile | Blue | `#3178C6` |
| JavaScriptFile | Yellow | `#F7DF1E` |
| MarkdownFile | Green | `#4CAF50` |
| ConfigFile | Purple | `#9C27B0` |
| TestFile | Red | `#F44336` |
| Function | Default | Node default |
| Class | Default | Node default |
| Module | Grey | External dependencies |
| Directory | Default | Structural nodes |

## Importing the Stylesheet

1. Open Neo4j Browser at http://localhost:7474
2. Click the gear icon (Browser Settings)
3. Scroll to "Graph Stylesheet"
4. Drag and drop `graph.grass` from the saved location, or paste its contents
5. The stylesheet persists in browser local storage

## Saved Queries

10 pre-built queries are available in `saved-queries.cypher` for common exploration patterns.
Import them via Neo4j Browser's "Favorites" panel (star icon) by pasting the file contents.

Common query patterns include:
- Full graph overview (node/edge counts)
- Top functions by PageRank
- Bridge functions (betweenness centrality)
- Community visualization
- Cross-community call edges (coupling detection)
- Import dependency trees
- Class inheritance hierarchies
- File-level dependency graphs
