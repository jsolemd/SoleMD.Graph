# 13 — Auth & User Data Plane

> **Status**: deferred. The auth plane is intentionally **not** part of the
> day-one backend implementation. What is locked here is the deferral boundary
> and the later activation path, so the rebuilt backend stays auth-aware
> without dragging auth-specific tables, roles, or DSNs into unrelated slices.
>
> **Date**: 2026-04-17
>
> **Scope**: the future serve-cluster auth plane only. Owns the reserved `auth`
> schema boundary, the later Better Auth integration path, the cross-schema
> relationship rule for future app-owned user tables, and the activation order.
>
> **Authority**: this doc is authoritative only when auth activates. Until
> then, `03 §4.4` is the only live auth-facing structural surface: an empty
> reserved schema.

## Purpose

The goal is not to implement auth now. The goal is to avoid painting the
backend into a corner.

That means the auth plan must be:

- **deferred** enough that it does not block slice 1 through slice 9
- **specific** enough that later auth does not require a serve-schema rename or
  topology rework
- **minimal** enough that we do not lock in outdated Better Auth assumptions
  before the product actually needs user state

## 0. Locked deferral boundary

Day one includes:

- reserved `auth` schema on serve
- no `auth.*` tables
- no auth-specific DSN in the engine
- no auth-specific role in the day-one runtime contract
- no `solemd.user_*` tables

Day one explicitly does **not** include:

- Better Auth runtime wiring
- session validation inside the engine
- user notes, saved papers, or collections
- auth-specific backup activation

## 1. Future ownership model

When auth activates, ownership is split cleanly:

| Surface | Future owner | Notes |
|---|---|---|
| `auth.*` | Better Auth | Better Auth owns its own auth tables. |
| `solemd.user_*` | application / project SQL migrations | Only if the product truly needs app-owned user data beyond Better Auth core tables. |

Locked rule:

- application-owned user tables, if they later exist, live in `solemd`, not in
  `auth`
- cross-schema FKs, if later needed, point from `solemd.user_*` to
  `auth.user(id)`
- no warehouse surface ever mirrors auth state

## 2. Preferred Better Auth path

The preferred future path is now locked more narrowly than the prior draft:

- Drizzle mentions in this doc are comparison-only and do **not** authorize a
  Drizzle-based migration or schema path for the backend rebuild.
- prefer Better Auth's **built-in PostgreSQL path** over the Drizzle adapter
  unless a later codebase-wide ORM decision makes Drizzle mandatory
- use a dedicated **direct PostgreSQL** connection / pool for Better Auth when
  it activates, not the transaction-pooled `pgbouncer-serve` path
- place Better Auth tables in the reserved `auth` schema via PostgreSQL
  `search_path`
- use the current official CLI path, `npx auth@latest`

Why this is the preferred path:

- it is the current official direct-apply workflow for PostgreSQL
- non-default schema placement via `search_path` is officially documented
- auth/session flows should not depend on transaction-pooled PgBouncer session
  behavior when a direct PostgreSQL path is available
- it avoids pre-committing the project to Drizzle-specific auth plumbing before
  the product needs it

## 3. Activation order

When auth becomes real scope, activation order is locked:

1. ensure serve backups / off-box mirror are live before first user row
2. ensure the reserved `auth` schema exists and the activation role has schema
   privileges
3. run Better Auth's own migration flow into `auth`
4. only then add any app-owned `solemd.user_*` tables that genuinely belong to
   the product surface
5. only then expose auth-dependent application endpoints

Reverse order is forbidden.

## 4. Better Auth CLI contract

Current official posture from Better Auth docs:

- built-in PostgreSQL / Kysely path: `npx auth@latest migrate`
- ORM adapters such as Drizzle: `npx auth@latest generate`, then the ORM's own
  migration/apply path

The project therefore does **not** lock in the older `@better-auth/cli` naming
or the old assumption that Better Auth `migrate` is also the Drizzle apply
path.

Operational floor:

- the rest of the serve plane should stay on the pinned PgBouncer line from
  `16-version-inventory.md`; if that pin changes later, the replacement must
  preserve the `search_path`-related security fix before auth activates.

The project also locks one review policy now, to avoid a future half-and-half
deployment story:

- **production auth DDL is repo-reviewed.** When auth activates, the operator
  first runs `npx auth@latest generate` and checks the emitted SQL into
  `db/migrations/serve/auth/` for review.
- **direct `npx auth@latest migrate` is allowed for local/dev validation only,**
  not as an opaque production-schema change path.

This keeps the runtime on Better Auth's built-in PostgreSQL path while
preserving the project's SQL-review discipline.

ID-generation note:

- if the later Better Auth config wants the database to own UUID generation, the
  current official setting is `advanced.database.generateId = false`, not an
  adapter-local Drizzle-only flag.

## 5. Cross-schema rule for future app data

If the product later needs application-owned user data:

- keep it in `solemd.user_*`
- reference `auth.user(id)` from `solemd`
- use `ON DELETE CASCADE` only where the product actually wants hard delete
  semantics
- keep sensitive auth/session/account tables outside the engine read surface by
  grant, not by convention alone

What is intentionally **not** locked now:

- exact `solemd.user_*` table inventory
- whether query history exists
- whether collections, notes, and saved papers all ship together
- exact auth plugin set

Those are product-surface decisions, not topology decisions.

## 6. Day-one implementation guidance

For slices 1 through 9, the only auth-aware work that should exist is:

- reserve the `auth` schema namespace on serve
- keep serve runtime and migrations from assuming `public` is the only future
  schema
- avoid introducing hard-coded assumptions that all user-facing state must live
  in anonymous server-side session storage

Everything else remains deferred.

## 7. Relationship to other docs

- `03 §4.4` owns the live placeholder
- `11` owns the backup trigger once auth actually lands
- `12` owns the migration boundary and explicitly keeps Better Auth outside the
  runner

## Primary references

- Better Auth CLI docs: <https://better-auth.com/docs/concepts/cli>
- Better Auth database docs: <https://better-auth.com/docs/concepts/database>
- Better Auth PostgreSQL adapter docs:
  <https://better-auth.com/docs/adapters/postgresql>
- Better Auth Drizzle adapter docs:
  <https://better-auth.com/docs/adapters/drizzle>
