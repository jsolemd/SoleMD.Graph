# 06 — Async Python Stack

> **Status**: locked for the four-pool topology, asyncpg-as-default stance,
> Pydantic v2 boundary contract, FastAPI lifespan + dependency-injection
> shape, Dramatiq AsyncIO middleware shape, Testcontainers no-mocks-for-PG
> rule. Microdesign details (per-pool sizes at 68 GB / 128 GB, Pydantic
> directory split per family, exact actor `time_limit` values, model_validate
> ns budgets) are **provisional until first sample build** validates them.
>
> **Date**: 2026-04-16
>
> **Scope**: the Python side of the stack — pools, Pydantic v2 at the DB
> boundary, FastAPI app shape, Dramatiq AsyncIO worker shape, secret/DSN
> handling, the migrations-runner contract, and Testcontainers-based
> integration testing. Tuning numbers (PG GUCs, PgBouncer sizing,
> `statement_timeout`) live in `09-tuning.md`. Observability dashboards
> live in `10-observability.md`. Auth wiring lives in `13-auth.md`.
>
> **Schema authority**: this doc is the engine-code authority. Engine code
> under `engine/app/db/`, `engine/app/models/`, `engine/app/api/`,
> `engine/app/workers/`, and `engine/test/` derives from here. Where the
> warehouse / serve schema is the source of truth (`02 §0`, `03 §0`), this
> doc cites instead of restates.

## Purpose

Define the Python-side runtime contract for the engine so that every
hot-path component — `graph-engine-api` (FastAPI, always-up),
`graph-worker` (Dramatiq + RAPIDS, on-demand), the projection worker,
the ingest worker — resolves its database access, role, pool, codec
setup, validation contract, and test fixture against the same shape.

Eight load-bearing properties:

1. **Four asyncpg pools per role.** `ingest_write`, `warehouse_read`,
   `serve_read`, `admin`. Each pool is keyed to one PG role, one
   physical target, and one pooler decision. No code path opens an
   ad-hoc pool. (§2)
2. **asyncpg on every hot path.** Ingest, projection, serve reads,
   FastAPI handlers, Dramatiq actors. psycopg3 is reserved for sync
   admin utilities — primarily `engine/db/scripts/schema_migrations.py`.
   No SQLAlchemy / SQLModel / Piccolo. (§3)
3. **Pydantic v2 sits at the DB boundary.** Every row that crosses
   asyncpg ↔ Python passes through `model_validate` on read and
   `model_dump(mode='python')` on write. Pure schema models, no
   business logic. (§4)
4. **FastAPI lifespan owns the always-up pools.** `serve_read` and
   `admin` open at startup, drain at shutdown. Pools reach handlers
   via `Depends(...)`, never via module globals. (§5)
5. **Dramatiq AsyncIO middleware drives the worker.** One event-loop
   thread per worker process; pools open at process start, not per
   actor. Async actors are first-class. (§6)
6. **Per-role PG users with explicit grants.** No shared `postgres`
   account. DSNs assembled from environment at startup, never
   hard-coded. `application_name` always set for `pg_stat_activity`
   triage. (§7)
7. **One migrations runner, currently sync psycopg3.** The existing
   `engine/db/scripts/schema_migrations.py` stays the executor /
   ledger; SQL-first schema files author, and async conversion stays deferred
   until a runtime path truly needs it. (§8)
8. **Testcontainers as the substrate.** Session-scoped two-cluster
   PG; function-scoped transactional rollback for isolation. No mocks
   for PG, ever. Mocks for OpenSearch / Redis allowed in their own
   plane. (§9)

## §0 Conventions delta from `00` / `04` / `05`

Inherits every convention from `00 §1`, `02 §0`, `04 §0`, `05 §0`.
Adds the engine-code-side rules below; nothing here weakens those
docs.

| Concern | This doc adds |
|---|---|
| **Per-role pool layout** | Four pools by role (`ingest_write`, `warehouse_read`, `serve_read`, `admin`); each pinned to one DSN, one PG user, one pooler decision. §2. |
| **Pydantic v2 boundary helper** | `from_record(record) -> Model` and `to_copy_tuple(model) -> tuple` helper signatures; `model_dump(mode='python')` on writes. §4. |
| **Dramatiq actor decorator pattern** | `@dramatiq.actor(queue_name=..., max_retries=..., time_limit=...)`; pool sharing across asyncio tasks within a process; one process per GPU. §6. |
| **FastAPI lifespan pool ownership** | `app.state.serve_read_pool` / `app.state.admin_pool` opened in `lifespan`; surfaced to handlers via `Annotated[Pool, Depends(get_serve_read_pool)]`. §5. |
| **Testcontainers fixture scope rules** | Session-scoped containers; function-scoped `BEGIN; … ROLLBACK;`. Tests that exercise DDL / advisory locks / swap opt out via `@pytest.mark.serial`. §9. |
| **No-mocks-for-PG rule** | Every test that touches PG hits a real container. Mocks are reserved for OpenSearch / Redis where their own contracts in `07` and elsewhere apply. §9. |

## §1 Identity / boundary types

No new identity types beyond `02 §2` and `03 §2`. This section locks
the codec setup that makes the existing types boundary-safe.

| PG type | Python type | Codec at boundary |
|---|---|---|
| `bigint` | `int` | builtin (asyncpg native) |
| `integer`, `smallint` | `int` | builtin |
| `boolean` | `bool` | builtin |
| `text`, `varchar` | `str` | builtin |
| `bytea` | `bytes` | builtin |
| `timestamptz`, `date` | `datetime`, `date` | builtin (UTC-aware per `02 §0.1`) |
| `uuid` | `uuid.UUID` | builtin (asyncpg native; covers PG 18 `uuidv7()` output) |
| `jsonb` | `dict` / `list` | per-connection codec via `init`: `set_type_codec('jsonb', encoder=json.dumps, decoder=json.loads, schema='pg_catalog', format='text')` — `json` decode in C extension is fast enough; binary jsonb in asyncpg is still text-format on the wire (asyncpg API ref, <https://magicstack.github.io/asyncpg/current/usage.html>) **locked** |
| `bit(8)` | `int` | per-connection codec converting `bit(n)` → `int` (bitmask use only) **locked** |
| `halfvec(n)` / `vector(n)` | `numpy.ndarray[float16]` / `numpy.ndarray[float32]` | `pgvector.asyncpg.register_vector(conn)` in `init` — only on pools that touch warehouse `paper_embeddings_graph` (`02 §4.6`) **locked** (see §2 — only `warehouse_read` for graph build, not `serve_read` per `03 §0.7`) |

`COMMENT`: PG 18's native `uuidv7()` returns `uuid` over the wire;
the existing builtin codec round-trips it without help. This is why
`02 §2` and `03 §2` can use `uuidv7()` defaults without engine-side
serialization.

## §2 Pool topology

Four asyncpg pools per worker process / per FastAPI process. No code
path opens a pool outside `engine/app/db/pools.py`. Every pool is
pinned to:

1. One PG **role** (per-pool grants, §7).
2. One PG **physical target** (warehouse vs serve cluster).
3. One **pooler decision** (direct vs through `pgbouncer-serve`).

### 2.1 Per-pool spec

| Pool | Role | Target | Pooler | DSN env | min / max (68 GB) | min / max (128 GB) | `command_timeout` | `statement_cache_size` | Codecs registered |
|---|---|---|---|---|---:|---:|---:|---:|---|
| `ingest_write` | `engine_ingest_write` | warehouse | direct | `WAREHOUSE_DSN_INGEST` | 8 / 64 | 8 / 96 | `None` | `0` | jsonb, bit, pgvector |
| `warehouse_read` | `engine_warehouse_read` | warehouse | direct | `WAREHOUSE_DSN_READ` | 2 / 8 | 2 / 16 | `300` | `128` | jsonb, bit, pgvector |
| `serve_read` | `engine_serve_read` | serve | `pgbouncer-serve` (txn mode) | `SERVE_DSN_READ` | 2 / 16 | 2 / 32 | `5` | `0` | jsonb, bit |
| `admin` | `engine_admin` | serve | direct | `SERVE_DSN_ADMIN` | 1 / 2 | 1 / 2 | `None` | `128` | jsonb, bit |

Sizing rationale (provisional; final values in `09-tuning.md`):
- **`ingest_write`** sized for the §05.4 `min=8, max=64` envelope —
  32 hash partitions × ~2 streams. Direct because warehouse has no
  pooler day one (`00 §1`). Writes only.
- **`warehouse_read`** sized for the projection worker's cohort-build
  read traffic (§05.4 lookup-cache builds, §04.6 join SQL). Direct;
  read-only role.
- **`serve_read`** sized for the FastAPI request fan-out plus the
  projection worker's pre-flight audits. Through `pgbouncer-serve`
  txn mode per `03 §7.3`.
- **`admin`** sized for the swap transaction (`04 §3.5`) plus
  occasional ops scripts. Direct per `04 §4`. Tiny — at most one
  swap in flight per worker process.

### 2.2 Pool factory contract

```python
# engine/app/db/pools.py — sketch
from __future__ import annotations
import json
from dataclasses import dataclass
from typing import Literal

import asyncpg
from pgvector.asyncpg import register_vector

from app.config import settings


PoolName = Literal["ingest_write", "warehouse_read", "serve_read", "admin"]


@dataclass(frozen=True, slots=True)
class PoolSpec:
    name: PoolName
    dsn: str
    min_size: int
    max_size: int
    statement_cache_size: int       # 0 for serve_read (pgbouncer txn mode); 128 elsewhere
    command_timeout: float | None   # None for COPY / DDL paths; 5 s on serve_read OLTP
    register_pgvector: bool         # True for warehouse-touching pools (paper_embeddings_graph)
    application_name: str           # always set; surfaces in pg_stat_activity
    server_settings: dict[str, str] # role-specific GUCs (synchronous_commit, lock_timeout, …)


async def _init_connection(conn: asyncpg.Connection, register_pgvector: bool) -> None:
    """Codec setup. Runs once per new physical connection — `init`, not `setup`
    (asyncpg API ref: https://magicstack.github.io/asyncpg/current/api/index.html
    — init runs at connection creation; setup runs on every acquire and would
    re-register codecs unnecessarily)."""
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads,
                              schema="pg_catalog", format="text")
    await conn.set_type_codec("bit",
                              encoder=lambda i: format(int(i), "b"),
                              decoder=lambda s: int(s, 2),
                              schema="pg_catalog", format="text")
    if register_pgvector:
        # pgvector-python README (https://github.com/pgvector/pgvector-python;
        # issue #100 best-practice): register_vector on init is the supported
        # pool pattern.
        await register_vector(conn)


async def open_pool(spec: PoolSpec) -> asyncpg.Pool:
    """Open one pool per the §2.1 spec. Asyncpg defaults kept for max_queries
    (50_000) and max_inactive_connection_lifetime (300 s)."""
    server_settings = {**spec.server_settings, "application_name": spec.application_name}
    return await asyncpg.create_pool(
        dsn=spec.dsn,
        min_size=spec.min_size, max_size=spec.max_size,
        command_timeout=spec.command_timeout,
        statement_cache_size=spec.statement_cache_size,
        server_settings=server_settings,
        init=lambda c: _init_connection(c, spec.register_pgvector),
    )


async def open_pools(names: tuple[PoolName, ...]) -> dict[PoolName, asyncpg.Pool]:
    """Single entry point used by FastAPI lifespan (§5.1) and Dramatiq worker
    boot (§6.2). Lint rule: no other call site may invoke create_pool."""
    ...
```

Per-spec values follow the §2.1 table verbatim. Server-settings deltas
worth highlighting:

- **`ingest_write`** sets `synchronous_commit='off'`, `temp_buffers='256MB'`
  per `05 §4.3` / `05 §6.3`.
- **`warehouse_read`** sets `default_transaction_read_only='on'` as
  belt-and-braces over the role grant.
- **`admin`** sets `lock_timeout='2s'` and `statement_timeout='0'` per
  `04 §3.5`.
- **`serve_read`** sets nothing beyond `application_name`; PgBouncer
  enforces the rest at the pooler edge.

### 2.3 Pool ownership matrix

Which process opens which pools is fixed:

| Process | `ingest_write` | `warehouse_read` | `serve_read` | `admin` |
|---|:---:|:---:|:---:|:---:|
| `graph-engine-api` (FastAPI) | — | — | yes | yes |
| `graph-worker` — projection actor | — | yes | yes | yes |
| `graph-worker` — ingest actor | yes | — | — | — |
| `graph-worker` — RAG inference actor | — | — | yes | — |
| `engine/db/scripts/schema_migrations.py` (sync) | — | — | — | sync psycopg3 against `SERVE_DSN_ADMIN` (§3, §8) |

Rules:
- A given worker process opens only the pools its actors need at
  process boot. The Dramatiq pre-fork model (one process per GPU,
  see §6.3) keeps pool fan-out per host bounded.
- The FastAPI process never opens `ingest_write` or `warehouse_read`
  — it has no business writing warehouse or running cohort-build SQL.
  This is enforced at the `Depends` layer (§5.3).
- Direct connections (`ingest_write`, `warehouse_read`, `admin`)
  share Unix-socket-style locality with their target on this host;
  no PgBouncer in the loop reduces failure modes (`04 §4.1`).

**locked** for ownership matrix; **provisional** for sizing.

## §3 asyncpg vs psycopg3 stance

Two drivers, two roles:

| Driver | Used for | Why |
|---|---|---|
| **asyncpg 0.31+** | Every hot path: ingest COPY, projection swap, FastAPI handlers, Dramatiq async actors, projection-worker reads. | Binary protocol, native `copy_records_to_table`, and the leanest direct async surface for the paths this repo cares about. Any claimed latency edge over psycopg3 is benchmark-owned for this project, not an upstream-documented guarantee. |
| **psycopg3 3.3+** | Sync admin utilities only — primarily `engine/db/scripts/schema_migrations.py` and one-off scripts that genuinely cannot sit inside an event loop. | Sharper sync API, COPY support (less critical here — admin rarely COPYs). Useful when the script must be importable into an interactive REPL or a non-asyncio process. |

### 3.1 Forbidden shapes

- **No SQLAlchemy / SQLModel / Piccolo** anywhere in the engine —
  including admin scripts. SQL-first schema files handle schema; everything
  else is raw SQL through Pydantic v2 (§4).
- **No `asyncio.run()` inside a Dramatiq actor.** AsyncIO middleware
  shares one event loop per worker process (§6.2); per-actor
  `asyncio.run()` would create a fresh loop and defeat pool sharing.
- **No mixing asyncpg + psycopg3 on the same connection.** Different
  wire protocols; one process picks one driver per connection.
- **No asyncpg client-side statement cache behind transaction-pooled
  PgBouncer.** `serve_read` keeps `statement_cache_size=0`, avoids
  explicit `Connection.prepare()`, and treats any server-side
  prepared-plan reuse as an integration-tested optimization rather than
  a baseline assumption. Transaction-pooled paths also avoid session-state
  assumptions (`SET`, temp objects, LISTEN/NOTIFY, session locks).

### 3.2 Why no SQLAlchemy 2.x async

SQLAlchemy 2.1 async composes with asyncpg as the underlying driver.
We still reject it because (1) the `04 §3.5` swap shape (raw
`ALTER TABLE … RENAME` + pointer UPDATE + ledger writes in one
multi-statement transaction) is not ORM-shaped — SQLAlchemy would
either wrap it in `text()` blocks that lose every ORM benefit or
`Core` constructs that obscure the SQL; (2) Pydantic v2 already
gives us the typed-row contract (§4) — SQLAlchemy on top duplicates
the boundary work; (3) the COPY fast path (`05 §4.3`, `04 §3.3`)
sits below SQLAlchemy's abstraction surface anyway —
`copy_records_to_table` is asyncpg-only. `research-distilled §3`
summary stands. **locked**

## §4 Pydantic v2 at the DB boundary

Every row that crosses the asyncpg ↔ Python boundary passes through
a Pydantic v2 model. Pure schema; no business logic.

### 4.1 Direction "in" — Record → Model

asyncpg returns `asyncpg.Record` objects from `fetch` / `fetchrow` /
`fetchval`. The boundary helper converts to dict and validates:

```python
# engine/app/db/boundary.py — sketch
from typing import Type, TypeVar
import asyncpg
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

def from_record(record: asyncpg.Record, model: Type[T]) -> T:
    """asyncpg.Record → typed Pydantic model. Pydantic v2's Rust core
    makes this ns-class for plain-typed models (perf guide:
    https://docs.pydantic.dev/latest/concepts/performance/)."""
    return model.model_validate(dict(record))

def from_records(records: list[asyncpg.Record], model: Type[T]) -> list[T]:
    return [model.model_validate(dict(r)) for r in records]
```

Why `dict(record)` rather than `model.model_validate(record)` directly:
`Record` is not a `Mapping` in every Pydantic-validator code path;
`dict(record)` is one C-level call and round-trip-safe across asyncpg
minor versions.

### 4.2 Direction "out" — Model → COPY tuple / parameter list

```python
# engine/app/db/boundary.py — sketch (continued)
from typing import Iterable

def to_copy_tuple(model: BaseModel, columns: tuple[str, ...]) -> tuple:
    payload = model.model_dump(mode="python", exclude_unset=False)
    return tuple(payload[c] for c in columns)

def to_copy_records(models: Iterable[BaseModel],
                    columns: tuple[str, ...]) -> Iterable[tuple]:
    """Lazy generator for asyncpg.copy_records_to_table(records=...). Avoids
    materializing all rows in Python. Caller supplies the column order
    (must match the partition's MAXALIGN layout per 02 §0.3)."""
    for m in models:
        payload = m.model_dump(mode="python", exclude_unset=False)
        yield tuple(payload[c] for c in columns)

def to_param_list(model: BaseModel, columns: tuple[str, ...]) -> list:
    """For asyncpg.execute / fetch with positional binds."""
    return list(to_copy_tuple(model, columns))
```

**Performance rules** (Pydantic perf guide above):

- Always `model_dump(mode='python')` on the hot path. `mode='json'`
  costs a `datetime → str` round-trip we don't want.
- No `wrap` validators on hot models — they materialize Python
  objects mid-validation.
- No `ConfigDict(arbitrary_types_allowed=True)` on hot models — it
  bypasses the Rust core for those types.
- Prefer `BaseModel` over `pydantic.dataclasses.dataclass`; BaseModel
  has the more aggressive Rust optimizations in 2.x.

### 4.3 Codec setup interplay

`from_record` works because the per-connection codecs in §1 / §2.2
already convert `jsonb → dict`, `bit(8) → int`, `halfvec(n) → ndarray`
on the wire. By the time the Record reaches Python, the values are
in a shape Pydantic v2 can validate without custom validators. **locked**

### 4.4 Directory layout

```
engine/app/models/
├── warehouse/      corpus.py, citation.py, grounding.py, concept.py,
│                   ingest.py, pubtator.py — one file per 02 §4 family
├── serve/          projection.py (cards, profiles, cluster_cards),
│                   graph.py (graph_run_metrics, points, clusters,
│                   semantic_neighbors), serving.py (03 §4.3 control),
│                   cohort.py (04 §5.1), auth.py (Better Auth placeholder)
└── shared/         enums.py (generated from db/schema/enum-codes.yaml),
                    identifiers.py (CorpusId/ConceptId NewTypes),
                    jsonb_payloads.py (small JSONB Pydantic models)
```

Co-location rules: one file per **family**, not per table; no
business logic in `engine/app/models/` (SQL templates and transforms
live in `engine/app/projection/`, `engine/app/ingest/`); enum models
are SMALLINT-coded `IntEnum` generated from `db/schema/enum-codes.yaml`
per `02 §0.10`.

**locked** for the split; **provisional** for per-family file
partitioning — revisit if any single file passes ~600 lines.

### 4.5 Example boundary model

```python
# engine/app/models/serve/projection.py (slice)
from uuid import UUID
from pydantic import BaseModel, ConfigDict

class PaperApiCard(BaseModel):
    """Mirrors solemd.paper_api_cards (03 §4.2). Field order matches the
    table's MAXALIGN declaration so to_copy_tuple lines up with INCLUDING
    ALL stage tables (04 §3.2). frozen=True trips pydantic-core's faster
    slot path; safe because boundary models are read-then-passed, never
    mutated."""
    model_config = ConfigDict(frozen=True, str_strip_whitespace=False)

    corpus_id: int
    current_graph_run_id: UUID | None
    citation_count: int
    influential_citation_count: int
    publication_year: int | None
    package_tier: int
    text_availability: int
    article_type: int | None
    language: int | None
    is_retracted: bool
    has_full_grounding: bool
    display_title: str
    author_line: str | None
    venue_display: str | None
    external_ids: dict | None  # small JSONB; 03 §4.2 keeps it < 4 KB
```

COPY consumer (sketch): worker calls
`admin_conn.copy_records_to_table("paper_api_cards_next",
schema_name="solemd", records=to_copy_records(models, COLUMNS),
columns=COLUMNS)` where `COLUMNS` is the MAXALIGN-ordered tuple of
column names matching the model's field order.

## §5 FastAPI app shape — `graph-engine-api`

`graph-engine-api` is the always-up FastAPI service per `00 §1`. It
opens `serve_read` and `admin` pools at startup, drains them on
shutdown, and exposes pools to handlers via dependency injection.

### 5.1 Lifespan contract

```python
# engine/app/api/main.py — sketch
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.db.pools import open_pools


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan owns serve_read + admin pools (events doc:
    https://fastapi.tiangolo.com/advanced/events/). Pool.close() waits
    for in-flight to drain. Hard kill falls back on asyncpg's per-conn
    GC cleanup — not graceful but never corrupts."""
    pools = await open_pools(("serve_read", "admin"))
    app.state.serve_read_pool = pools["serve_read"]
    app.state.admin_pool      = pools["admin"]
    try:
        yield
    finally:
        await pools["serve_read"].close()
        await pools["admin"].close()


app = FastAPI(lifespan=lifespan, title="graph-engine-api")
```

Two reasons not to use module-level pool globals:
- `uvicorn --reload` re-imports the module without re-running the
  lifespan, leaking the pool. Lifespan ties pool lifetime to app
  instance lifetime, which `--reload` honors.
- Test fixtures (§9.5) override the lifespan to inject Testcontainers
  pools without touching app code.

### 5.2 Dependency injection

```python
# engine/app/api/dependencies.py — sketch
from typing import Annotated
import asyncpg
from fastapi import Depends, Request

async def get_serve_read_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.serve_read_pool

async def get_admin_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.admin_pool

ServeReadPool = Annotated[asyncpg.Pool, Depends(get_serve_read_pool)]
AdminPool     = Annotated[asyncpg.Pool, Depends(get_admin_pool)]
```

Handlers consume `pool: ServeReadPool` and use `async with
pool.acquire() as conn` to scope the connection to the request.
Result rows pass through `from_records(rows, PaperApiCard)` (§4.1)
before serialization.

### 5.3 Admin dependency boundary

The admin pool is privileged, but the enforcement point is static, not
runtime:

- Only handlers under `engine/app/api/admin/` may import or declare
  `AdminPool`.
- Non-admin route modules use `ServeReadPool` only.
- Review + lint enforce the directory boundary; the dependency itself
  stays a thin accessor with no runtime module introspection.

This keeps the request path free of policy plumbing that is cheaper to
enforce structurally. If an admin-only operation later needs to move
outside `app/api/admin/`, that is handled as an explicit architecture
change rather than a hidden runtime exception path.

### 5.4 No long-running background tasks

FastAPI's `BackgroundTasks` and route-bound `asyncio.create_task` are
**not** the place for projection / ingest / archive work. Those go
to Dramatiq (§6) so:

- The HTTP request returns promptly.
- Crash recovery is governed by `04 §10` and `05 §9` rather than
  the worst-case "FastAPI process died mid-projection" path.
- Time limits and retries are first-class (Dramatiq actor decorator).

`BackgroundTasks` is acceptable for tiny post-response side effects
(< 100 ms, no DB write) — Prometheus metric flushes, structured-log
finalize. Anything heavier crosses the Dramatiq boundary.

### 5.5 Observability hooks at the FastAPI layer

`10-observability.md` owns dashboards. This layer must surface:
- `serve_read_pool_acquire_latency_seconds` — histogram, no labels;
  collected via a pool wrapper that times `pool.acquire()`.
- `request_pool_in_use_connections` — gauge per pool, scraped from
  `pool.get_size() - pool.get_idle_size()`.
- `request_query_duration_seconds` — histogram, `route` label,
  emitted by a thin asyncpg query wrapper.
- OpenTelemetry tracing wired in `app/api/_otel.py` per `10`.

This doc names the requirement; the wrapper code lives in `10`.

## §6 Dramatiq AsyncIO worker shape — `graph-worker`

`graph-worker` is the on-demand CUDA / RAPIDS worker per `00 §1`.
Dramatiq 2.x ships AsyncIO middleware as a built-in
(`dramatiq.middleware.AsyncIO`; user-guide cookbook example
<https://dramatiq.io/cookbook.html>; module source
<https://dramatiq.io/_modules/dramatiq/middleware/asyncio.html>).
One event-loop thread per worker process; async actors first-class.

### 6.1 Broker + middleware bootstrap

```python
# engine/app/workers/_broker.py — sketch
import dramatiq
from dramatiq.brokers.redis import RedisBroker
from dramatiq.middleware import AsyncIO, Retries, TimeLimit, ShutdownNotifications

from app.config import settings


def configure() -> dramatiq.Broker:
    broker = RedisBroker(url=settings.redis_url, namespace="solemd-graph")
    # AsyncIO MUST be added before any actor module is imported (cookbook:
    # https://dramatiq.io/cookbook.html). It creates one event-loop thread
    # per worker process at before_worker_boot.
    broker.add_middleware(AsyncIO())
    # Default retries with exponential backoff; per-actor max_retries on
    # the decorator overrides where needed (§6.4).
    broker.add_middleware(Retries(max_retries=3, min_backoff=1_000, max_backoff=60_000))
    broker.add_middleware(TimeLimit())                # enforces per-actor time_limit
    broker.add_middleware(ShutdownNotifications())    # SIGTERM drain hook
    dramatiq.set_broker(broker)
    return broker
```

### 6.2 Process boot — open pools once

A custom `WorkerPoolBootstrap(Middleware)` added immediately after
`AsyncIO()` calls `open_pools(self._pool_names)` inside
`before_worker_boot` (and closes them in `after_worker_shutdown`).
The middleware runs the coroutine on the AsyncIO middleware's
event-loop thread via `asyncio.run_coroutine_threadsafe` — the only
clean way to call an async function from Dramatiq's sync hook.

Each worker process gets its own pool set in a process-local
`_POOLS: dict[PoolName, Pool]`. Actors fetch pools via a `get_pool(name)`
accessor; module-level dicts are safely process-local because Dramatiq
pre-forks per worker.

### 6.3 Worker process count

One process per worker class on the RTX 5090 host:

| Worker (`engine/app/workers/…`) | Pools | Count |
|---|---|---:|
| `ingest.py` | `ingest_write` | 1 (one ingest at a time per release; `05 §10.1`) |
| `chunker.py` | `ingest_write` | 1 (post-publish evidence-unit assembly actor; `05a §6.2`) |
| `projection.py` | `warehouse_read`, `serve_read`, `admin` | 1 (advisory lock per family; `04 §9.1`) |
| `wiki.py` | `admin` | 1 (wiki sync/activation actor; stages and activates `wiki_pages`; `05d §5`) |
| `rag.py` | `serve_read` | 1 (owns the RTX 5090 RAPIDS context) |
| `maintenance.py` | `admin` | 1 (cron-trigger; no GPU) |

Pool sharing: within a process, pools are shared across all asyncio
tasks (asyncpg pool is concurrent-safe; AsyncIO middleware's single
event-loop thread serializes scheduling, but parallelism comes from
`Pool.acquire()` returning distinct physical connections). Across
processes, never share — each process opens its own physical
connections, and RAPIDS / CUDA contexts cannot share across
processes anyway.

This is intentionally narrow. A second projection process would
force a re-think of the per-family advisory lock (`04 §9.1`), which
is process-scoped via the pinned admin connection.

The wiki worker is separate from `maintenance.py` because wiki
activation is user-visible content publication, not housekeeping. It
owns the Dramatiq queue that records `wiki_sync_runs`, stages
`wiki_pages`, and activates the new request-path set without exposing a
partial sync to readers.

### 6.4 Actor decorator pattern

```python
# engine/app/workers/projection.py — sketch
import dramatiq
from app.workers._boot import get_pool
from app.projection.cohort import CohortManifest
from app.projection.runner import project_cohort


@dramatiq.actor(
    queue_name="projection",
    max_retries=2, min_backoff=10_000, max_backoff=600_000,
    # 6 h ceiling: rolls up per-family stage builds (04 §3.4); when a
    # single family is expected to exceed the budget, the worker splits
    # the cohort and enqueues sub-cohort actors (04 §5.4 resume safety).
    time_limit=6 * 60 * 60 * 1000,
)
async def project_cohort_actor(serving_run_id: str, manifest_payload: dict) -> None:
    manifest = CohortManifest.model_validate(manifest_payload)
    await project_cohort(
        serving_run_id=serving_run_id, manifest=manifest,
        serve_read_pool=get_pool("serve_read"),
        admin_pool=get_pool("admin"),
        warehouse_read_pool=get_pool("warehouse_read"),
    )
```

Per-actor `time_limit` overrides Dramatiq's 10-minute default
(<https://oneuptime.com/blog/post/2026-01-24-python-task-queues-dramatiq/view>).
Per-family `CREATE INDEX` runs inside the actor on the admin pool with
`command_timeout=None` (§2.2); the actor's `time_limit` is the hard
ceiling. The archive actor (`04 §7.2`, post-publish parquet write)
takes `time_limit=10 * 60_000` and `max_retries=3`.

Retry semantics:
- Projection actor: idempotent under same-`serving_run_id` resume
  (`04 §5.4`); `max_retries=2` so a second failure surfaces to
  operators rather than thrashing.
- Ingest actor: idempotent under same-`(source_code, release_tag)`
  resume (`05 §7`); same `max_retries=2`.
- Archive actor: idempotent (`04 §10.5`); `max_retries=3` (small,
  cheap to retry).

### 6.5 Sync vs async actors

Dramatiq permits mixing — sync actors run on the worker thread pool,
async actors land on the AsyncIO middleware's loop thread (cookbook
example: <https://dramatiq.io/cookbook.html>). We default to async
for everything that does PG I/O (asyncpg). Sync actors are reserved
for CPU-only RAPIDS kernels that don't touch PG and benefit from
the worker thread pool's true parallelism.

### 6.6 Dramatiq + Redis broker tuning

Per `00 §1`, Redis is the broker. Connection-string assembled from
`REDIS_URL`. Defaults:
- Heartbeat timeout: Dramatiq default (60 s).
- Dead-letter TTL: 7 days (matches `solemd.api_projection_runs` /
  `solemd.ingest_runs` retention).
- Maintenance chance: Dramatiq default (16).

Concrete tuning lives in `09-tuning.md`. **provisional**.

## §7 Connection strings & secrets

### 7.1 PG roles

Per-role users on each cluster, with grants enumerated in
`12-migrations.md`. This doc names the contract.

| Role | Cluster | Grants |
|---|---|---|
| `engine_ingest_write` | warehouse | INSERT, COPY on `solemd.*` and `pubtator.*` raw + canonical tables; UPDATE on `ingest_runs` / `source_releases`; SELECT on lookup-cache source tables (`papers`, `concept_xrefs`); CREATE on `solemd.*` for UNLOGGED partition state changes (`05 §4.5` SET LOGGED). |
| `engine_warehouse_read` | warehouse | SELECT on `solemd.*` and `pubtator.*`; **no** INSERT / UPDATE / DELETE / CREATE. Default `transaction_read_only = on` belt-and-braces. |
| `engine_serve_read` | serve | SELECT on `solemd.*` projection + control tables; UPDATE on `solemd.api_projection_runs.*` for the projection worker's pre-flight audits / status counters; **no** DDL. Mapped to `pgbouncer-serve`'s `auth_query` allowlist. |
| `engine_admin` | serve | All of `engine_serve_read` plus CREATE / ALTER / DROP / COPY on `solemd.*`; UPDATE on `solemd.active_runtime_pointer`; INSERT on `solemd.serving_runs` / `serving_artifacts`. **Never** added to PgBouncer's `auth_query` allowlist (`04 §4.2`). |
| `warehouse_grounding_reader` | warehouse | SELECT on the FDW-exposed grounding tables only (`03 §3.2`). Used by serve's FDW user-mapping; not opened directly from Python. |

### 7.2 DSN env vars

```
WAREHOUSE_DSN_INGEST   = postgresql://engine_ingest_write@graph-db-warehouse:5432/warehouse?application_name=ingest-worker
WAREHOUSE_DSN_READ     = postgresql://engine_warehouse_read@graph-db-warehouse:5432/warehouse?application_name=projection-worker-read
WAREHOUSE_DSN_ADMIN    = postgresql://engine_warehouse_admin@graph-db-warehouse:5432/warehouse?application_name=schema-migrations
SERVE_DSN_READ         = postgresql://engine_serve_read@pgbouncer-serve:6432/serve?application_name=engine-api
SERVE_DSN_ADMIN        = postgresql://engine_admin@graph-db-serve:5432/serve?application_name=projection-worker-admin
REDIS_URL              = redis://graph-redis:6379/0
```

Rules:
- DSNs are read by `app/config.py` at startup via Pydantic
  `BaseSettings`. The `application_name` query parameter is **always
  set** so `pg_stat_activity` triage can attribute every connection
  to a process / pool (`05 §6.3`).
- The DSN inventory is a contract, not a convenience. Admin, migration,
  cutover, and schema-changing paths use the direct `*_ADMIN` surfaces.
  Pooled request-path reads use `SERVE_DSN_READ`. App-path DSNs are never
  reused for DDL.
- Passwords come from environment, never the URL. Dev: `.env` via
  `direnv` with `op run` (1Password) per `research-distilled §7`.
  Prod: same shape, different secrets manager.
- `pg_hba.conf` on warehouse PG locks each role to its expected
  source — `engine_ingest_write` only from `graph-worker` host;
  `engine_warehouse_read` only from `graph-worker` host; serve roles
  only from `graph-engine-api` and `graph-worker`. Specifics in
  `09-tuning.md`. Canonical repo-owned paths are
  `db/conf/warehouse_hba.conf` and `db/conf/serve_hba.conf`.

### 7.3 Settings model

`engine/app/config.py` exposes a `Settings(BaseSettings)` with
DSN fields aliased to `WAREHOUSE_DSN_INGEST` / `WAREHOUSE_DSN_READ`
/ `WAREHOUSE_DSN_ADMIN` / `SERVE_DSN_READ` / `SERVE_DSN_ADMIN`
/ `REDIS_URL` and pool-size fields with defaults from the §2.1
68 GB column (`pool_ingest_min=8,
pool_ingest_max=64, pool_warehouse_read_min=2, pool_warehouse_read_max=8,
pool_serve_read_min=2, pool_serve_read_max=16, pool_admin_min=1,
pool_admin_max=2`). `model_config = SettingsConfigDict(env_file=".env",
extra="ignore")`. `settings = Settings()` is module-global; constructed
once per process.

### 7.4 Tests

Tests **never** read `os.environ` from inside test code. The
session-scoped Testcontainers fixture (§9.1) writes ephemeral DSNs
into a per-test-session `Settings`-shaped object that the engine
reads via `app.config.settings` after a context-manager-style
override. Real-process `.env` files are unaffected.

## §8 Migrations runner contract

`engine/db/scripts/schema_migrations.py` is the current executor /
ledger baseline. This section is the authoritative contract it must
satisfy as the bottom-up rebuild lands.

| Property | Value |
|---|---|
| **Authoring tool** | Ordered PostgreSQL SQL under `db/schema/{warehouse,serve}/` per `02 §0.10` and `12`. |
| **Executor** | `engine/db/scripts/schema_migrations.py` — sync, psycopg3-based per §3. |
| **Ledger table** | `solemd.schema_migration_ledger` on each cluster (one ledger per cluster). Records `migration_name`, `migration_file`, `checksum_sha256`, `execution_mode` (`transactional` | `autocommit`), `status`, `sql_bytes`, `applied_at`, `applied_by`, `applied_via`, `notes`, `error_message`, `recorded_at`, `updated_at`. |
| **Execution mode** | `transactional` (default) or `autocommit` (when SQL contains `CREATE INDEX CONCURRENTLY`, `ALTER TABLE … SET LOGGED`, `VACUUM`, etc. — full marker list in the existing file). |
| **Adopt vs apply** | `adopt` records the file as already-applied without running it for pre-existing schema or orphan-ledger repair; `apply` runs the migration against the cluster. Fresh rebuilds do not adopt the archived legacy chain. `verify` compares ledger and on-disk files; `--check` exits non-zero on drift. |
| **Idempotency** | Re-running a migration is a no-op when the ledger already records `status='applied'` and `checksum_sha256` matches. Mismatches raise `ChecksumMismatch` and refuse to re-apply silently. |
| **Per-cluster invocation** | `python -m engine.db.scripts.schema_migrations apply --cluster warehouse|serve`. The command resolves the right DSN from `SERVE_DSN_ADMIN` or `WAREHOUSE_DSN_ADMIN`; app-path DSNs (`WAREHOUSE_DSN_INGEST`, `WAREHOUSE_DSN_READ`, `SERVE_DSN_READ`) are never reused for DDL. |
| **Async in scope** | None today — the runner is sync because (a) it is invoked from the shell or CI, not inside an event loop, and (b) `CREATE INDEX CONCURRENTLY` semantics make sync the simpler shape. asyncpg-conversion is **deferred** until a runtime path (rather than a CLI path) needs migrations. |

The `MigrationFile`, `MigrationFileRecord`, `MigrationLedgerRecord`,
`MigrationReadinessReport`, `MigrationApplyReport`,
`MigrationAdoptionReport` types should remain `ParseContractModel`
surfaces so the runner stays aligned with §4's Pydantic-at-the-boundary
rule. **locked** for the contract; the implementation is expected to
converge to it.

## §9 Testing

Testcontainers is the substrate. No mocks for PG — every test that
touches PG hits a real container. (Mocks for OpenSearch / Redis are
allowed and governed by the contracts in `07` and the worker tests.)

### 9.1 Session-scoped fixtures: two PG containers

```python
# engine/test/conftest.py — sketch
import pytest, pytest_asyncio
from testcontainers.postgres import PostgresContainer

PG_IMAGE = "postgres:18-alpine"   # pinned by 00 §1 / 09-tuning.md

@pytest.fixture(scope="session")
def warehouse_container() -> PostgresContainer:
    """driver=None so testcontainers doesn't try to open a sync sqlalchemy
    engine against the container
    (https://github.com/testcontainers/testcontainers-python/issues/263)."""
    c = PostgresContainer(PG_IMAGE, driver=None,
                          username="warehouse_admin", password="test_warehouse",
                          dbname="warehouse")
    c.start(); yield c; c.stop()

# Identical shape for serve_container.

@pytest.fixture(scope="session")
def test_settings(warehouse_container, serve_container) -> Settings:
    """Per-session Settings constructed from container DSNs. Tests never read
    os.environ for these values (§7.4 rule). Pool sizes shrunk for the tiny
    Testcontainers PG max_connections."""
    return Settings(WAREHOUSE_DSN_INGEST=..., SERVE_DSN_ADMIN=..., ...)

@pytest_asyncio.fixture(scope="session")
async def session_pools(test_settings):
    """Apply schema once via the §8 migrations runner against each container,
    then open the four pools and reuse across the session."""
    from engine.db.scripts.schema_migrations import apply_all
    apply_all(cluster="warehouse", dsn=test_settings.warehouse_dsn_ingest)
    apply_all(cluster="serve",     dsn=test_settings.serve_dsn_admin)
    pools = await open_pools(("ingest_write", "warehouse_read", "serve_read", "admin"))
    yield pools
    for p in pools.values():
        await p.close()
```

### 9.2 Function-scoped transactional rollback

```python
# engine/test/conftest.py — continued
@pytest_asyncio.fixture
async def serve_conn(session_pools):
    """BEGIN; … ROLLBACK; isolation. Use for any read/write test that does
    not need visibility across connection boundaries."""
    async with session_pools["admin"].acquire() as conn:
        tx = conn.transaction(); await tx.start()
        try: yield conn
        finally: await tx.rollback()

# warehouse_conn: same shape, against session_pools["ingest_write"].
```

### 9.3 Opt-out for tests that exercise DDL / advisory locks / swap

A `serve_fresh_conn` fixture yields a non-transactional connection
because (a) `04 §3` stage-and-swap renames need real commit
visibility, (b) `04 §9` advisory locks are session-scoped and a
transaction wrapper would hide them, and (c) `12-migrations.md`
DDL paths must run outside a wrapping transaction.

These tests must clean up after themselves — there is no rollback
safety net. Convention: serial DDL tests live under
`engine/test/integration/ddl/` and run via
`pytest -p no:xdist engine/test/integration/ddl/` in CI. The plain
transactional fixture covers ~95 % of test shapes.

### 9.4 Pydantic v2 model unit tests

Pure-schema models test with `model_validate(raw_dict)` directly —
no Testcontainers spin-up needed. A round-trip check
(`model.model_dump(mode='python')`) confirms `to_copy_records` will
emit the right tuple for the COPY consumer (§4.2).

### 9.5 FastAPI app under test

A pytest fixture overrides `app.state.serve_read_pool` /
`app.state.admin_pool` with the session pools and yields an
`httpx.AsyncClient(transport=ASGITransport(app=app))`. The lifespan
context never runs (the test fixture is the lifespan equivalent), so
test pools are not double-opened.

### 9.6 Directory layout

```
engine/test/
├── conftest.py                  # session pools, transactional fixtures, opt-outs
├── models/                      # pure Pydantic v2 unit tests, no DB
├── db/                          # asyncpg-against-Testcontainers integration
│   ├── test_pools.py
│   └── test_boundary.py
├── ingest/                      # 05 ingest pipeline behaviors
├── projection/                  # 04 projection-contract behaviors
├── api/                         # FastAPI handlers via httpx ASGITransport
└── integration/
    └── ddl/                     # serial DDL / swap / advisory-lock tests
```

**locked** for fixture contract; **provisional** for the directory
split (current repo has flatter `engine/test/test_*.py`; the new
split is the target as new tests land).

## §10 Observability hooks

This doc emits the requirements `10-observability.md` must surface
for the Python layer.

### 10.1 Pool-level metrics

`asyncpg_pool_size` (gauge, `pool_name`),
`asyncpg_pool_idle` (gauge, `pool_name`),
`asyncpg_pool_acquire_duration_seconds` (histogram, `pool_name`),
`asyncpg_pool_acquire_failures_total` (counter, `pool_name` +
`failure_class` ∈ {`timeout`, `pool_closed`, `connection_lost`}),
`asyncpg_query_duration_seconds` (histogram, `pool_name` + `op` ∈
{`fetch`, `execute`, `copy`}).

The instrumenting wrapper lives in `app/db/_instrumented.py` (created
in `10`'s PR); `app/db/pools.py` returns wrapped pools when the OTel
layer is configured.

### 10.2 Actor-level metrics

Inherits Dramatiq's built-in Prometheus middleware where available:
`dramatiq_actor_invocations_total` (counter, `actor_name` +
`outcome`), `dramatiq_actor_duration_seconds` (histogram,
`actor_name`), `dramatiq_actor_retries_total` (counter, `actor_name`),
`dramatiq_in_flight_messages` (gauge, `actor_name`). `10` ties
these into Grafana dashboards and alert rules.

### 10.3 Structured logging

JSON log lines on stderr; Alloy → Loki per `research-distilled §7`.
Required event fields: `pool_name` on every pool-acquire / query log;
`actor_name`, `message_id`, `serving_run_id` / `ingest_run_id` on
every actor log; `request_id`, `route`, `corpus_id` on every FastAPI
access log. Wired via `structlog` + `logging-json` in `app/logging.py`.

## §11 Failure modes

### 11.1 Pool exhaustion

`TooManyConnectionsError` or `acquire()` blocking past
`command_timeout`. Causes: connection held across a slow external
`await` (typical: OpenSearch — fix by releasing first); `max_size`
under traffic (raise in `09-tuning.md`); leaked acquire (lint:
require `async with pool.acquire() as conn` outside `app/db/`).
Recovery: `Pool.expire_connections()`, worst case restart FastAPI.

### 11.2 Dropped connections

`ConnectionDoesNotExistError` / `InterfaceError`. Causes: PG
restart, network blip, PgBouncer recycle on health-check
(`04 §4.1`). Recovery: asyncpg `init` runs again on the next
physical connection — codecs re-register transparently. The query
fails once; Dramatiq actors retry per `Retries` middleware default
(§6.1), FastAPI handlers return 503 with a structured error body.
**locked**.

### 11.3 Advisory-lock starvation

Per `04 §9.1` / `05 §10.1`, advisory locks are session-scoped on
pinned admin connections. Starvation is bounded by
`pg_try_advisory_lock` — the second worker fails fast, logs,
exits. Python contract: the actor holding the lock must
`pool.acquire()` once at the top of the family loop and pass
`conn` down to helpers; never release-and-reacquire mid-section.
**locked**.

### 11.4 Asyncio cancellation propagation

asyncpg honors task cancellation; in-flight `fetch` raises
`asyncio.CancelledError` at the `await` boundary. The pool's
`reset` coroutine on release defaults to
`pg_advisory_unlock_all(); CLOSE ALL; UNLISTEN *; RESET ALL;`
(asyncpg API ref). Cancellation mid-COPY aborts the COPY cleanly —
resume per `05 §9.1` (TRUNCATE partition, re-COPY). Cancellation
mid-swap (`04 §3.5`) rolls the whole transaction back; pointer
untouched, `_next` fully built and retry-ready. Safety is
by-construction: every command uses `async with`, never bare
`acquire()`. **locked**.

### 11.5 Pydantic validation errors at boundary

`pydantic.ValidationError` from `from_record` / `model_validate`
indicates schema drift (PG migration added a column; model not
updated), a nullable column returning `None` where the model
declared required, or a custom codec returning an unexpected type.
Policy: validation errors at read time are **fatal** — log
`{model, column, error}`, return 500 from FastAPI, raise non-retryable
`SchemaContractError` from Dramatiq actors so the dead-letter queue
catches it for operator triage instead of retries hammering.
**locked**.

## §12 Performance budgets

Concrete targets to validate at first sample build. **provisional**
until measured; baselines for `10-observability.md` SLOs.

| Surface | Target |
|---|---|
| Pool acquire `serve_read` (through PgBouncer) | p50 < 200 µs, p99 < 2 ms |
| Pool acquire `admin` (direct) | p50 < 100 µs, p99 < 1 ms |
| Pool acquire `warehouse_read` (direct) | p50 < 200 µs, p99 < 2 ms |
| Pool acquire `ingest_write` (direct, hot during ingest) | p50 < 500 µs, p99 < 5 ms |
| `model_validate(dict)` on `PaperApiCard` (~16 primitive fields) | 5–15 µs / call (Pydantic perf docs: <https://docs.pydantic.dev/latest/concepts/performance/>) |
| `model_dump(mode='python')` on same | 3–8 µs / call |
| COPY tuple generator end-to-end | ≥ 200 k rows/s through Pydantic; PG-side COPY caps at 250–400 k rows/s (`05 §6.5`) so Pydantic is not the bottleneck |
| Ingest worker COPY | ≥ 250 k rows/s per partition (`05 §6.5`); aggregate 5–10 M rows/s |
| Projection worker COPY | ≥ 200 k rows/s sustained |
| FastAPI cards-list (index-only scan) | p95 < 25 ms end-to-end (pool acquire + validate) |
| FastAPI paper detail PK lookup | p95 < 15 ms |
| FastAPI graph bootstrap (two single-row reads) | p95 < 5 ms |

Pool-acquire targets assume a warm pool (`min_size` conns already
open). Cold-start acquire is one PG handshake — typically 5–15 ms;
not in the target. FastAPI numbers per `03 §7.1`.

## Cross-cutting invariants

1. **One pool factory.** All pools open through `app/db/pools.py`.
   Lint rule: any `asyncpg.create_pool` outside `app/db/pools.py`
   fails CI.
2. **One boundary helper.** All Record → Model and Model → tuple
   conversions go through `app/db/boundary.py`. Lint rule: any
   call to `model.model_dump(mode='json')` on hot-path code paths
   fails CI.
3. **Pools never escape their owning process.** No pool reference
   sits in module-global state outside `app/db/pools.py` (FastAPI
   side: `app.state.*_pool`; Dramatiq side: `app/workers/_boot.py`
   `_POOLS` dict).
4. **DSNs read once at startup.** `Settings()` is constructed once
   per process; `WAREHOUSE_DSN_*` / `SERVE_DSN_*` are never read
   from `os.environ` after process boot.
5. **No pool / connection used across processes.** Dramatiq
   pre-fork model means each child owns its own physical connections.
6. **Async actors only for PG-touching work.** Sync actors are for
   CPU-only kernels.
7. **No mocks for PG.** Every test that touches PG hits a
   Testcontainers PG.
8. **`application_name` on every connection.** `pg_stat_activity`
   triage is a first-class debugging surface.

## Write patterns

**Ingest worker** opens `ingest_write` only; one `Pool.acquire()`
per partition coroutine (32 in flight at peak per `05 §6.3`); bulk
via `copy_records_to_table` (`05 §4.3`); control-row UPDATEs on
`ingest_runs` via `execute` with positional binds.

**Projection worker** opens `warehouse_read`, `serve_read`, `admin`;
reads warehouse via `warehouse_read.acquire()`; stage-table COPY
into serve via `admin.acquire()` (`04 §3.3`, `04 §4.2`); pre-flight
audits / status counters via `serve_read.acquire()`; the swap
transaction (`04 §3.5`) holds one pinned `admin` connection across
the full family lifecycle (advisory lock + stage + swap + ledger).

## Read patterns

**Engine API** uses `serve_read` only on the read path; one
`pool.acquire()` per request, released via `async with`. No N+1 —
every endpoint is one PK lookup, one covering-index scan, or one
bounded FDW dereference. Active-pointer
(`solemd.active_runtime_pointer`) is read once per request when
needed; cache TTL ≤ 1 s in-process for the cache-warming path
(**provisional** — drop if PG-side `pg_prewarm` hit rate makes it
irrelevant).

**Projection worker reads** the warehouse cohort-build SQL via
`warehouse_read`; `02 §4.7` graph-build outputs via `warehouse_read`
for `04 §2.4` validation; `serving_members` / `serving_cohorts` on
`serve_read` for cohort identity resolution.

## §N Decisions — locked / provisional / deferred

### Locked now

| Decision | Rationale |
|---|---|
| Four asyncpg pools by role (`ingest_write`, `warehouse_read`, `serve_read`, `admin`) | Each pool keyed to one role + one target + one pooler decision; matches `00 §1`, `04 §4`, `05 §6.3`. |
| asyncpg on every hot path; psycopg3 only for sync admin | `research-distilled §3`; binary protocol + `copy_records_to_table` are the difference at TB scale. |
| No SQLAlchemy / SQLModel / Piccolo anywhere in the engine | Pydantic v2 + raw SQL gives us the typed-row contract without ORM tax. |
| Pydantic v2 at the DB boundary; `from_record` + `to_copy_records` helpers | Single boundary, native types preserved via `mode='python'`, Rust-core perf. |
| Codec setup in `init` (not `setup`) — runs once per physical connection | asyncpg API ref; cheaper than re-registering on every acquire. |
| pgvector codec only on pools that touch warehouse `paper_embeddings_graph` | `serve_read` has no pgvector columns day one (`03 §0.7`). |
| jsonb codec uses `json.loads` / `json.dumps` in text format | asyncpg jsonb is text-format on the wire; `dict` round-trip is the right shape. |
| FastAPI lifespan owns serve_read + admin pools; surfaced via `Annotated[Pool, Depends]` | Tied to app instance lifetime; `--reload` honors close + reopen. |
| Admin pool is reserved for `engine/app/api/admin/` handlers and worker-side swap / index paths | Keeps privileged connections out of the public request surface without adding runtime introspection to hot paths. |
| Long-running work goes to Dramatiq, not FastAPI BackgroundTasks | Time limits, retries, crash recovery are first-class on Dramatiq. |
| Dramatiq AsyncIO middleware shipped in core (`dramatiq.middleware.AsyncIO`) | Cookbook example; one event-loop thread per worker process. |
| WorkerPoolBootstrap middleware opens pools at process boot, drains at shutdown | Mirrors FastAPI lifespan; pre-fork model means each process owns its own pools. |
| One worker process per GPU; never share asyncpg pools across processes | RAPIDS / CUDA contexts cannot share across processes; bounds pool fan-out. |
| Async actors for PG-touching work; sync actors for CPU-only kernels | AsyncIO middleware composes with asyncpg natively. |
| Per-role PG users with explicit grants; DSNs from env at startup | `pg_hba.conf` enforces source-host scoping; no shared `postgres` account. |
| `application_name` query parameter on every DSN | First-class debugging surface for `pg_stat_activity`. |
| `engine/db/scripts/schema_migrations.py` stays the executor / ledger | SQL-first schema/migration files author the DB; runner applies + records. Current code is reusable inventory, but the contract remains doc-led. |
| No-mocks-for-PG rule in tests | Real Testcontainers PG everywhere; mocks are reserved for OpenSearch / Redis. |
| Session-scoped two-cluster Testcontainers fixture | Apply schema once per session; reuse across tests. |
| Function-scoped `BEGIN; … ROLLBACK;` for test isolation | Standard 2026 Testcontainers pattern. |
| Opt-out fresh connection (`@pytest.mark.serial`) for DDL / swap / advisory-lock tests | Transaction wrapper hides session-scoped advisory locks; DDL needs real commit visibility. |
| Pydantic v2 model unit tests run without a DB | `model_validate` directly; no Testcontainers spin-up cost. |

### Provisional (revisit after first sample build)

| Decision | Revisit trigger |
|---|---|
| Per-pool sizes at 68 GB / 128 GB | Real concurrency observed on ingest / projection / serve. |
| `serve_read` `command_timeout = 5 s` | Real p99 OLTP measurement; tighten if 250 ms `statement_timeout` proves enforceable upstream. |
| `admin` pool `min=1, max=2` | Bulk index-build durations; second slot may need to be 4 if `pg_prewarm` overlap is hot. |
| `statement_cache_size=128` on `warehouse_read` and `admin` | `pg_stat_statements` showing parse-cost as a non-trivial line. |
| Projection actor `time_limit=6 h` | Real cohort-build wall-clock. |
| Pydantic boundary throughput targets (5–15 µs / call) | Profile against real models at 14 M-row scale. |
| Pool-acquire p50 / p99 budgets | First production-shape load test. |
| Active-pointer in-process cache TTL ≤ 1 s | `pg_prewarm` hit rate may make it irrelevant. |
| Per-family file partitioning under `engine/app/models/` | Revisit if any single file exceeds ~600 lines. |

### Deferred (trigger-gated)

| Decision | Trigger |
|---|---|
| asyncpg-conversion of `engine/db/scripts/schema_migrations.py` | A runtime path (rather than a CLI path) needs migrations. |
| SQLAlchemy 2.x async adoption | Hard "no" today — would require a directional reversal of `research-distilled §3`. |
| psycopg3 pipeline-mode adoption on FastAPI handlers | asyncpg latency proves insufficient on a measured hot path that pipelining could close. |
| LISTEN/NOTIFY-driven actor enqueue (replace pg_cron polling) | `04` / `05` open items resolved. |
| Per-handler asyncpg `Connection` codec overrides | A read path needs a non-default jsonb decoder (e.g., `orjson` for hot JSONB columns). |
| OpenTelemetry exporter from asyncpg → Langfuse | End-to-end DB + LLM trace correlation per `00 §6` deferred. |
| Pool-warmer that pre-prepares hot statements at FastAPI lifespan start | First measurement of cold-cache p99 spikes. |
| Multi-process coordination of `admin` pool (more than one projection process) | Today bounded by `04 §9.1` advisory lock semantics; would require lock-key extension. |
| Per-process Pydantic model warmup (`Model.model_rebuild()` at startup) | Cold-import latency on first FastAPI request becomes a measured issue. |

## Open items

Forward-tracked; none block subsequent docs:

- **Pool-acquire wrapper** — code in §10.1 lives in
  `10-observability.md`'s PR; resolves when `10` lands.
- **`engine/app/models/` directory split rollout** — incremental
  migration as new ingest / projection models land; no big-bang
  rename of the existing `engine/app/codeatlas_eval/`,
  `engine/app/rag/` trees.
- **Better Auth Pydantic models** — `auth/` placeholder (§4.4)
  empty day one; populated when `13-auth.md` lands.
- **Sync actor inventory** — every actor is async today; if a
  CPU-only RAPIDS kernel proves to need sync threading parallelism,
  it lands under `engine/app/workers/cuda_kernels.py`.
- **OTel pool wrapper × `init` codecs** — when the `10` wrapper
  materializes, verify wrapped `Pool.acquire` preserves the
  `init`-registered codecs on the wrapped connection. Should be
  transparent (asyncpg's pool returns the same `Connection` that
  ran `init`); flagged as a follow-up test in `10`.

No contradictions discovered with `00–05` or `research-distilled.md`.

The one deliberate simplification in this revision is that §5.3 keeps
the admin dependency boundary structural rather than runtime-enforced:
directory ownership, review, and lint carry the policy, while
`get_admin_pool` remains a thin accessor.
