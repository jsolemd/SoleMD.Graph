# 11 — Backup, Recovery, Retention

> **Status**: locked for the per-system irreplaceability classification, the
> backup-tool selection per system, the cadence skeleton, the runbook shape,
> and the periodic-restore-drill rule. Specific retention windows
> (4 full + 28 differential + 7-day WAL on serve, 30-day local logical-dump
> retention on warehouse, 7 daily + 4 weekly OpenSearch snapshots) are
> **provisional** until first quarterly drill exercises them on real data.
> Langfuse has no backup contract under any deployment posture (§7). The
> off-box mirror (Backblaze B2 + rclone, or network-attached storage if the
> project growth warrants the hardware) is **deferred but specified**.
> Encryption-at-rest on the local pgBackRest repo is **deferred** (single-user
> host).
>
> **Date**: 2026-04-17
>
> **Scope**: every state-bearing surface declared in `00 / 01 / 02 / 03 / 07 /
> 10`. This document supplies the actual backup mechanism, schedule,
> retention, restore runbook, and integrity-check policy for each. It does
> **not** define what is rebuildable vs irreplaceable in the abstract — that
> is owned by `00 §1` (which surfaces are always-up vs on-demand), `01 §3`
> (raw releases live read-only on the warehouse FS), `02 §1` (canonical-derived
> tables on warehouse), `03 §0.8` (serve schemas), `04 §7.4` (filesystem
> archive retention rules), and `05 §6` (warehouse rebuildable from raw +
> ledger). This doc consumes those classifications and operationalizes them.
>
> **Authority**: this doc is authority for backup mechanism, schedule,
> retention, restore procedure, integrity-check cadence, and the
> periodic-restore-drill rule. Engine code under
> `engine/app/ops/backup/`, the pg_cron schedules registered on serve and
> warehouse, the pgBackRest configuration shipped under
> `docker/pgbackrest/`, the OpenSearch snapshot repository registration,
> and the Redis `redis.conf` persistence
> stanza all derive from here. Where 00–10 are the source of truth for
> the underlying surfaces, this doc cites instead of restates.

## Purpose

`00 / 01 / 02 / 03 / 04 / 05 / 07 / 10` each declare a state-bearing
surface but stop short of supplying its backup contract. Earlier docs
draw the "rebuildable vs irreplaceable" line in the abstract; this doc
converts that line into a concrete tool, schedule, retention window,
restore procedure, and integrity-check cadence per surface, plus a
periodic-restore-drill discipline that prevents backup-as-theatre.

Twelve load-bearing properties:

1. **Per-system irreplaceability classification.** Every state-bearing
   store on the host falls into one of five tiers — irreplaceable
   (RPO ≈ 5 min), canonical-derived (RPO = 24 h), index (RPO = build
   time), cache (RPO ≈ ∞), raw releases (RPO = ∞ via upstream
   re-download). Each tier has a different backup mechanism. (§2)
2. **pgBackRest is the tool of record on serve.** Single repo at
   `/mnt/solemd-graph/pgbackrest-repo/` (per `01 §3`), single stanza
   `serve`. Full weekly + differential daily + 5-minute WAL. (§3)
3. **Warehouse is logical-dump only — not pgBackRest.** Bulk source-derived
   tables (`s2_*_raw`, `pt3_*_raw`, `paper_embeddings_graph`) are
   excluded from backup entirely; the identity / ledger subset
   (concepts, aliases, lifecycle, lineage, run metadata, core registries)
   gets nightly `pg_dump --format=custom`. (§4)
4. **OpenSearch snapshots are best-effort acceleration, not the canonical
   recovery path.** The canonical recovery path is full re-index from
   serve via the `07 §7` bulk-then-freeze actor. The snapshot repo
   exists to make that recovery faster, not to replace it. (§5)
5. **Redis is RDB-only with no AOF.** The Dramatiq queue is recoverable
   from PG ledger state; the query-vector cache regenerates on miss.
   Loss of Redis state is acceptable on principle, not on accident.
   (§6)
6. **Off-box mirror is specified but deferred.** Backblaze B2 + rclone
   is the candidate; trigger is the first irreplaceable serve row
   (auth, user notes, saved papers — not test data). (§9)
7. **RTO and RPO are explicit per system.** Serve full restore: RTO
   30–60 min, RPO ≤ 5 min. Warehouse rebuild from raw + dumps: RTO
   5–9 h, RPO 24 h. OpenSearch full re-index: RTO 2–6 h, RPO =
   projection cadence. (§11)
8. **Disaster runbooks are concrete, not aspirational.** Single-table
   corruption, whole-serve disk loss, whole-warehouse disk loss,
   OpenSearch index corruption, whole-host disk loss, repo
   self-corruption — six step-by-step procedures. (§12)
9. **Operational cadence sits on the same admin-pool path that owns
   projection swaps.** pg_cron schedules trigger Dramatiq actors that
   acquire the `admin` pool (`06 §2.1`) and execute under role
   `engine_admin` against `graph-db-serve` (and a separate
   `engine_warehouse_admin` against `graph-db-warehouse` for the
   logical-dump actor). (§13)
10. **Prometheus alerts cover the two failure modes that matter.**
    Missed backup runs and failed integrity checks both page per
    `10 §10.1`. (§13)
11. **Quarterly restore drill is mandatory, not optional.** A backup
    that has not been restored is a hypothesis, not a fact. (§14)
12. **Backup repo lives on the same E-drive as the warehouse data
    today.** This is acknowledged co-location risk (`01 §5` deferred
    decision); the off-box mirror is the answer once it triggers. (§9)

What this doc does **not** cover:

- **Schema migration mechanics.** That is `12-migrations.md` (deferred
  until ingest substrate proves out). SQL-first schema authoring plus the
  `schema_migrations.py` ledger are inherited from `06 §8`.
- **Bundle / archive retention pruning rules.** Those are owned by
  `04 §7.4` (`projection_run` artifacts) and `01 §3` (bundles
  retention pending size pressure). This doc only covers their
  *backup* posture, which is "filesystem-as-is, retention by §rules
  in §10."
- **Auth / user-data backup.** Better Auth is deferred (`00 §6`,
  `03 §4.4`). When `auth.*` tables land, they live on serve and ride
  the `serve` pgBackRest stanza automatically.
- **Object-storage gateway (MinIO).** Deferred per `01 §8`. Until then
  the OpenSearch snapshot repo is `fs`-typed, not `s3`-typed.

## §0 Conventions delta from `00 / 01 / 04 / 09 / 10`

This document inherits every convention from those upstream docs and
adds the following:

| Concern | Backup delta |
|---|---|
| **Per-system irreplaceability tier** | Every state-bearing surface gets exactly one of `irreplaceable`, `canonical-derived`, `index`, `cache`, `raw-release`, or `archive` (the §2 inventory). The tier dictates the backup mechanism; mechanism does not float free of tier. |
| **RTO / RPO contract format** | Every backed-up system carries an explicit (RTO, RPO) pair in §11. RTO is "wall-clock from declared incident to read-path serving correct data again"; RPO is "maximum data loss in time, measured from the most recent durable backup point." Both numbers are committed targets, not aspirations — failure to meet either in a real incident is a postmortem trigger. |
| **Restore-drill cadence as part of the backup contract** | A backup is not in a healthy state unless it has been restored within the last 90 days into an isolated container (the `serve-restore-test` shape in §14). Missed drill is a `severity=warn` alert per `10 §10.1`. |
| **Repo / stanza naming** | The pgBackRest stanza uses the cluster's bare service name (`serve`), not a hyphenated variant. The repo at `/mnt/solemd-graph/pgbackrest-repo/` is single-stanza today; if a future state-bearing PG cluster lands and warrants pgBackRest, it joins as an additional stanza on the same repo per pgBackRest's documented multi-stanza pattern. |
| **Logical-dump output layout** | Warehouse `pg_dump` output lands at `/mnt/solemd-graph/warehouse-logical-dumps/<yyyy-mm-dd>/<schema>.<table>.pgdump`. Date-prefixed directories so retention pruning is `find ... -mtime +30 -delete`-trivial; per-table files so partial restore does not require unwrapping the whole snapshot. |
| **Encryption posture** | Local backup repos are unencrypted today (single-user host, no shared filesystem, no off-box mirror yet). When the off-box mirror triggers, **the off-box copy is encrypted at rest** via pgBackRest's repo cipher (or rclone crypt for non-pgBackRest data); the local repo can stay unencrypted until then. Decision flagged as deferred-but-specified in §9. |
| **Backup operations role** | Backup admin commands run as `engine_admin` on serve (existing role per `06 §7`) and as a new `engine_warehouse_admin` role on warehouse. Both are direct-PG (no PgBouncer), via the `admin` asyncpg pool topology declared in `06 §2.1`. The pgBackRest sidecar process runs as Postgres-equivalent `999` UID against the cluster's data dir; it does not need a database role on serve, only filesystem read on PGDATA + write on the repo. |

## §1 Identity / boundary

This document declares **no new canonical identity types**. It consumes
every identity declared upstream:

- `serving_run_id`, `api_projection_run_id`, `graph_run_id`,
  `chunk_version_key`, `ingest_run_id` (`02 §0.2`, `03 §2`, `05 §1`).
- `source_release_id`, `source_code`, `release_tag` (`02 §4.1`,
  `05 §3`).
- `evidence_key` (UUIDv5, content-bound; `02 §0.2`).

Backup metadata uses pgBackRest's own internal lineage IDs (backup
labels of the form `20260417-030000F`, `20260417-030000F_20260418-030000D`
for differentials, plus WAL segment file names). Those are tool-internal
and not promoted into the project identity glossary.

Boundary owned: "data is durable on the host" → "data is recoverable
to the host on demand." Not owned: schema drift detection
(`12-migrations.md`); Langfuse benchmark JSON exports
(`.claude/skills/langfuse/references/benchmarking.md`, `10 §7.3`);
bundle publication / asset-serving (graph skill, not backup).

## §2 Per-system irreplaceability classification

Every state-bearing surface declared in `00 §1`, `00 §2`, `01 §1`,
`01 §3`, `01 §4`, `07 §10`, and `10 §7` appears in this table exactly
once.

| System | Tier | RPO target | Backup mechanism | Section |
|---|---|---|---|---|
| `graph-db-serve` (PG 18, NVMe named volume `graph_serve_pg-data`) | irreplaceable | ≤ 5 min | pgBackRest stanza `serve`: full weekly + differential daily + 5-min WAL | §3 |
| `graph-db-warehouse` (PG 18, E-drive bind `/mnt/solemd-graph/pg-data`) — dumped identity / ledger subset only | canonical-derived | 24 h | `pg_dump --format=custom` per-table nightly | §4 |
| `graph-db-warehouse` — bulk source-derived tables (`s2_*_raw`, `pt3_*_raw`, `paper_embeddings_graph`) | rebuildable | n/a | **none** — explicitly skipped; rebuild from `/mnt/solemd-graph/data/` per `05 §6` (5–9 h S2 bulk load) | §4.3 |
| `graph-opensearch` (3.6, NVMe named volume `graph_opensearch_data`) | index | build time (2–6 h re-index) | Daily `fs`-repo snapshot of `paper_index_live` + `evidence_index_live`; canonical recovery is full re-index from serve via `07 §7` | §5 |
| `graph-redis` (Redis 8, no volume today; planned NVMe target if persistence stays on) | cache | ∞ | RDB-only, `save 900 1 300 10 60 10000`, no AOF | §6 |
| Langfuse (Cloud Hobby today, self-host deferred per `10 §7`) | telemetry — sliding window | n/a | **none** — 30-day Cloud window IS the retention; no backup even if self-host lands | §7 |
| `/mnt/solemd-graph/data/{semantic-scholar,pubtator}/releases/` (raw release files) | raw-release | ∞ | **none** — re-downloadable from upstream; backup cost > rebuild cost | §2.1 |
| `/mnt/solemd-graph/bundles/` (published Parquet, `01 §3`) | archive | build time | filesystem-as-is; covered by future off-box mirror; rebuildable from `graph_runs` ledger | §10 |
| `/mnt/solemd-graph/archives/serving-packages/<serving_run_id>/` (`04 §7.4`) | archive | build time | filesystem-as-is; if lost, re-run projection per `04 §7.4` | §10 |
| `/mnt/solemd-graph/archives/chunk-versions/`, `archives/cold-text/`, `archives/projection-manifests/` (`01 §4`) | archive | build time | filesystem-as-is; rebuildable from warehouse + raw releases | §10 |
| Prometheus TSDB (`graph_prometheus_data`, 15 d retention per `01 §5` / `10 §3`) | metrics-history | n/a (rolling) | none; `severity=warn` if lost | §2.1 |
| Grafana state (`graph_grafana_data`) — dashboards via Grafonnet under git per `10 §0` | rebuildable | n/a | dashboards are git, not backup; runtime preferences acceptable to lose | §2.1 |
| Loki chunks (`graph_loki_data`, 7 d retention) | logs-history | n/a (rolling) | none; logs are observability, not record-of-truth | §2.1 |
| `graph_worker-opt-venv` (Python venv, image-rebuild trivial) | rebuildable | n/a | none; container restart rebuilds | §2.1 |
| pgBackRest repo at `/mnt/solemd-graph/pgbackrest-repo/` itself | meta | n/a | `pgbackrest verify` daily; off-box mirror once §9 triggers | §13.4 |

### §2.1 Why the "no backup" entries exist

Six surfaces are explicitly **not** backed up:

- **Bulk source-derived warehouse tables** (`s2_*_raw`, `pt3_*_raw`,
  `paper_embeddings_graph`): derived 1:1 from raw releases; rebuild
  benchmarked at 5–9 h (`research-distilled §2`, `05 §6`). Backing
  them up would roughly double warehouse footprint (~1 TB) with no
  added information.
- **Raw release files** under `/mnt/solemd-graph/data/`: freely
  re-downloadable from S2 + PubTator3 upstream. At ~850 GB combined,
  local backup cost dominates re-download cost on a residential
  gigabit link.
- **Langfuse (Cloud Hobby, or self-host if it ever lands)**: telemetry
  is observability, not record-of-truth. The 30-day Cloud window IS
  the retention; we act on insights inside that window. If self-host
  later replaces Cloud, the same "no backup, sliding window" policy
  carries over — Langfuse never holds a row whose loss is
  unrecoverable. Curated benchmark dataset exports for keepsake
  history are a separate concern owned by the `langfuse` skill, not
  by this doc.
- **Prometheus / Loki retention**: rolling-retention observability;
  loss flushes the investigation window but no record-of-truth
  (`10 §3`).
- **Worker venv**: image rebuild via `docker compose build` is the
  recovery path; `pyproject.toml` + `uv.lock` are the durable
  artifacts under git.
- **Grafana state**: Grafonnet under git (`10 §0`); only personal UI
  preferences would be lost.

## §3 pgBackRest on serve

### §3.1 Repo and stanza shape

One pgBackRest repository at `/mnt/solemd-graph/pgbackrest-repo/` per
`01 §3`. The repo is shared across **multiple stanzas**: `serve`
today. pgBackRest's documented multi-stanza pattern (one repo per
filesystem, many stanzas per repo) leaves room for an additional
stanza without restructuring the repo if a future state-bearing PG
cluster lands.

```
/mnt/solemd-graph/pgbackrest-repo/
├── archive/
│   └── serve/                       WAL archive, 5-min push cadence
│       ├── 18-1/
│       │   └── 0000000100000001/    16 MB segments
│       └── archive.info
└── backup/
    └── serve/
        ├── 20260417-030000F/        weekly full
        ├── 20260418-030000F_20260419-030000D/  daily diff
        └── backup.info
```

### §3.2 `pgbackrest.conf`

Shipped under `docker/pgbackrest/pgbackrest.conf`, mounted into both
the pgBackRest sidecar and `graph-db-serve`. Bind-mount, not a copy
in two places.

```ini
[global]
repo1-path                = /var/lib/pgbackrest
repo1-retention-full      = 4
repo1-retention-diff      = 28
repo1-retention-archive   = 7
repo1-retention-archive-type = diff
repo1-bundle              = y
repo1-block               = y
repo1-cipher-type         = none
# ^ encryption deferred: single-user host, no off-box mirror yet (§9).
#   When off-box mirror triggers, set repo2-cipher-type=aes-256-cbc
#   on the off-box repo and rotate keys via `pass`(1) on the host.

compress-type             = zst
compress-level            = 3
process-max               = 4
log-level-console         = info
log-level-file            = detail
log-path                  = /var/log/pgbackrest

archive-async             = y
spool-path                = /var/spool/pgbackrest
archive-push-queue-max    = 4GiB
archive-get-queue-max     = 1GiB

start-fast                = y
stop-auto                 = y
resume                    = y

[global:archive-push]
process-max               = 4

[global:archive-get]
process-max               = 4

[serve]
pg1-path                  = /var/lib/postgresql/data
pg1-port                  = 5432
pg1-user                  = postgres
pg1-host                  = graph-db-serve
pg1-host-user             = postgres
pg1-database              = postgres
```

Source for the multi-stanza, asynchronous-archiving, `repo1-bundle =
y` pattern: <https://pgbackrest.org/configuration.html> and
<https://pgbackrest.org/user-guide.html> (asynchronous archiving §,
parallel restore §, retention §). `repo1-bundle = y` packs many small
files into one — relevant on the WAL archive directory which otherwise
generates one 16 MB file per WAL segment, ~288 files per day at 5-min
cadence under low load. `compress-type = zst` is supported since
pgBackRest 2.45 and is the documented faster-than-`gz` choice for
modern CPUs.

### §3.3 Compose snippet — pgBackRest sidecar

The sidecar runs as a separate Compose service sharing both PGDATA
and the repo bind (pgBackRest documented sidecar pattern):

```yaml
services:
  graph-pgbackrest:
    image: pgbackrest/pgbackrest:2.55       # pin TBD per open item §2
    container_name: graph-pgbackrest
    networks: [graph-internal]
    volumes:
      - graph_serve_pg-data:/var/lib/postgresql/data:ro
      - /mnt/solemd-graph/pgbackrest-repo:/var/lib/pgbackrest
      - ./docker/pgbackrest/pgbackrest.conf:/etc/pgbackrest/pgbackrest.conf:ro
      - graph_pgbackrest_spool:/var/spool/pgbackrest
      - graph_pgbackrest_log:/var/log/pgbackrest
    environment: [PGBACKREST_STANZA=serve]
    command: ["sleep", "infinity"]   # invoked by docker-exec from pg_cron actor
    profiles: [backup]
    restart: unless-stopped
    depends_on: [graph-db-serve]

volumes:
  graph_pgbackrest_spool: {}
  graph_pgbackrest_log: {}
```

The serve cluster image must also bundle the `pgbackrest` binary so
`archive_command` can invoke it; both containers mount the same
config + repo paths. Sidecar is the executor for
full / differential / verify; cluster is the emitter for
`archive-push`.

### §3.4 Replacing the `09 §4` placeholder

`09 §4` (`docs/rag/09-tuning.md` line 379–382) has serve at:

```ini
archive_mode    = off    # keep off until 11-backup wires a real pgBackRest
archive_command = ''
```

This document supplies the real values. Once the §3.3 sidecar lands
and `pgbackrest --stanza=serve stanza-create` and
`pgbackrest --stanza=serve check` both succeed, the serve
`postgresql.conf` flips atomically (single restart, single PR) to:

```ini
archive_mode    = on
archive_command = 'pgbackrest --stanza=serve archive-push %p'
archive_timeout = 60s
```

`archive-async = y` in pgBackRest config (§3.2) means
`archive-push` returns immediately to PostgreSQL once the segment is
spooled; the actual push to repo happens out of band. This decouples
PostgreSQL's WAL writer from repo I/O.

`archive_timeout = 60s` ensures a WAL segment is forced out at least
once per minute even on quiet OLTP — the 5-min RPO depends on this.

**Upstream amendment**: `09 §4` lines 379–382 must be edited to
reflect this once §3 is wired. Until the sidecar lands, `archive_mode
= off` per `09 §4` is correct (per `research-distilled §7`,
PostgreSQL's own docs explicitly discourage fake-success placeholders
like `archive_command = '/bin/true'` for normal operation).

### §3.5 Cadence and retention

| Backup type | Cadence | Retention |
|---|---|---|
| Full | Sunday 03:00 UTC | 4 most recent fulls |
| Differential | Mon–Sat 03:00 UTC | 28 most recent diffs |
| WAL | continuous, ≤5 min lag | 7 days, plus everything needed by retained fulls/diffs |
| Verify | Daily 06:00 UTC | n/a (alerts only) |

Retention windows are pgBackRest-native (`repo1-retention-full = 4`,
`repo1-retention-diff = 28`, `repo1-retention-archive = 7`,
`repo1-retention-archive-type = diff`). `expire` runs implicitly after
each successful backup; explicit `pgbackrest expire` invocation is not
required.

Storage estimate at this retention shape:
- 4 fulls × ~50 GB (serve `01 §5` peak) = ~200 GB
- 28 diffs × ~5 GB average = ~140 GB
- 7 days WAL × ~1 GB/day OLTP = ~7 GB
- **Total**: ~350 GB on `/mnt/solemd-graph/pgbackrest-repo/`.

This is consistent with `01 §5`'s ~150 GB at-scale pgBackRest line,
which assumed pre-launch sparse-data shape. Recompute after first
quarterly drill against real data.

### §3.6 Restore runbook — point-in-time

Single-table corruption or a bad operator UPDATE that needs a PITR
to a known-good moment.

```bash
TARGET_TIME='2026-04-17 14:30:00 UTC'

# 1. Stop pooler then cluster (readers off first).
docker compose stop pgbouncer-serve graph-db-serve

# 2. Move the current PGDATA aside (salvage option, don't delete).
sudo mv /var/lib/docker/volumes/graph_serve_pg-data/_data \
        /var/lib/docker/volumes/graph_serve_pg-data/_data.broken

# 3. PITR restore.
docker compose --profile backup run --rm graph-pgbackrest \
  pgbackrest --stanza=serve --type=time \
             --target="$TARGET_TIME" \
             --target-action=promote \
             --process-max=4 \
             restore

# 4. Bring serve up; PG replays WAL up to TARGET_TIME, then promotes.
docker compose start graph-db-serve

# 5. Verify.
docker exec graph-db-serve psql -U postgres -d solemd -c \
  "SELECT * FROM solemd.active_runtime_pointer;"

# 6. Bring pooler + engine back up.
docker compose start pgbouncer-serve graph-engine-api
```

`--target-action=promote` is PITR-and-stay-promoted; `pause` is the
inspect-then-promote alternative. Source:
<https://pgbackrest.org/command.html#command-restore>.

### §3.7 Restore runbook — whole-cluster disk loss

Same as §3.6 except step 1 is "the volume is gone, not corrupted":
skip the `mv` and let pgBackRest restore into an empty `_data`. PG
replays WAL to the latest archived segment (`--type=default`), which
is the 5-min RPO target.

### §3.8 Integrity check

Daily `pgbackrest --stanza=serve verify` at 06:00 UTC, after the
day's differential has completed. Checks repo internal consistency,
recomputes block checksums, validates archive completeness against
the backup set. Alerts on non-zero exit per `10 §10.1` —
`severity=page`. Source: <https://pgbackrest.org/command.html#command-verify>.

## §4 Logical dumps on warehouse

### §4.1 Why pg_dump and not pgBackRest

Warehouse holds ~1.2 TB of data at scale (`01 §5`). About 90 % of
that is bulk source-derived (`s2_papers_raw`, `pt3_documents_raw`,
`paper_embeddings_graph`, etc.) and is **rebuildable in 5–9 h** from
the raw releases on the same disk (`research-distilled §2`,
`05 §6`). Backing the bulk up with pgBackRest would:

- Roughly double the warehouse footprint on the E-drive (already
  tight per `01 §5`).
- Pay a continuous WAL-archive cost on a cluster that runs
  `wal_level = minimal` (`09 §4` / `00 §3`) precisely so it can
  skip WAL on bulk COPY.
- Provide no data the raw releases don't already carry.

The remaining 10 % is the **identity / ledger subset**: concepts,
aliases, lifecycle, run metadata, chunk-version lineage, and the core
paper / author / venue registries. These are computed from raw +
ingest logic but are not the kind of bulk state we want to rebuild from
scratch on every recovery path, and they carry non-trivial identity
allocation (`corpus_id`, `concept_id`, UUIDv7 `ingest_run_id`s). These
get nightly logical dumps.

### §4.2 What gets dumped

Explicit per-table list. The dump actor invokes `pg_dump` once per
table to produce per-table `.pgdump` files; this makes partial restore
trivial (`pg_restore --table=concepts ...`) without unwrapping a
schema-wide dump.

| Schema | Table | Why dumped |
|---|---|---|
| `solemd` | `corpus` | `corpus_id` allocation registry; identity-bearing |
| `solemd` | `papers` | core paper registry; cross-source identity bridge |
| `solemd` | `concepts` | concept identity allocation |
| `solemd` | `concept_aliases` | alias registry; manual curation creeps in |
| `solemd` | `concept_search_aliases` | synonym-eligible filtered subset |
| `solemd` | `paper_lifecycle` | lifecycle state — not re-derivable from raw |
| `solemd` | `paper_chunk_versions` | chunk-version lineage; identity-bearing |
| `solemd` | `source_releases` | release ledger |
| `solemd` | `ingest_runs` | ingest ledger; pairs with `source_releases` |
| `solemd` | `graph_runs` | graph build ledger |
| `solemd` | `graph_bundle_artifacts` | bundle lineage |
| `solemd` | `venues` | venue registry |
| `solemd` | `authors` | author registry (cross-paper identity) |
| `pubtator` | `concept_index` | PubTator3-side concept index (used by ingest) |

### §4.3 What is explicitly skipped

| Schema | Table family | Why skipped |
|---|---|---|
| `solemd` | `s2_*_raw` | Bit-for-bit derivable from `/mnt/solemd-graph/data/semantic-scholar/releases/<tag>/`. |
| `solemd` | `pt3_*_raw` | Same, from `/mnt/solemd-graph/data/pubtator/releases/<tag>/`. |
| `solemd` | `paper_authors` | Derivable from `s2_paper_authors_raw`. |
| `solemd` | `paper_citations` | Derivable from `s2_paper_references_raw`. |
| `solemd` | `paper_concepts`, `paper_relations` | Derivable from PubTator3 + concept lookup. |
| `solemd` | `paper_text` | Rebuildable from `s2_abstracts_raw` + `s2_s2orc_raw` via deterministic per-source tokenization (`05 §3`). ~80 GB at scale; biggest dump-set saving. RTO impact ≈ 30–60 min added to the warehouse rebuild envelope already specced at 5–9 h. |
| `solemd` | `paper_evidence_units` | UUIDv5 grounding identity is deterministic in `corpus_id + chunk_version_key + sentence_range`; rebuilds bit-for-bit from raw + `paper_chunk_versions` (which IS dumped). ~10 GB saving. RTO impact bundled with the grounding-spine rebuild that produces it. |
| `solemd` | `paper_documents`, `_sections`, `_blocks*`, `_sentences*`, `_*_mentions*`, `_chunk_members*` | Grounding spine bulk; rebuildable from raw via `05 §3` build order. **Identity** (`evidence_key` UUIDv5) is regenerated deterministically. |
| `solemd` | `paper_embeddings_graph` | Re-encodable from `paper_text` via the engine encoder. ~3 h on RTX 5090 for 14 M papers. |

### §4.4 Cadence and retention

| Concern | Value |
|---|---|
| Cadence | Daily 02:30 UTC (before the 03:00 serve full / diff window so disk I/O does not collide) |
| Retention (local) | 30 days |
| Retention (off-box) | 7 days, **deferred until §9 mirror lands** |
| Output dir | `/mnt/solemd-graph/warehouse-logical-dumps/<yyyy-mm-dd>/<schema>.<table>.pgdump` |
| Format | `--format=custom --no-owner --no-acl --compress=9 --jobs=1` per file |
| Cluster wake | actor brings `graph-db-warehouse` up via Compose profile if down, runs dumps, leaves it running for the morning ingest window if one is scheduled, otherwise stops it |

`--format=custom` is the right choice for selective restore via
`pg_restore`; `--no-owner --no-acl` keeps the dumps portable across
role-name changes. `--compress=9` is `pg_dump`-internal zlib (not
zstd; PG 18 supports `--compress=lz4` and `--compress=zstd` — flag as
provisional whether to switch to zstd for faster restore).

Estimated dump size at scale (dumped identity / ledger subset, post-shrink):
- `concepts` + aliases (incl. `concept_search_aliases`): ~5 GB
- `papers` (registry only, no text): ~3 GB
- `authors`, `venues`: ~2 GB
- `paper_chunk_versions`, `paper_lifecycle`: ~1 GB
- `pubtator.concept_index`: ~1 GB
- ledgers (`*_runs`, `source_releases`, `graph_*`, `graph_bundle_artifacts`): < 1 GB
- **Total**: ~12 GB per nightly snapshot.

At 30 days × ~12 GB = ~360 GB local. Fits comfortably on the E-drive.
The shrink came from removing `paper_text` (~80 GB) and
`paper_evidence_units` (~10 GB) from the dump set per §4.3 — both
rebuild deterministically from raw + the dumped lineage tables, and
neither extends RTO meaningfully past the 5–9 h warehouse-rebuild
envelope already locked in §11.

If the project later adds a state-bearing surface that pushes the
dump set past E-drive headroom, that is the trigger to provision the
network storage anticipated in §9. Until then, 30-day local retention
is **locked**; off-box mirror remains deferred per §9.

### §4.5 Orchestration — pg_cron + Dramatiq actor

The dump actor lives in `engine/app/ops/backup/warehouse_dump.py`,
invoked by pg_cron on serve (warehouse itself may be down at 02:30):

```sql
-- on graph-db-serve, as engine_admin
SELECT cron.schedule('warehouse-logical-dump-nightly', '30 2 * * *',
  $$ SELECT engine_admin.enqueue_dramatiq_actor('warehouse.logical_dump_nightly', '{}'::jsonb) $$);
```

Actor steps: (1) bring warehouse up if down; (2) connect as
`engine_warehouse_admin`; (3) for each table in §4.2 invoke
`pg_dump --format=custom --table=<schema>.<table>` to
`/mnt/solemd-graph/warehouse-logical-dumps/<today>/`; (4) write
`manifest.json` with file sizes + `pg_class.reltuples` row counts
+ PG version; (5) optionally stop warehouse per config flag
(default: leave up if ingest scheduled within 6 h); (6) prune
directories older than 30 days; (7) emit
`backup_run_total{actor="warehouse.logical_dump_nightly"}` per §13.3.

Per-table failure does not abort the run — the manifest records
partial-success and the alert fires on the failed table (matches
`04 §9` projection-cohort failure model).

### §4.6 Restore runbook — single dumped warehouse table

```bash
DUMP_DATE='2026-04-16'; TABLE='solemd.concepts'

# 1. Bring warehouse up; stage-restore into a temporary database.
docker compose --profile db up -d graph-db-warehouse
docker exec graph-db-warehouse createdb -U postgres restore_staging
docker exec graph-db-warehouse pg_restore -U postgres \
  -d restore_staging --no-owner --no-acl --jobs=4 \
  /dump/${DUMP_DATE}/${TABLE}.pgdump

# 2. Diff counts against live before swap.
# 3. Atomic rename-swap + dblink copy inside a BEGIN/COMMIT
#    (analogue of projection _prev pattern, 04 §3.6).
# 4. Drop staging db; keep <table>_pre_restore for 24 h.
```

For full-warehouse loss, see §12.3.

## §5 OpenSearch snapshots

### §5.1 Repository declaration

Per `07 §10`, the OpenSearch snapshot repository is declared at
`/mnt/solemd-graph/opensearch-snapshots/` with `fs` type. The
snapshot-restore plugin requires the path be on `path.repo` in
`opensearch.yml`:

```yaml
# opensearch.yml — added to graph-opensearch's mounted config
path.repo: ["/mnt/solemd-graph/opensearch-snapshots"]
```

Repository registration (one-time, via Dramatiq actor on first boot):

```http
PUT /_snapshot/solemd_graph_local
Content-Type: application/json

{
  "type": "fs",
  "settings": {
    "location": "/mnt/solemd-graph/opensearch-snapshots",
    "compress": true,
    "max_snapshot_bytes_per_sec": "200mb",
    "max_restore_bytes_per_sec": "200mb",
    "chunk_size": "1g"
  }
}
```

`s3` repo type with a local MinIO front-end is **deferred** per
`01 §8`. `fs` repo on a local filesystem is the documented dev /
single-node default (<https://docs.opensearch.org/latest/tuning-your-cluster/availability-and-recovery/snapshots/snapshot-restore/>).

### §5.2 Cadence and retention

| Snapshot type | Cadence | Retention |
|---|---|---|
| Daily of `paper_index_live` + `evidence_index_live` | 04:00 UTC | 7 daily |
| Weekly of same | Sunday 04:30 UTC | 4 weekly |
| Verify | Weekly Saturday 05:00 UTC | n/a |

The `opensearch.snapshot_daily` Dramatiq actor (per `07 §10`) calls
`PUT /_snapshot/solemd_graph_local/<kind>-<utc-ts>` with
`indices=paper_index_live,evidence_index_live`,
`include_global_state=false`,
`metadata={kind, serving_run_id}`,
`wait_for_completion=false`, then polls the snapshot status endpoint
until SUCCESS, then prunes per retention window.
`time_limit=3_600_000` ms is the actor-level guard.

### §5.3 Restore runbook — index corruption

The canonical recovery path for a corrupted OpenSearch index is **full
re-index from serve** via the `07 §7.2` `opensearch.build_paper_index`
or `opensearch.build_evidence_index` actor. RTO: 2–6 h depending on
hot-tier vs warm-tier scope. RPO: as good as the most recent
serving-run cohort cycle.

Snapshot-restore is the **acceleration path**, not the canonical one.
Use it when the snapshot is fresher than the most recent published
serving cohort, or when full re-index is bottlenecked on a
warehouse-down window.

```http
POST /_snapshot/solemd_graph_local/<snapshot_name>/_restore
Content-Type: application/json

{
  "indices": "paper_index_<run_token>,evidence_index_<run_token>",
  "rename_pattern": "(.+)",
  "rename_replacement": "$1_restored",
  "include_aliases": false,
  "include_global_state": false
}
```

After restore completes, the alias swap follows the same `07 §8.2`
pattern as a fresh build:

```http
POST /_aliases
Content-Type: application/json

{ "actions": [
    { "remove": { "index": "*", "alias": "paper_index_live" } },
    { "add":    { "index": "paper_index_<run_token>_restored", "alias": "paper_index_live" } }
] }
```

PG's `serving_runs.opensearch_alias_swap_status` is updated by the
restore actor to mirror the same audit shape as a normal cutover
(`07 §8.4`).

### §5.4 Why the snapshot is best-effort

Three reasons the snapshot is not the canonical recovery path:

1. **Snapshot lag vs cohort lag.** A 04:00 snapshot captures whatever
   cohort was live at 04:00; if a bad cohort published at 05:00, the
   snapshot is already poisoned. Re-index uses *current* serve state.
2. **Faiss HNSW segments are large.** Snapshot-restore copies raw
   segment files; for a 21 GB paper-index this is roughly the same
   wall-clock as bulk re-index (bottlenecked on embedding I/O, not
   OpenSearch ingest). Snapshot wins only when re-index is blocked.
3. **Snapshot does not cover engine-side artifacts.** It does not
   re-run `_warmup`, re-emit projection-cohort metrics, or re-stamp
   serving-run audit columns. The cohort orchestrator (`07 §11`)
   does all of that on a fresh build.

Snapshot is DR insurance against catastrophic OpenSearch failure
(cluster RED, index files unrecoverable). For routine corruption,
prefer re-index.

## §6 Redis persistence

### §6.1 RDB-only, no AOF

Redis 8 `redis.conf` snippet shipped under `docker/redis/redis.conf`:

```conf
# Persistence: RDB only. No AOF.
# Rationale: Dramatiq queue is recoverable from PG ledger state
# (ingest_runs, serving_runs, graph_runs); query-vector cache regenerates
# on miss. Loss of Redis state is acceptable.

save 900 1
save 300 10
save 60 10000

stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /data

appendonly no
# AOF disabled: every write would fsync (or fsync periodically) which
# halves Redis throughput on the Dramatiq broker queue path. The trade
# is unfavorable when the queue is recoverable from PG.

# Snapshot-on-shutdown handled via `stop-writes-on-bgsave-error yes` +
# `SHUTDOWN SAVE` invoked by the compose stop hook.
```

`save 900 1 300 10 60 10000` is the Redis-documented "developer-friendly"
default — snapshot every 15 min if at least 1 key changed, every 5 min
if 10 keys changed, every minute if 10 000 keys changed. Source:
<https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/>.

### §6.2 Storage target

Redis persistence target is the NVMe (per `01 §1` — Redis is listed as
"stateless cache" today with no volume; **§6 of this doc adds an
optional `graph_redis_data` named volume on NVMe**, registered only
when persistence is on). With `save` configured, Redis writes
`dump.rdb` to `/data` which needs to be a real volume to survive
restart.

```yaml
# delta to docker/compose.yaml
services:
  graph-redis:
    volumes:
      - graph_redis_data:/data            # added per 11 §6.2
volumes:
  graph_redis_data: {}
```

This is a small additive amendment to `01 §1` — flagged at the bottom
of this doc.

### §6.3 No off-box mirror, no snapshot copy

Redis state is acceptable to lose on host disk loss. Dramatiq queue
rebuilds from PG ledger reconciliation on worker startup (`06 §6.4`);
query-vector cache is rebuildable from the encoder pass (`08 §6`).

**Reviewer judgment call**: RDB-only with no AOF means up to 15 min
of broker queue state is lost on hard crash between snapshots.
Reviewer, confirm acceptable given ingest is idempotent on
`(source_release_id, family)` (`05 §4`), projection on
`serving_run_id` (`04 §1`), and OpenSearch bulk-indexer on `_id`
(`07 §7`). If any becomes non-idempotent, `appendonly yes` +
`appendfsync everysec` becomes the right default.

## §7 Langfuse — no backup (telemetry, sliding window)

Langfuse is observability, not record-of-truth. There is no backup
contract for it under any deployment posture.

- **Today (Cloud Hobby per `10 §7`)**: the 30-day Cloud window IS
  the retention. Insights are acted on inside that window or they
  age out. There is nothing on the host to back up.
- **If self-host ever lands** (trigger-gated per `10 §7.2`): the
  same policy carries over. Operate Langfuse as a sliding-window
  telemetry store with no separate backup. A crash loses recent trace
  history; no SoleMD record-of-truth is at risk because Langfuse holds
  none.
- **Curated benchmark / experiment exports for archival history**
  are owned by the `langfuse` skill (dataset JSON snapshots into the
  repo, per `10 §7.3`), not by this doc. Those exports are durable
  via git, not via this backup contract.

This section exists to make the "no backup" decision explicit so
future drift toward "we should probably back up Langfuse" gets
checked against the original premise.

## §9 Off-box mirror — deferred but specified

### §9.1 Trigger

The off-box mirror activates the day a real irreplaceable serve row
lands. "Real" means: a `auth.users` row that is not the developer's
own test account, a `solemd.user_notes` row tied to a real session,
a saved `solemd.user_paper_collection` not from automated test setup.
Test data does not trigger the mirror.

This is the same trigger that `00 §6` and `01 §8` declare for the
Backblaze B2 deferred decision. Restating here as the actual
operational trigger because §9 is the implementation of that
deferred decision.

### §9.2 Tool selection — Backblaze B2 + rclone

Per `research-distilled §7`: Backblaze B2 is the right choice for
**rare-restore** workloads (cheap storage, paid egress). Cloudflare
R2 wins only on **routine-restore** (zero egress, 2.5× storage). For
this profile (irreplaceable data that almost never needs to be
restored from off-box), B2 dominates.

```ini
# rclone.conf (encrypted-at-rest via rclone crypt + pass(1) for the key)
[b2-raw]
type = b2
account = $(pass solemd/b2-account-id)
key = $(pass solemd/b2-application-key)

[b2-encrypted]
type = crypt
remote = b2-raw:solemd-graph-backups
password = $(pass solemd/rclone-crypt-password)
password2 = $(pass solemd/rclone-crypt-salt)
filename_encryption = standard
directory_name_encryption = true
```

### §9.3 Sync schedule (when triggered)

```bash
# /etc/systemd/system/solemd-offbox-mirror.service
ExecStart=/usr/bin/rclone sync \
  /mnt/solemd-graph/pgbackrest-repo/ \
  b2-encrypted:pgbackrest-repo/ \
  --transfers 4 --checkers 8 --b2-hard-delete \
  --log-level INFO

# /etc/systemd/system/solemd-offbox-mirror.timer
OnCalendar=*-*-* 05:00:00 UTC
```

Same pattern for `/mnt/solemd-graph/warehouse-logical-dumps/`.

### §9.4 Cost math

At 50–100 GB monthly mirrored to B2:
- Storage: $6/TB/mo × 0.10 TB = **~$0.60/mo**.
- Egress (only on restore): $10/TB × 0.10 TB = ~$1 per full restore.
- API calls: < $0.10/mo at this volume.
- **Total monthly**: under $1, dominated by storage.

Budget ceiling: $5/mo if mirror grows to ~500 GB. At that point
revisit the dump-retention policy (§4.4 open item).

Source: Backblaze B2 pricing
(<https://www.backblaze.com/cloud-storage/pricing>) and the
ThemeDev 2026 comparison cited in `research-distilled §7`.

### §9.5 Encryption key custody

`pass`(1) on the host is the canonical key store. Keys are also
exported to a sealed envelope kept off-host (Yubikey-encrypted backup
of the `pass` GPG key, stored in a fireproof safe).

If the host is lost and the safe is lost, the off-box mirror is
unrecoverable. This is acceptable risk at solo-dev scale; reviewer
flag if it isn't.

## §10 Archive-folder snapshots

### §10.1 Default posture: filesystem-as-is

`/mnt/solemd-graph/archives/serving-packages/` and the other
archive subdirs declared in `01 §4` are filesystem-only today.
Their retention is governed by `04 §7.4` (projection-run package
retention) and `01 §3` (bundle retention pending size pressure),
not by this doc.

For backup purposes, these directories are:

- **In scope of the off-box mirror** when §9 triggers (rclone sync
  picks them up alongside the pgBackRest repo).
- **Not in scope** of any local snapshot tool today.

### §10.2 If a stronger contract is needed

If `04 §7.4`-driven filesystem retention proves insufficient — e.g.,
a serving-package gets accidentally `rm -rf`'d before its 90-day
retention window expired — restic or kopia is the candidate for
content-addressed local snapshotting:

- **restic** is mature, single-binary, supports B2 backend natively,
  encryption-at-rest by default. Familiar to most ops practitioners.
- **kopia** is newer, more concurrent, has a UI, GC story is more
  intuitive. Less battle-tested at the workloads we care about.

**Default today**: filesystem retention rules in `04 §7.4` plus the
off-box mirror in §9 are sufficient. Restic / kopia are deferred.

### §10.3 Bundle directory backup

`/mnt/solemd-graph/bundles/<graph_run_id>/` is rebuildable from
`solemd.graph_runs` ledger + the warehouse data the run consumed.
However, rebuilding a bundle is a long graph-build pipeline run
(hours), so **bundles are mirror-eligible** when §9 triggers:
trading B2 storage cost (cheap) against rebuild compute cost
(expensive in operator wall-clock).

## §11 RTO / RPO targets

Every backed-up system carries an explicit (RTO, RPO) pair. These are
**committed targets**, not aspirations.

| System | RTO | RPO | Justification |
|---|---|---|---|
| `graph-db-serve` (PITR, single-table or whole-cluster) | 30–60 min | ≤ 5 min | pgBackRest restore at `process-max=4` on NVMe-backed PGDATA + WAL replay. RPO = `archive_timeout = 60s` × small WAL queue = max 5 min. |
| `graph-db-warehouse` (full rebuild from raw + dumps) | 5–9 h | 24 h | `research-distilled §2` benchmark: 638 GB S2 + 210 GB PT3 bulk load on this hardware = 5–9 h with UNLOGGED → indexed → LOGGED. Dumps lay the identity / ledger subset back in < 30 min. RPO = nightly dump cadence. |
| `graph-db-warehouse` (single dumped warehouse table) | 15–30 min | 24 h | Per-table `pg_restore` + atomic-swap pattern in §4.6. |
| `graph-opensearch` (full re-index from serve) | 2–6 h | = projection cadence | `07 §7` bulk-then-freeze on warm tier (~14 M docs) is the worst case. Hot tier alone is ~30 min. |
| `graph-opensearch` (snapshot-restore) | 30–90 min | ≤ 24 h | When snapshot is fresher than the most recent published cohort. |
| `graph-redis` | n/a (cache regenerates on miss) | ∞ | Acceptable per §6. |
| Langfuse | n/a (no backup) | sliding 30 d (Cloud) | Per §7 — telemetry, not record-of-truth. Loss flushes recent trace history; no SoleMD canonical state at risk. |
| Whole-host disk loss (everything on `/mnt/solemd-graph/` is gone) | 24–72 h | depends on §9 trigger state | Re-provision host, re-download raw releases (12–18 h on residential gigabit), restore from off-box if §9 active, otherwise rebuild warehouse from raw + accept loss of any unmirrored serve data. |

**The 24–72 h whole-host RTO is the load-bearing reason §9 must
activate the moment serve holds irreplaceable data.** Without §9,
serve loss in a host-disk-loss scenario is total — there is no
recovery path.

## §12 Disaster scenarios + runbooks

Six scenarios. Each has a step-by-step runbook calibrated to the
RTO / RPO above. Langfuse loss is not a disaster scenario — per §7
the data is sliding-window telemetry and recent trace history is
acceptable to lose.

### §12.1 Single-table corruption on serve (PITR + selective restore)

**Symptom**: `solemd.paper_api_cards` rows mass-deleted by a bad
projection swap; cohort orchestrator paused.

**Procedure**:
1. Identify last-known-good time from Loki + projection-actor logs.
2. Spin up a temporary serve cluster (`graph-db-serve-restore`) on a
   sidecar volume via `--profile restore` (Compose profile to be added):
   `docker compose --profile restore up -d graph-db-serve-restore`.
3. Run the §3.6 PITR runbook against the restore cluster, target =
   pre-corruption time.
4. Dump the affected table from the restore cluster:
   `docker exec graph-db-serve-restore pg_dump -t solemd.paper_api_cards
    --format=custom > /tmp/recovery.pgdump`.
5. Restore into live serve as `paper_api_cards_recovered`, swap atomically
   per the projection contract (`04 §3.5`).
6. Update `serving_runs.build_status` to mark the bad cohort as
   `aborted=3`.
7. Tear down `graph-db-serve-restore`.

**RTO**: 60–90 min (most of the cost is the PITR replay).

### §12.2 Whole-serve disk loss (full pgBackRest restore)

**Symptom**: NVMe failure, `graph_serve_pg-data` volume gone.

**Procedure**: §3.7 in full. Engine API stays down until restore
completes; Cloudflare maintenance page on the Vercel side.

**RTO**: 30–60 min.

### §12.3 Whole-warehouse disk loss

**Symptom**: E-drive VHDX corruption, `/mnt/solemd-graph/pg-data/` gone.
Raw releases under `/mnt/solemd-graph/data/` may or may not survive
depending on extent of damage.

**Procedure**:
1. Drop the warehouse cluster: `docker compose --profile db down -v`
   (the `-v` is destructive; use only when confirming the volume is
   already lost).
2. Re-init `/mnt/solemd-graph/pg-data/` (empty bind, fresh PG init).
3. Bring up: `docker compose --profile db up -d graph-db-warehouse`.
4. Apply the warehouse SQL schema / migration set via
   `engine/db/scripts/schema_migrations.py` (per `06 §8` / `12`).
5. If raw releases survived: re-run ingest from `/mnt/solemd-graph/data/`
   per `05 §6`. ETA 5–9 h for S2 + PT3.
6. If raw releases also lost: re-download S2 + PT3 from upstream
   first (12–18 h on residential gigabit). Then step 5.
7. After ingest publishes, restore dumped identity / ledger tables from
   `/mnt/solemd-graph/warehouse-logical-dumps/<latest>/` per §4.6
   per-table runbook. This restores manually-curated state
   (`concept_search_aliases` whitelisting, etc.) that ingest does
   not regenerate.
8. Re-trigger projection cohort (`04 §3`) to repopulate serve.

**RTO**: 5–9 h (raw survived) or 18–28 h (raw lost). RPO: 24 h on
the dumped identity / ledger subset.

### §12.4 OpenSearch index corruption

**Symptom**: Cluster RED on `paper_index_<run_token>`, `_warmup` returning 500.

**Procedure A (canonical, faster RTO when serve is healthy)**:
1. Re-trigger `opensearch.build_paper_index` from the cohort
   orchestrator (`07 §7.2`).
2. Wait for `force_merge` + `_warmup` to complete.
3. Alias swap per `07 §8.2`.

**Procedure B (snapshot-restore, when serve is concurrently down)**:
1. §5.3 runbook.

**RTO**: 2–6 h (A, warm tier) or 30–90 min (B).

### §12.5 Whole-host disk loss

**Symptom**: NVMe + E-drive VHDX both lost. Worst case.

**Procedure**:
1. Re-provision host (Windows + WSL2 + native dockerd + systemd per
   `00 §1`).
2. Restore `/mnt/solemd-graph/` from off-box mirror if §9 active. If
   §9 not active and no mirror exists, the irreplaceable data on
   serve is **lost** — this is the load-bearing reason §9 must
   trigger before serve holds real user data.
3. Re-pull container images via `docker compose pull`.
4. Re-init containers. Restore serve from pgBackRest repo (now
   restored from off-box mirror to the new E-drive).
5. Re-download raw releases (or restore from off-box mirror if
   bundles + raw are mirrored).
6. Re-build warehouse per §12.3.
7. Re-build OpenSearch indexes per §12.4 Procedure A.

**RTO**: 24–72 h. **RPO**: depends on §9 mirror state at moment of
loss.

### §12.6 Repo-self-corruption

**Symptom**: `pgbackrest verify` fails (§3.8). Repo internal
checksums no longer match.

**Procedure**:
1. Stop scheduled backups (`pg_cron` on serve).
2. Inspect `pgbackrest info --output=json` for the affected stanza.
3. If the corruption is local-only and §9 mirror is active:
   `rclone copy b2-encrypted:pgbackrest-repo/<stanza>/ /mnt/solemd-graph/pgbackrest-repo/<stanza>/`
   to refresh from off-box.
4. If §9 not active: pgBackRest's `expire` command can drop the
   corrupted backup set; subsequent backups land fresh. Accept the
   gap in retention.
5. Re-enable scheduled backups; force a full to seed a clean baseline.

**Severity**: `severity=page` per `10 §10.1`. Repo corruption in a
no-mirror state is a true emergency.

## §13 Operational cadence + alerts

### §13.1 pg_cron schedule (on serve)

```sql
-- All schedules registered on graph-db-serve, the always-up cluster.
-- Backup orchestration lives on serve so warehouse can be down at
-- backup time; backup actor wakes warehouse if needed.

-- Serve full (Sunday)
SELECT cron.schedule('serve-full-weekly', '0 3 * * 0',
  $$ SELECT engine_admin.enqueue_dramatiq_actor('serve.pgbackrest_full', '{}'::jsonb) $$);

-- Serve differential (Mon-Sat)
SELECT cron.schedule('serve-diff-daily', '0 3 * * 1-6',
  $$ SELECT engine_admin.enqueue_dramatiq_actor('serve.pgbackrest_diff', '{}'::jsonb) $$);

-- Warehouse logical dumps (daily, 02:30)
SELECT cron.schedule('warehouse-logical-dump-nightly', '30 2 * * *',
  $$ SELECT engine_admin.enqueue_dramatiq_actor('warehouse.logical_dump_nightly', '{}'::jsonb) $$);

-- OpenSearch snapshots (daily, 04:00)
SELECT cron.schedule('opensearch-snapshot-daily', '0 4 * * *',
  $$ SELECT engine_admin.enqueue_dramatiq_actor('opensearch.snapshot_daily',
                                                 '{"snapshot_kind":"daily"}'::jsonb) $$);

-- OpenSearch weekly snapshot
SELECT cron.schedule('opensearch-snapshot-weekly', '30 4 * * 0',
  $$ SELECT engine_admin.enqueue_dramatiq_actor('opensearch.snapshot_daily',
                                                 '{"snapshot_kind":"weekly"}'::jsonb) $$);

-- pgBackRest verify (daily, 06:00)
SELECT cron.schedule('pgbackrest-verify-daily', '0 6 * * *',
  $$ SELECT engine_admin.enqueue_dramatiq_actor('serve.pgbackrest_verify', '{}'::jsonb) $$);

-- Quarterly restore drill (cron triggers reminder; drill itself is
-- operator-driven per §14)
SELECT cron.schedule('restore-drill-reminder', '0 10 1 1,4,7,10 *',
  $$ SELECT engine_admin.enqueue_dramatiq_actor('ops.restore_drill_reminder', '{}'::jsonb) $$);
```

### §13.2 Dramatiq actors (engine-side)

All under `engine/app/ops/backup/`:

| Actor | Queue | Role | Pool | time_limit |
|---|---|---|---|---|
| `serve.pgbackrest_full` | `ops` | n/a (calls sidecar) | n/a | 4 h |
| `serve.pgbackrest_diff` | `ops` | n/a | n/a | 1 h |
| `serve.pgbackrest_verify` | `ops` | n/a | n/a | 1 h |
| `warehouse.logical_dump_nightly` | `ops` | `engine_warehouse_admin` | `warehouse_read` (read) + sidecar exec for `pg_dump` | 6 h |
| `opensearch.snapshot_daily` | `ops` | n/a (OS HTTP) | n/a | 1 h |
| `ops.restore_drill_reminder` | `ops` | n/a | n/a | 5 min |

Each actor follows the §13.3 emit contract.

### §13.3 Prometheus emission

Every backup actor emits:

- `backup_run_total{actor, outcome}` — counter,
  `outcome ∈ {success, failure, skipped}`.
- `backup_run_duration_seconds{actor}` — histogram, buckets
  `(60, 300, 900, 1800, 3600, 7200, 14400, 28800)`.
- `backup_repo_size_bytes{repo, stanza}` — gauge.
- `backup_last_successful_run_timestamp_seconds{actor}` — gauge;
  load-bearing for the missed-run alert.

### §13.4 Alerts (additive to `10 §10.1`)

```yaml
- name: solemd-graph-backup
  rules:

    - alert: BackupMissedRun
      expr: |
        time() - max by (actor) (
          backup_last_successful_run_timestamp_seconds
        ) > 86400 * 1.5
      for: 1h
      labels:
        severity: page
      annotations:
        summary: "Backup actor {{ $labels.actor }} has not succeeded in > 36 h"
        runbook: docs/rag/11-backup.md#13-operational-cadence--alerts

    - alert: BackupRunFailureSpike
      expr: |
        rate(backup_run_total{outcome="failure"}[6h]) > 0
      for: 10m
      labels:
        severity: page
      annotations:
        summary: "Backup actor {{ $labels.actor }} failing"

    - alert: PgBackRestVerifyFailure
      expr: |
        backup_run_total{actor="serve.pgbackrest_verify",outcome="failure"} > 0
      for: 0m
      labels:
        severity: page
      annotations:
        summary: "pgBackRest verify failed — repo integrity at risk"
        runbook: docs/rag/11-backup.md#128-repo-self-corruption

    - alert: BackupRepoSizeRunaway
      expr: |
        backup_repo_size_bytes{repo="pgbackrest"} > 5e11   # 500 GB
      for: 1h
      labels:
        severity: warn
      annotations:
        summary: "pgBackRest repo > 500 GB; review retention or grow E-drive"

    - alert: RestoreDrillOverdue
      expr: |
        time() - restore_drill_last_success_timestamp_seconds > 86400 * 100
      for: 6h
      labels:
        severity: warn
      annotations:
        summary: "No restore drill in > 100 days; quarterly cadence breached"
```

`BackupMissedRun` at 36 h tolerates one missed daily run (e.g.
maintenance window) before paging. `BackupRunFailureSpike` is
zero-tolerance — any failure pages.

## §14 Periodic restore-drill discipline

### §14.1 The rule

A backup that has not been restored is a hypothesis, not a fact.
**Quarterly**, on the first business day of January / April / July /
October, the operator runs a full restore drill.

### §14.2 Drill procedure

`bin/restore-drill` (checked into the repo) executes:

1. Spin up `graph-db-serve-restore-test` (Compose `--profile
   restore-drill`).
2. `pgbackrest --stanza=serve --type=default restore` into the test
   container.
3. Smoke queries against `solemd.serving_runs`,
   `active_runtime_pointer`, `graph_runs`, `paper_api_cards`; tee to
   `/mnt/solemd-graph/restore-drills/<ts>/smoke.log`.
4. `pg_restore --table=solemd.concepts` from the latest nightly
   logical dump.
5. Snapshot-restore one OpenSearch snapshot into a renamed index
   (test against live OS during a quiet window, or sidecar instance).
6. Stamp `solemd.restore_drill_ledger` (§14.3) with the outcome.
7. `docker compose --profile restore-drill down -v` teardown.

### §14.3 Restore-drill ledger

A small additive table on serve:

```sql
CREATE TABLE solemd.restore_drill_ledger (
    drill_date              timestamptz NOT NULL DEFAULT now(),
    outcome                 text NOT NULL CHECK (outcome IN ('success', 'partial', 'failure')),
    smoke_log_path          text,
    notes                   text,
    PRIMARY KEY (drill_date)
);
COMMENT ON TABLE solemd.restore_drill_ledger IS
  'Audit trail of quarterly restore drills per 11 §14. RestoreDrillOverdue '
  'alert fires when latest drill_date is > 100 days old.';
```

The `restore_drill_last_success_timestamp_seconds` Prometheus gauge
(used by the §13.4 alert) is computed from this table by an exporter
in `graph-engine-api`.

### §14.4 Why this matters

Without periodic restore tests: (1) pgBackRest repo silently rots
(filesystem corruption, missing WAL segment, backup-label mismatch)
unnoticed until a real incident; (2) the runbook drifts from reality
(compose service names, volume layouts, role grants) and the first
real restore is also the first runbook exercise; (3) operator recall
decays. The drill exercises all three quarterly. **Backup without
restore drill is theatre.**

## Cross-cutting invariants

These are the invariants every backup-related code path, schedule,
and config must satisfy. Violations are review-blocking.

1. **Every state-bearing surface declared in `00 / 01 / 02 / 03 / 07 /
   10` appears in §2's per-system table exactly once.** A new
   state-bearing surface added in any of those documents triggers a
   §2 amendment.
2. **Every backed-up surface has an explicit (RTO, RPO) pair in §11.**
   No "best effort" without a wall-clock target.
3. **Every backed-up surface has a concrete restore runbook in §3 /
   §4 / §5 / §12.** Restore-by-vibes is not a runbook.
4. **Every scheduled backup actor emits the §13.3 metric set with the
   `actor` label populated.** Missing-emission breaks the
   `BackupMissedRun` alert.
5. **`pgbackrest verify` runs daily and pages on failure.** Repo
   integrity is non-negotiable.
6. **Quarterly restore drill is mandatory.** §14.1.
7. **The pgBackRest repo on `/mnt/solemd-graph/pgbackrest-repo/`
   shares the same disk as warehouse data.** Acknowledged
   co-location risk per `01 §5`. Off-box mirror is the answer once
   §9 triggers; until then, host-disk loss = serve loss.
8. **Off-box mirror is encrypted at rest.** Local repo can stay
   unencrypted on a single-user host; the moment data leaves the
   host, it is encrypted via pgBackRest cipher (PG side) or rclone
   crypt (everything else). Keys live in `pass`(1).
9. **Logical dumps are per-table, not schema-wide.** Partial restore
   is the dominant restore mode; per-file dumps make it trivial.
10. **Snapshot-restore is the acceleration path; full re-index from
    serve is the canonical path for OpenSearch.** This ranking is
    explicit per §5.4.
11. **Redis loss is acceptable.** RDB-only persistence is the locked
    posture. Reviewer signs off per §6.3.
12. **`archive_command` placeholders that fake success
    (`'/bin/true'`) are forbidden.** Per `research-distilled §7` /
    PG docs. `archive_mode = off` is the correct pre-wiring posture
    until §3 sidecar lands.

## §N Decisions — locked / provisional / deferred

### Locked

| Decision | Rationale |
|---|---|
| pgBackRest is the sole serve-PG backup tool | `research-distilled §7`; mature, repo + WAL semantics, parallel restore, multi-stanza native. |
| Single shared repo at `/mnt/solemd-graph/pgbackrest-repo/`, multiple stanzas | pgBackRest documented multi-stanza pattern; single backup target on the same E-drive as warehouse data per `01 §3`. |
| Serve cadence: full Sun 03:00, diff Mon–Sat 03:00, 5-min WAL | OLTP-like serve pattern; `01 §5` storage envelope tolerates retention. |
| Warehouse: pg_dump per-table custom-format on the dumped identity / ledger subset only | `02 §1` classification plus the §4.3 skip set; bulk source-derived and deterministic bulk canonical tables rebuild from raw releases per `05 §6`. |
| Warehouse dump cadence: daily 02:30 UTC | Before serve full / diff window so disk I/O does not collide. |
| Per-table `pg_dump` files (not schema-wide) | Partial-restore-friendly per §4.6 runbook. |
| OpenSearch: `fs`-repo snapshot daily + weekly | `07 §10` declared the repo; this doc supplies the cadence. |
| OpenSearch snapshot is acceleration only; canonical recovery is re-index from serve | §5.4 ranking. |
| Redis: RDB-only, no AOF, NVMe target | Cache loss acceptable; broker queue rebuilds from PG ledger. |
| `archive_command = 'pgbackrest --stanza=serve archive-push %p'` (replacing `09 §4` placeholder) | §3.4. Triggers the `09 §4` upstream amendment. |
| Backup actors emit `backup_*` Prometheus metrics with `actor` label | §13.3. Required for `BackupMissedRun` alert. |
| Quarterly restore drill is mandatory; tracked in `solemd.restore_drill_ledger` | §14. |
| `pgbackrest verify` runs daily | §3.8. |
| Off-box mirror trigger: first irreplaceable serve row | §9.1. |
| Off-box: Backblaze B2 + rclone (crypt) | `research-distilled §7`; rare-restore profile favors B2. |
| Per-system irreplaceability classification (§2) | The classification *is* the contract. |
| RTO / RPO contract format per §11 | Targets, not aspirations. |

### Provisional

| Decision | Revisit trigger |
|---|---|
| Serve retention windows (4 full + 28 diff + 7-day WAL) | First quarterly drill against real data; storage usage trend. |
| Warehouse logical-dump local retention 30 days | Disk pressure on E-drive vs §9 mirror availability; first quarterly drill. |
| OpenSearch snapshot retention 7 daily + 4 weekly | First snapshot-driven recovery exercise. |
| pgBackRest sidecar image pin (`pgbackrest/pgbackrest:2.55`) | Upstream PG-18-compatible image lands; community vs upstream selection. |
| `pg_dump --compress=9` (zlib) vs switching to `--compress=zstd` | First restore drill measures restore wall-clock; zstd may halve it. |
| Encryption posture (local repo unencrypted, off-box encrypted) | Off-box mirror activation date; multi-user access scenario. |
| Whether `pgbackrest verify` granularity should grow to per-backup checksum | Quarterly drill discovers latent corruption. |

### Deferred

| Decision | Trigger |
|---|---|
| Off-box mirror — Backblaze B2 + rclone, or NAS purchase if project growth warrants the hardware (§9) | First irreplaceable serve row (auth, user notes, real saved data) **or** project-growth signal that warrants dedicated backup hardware. |
| Encryption-at-rest on local pgBackRest repo | Multi-user host scenario or compliance requirement. |
| restic / kopia for archive-folder snapshots (§10.2) | `04 §7.4` filesystem-retention proves insufficient. |
| MinIO-fronted S3 OpenSearch snapshot repo | `01 §8` MinIO-fronts-`archives/` decision lands. |
| Pluggable secondary repo (separate disk for pgBackRest) | E-drive I/O contention between warehouse writes and pgBackRest reads becomes measurable per `01 §8`. |
| Cross-host backup mirror (second machine on Tailscale) | Off-box mirror cost or restore-time becomes the bottleneck. |

## Open items

1. **pgBackRest sidecar image source for PG 18.** As of 2026-04-17
   the official `postgres:18` image does not bundle pgBackRest;
   community images exist but selection is not pinned. First
   implementation PR must select and pin one.

2. ~~Langfuse self-host activation~~ — **resolved**. Per the
   reviewer's clarification (2026-04-17), Langfuse is sliding-window
   telemetry under any deployment posture; no backup contract
   applies, even if self-host eventually lands. §7 of this doc
   provision today. Reviewer must confirm which is canonical.

4. **Compose `--profile restore` / `--profile restore-drill`** are
   referenced by §12 / §14 but not yet declared in
   `docker/compose.yaml`. First implementation PR adds them.

5–9 are flagged as **upstream amendments** below.

## Upstream amendments

This document forces the following amendments to upstream docs. None
block §11 itself; they land as part of the §3 / §6 / §14 implementation
PRs.

1. **`09 §4` lines 379–382** — replace
   ```
   archive_mode    = off
   archive_command = ''
   ```
   with
   ```
   archive_mode    = on
   archive_command = 'pgbackrest --stanza=serve archive-push %p'
   archive_timeout = 60s
   ```
   the day the §3 sidecar lands. Until then, `09 §4` is correct as
   written.

2. **`01 §1` Volume inventory** — add
   ```
   | `graph_redis_data` | named volume | `graph-redis:/data` | Redis 8 RDB | serving |
   ```
   when §6 persistence activates.

3. **`01 §5` NVMe sizing table** — add a line for `graph_redis_data`
   (~5 GB steady, ~10 GB peak).

4. **`03 §4` schema** — add `solemd.restore_drill_ledger` table
   per §14.3.

5. **`06 §7` PG role list** — add `engine_warehouse_admin` for
   warehouse logical-dump operations.

6. **`10 §13.7` metric inventory** — add
   `backup_run_total`, `backup_run_duration_seconds`,
   `backup_repo_size_bytes`,
   `backup_last_successful_run_timestamp_seconds`, and
   `restore_drill_last_success_timestamp_seconds` to the metric
   table; add the §13.4 alert rules to `10 §10.1`.

7. **`07 §10` snapshot-repo declaration** — already references this
   doc for retention (`07 §10` says "see `11-backup.md` for
   retention"). No change needed; §5.2 supplies the values.
