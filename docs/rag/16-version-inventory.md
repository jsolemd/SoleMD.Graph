# 16 — Canonical Version Inventory

> **Status**: active implementation support surface for exact version pins and
> image tags that should not be repeated loosely across the rest of `docs/rag/`.
> **Provisional**: the specific pins remain implementation-owned until they are
> locked in the cleanup/preflight slice.
> **Date**: 2026-04-18
>
> **Scope**: one canonical home for exact version pins, image tags, and other
> concrete runtime-version decisions that the backend rebuild depends on. This
> document exists to prevent drift caused by prose docs each saying what is
> "current" in slightly different ways.

## Purpose

The rebuild needs a single place that answers:

- what exact versions are currently intended
- which pins are already locked
- which pins are still provisional
- which other docs should reference this inventory instead of repeating exact
  version strings

This document is not the authority for topology, schema, or behavior. It is the
authority for the exact version inventory once the cleanup/preflight slice locks
those pins.

## Working rule

Until the version-inventory slice is completed:

- use this file as the working tracker for version-pin cleanup
- remove or normalize repeated exact-version prose elsewhere in `docs/rag/`
- prefer references back to this file rather than duplicating exact pins in
  multiple narrative docs

Once a pin is locked here, other docs should say "see `16-version-inventory.md`"
instead of re-stating the value unless the exact version is essential to the
local argument.

## Inventory checklist

- [x] PostgreSQL version line consolidated here
- [x] PgBouncer version pin consolidated here
- [x] OpenSearch version line consolidated here
- [x] Redis version line consolidated here
- [x] Python runtime version line consolidated here
- [ ] FastAPI / async stack version pins consolidated here where required
- [x] GPU-runtime compatibility set consolidated here where required
- [ ] Backup/restore tool exact pins consolidated here where required
- [x] Repeated exact-version prose normalized across `docs/rag/`

## Current intended inventory

This table records the current intended pins or version lines already present in
the doc contract. It also makes explicit which values are still only line-level
targets and which are specific pins.

| Surface | Current intended pin or line | Status | Notes / current authority |
|---|---|---|---|
| PostgreSQL | `18` line | provisional | `docs/rag/README.md`, `12-migrations.md`, and the wider RAG docs currently target PostgreSQL 18. Exact image tag should lock when `infra/docker/` lands. |
| PgBouncer | `1.25.1` | provisional | Current intended pin carried by the topology/auth docs; should move into compose/image pins when the runtime scaffold lands. |
| OpenSearch | `3.6` line | provisional | Current intended serving line across topology and serving docs. Exact image tag still needs to be locked in runtime config. |
| Redis | `8` line | provisional | Current intended queue/cache line across runtime docs. Exact image tag still needs to be locked in runtime config. |
| Python | `3.13` line | provisional | Current intended backend runtime line for `apps/api` and `apps/worker`. Exact base image or toolchain pin remains open. |
| `asyncpg` | `0.31+` | provisional | `06-async-stack.md` already carries the current floor; exact package lock belongs with the eventual backend manifests. |
| Dramatiq | `2.x` line | provisional | AsyncIO-middleware assumption is already part of `06`, but the exact package pin has not been frozen in code yet. |
| RAPIDS | `26.04` | provisional | Current intended GPU analytics line from the RAG docs; exact image/base wiring still needs implementation validation. |
| CUDA | `13.0-13.1` compatibility set | provisional | Compatibility target carried by the docs; exact container/base image selection remains implementation-owned. |
| PyTorch CUDA | `13.0.x` packaging line | provisional | Compatibility target only; exact wheel/container pin remains implementation-owned. |

## Explicitly unresolved exact pins

These values still need concrete locking before their checklist items can be
treated as done:

- exact PostgreSQL image tag
- exact OpenSearch image tag
- exact Redis image tag
- exact Python base image / toolchain pin
- exact FastAPI / Pydantic / psycopg / uvicorn package pins
- exact pgBackRest version pin if the local runtime will ship it directly

## Normalization rule

The active docs now follow this rule:

- non-essential runtime version repetition should point back to this file
- exact version strings may remain only where the local argument genuinely
  depends on that version detail
- `research-distilled.md` may retain time-bound version statements as archive
  context, not as live implementation authority

## Intended scope

This file is expected to become the canonical inventory for:

- container image tags
- major/minor service versions
- CLI/tool versions that materially affect implementation
- runtime combinations that must remain compatible

Examples:

- PostgreSQL
- PgBouncer
- OpenSearch
- Redis
- Python
- CUDA / RAPIDS / PyTorch where the combination matters
- pgBackRest

## Slice notes

- 2026-04-18: moved exact runtime pins out of `docs/rag/README.md` so the
  README can stay a stable agent prompt + master ledger.
- 2026-04-18: established the first canonical inventory table here, separating
  version-line targets from exact still-unresolved pins.
- 2026-04-18: normalized the active `docs/rag/` surfaces so non-essential
  version duplication now points back here instead of drifting across the
  contract docs.
