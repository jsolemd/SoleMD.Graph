# Cypher Examples Reference

## Check graph health

```cypher
// Node counts by label
MATCH (n) RETURN labels(n) AS labels, count(n) AS count ORDER BY count DESC

// Relationship counts by type
MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY count DESC

// GDS availability
RETURN gds.version()
```

## Find most important functions

```cypher
MATCH (f:Function {project: 'solemd.graph'})
WHERE f.importance_score > 0
RETURN f.name, f.path, f.importance_score, f.pagerank_score, f.betweenness_score
ORDER BY f.importance_score DESC
LIMIT 20
```

## Find cross-community calls (coupling)

```cypher
MATCH (a:Function)-[:CALLS]->(b:Function)
WHERE a.community_id <> b.community_id
  AND a.project = 'solemd.graph'
RETURN a.community_label, b.community_label, count(*) AS cross_calls
ORDER BY cross_calls DESC
LIMIT 15
```

## Trace call chain between two functions

```cypher
MATCH path = shortestPath(
  (a:Function {name: 'run_pipeline'})-[:CALLS*..10]->(b:Function {name: 'persist_entities'})
)
RETURN [n IN nodes(path) | n.name] AS chain, length(path) AS depth
```
