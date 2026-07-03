# Backend Review Reference

Stack-specific review guidance for Python, PostgreSQL, FastAPI/Flask, SQLAlchemy,
async patterns, and CLI tools.

## Native Solution Examples

| Layer | Native solution | Violation example |
|-------|----------------|-------------------|
| **Python stdlib** | `pathlib`, `dataclasses`, `functools.lru_cache`, `itertools`, `contextlib` | Manual path string concatenation instead of `pathlib.Path` |
| **PostgreSQL** | Window functions, CTEs, `LATERAL` joins, `jsonb` operators, partial indexes | Fetching all rows then filtering/aggregating in Python |
| **SQLAlchemy** | Relationship loading strategies, hybrid properties, `select()` composition | Manual JOIN queries duplicating what relationship lazy/eager loading provides |
| **Pydantic** | Model validation, `field_validator`, `model_validator`, serialization | Manual dict-walking with `isinstance` checks for validation |
| **Typer/Click** | Type coercion, argument validation, help generation, `Annotated` | Manual `sys.argv` parsing or hand-rolled validation |
| **asyncio** | `gather`, `TaskGroup`, `Semaphore`, `asyncio.to_thread` | Sequential `await` calls that could be concurrent |
| **httpx/aiohttp** | Connection pooling, retry, timeout configuration | Manual retry loops with `time.sleep` |

## Adapter Boundaries (Backend)

**Database adapter**: All database access should go through a defined query layer
or repository pattern. Raw SQL strings scattered across business logic modules are
violations. Queries belong in dedicated query modules or repository classes.

**External API adapter**: HTTP clients for external services (Zotero, PubMed,
CrossRef, Unpaywall) should be encapsulated in client classes with typed
interfaces. Business logic should not construct URLs or parse raw HTTP responses
directly.

**Config adapter**: Environment variables, secrets, and configuration should be
loaded through a single config module (e.g., `config.py` with Pydantic Settings).
Direct `os.environ` reads scattered across modules are violations.

Secret workflow contract:
- Canonical local runtime path is `solemd op-run <project> -- <cmd...>`.
- Use 1Password Environments as the only secret-bearing source for local
  runtime injection.
- Do not ship plaintext dotenv fallbacks in code paths that can run through the
  shared wrapper.

## Query Redundancy

- Same SQL query executed from multiple call sites (should be a shared function)
- N+1 query patterns: fetching a list then querying each item individually
- Missing `SELECT` column pruning (selecting `*` when only 2 columns needed)
- Data fetched from database then re-filtered in Python when `WHERE` clause would suffice
- Redundant JOINs or subqueries that duplicate logic in existing views
- Missing database indexes on frequently filtered/joined columns
- Sequential queries that could be batched or parallelized

## Database Optimization & Parallelization

Every database operation must be designed for scale, not just correctness:

**Batch over loop**:
- `executemany` / `COPY` / bulk `INSERT ... VALUES` instead of row-at-a-time inserts
- `UPDATE ... FROM` or `MERGE` for batch updates instead of per-row UPDATE loops
- `unnest()` array parameters for IN-clause batching

**Parallel over sequential**:
- Independent queries → `asyncio.gather()` or `asyncio.TaskGroup`, not sequential awaits
- Use connection pools sized for concurrency (not one shared connection)
- Release connections promptly — don't hold through unrelated computation
- Structure transactions to lock the minimum scope needed

**Push work into the database**:
- Aggregation, filtering, sorting, deduplication, and joins belong in SQL
- CTEs and window functions over application-side post-processing
- `LATERAL` joins for correlated subqueries that would otherwise be N+1
- Partial indexes for queries with constant predicates (e.g., `WHERE active = true`)

**Design for 10× scale**:
- Paginate or stream unbounded result sets
- Avoid `COUNT(*)` on large tables without caching or approximation
- Ensure `ORDER BY` + `LIMIT` patterns have supporting indexes
- Prefer streaming/cursor-based iteration over materializing full result sets

## PostgreSQL Operational Patterns

Use these rules whenever a cleanup pass touches PostgreSQL schemas, indexes, or
direct `psql` work:

**Measure before changing**:
- Capture the representative SQL before "optimizing" it
- Run `EXPLAIN (ANALYZE, BUFFERS)` on the real query shape
- Inspect `pg_stat_user_indexes`, `pg_stat_user_tables`, `pg_stat_activity`,
  `pg_relation_size`, and `pg_total_relation_size` before adding or dropping indexes
- Every kept index must have an owning query; every dropped index must be proven redundant

**Classify tables correctly**:
- Source-of-truth warehouse tables are not cache tables
- Derived serving projections are rebuildable and should use safer rebuild patterns
- Scratch tables are disposable and should stay obviously disposable

**Large derived-table rebuilds**:
- Default to `CREATE TABLE ... AS SELECT` into a staging table such as `<table>_next`
- Add primary keys and serving indexes after the bulk load, not during row-by-row insert maintenance
- Use a short `lock_timeout` for the final rename swap
- Run `ANALYZE` after cutover
- Keep the final serving table logged; use `TEMP` or `UNLOGGED` only for replayable scratch relations
- Avoid `TRUNCATE + INSERT` on live queried serving tables when the rebuild is large

**Index lifecycle**:
- Use `CREATE INDEX CONCURRENTLY` and `DROP INDEX CONCURRENTLY` on live tables
- Do not drop indexes while active backfills or hot queries still rely on them
- Prefer one deliberate composite index for a real serving query over multiple overlapping indexes

**Parallelism discipline**:
- Prefer planner parallelism plus set-based SQL over launching multiple competing sessions
- Parallelize independent queries, not several full-table scans of the same hot relation
- If a job is IO-bound, more concurrent `psql` sessions can make it slower

**Session-local tuning**:
- For one-off rebuilds, set `work_mem`, `maintenance_work_mem`, `jit`,
  `effective_io_concurrency`, parallel worker knobs, and `synchronous_commit`
  per session
- Do not mutate global PostgreSQL config just to help one maintenance task

**Runtime contract centralization**:
- Separate warehouse/catalog tables from narrow runtime lookup tables when workloads differ
- Keep one owning rebuild path per serving projection
- Keep one owning read path per runtime contract
- If the same DB-backed contract is duplicated across query SQL, service logic, and API schemas, treat that as a cleanup failure

## Python Module Organization

**File size**: Same 600 LOC hard limit applies. Python files over 600 lines should
be split along responsibility boundaries (models, queries, services, handlers).

**Import hygiene**:
- Circular imports indicate entangled responsibilities - split the cycle
- Wildcard imports (`from module import *`) hide dependencies
- Heavy imports at module level when only needed in one function (use local imports
  for expensive/optional dependencies)

**Module boundaries**:
- Business logic should not import from CLI/web layers
- Data access should not import from business logic (inversion of control)
- Utility modules should be leaf nodes in the dependency graph

## Async Patterns

- `asyncio.gather()` or `TaskGroup` for concurrent I/O instead of sequential `await`
- `asyncio.to_thread()` for blocking I/O in async contexts (file I/O, CPU-bound work)
- Connection pool exhaustion: ensure DB connections are returned promptly
- Missing `async with` for async context managers (connection leaks)
- Blocking calls inside async functions without `to_thread` wrapper

## Error Handling

Only validate at system boundaries - external input, API responses, user-provided
data. Trust internal code and framework guarantees. Don't add defensive checks
for impossible states.

- API endpoints should validate input and return structured errors
- Background tasks should catch and log, not silently swallow
- Database operations should use transactions where atomicity matters
- External API calls should handle timeouts and retries at the client level

## Centralization (Backend)

**Single source of truth violations**:
- Magic strings for database column names (should be constants or enum)
- Hardcoded API URLs (should be in config)
- Duplicated Pydantic models for the same entity across modules
- Business rules encoded in multiple places instead of one authoritative module
- SQL table/schema names hardcoded instead of referencing a schema registry

## Backend Performance Tests

```python
# Database query perf: execution stays under threshold
def test_summary_query_under_100ms(db_session, sample_data):
    start = time.perf_counter()
    result = queries.get_summary(db_session, dataset_id=sample_data.id)
    elapsed = (time.perf_counter() - start) * 1000
    assert elapsed < 100, f"Summary query took {elapsed:.0f}ms"

# Batch operation perf: linear scaling
def test_batch_insert_scales_linearly(db_session):
    times = []
    for n in [100, 1000, 10000]:
        start = time.perf_counter()
        queries.batch_insert(db_session, generate_records(n))
        times.append((time.perf_counter() - start) * 1000)
    # 10x data should not be more than 15x time
    assert times[2] / times[1] < 15

# API endpoint perf: response time
def test_search_endpoint_under_200ms(client, indexed_data):
    start = time.perf_counter()
    resp = client.get("/api/search", params={"q": "test"})
    elapsed = (time.perf_counter() - start) * 1000
    assert resp.status_code == 200
    assert elapsed < 200

# Memory: no unbounded growth
def test_streaming_export_constant_memory(db_session, large_dataset):
    import tracemalloc
    tracemalloc.start()
    for chunk in queries.stream_export(db_session, large_dataset.id):
        pass
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    assert peak < 50 * 1024 * 1024  # 50MB ceiling
```

## CLI Tool Patterns

- Use Typer/Click for argument parsing, not manual `sys.argv`
- Subcommands should be thin dispatchers to business logic, not contain logic themselves
- Output formatting (tables, JSON, progress bars) should be separate from logic
- Exit codes should be meaningful (0 = success, 1 = user error, 2 = system error)
