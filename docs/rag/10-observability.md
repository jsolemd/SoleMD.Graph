# 10 — Observability

> **Status**: locked for stack shape, container placement, collector
> set, label taxonomy, PG / OpenSearch / Redis / engine instrumentation
> surfaces, and the Langfuse-vs-Prometheus split contract. The first
> worker telemetry slice is landed in `apps/worker`: Dramatiq
> Prometheus middleware and `prometheus_client` application metrics
> share per-scope multiprocess stores for `ingest`, `corpus`, and
> `evidence`. Prometheus + Grafana provisioning for those worker lanes
> now lives in `SoleMD.Infra/infra/observability/`, using host
> networking to scrape the host-run worker endpoints on `9464` /
> `9465` / `9466` and exposing local UIs on Prometheus `9095` and
> Grafana `3300`. Loki / Alloy / Alertmanager and the wider non-worker
> exporter set remain deferred.
>
> **Date**: 2026-04-16
>
> **Supersedes**: any earlier ad-hoc observability guidance in
> `docs/rag-future.md §7` that pre-dated the split into a
> project-scoped vs shared-infra stack. The always-up observability
> containers named in `00-topology.md §1` (Prometheus, Grafana, Loki,
> Alloy) live in `shared-infra`, not `SoleMD.Graph`; the PG-cluster /
> Redis / OpenSearch exporters live in `SoleMD.Graph`'s compose and
> scrape locally. Project-specific sizing in `01-storage.md` (volumes
> `graph_prometheus_data`, `graph_grafana_data`, `graph_loki_data`)
> remains the target for the shared stack's on-disk state.
>
> **Scope**: this doc supplies the observability substrate. Every
> metric, structured log event, and Langfuse span declared by 04–09
> lands here with a collector, retention rule, dashboard surface, and
> alert policy where warranted. This doc does not re-declare those
> emission-side requirements — it inventories them in §13 / §14 / §15
> and wires them.
>
> **Authority**: this doc is authority for runtime observability —
> scrape configs, exporter deployment, dashboard-as-code layout, alert
> rules, retention policy, Langfuse deployment shape, and
> the label taxonomy. It is **not** authority for the RAG evaluation
> design (datasets, evaluators, experiments) — that is owned by the
> `langfuse` skill and `.claude/skills/langfuse/references/benchmarking.md`.
> This doc supplies the infrastructure the eval system runs on.

## Purpose

`04 / 05 / 06 / 07 / 08 / 09` each emit an observability surface:
projection-lane metrics and structured logs, ingest-lane metrics,
async-stack pool and actor metrics, OpenSearch per-lane latency and
bulk-load audit, cascade Langfuse traces + per-stage counters, and
`pg_stat_*` tuning-validation views. This document collects them.

Two product concerns share this surface and must remain
distinguishable:

1. **Operational telemetry** — PG / OpenSearch / Redis / Docker /
   engine process health; queue depth; disk / GPU; request latency;
   failure counters. Prometheus + Grafana + Loki are the substrate.
2. **RAG-quality telemetry** — per-request cascade trace, LLM-judge
   scores, dataset-run evaluators, faithfulness / context-relevance
   metrics. Langfuse Cloud is the substrate.

The two surfaces are cross-linked by exemplars (Prometheus histogram
bucket → Langfuse trace id) but never merged — a p95 spike in
`cascade_request_duration_seconds` is an operational concern; a
drop in faithfulness score on a benchmark run is a quality concern.

## §0 Conventions delta from `00 / 04 / 05 / 06 / 07 / 08 / 09`

Inherits every convention from those documents. This doc adds:

| Concern | Observability delta |
|---|---|
| **Label taxonomy** | Every Prometheus metric emitted inside SoleMD.Graph carries four mandatory labels injected at scrape time (via `external_labels` on this project's Prometheus instance, or via `relabel_configs` in the shared Prometheus): `project=solemd.graph`, `cluster=<warehouse|serve|opensearch|redis|engine-api|graph-worker>`, `role=<db|search|cache|api|worker|pooler|exporter>`, `environment=dev`. Per-metric labels from 04–09 (`family`, `lane`, `stage`, `source_code`, `phase`, `outcome`, `failure_class`, `query_type`, `index`) stack on top. No per-`corpus_id`, per-`evidence_key`, per-`trace_id`, or per-`ingest_run_id` labels — those live on logs and traces. The cardinality budget is enforced by a CI lint that greps the engine for `prometheus_client` metric instantiations and rejects labels matching the blocklist. |
| **Langfuse-vs-Prometheus split contract** | RAG-quality signals (faithfulness, context relevance, answer relevance, LLM-judge scores, per-dataset eval run outcomes) live in Langfuse. Operational signals (latency, throughput, error counters, cache hit ratio, pool state, disk, GPU) live in Prometheus. Cascade per-stage latency is the only quantity dual-emitted: Prometheus histogram for operational dashboarding + alerting (`cascade_stage_duration_seconds`), Langfuse span for per-request trace reconstruction. The two are linked via exemplars, not joined at the data layer. |
| **Sibling batch-quality surface** | `10a-rag-quality-analyzer.md` is the sibling authority for offline batch analytics derived from cascade traces and persisted in `solemd.rag_quality_metrics`. `10` owns live operational telemetry, Langfuse wiring, and Grafana plumbing; `10a` owns the Postgres-backed quality table and the batch dashboard query surface. No shared metric tables. |
| **Exemplar wiring rule** | Every histogram on the cascade's hot path (`cascade_request_duration_seconds`, `cascade_stage_duration_seconds`) MUST attach the active Langfuse `trace_id` as an exemplar. Jumping from a Grafana latency panel to the exact cascade trace is a product feature, not an optional debugging convenience. The emit helper in `engine/app/observability/metrics.py` enforces this on every `.observe()` call inside a cascade span context. |
| **Dashboard-as-code discipline** | Current worker dashboards are provisioned from committed JSON under `SoleMD.Infra/infra/observability/grafana/dashboards/`. Hand-edits in the Grafana UI are for exploration only; the committed dashboard file remains canonical. If the dashboard set expands materially, migrating the source-of-truth to Grafonnet is acceptable, but JSON provisioning is the current contract. |
| **Alert severity taxonomy** | Two tiers. `severity=page` — user-visible outage, data loss, or read-path broken; routes to ntfy.sh (sole-developer pager); counter example: serve cluster down, OpenSearch RED, cascade p95 > 800 ms, disk < 10 %. `severity=warn` — degradation or capacity risk; routes to email (`jsolemd@gmail.com`); counter example: autovacuum lag, Redis memory pressure, evaluator failure rate elevated. No third tier — at solo-dev scale a three-tier policy devolves into noise. |
| **Project-scoped vs shared-infra placement** | Prometheus, Grafana, Loki, Alloy run in shared-infra's compose and scrape across the `solemd-shared-infra` Docker network plus any project's `graph-internal` network that Alloy is a member of. The project-scoped exporters (`postgres_exporter` ×2, `redis_exporter`, `opensearch-prometheus-exporter`, `pgbouncer_exporter`, `dcgm-exporter`, `node_exporter`, `cadvisor`) live in SoleMD.Graph's compose and expose their scrape targets on the `graph-internal` network. This decision is §2.2 and is **locked**. |
| **Cross-signal navigation** | A Grafana panel on `cascade_request_duration_seconds` with exemplars enabled produces click-through to the Langfuse trace UI (via a data-link template using the `trace_id` exemplar label). Same pattern on Loki — every log with a `trace_id` field produces a "view in Langfuse" quick-link via a Grafana Loki derived field. This is the 2026 "metrics → logs → traces" pattern (Prometheus exemplars spec, <https://prometheus.io/docs/instrumenting/exposition_formats/#exemplars>; Grafana data links, <https://grafana.com/docs/grafana/latest/panels-visualizations/configure-data-links/>). |

## §1 Identity / boundary

This document declares **no new canonical identity types**. It
consumes every identity declared upstream:

- `serving_run_id`, `api_projection_run_id`, `graph_run_id`,
  `chunk_version_key`, `ingest_run_id` (`02 §2`, `03 §2`, `05 §1`).
- `trace_id` (UUIDv7; `08 §15.2`, created per cascade request).
- `corpus_id`, `evidence_key`, `cohort_id` (`02 §2`, `03 §2`).

These identities surface on structured logs and on Langfuse traces.
They **do not** surface as Prometheus labels — §0 cardinality budget.
Cross-signal navigation uses them as join keys via exemplars and
Loki-derived fields, not via Prometheus label dimensions.

## §2 Stack topology

### §2.1 Services

```
┌───────────────────────────────────────────────────────────────────┐
│ shared-infra compose                                              │
│                                                                   │
│   graph-prometheus ─ scrapes ─► host-run graph workers            │
│   graph-grafana   ─ queries ─► graph-prometheus                   │
│                                                                   │
│   deferred shared surfaces:                                       │
│     loki / alloy / alertmanager / wider exporter fleet            │
│                                                                   │
├───────────────────────────────────────────────────────────────────┤
│ SoleMD.Graph compose (graph-internal network)                     │
│                                                                   │
│   postgres_exporter-serve     ── scrapes graph-db-serve           │
│   postgres_exporter-warehouse ── scrapes graph-db-warehouse       │
│   pgbouncer_exporter          ── scrapes pgbouncer-serve          │
│   redis_exporter              ── scrapes graph-redis              │
│   opensearch-prometheus-exporter (plugin inside graph-opensearch) │
│   dcgm-exporter               ── GPU metrics                      │
│   node_exporter               ── host-cgroup metrics              │
│   cadvisor                    ── container-level metrics          │
│                                                                   │
│   graph-engine-api exposes:                                       │
│     :9464 /metrics   — prometheus-client                          │
│                                                                   │
│   apps/worker queue-owned roots expose:                           │
│     app.ingest_worker   :9464 /metrics                            │
│     app.corpus_worker   :9465 /metrics                            │
│     app.evidence_worker :9466 /metrics                            │
│   each backed by its own multiprocess scope under                 │
│     .state/prometheus/<scope>                                     │
│     :4317 otlp/grpc → alloy (logs + traces)                       │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

External:
  Langfuse Cloud (EU `cloud.langfuse.com` or US `us.cloud.langfuse.com`)
  receives OTLP/HTTP traces from Alloy and serves the benchmark /
  quality UI directly.

### §2.2 Placement decision

**Locked for the worker slice**: Prometheus and Grafana run in
`SoleMD.Infra/infra/observability`. Langfuse runs in the managed cloud
for the workstation phase. Worker instrumentation surfaces run in
SoleMD.Graph as host processes and are scraped through
`host.docker.internal`. Loki, Alloy, Alertmanager, and the wider
exporter fleet remain the next observability expansion, not part of the
landed worker slice.
Rationale:

- Single pane of glass across SoleMD.Graph, SoleMD.Make, and any
  future project. A scrape config centralized in `shared-infra` can
  discover new projects as they join the `solemd-shared-infra`
  network.
- Retention costs (`graph_prometheus_data`, `graph_grafana_data`,
  `graph_loki_data` in `01 §1 / §2`) sit on SoleMD.Graph's NVMe
  named-volume inventory today; when shared-infra moves to its own
  volumes they will migrate together and these volumes become
  vestigial (flagged as a `12-migrations.md` task — see Open items).
- Exporters stay close to the target for two reasons: (1) Unix-domain
  or localhost scraping paths are simpler than cross-network, and
  (2) exporter lifecycle matches the target container's lifecycle
  (warehouse is on-demand; the warehouse `postgres_exporter` is in
  the same compose profile `db`).

**Consequence for §0 labels**: shared Prometheus injects
`project=solemd.graph` at scrape time via `relabel_configs` on the
discovery set for this project; project-local exporters never
hard-code the label.

### §2.3 Docker network shape

Reuses `00-topology.md`'s two-network shape:

- `solemd-shared-infra` — external network; shared-infra services +
  a sidecar Alloy endpoint are attached; every project's Prometheus
  scrape targets and every project's Alloy log-ship endpoint must be
  reachable here.
- `graph-internal` — internal to SoleMD.Graph; exporters and
  instrumented services publish on this network; shared-infra's
  Prometheus is added to this network as a non-primary member so it
  can scrape project-scoped targets without NAT.

### §2.4 Storage placement (per `01`)

Every named volume is on NVMe by design: metrics / logs / dashboard
state / Langfuse hot data are all latency-sensitive reads. Warehouse
FS is not a candidate — a VHDX-backed tmpfs would be storage-class
mismatch.

| Surface | Volume | Retention (default) | Storage class |
|---|---|---|---|
| Prometheus TSDB | `graph_prometheus_data` | 15 d (locked) | NVMe |
| Grafana state | `graph_grafana_data` | lifetime | NVMe |
| Loki chunks + index | `graph_loki_data` | 14 d default (label-specific, §8) | NVMe |
| Langfuse Cloud | external (`cloud.langfuse.com` or `us.cloud.langfuse.com`) | 30 d data access on Hobby | provider-managed |
| Alloy spool | ephemeral | 1 h in-memory + small disk fallback | NVMe |

Implication for `01-storage.md`: there are no local Langfuse data
volumes in the current workstation phase. Cloud adoption removes the
prior `langfuse_*` shared-infra storage surfaces and frees both RAM and
NVMe from the local observability footprint.

### §2.5 `docker-compose.yaml` sketch (this-project side)

```yaml
# docker/compose.yaml — observability subsection; full file in docker/compose.yaml.
# Network / volume / service names per 00-topology.md and 01-storage.md.
# Image tags pinned to latest stable as of 2026-04-16.

services:
  postgres-exporter-serve:
    image: quay.io/prometheuscommunity/postgres-exporter:v0.17.1
    environment:
      DATA_SOURCE_NAME: "postgresql://postgres_exporter@graph-db-serve:5432/serve?sslmode=disable"
      PG_EXPORTER_EXTEND_QUERY_PATH: /etc/postgres-exporter/queries.yaml
    volumes: ["./docker/observability/postgres-exporter/queries.yaml:/etc/postgres-exporter/queries.yaml:ro"]
    networks: [graph-internal, solemd-shared-infra]
    restart: unless-stopped

  postgres-exporter-warehouse:
    image: quay.io/prometheuscommunity/postgres-exporter:v0.17.1
    profiles: ["db"]
    environment:
      DATA_SOURCE_NAME: "postgresql://postgres_exporter@graph-db-warehouse:5432/warehouse?sslmode=disable"
      PG_EXPORTER_EXTEND_QUERY_PATH: /etc/postgres-exporter/queries.yaml
    volumes: ["./docker/observability/postgres-exporter/queries.yaml:/etc/postgres-exporter/queries.yaml:ro"]
    networks: [graph-internal, solemd-shared-infra]

  pgbouncer-exporter:
    image: prometheuscommunity/pgbouncer-exporter:v0.11.0
    environment:
      PGBOUNCER_EXPORTER_CONNECTION_STRING: "postgres://pgbouncer_exporter@pgbouncer-serve:6432/pgbouncer?sslmode=disable"
    networks: [graph-internal, solemd-shared-infra]
    restart: unless-stopped

  redis-exporter:
    image: oliver006/redis_exporter:v1.68.0
    command: ["-redis.addr=redis://graph-redis:6379"]
    networks: [graph-internal, solemd-shared-infra]

  dcgm-exporter:
    image: nvcr.io/nvidia/k8s/dcgm-exporter:3.3.9-3.6.1-ubuntu22.04
    runtime: nvidia
    networks: [graph-internal, solemd-shared-infra]

  node-exporter:
    image: quay.io/prometheus/node-exporter:v1.9.0
    # cgroup-v2 on WSL2: --path.rootfs=/host + host /:ro mount required; see open items.
    command: ["--path.rootfs=/host",
              "--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)"]
    volumes: ["/:/host:ro,rslave"]
    networks: [graph-internal, solemd-shared-infra]
    pid: host

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.50.0
    # WSL2 cgroup-v2: some metrics missing until cgroup hybrid disabled
    # (https://github.com/google/cadvisor/issues/3147).
    privileged: true
    volumes: ["/:/rootfs:ro", "/var/run:/var/run:ro", "/sys:/sys:ro",
              "/var/lib/docker/:/var/lib/docker:ro", "/dev/disk/:/dev/disk:ro"]
    networks: [graph-internal, solemd-shared-infra]

  # graph-opensearch uses the opensearch-prometheus-exporter plugin (§4).
```

## §3 PG instrumentation

### §3.1 Cluster-level extensions

`09 §3` and `09 §4` both set
`shared_preload_libraries = 'pg_stat_statements,auto_explain,pg_buffercache,pg_cron'`
(warehouse) and
`shared_preload_libraries = 'pg_stat_statements,auto_explain,pg_buffercache,pg_prewarm,pg_cron'`
(serve). **No upstream amendment needed** — `09` already has
`pg_stat_statements` and `auto_explain` included. This doc adopts
those values unchanged.

Confirmed values for this doc's collection purposes:

| GUC | Warehouse | Serve | Source |
|---|---|---|---|
| `log_destination` | `stderr,jsonlog` | `stderr,jsonlog` | `09 §3 / §4`; PG 18 jsonlog (<https://www.postgresql.org/about/featurematrix/detail/jsonlog-logging-format/>) |
| `logging_collector` | `on` | `on` | `09 §3 / §4` |
| `pg_stat_statements.max` | 10000 | 10000 | `09 §3 / §4` |
| `pg_stat_statements.track` | `all` | `all` | `09 §3 / §4` |
| `pg_stat_statements.track_utility` | `on` | `on` | `09 §3 / §4` (default; kept explicit) |
| `auto_explain.log_min_duration` | 5000 | 250 | `09 §3` = 5 s bulk; `09 §4` = 250 ms serve. Matches the required-reading brief (warehouse tolerates bulk query duration; serve captures hot-path > 250 ms). The brief's "500 ms serve / 5 s warehouse" is superseded by `09`; **no contradiction** once 09's 250 ms floor is read as a tighter (more inclusive) setting than the brief's 500 ms. |
| `auto_explain.log_analyze` | `off` | `off` | `09 §3 / §4`; too expensive in steady state, flipped on ad-hoc. |
| `auto_explain.log_format` | default | `json` | `09 §4` — serve emits JSON-formatted EXPLAIN plans for Loki parsing. Flag for `09 §3`: warehouse has no `log_format` line; recommend aligning to `json` since Alloy parses both. **Upstream amendment candidate** (non-blocking). |
| `track_io_timing` | `on` | `on` | `09 §3 / §4` |
| `track_wal_io_timing` | `on` | `on` | `09 §3 / §4` |
| `track_functions` | `pl` | `pl` | `09 §3 / §4` |

### §3.2 `postgres_exporter` custom queries

Stock `postgres_exporter` covers database / replication / locks /
activity. SoleMD.Graph adds five custom query sets via
`PG_EXPORTER_EXTEND_QUERY_PATH`
(<https://github.com/prometheus-community/postgres-exporter#adding-new-metrics>):

```yaml
# docker/observability/postgres-exporter/queries.yaml
# Authority: docs/rag/10-observability.md §3.2

serving_runs_status:
  query: "SELECT build_status::text AS build_status, count(*) AS count FROM solemd.serving_runs GROUP BY build_status"
  metrics:
    - build_status: { usage: "LABEL" }
    - count:        { usage: "GAUGE", description: "Row count per serving_runs.build_status (03 §3 / 04 §0)" }

ingest_runs_status:
  query: "SELECT status::text AS status, source_code, count(*) AS count FROM solemd.ingest_runs GROUP BY status, source_code"
  metrics:
    - status:      { usage: "LABEL" }
    - source_code: { usage: "LABEL" }
    - count:       { usage: "GAUGE" }

api_projection_runs_status:
  query: "SELECT build_status::text AS build_status, count(*) AS count FROM solemd.api_projection_runs GROUP BY build_status"
  metrics:
    - build_status: { usage: "LABEL" }
    - count:        { usage: "GAUGE" }

autovacuum_age:
  query: |
    SELECT schemaname || '.' || relname        AS table_fqn,
           extract(epoch FROM now() - last_autovacuum)::bigint AS seconds_since_autovacuum,
           n_dead_tup                          AS dead_tuples
    FROM pg_stat_all_tables
    WHERE schemaname IN ('solemd','pubtator') AND last_autovacuum IS NOT NULL
  metrics:
    - table_fqn:                { usage: "LABEL" }
    - seconds_since_autovacuum: { usage: "GAUGE" }
    - dead_tuples:              { usage: "GAUGE" }

pg_stat_statements_top:
  # Top-50 by total_exec_time; cardinality-capped.
  query: |
    SELECT queryid::text AS queryid,
           calls, mean_exec_time AS mean_exec_ms, total_exec_time AS total_exec_ms,
           temp_blks_written
    FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 50
  metrics:
    - queryid:           { usage: "LABEL" }
    - calls:             { usage: "COUNTER" }
    - mean_exec_ms:      { usage: "GAUGE" }
    - total_exec_ms:     { usage: "COUNTER" }
    - temp_blks_written: { usage: "COUNTER", description: "non-zero → raise work_mem per 09 §13" }
```

Cardinality caveats:

- `autovacuum_age` per table: `solemd` + `pubtator` hot-path tables
  are bounded at ~60 distinct `table_fqn` values at steady state.
  Below the cardinality-per-metric threshold the CI lint guards.
- `pg_stat_statements_top` LIMIT 50 is the cap. Keep `query_preview` out of
  Prometheus labels; dynamic query text belongs in logs or Grafana table
  queries, not time-series labels.

Primary source: `postgres_exporter` custom-queries README,
<https://github.com/prometheus-community/postgres-exporter>, v0.17
(adds `pg_stat_io` baseline collectors).

### §3.3 `auto_explain` → Loki

`auto_explain` emits structured EXPLAIN plans to stderr when a
statement crosses its threshold. With `log_destination=jsonlog`,
Alloy tails the PG jsonlog file (mounted read-only from each
cluster's volume into the Alloy container) and forwards to Loki with
labels `{project="solemd.graph", cluster="serve"|"warehouse",
role="db", event="auto_explain"}`.

Alloy River snippet:

```river
// docker/observability/alloy/pg-logs.river — tails PG 18 jsonlog
loki.source.file "pg_serve" {
  targets = [
    { __path__ = "/var/lib/postgresql/serve/log/postgresql-*.log",
      cluster  = "serve", role = "db", project = "solemd.graph" },
  ]
  forward_to = [loki.process.pg_parse.receiver]
}

loki.process "pg_parse" {
  forward_to = [loki.write.shared.receiver]
  stage.json {
    expressions = {
      ts = "timestamp",
      level = "error_severity",
      message = "message",
      user = "user",
      database = "dbname",
      statement = "statement",
      sqlstate = "sql_state_code",
    }
  }
  stage.labels {
    values = { level = "" , database = "", sqlstate = "" }
  }
}
```

Primary source: Grafana Alloy docs,
<https://grafana.com/docs/alloy/latest/reference/components/loki.source.file/>
(Promtail EOL was early 2024; Alloy is the successor).

### §3.4 Optional extensions

| Extension | Decision | Rationale |
|---|---|---|
| `pg_stat_kcache` | deferred | Adds kernel-level IO timing per statement; useful but requires contrib build in the official image. `pg_stat_io` (PG 18) covers 80 % at zero maintenance cost. |
| `pg_stat_monitor` | forbidden | Conflicts with `pg_stat_statements` at the executor hook. `research-distilled §7`, `09 §N.Locked`. |

## §4 OpenSearch instrumentation

### §4.1 Plugin-based Prometheus export

The current OpenSearch serving line in `16-version-inventory.md` ships the
`prometheus-exporter` plugin
(<https://github.com/aiven/prometheus-exporter-plugin-for-opensearch>)
compatible with the pinned serving line. Enabled in the image build; exposes
`/_prometheus/metrics` on the same HTTP listener as the REST API.
The 15 metric families declared in `07 §13.1` are surfaced via this
plugin plus four application-owned counters emitted by the engine's
OpenSearch client wrapper (`cascade_opensearch_failures_total`,
`opensearch_alias_swap_total`, `opensearch_alias_swap_lag_seconds`,
`opensearch_synonym_reload_total` — see §13 catalog).

Scrape config:

```yaml
# shared-infra prometheus.yml excerpt
- job_name: 'solemd-graph-opensearch'
  metrics_path: '/_prometheus/metrics'
  static_configs:
    - targets: ['graph-opensearch.graph-internal:9200']
  scrape_interval: 15s
  scrape_timeout: 10s
  relabel_configs:
    - target_label: project
      replacement: solemd.graph
    - target_label: cluster
      replacement: opensearch
    - target_label: role
      replacement: search
```

### §4.2 Performance Analyzer

`07 §14.4` (verified reference, not reopened here) names Performance
Analyzer for per-shard / per-thread-pool diagnostics. Enabled as a
sidecar binding on port 9600 per current OpenSearch docs for the pinned
serving line
(<https://docs.opensearch.org/latest/monitoring-your-cluster/pa/index/>).
Performance Analyzer's output is **not** scraped by Prometheus by
default — it's a diagnostic tool invoked ad-hoc. Flag as **deferred**
for automation.

### §4.3 OpenSearch log shipping

OpenSearch JSON logs (`-Elogger.level=INFO` default) tailed by Alloy
and forwarded to Loki. Separate label `phase=bulk_index` versus
`phase=request_path` is applied by Alloy based on the log source
(separate log files per OpenSearch 3.x's logging config, or by a
thread-name filter in the JSON log — the latter is the 2026-stable
path).

```river
loki.source.file "opensearch" {
  targets = [
    { __path__ = "/usr/share/opensearch/logs/opensearch-*.log",
      cluster  = "opensearch", role = "search", project = "solemd.graph" },
  ]
  forward_to = [loki.process.os_parse.receiver]
}

loki.process "os_parse" {
  forward_to = [loki.write.shared.receiver]
  stage.json {
    expressions = { level = "level", component = "component", message = "message" }
  }
  stage.match {
    selector = "{component=~\"o.o.i.r.Bulk.*\"}"
    action   = "labelstage"
    stage.labels { values = { phase = "bulk_index" } }
  }
  stage.labels {
    values = { level = "", component = "" }
  }
}
```

### §4.4 JVM heap and circuit-breaker watch

Emitted by the plugin as `opensearch_jvm_heap_used_percent` and
`opensearch_circuitbreaker_tripped_count` families. Alert policy
§10.

## §5 Redis instrumentation

### §5.1 `redis_exporter`

`oliver006/redis_exporter` v1.68.0 scrapes `INFO`, `LATENCY HISTORY`,
`SLOWLOG`, and by-key-pattern cardinality (disabled by default —
enabled only for the `dramatiq:*` pattern to surface queue depth).

Keys exposed to this doc:

| Metric family | Prom name | Source |
|---|---|---|
| Broker depth | `redis_stream_length{stream="dramatiq:…"}` | `06 §8` Dramatiq queue |
| Cache hit ratio | `redis_keyspace_hits_total`, `redis_keyspace_misses_total` | `08 §15` query-vector cache |
| Memory | `redis_memory_used_bytes`, `redis_memory_max_bytes` | maxmemory threshold |
| Slow log | `redis_slowlog_length` | p99 ops diagnostics |
| Latency events | `redis_latency_spike_last` | Redis `LATENCY HISTORY` |

Primary source: `redis_exporter` README,
<https://github.com/oliver006/redis_exporter>.

### §5.2 `dramatiq` in-process counters

Declared by `06 §10.2`: `dramatiq_actor_invocations_total`,
`dramatiq_actor_duration_seconds`, `dramatiq_actor_retries_total`,
`dramatiq_in_flight_messages`. Exposed via Dramatiq's built-in
Prometheus middleware on each queue-owned worker root's `/metrics`
listener (§6). In `apps/worker`, the middleware shares the same
per-scope multiprocess store as the application-owned
`prometheus_client` counters, histograms, and gauges. Not double-counted
via `redis_exporter`.

## §6 Engine process instrumentation

### §6.1 Library choice

| Concern | Library | Source |
|---|---|---|
| Prometheus metrics | `prometheus-client` ≥ 0.22 | <https://prometheus.github.io/client_python/> — async-safe, exemplar support since 0.18. |
| Tracing | `opentelemetry-api` + `opentelemetry-sdk` + `opentelemetry-exporter-otlp-proto-grpc` | <https://opentelemetry-python.readthedocs.io/> |
| Structured logging | `structlog` + `python-json-logger` | Per `06 §10.3` — already locked. |
| Langfuse | `langfuse` Python SDK v4 | <https://langfuse.com/docs/observability/sdk/overview> |

### §6.2 Metric surface

FastAPI (`graph-engine-api`) and the queue-owned Dramatiq worker roots
expose Prometheus metrics on `/metrics`. For `apps/worker`, the worker
bootstrap prepares one multiprocess directory per local scope and
configures Dramatiq's Prometheus middleware plus application-owned
`prometheus_client` metrics to write into that same scope-local store.

Current local defaults:

- `app.ingest_worker` uses scope `ingest`, directory
  `.state/prometheus/ingest`, and port `9464`
- `app.corpus_worker` uses scope `corpus`, directory
  `.state/prometheus/corpus`, and port `9465`
- `app.evidence_worker` uses scope `evidence`, directory
  `.state/prometheus/evidence`, and port `9466`

`WORKER_METRICS_PORT` remains optional. Leave it unset for local
multi-root development so each queue-owned root gets a distinct port
from `WORKER_METRICS_PORT_BASE`. Setting it pins every scope to one port
and is only safe when a single worker root is running in that host
namespace. The CLI prepares its own `cli` scope for direct runs/tests
but is not a standing scrape target.

### §6.3 Current `apps/worker` application metrics

The current worker-owned metrics emitted by `apps/worker/app/telemetry`
are:

| Lane | Metric families |
|---|---|
| Ingest | `ingest_phase_duration_seconds`, `ingest_runs_total`, `ingest_family_rows_total`, `ingest_family_files_total`, `ingest_failures_total`, `ingest_active_lock_age_seconds` |
| Corpus selection | `corpus_selection_phase_duration_seconds`, `corpus_selection_runs_total`, `corpus_selection_signals_total`, `corpus_selection_materialized_papers_total`, `corpus_selection_summary_rows_total`, `corpus_pipeline_stage_papers`, `corpus_selection_failures_total`, `corpus_selection_active_lock_age_seconds` |
| Evidence wave dispatch | `corpus_wave_phase_duration_seconds`, `corpus_wave_runs_total`, `corpus_wave_members_selected_total`, `corpus_wave_enqueued_total`, `corpus_evidence_policy_papers`, `corpus_wave_failures_total`, `corpus_wave_active_lock_age_seconds` |
| Evidence-text acquisition | `paper_text_acquisitions_total`, `paper_text_acquisition_duration_seconds`, `paper_text_document_rows_total`, `paper_text_failures_total`, `paper_text_inprogress` |

These application-owned metric families sit beside Dramatiq's own
middleware families on the same per-scope store. The exact Dramatiq
family names remain owned by Dramatiq; the queue / actor counters are
not re-declared here.

The two latest absolute-count gauges are there to make the warehouse
contract visible in Grafana without reconstructing it from run deltas:

- `corpus_pipeline_stage_papers`
  - latest `raw`, `corpus`, and `mapped` counts for a
    `(selector_version, s2_release_tag, pt3_release_tag)` release pair
- `corpus_evidence_policy_papers`
  - latest `evidence_cohort`, `evidence_satisfied`,
    `evidence_backlog`, and `evidence_selected` counts for one
    `(wave_policy_key, selector_version, s2_release_tag, pt3_release_tag)`
    plan

The provisioned Grafana worker dashboard is expected to render these beside a
text panel named `Pipeline Contract And Criteria` so the operator can see both
the numbers and the actual stage-membership rules in one place. The dashboard
should answer:

- what `raw`, `corpus`, `mapped`, and `evidence` mean
- how many papers are in each stage for the monitored release pair
- whether the current evidence run is measuring the whole cohort or only the
  current backlog dispatch

Exemplar emit helper (§0 rule):

```python
# engine/app/observability/metrics.py — authoritative emit helper
# Authority: docs/rag/10-observability.md §0 + §6.2

from __future__ import annotations

from contextlib import contextmanager
from time import perf_counter
from typing import Iterator

from opentelemetry import trace
from prometheus_client import Histogram, Counter, Gauge, CollectorRegistry

# Registry is the default; kept explicit so tests can swap.
_REGISTRY: CollectorRegistry = CollectorRegistry(auto_describe=True)


def _trace_id_exemplar() -> dict[str, str]:
    """Current OTel trace id, or empty dict if no active span."""
    span = trace.get_current_span()
    ctx = span.get_span_context()
    if not ctx or not ctx.trace_id:
        return {}
    # Hex encode per OTel spec; Langfuse trace ids are UUIDv7 produced
    # upstream and mirrored into the OTel trace id (08 §15.1).
    return {"trace_id": format(ctx.trace_id, "032x")}


cascade_request_duration_seconds = Histogram(
    "cascade_request_duration_seconds",
    "End-to-end cascade request latency.",
    labelnames=("lane", "outcome"),
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
    registry=_REGISTRY,
)


@contextmanager
def observe_cascade(lane: str) -> Iterator[None]:
    t0 = perf_counter()
    outcome = "ok"
    try:
        yield
    except Exception:
        outcome = "error"
        raise
    finally:
        elapsed = perf_counter() - t0
        cascade_request_duration_seconds.labels(lane=lane, outcome=outcome).observe(
            elapsed,
            exemplar=_trace_id_exemplar(),   # prometheus-client exemplar support
        )
```

The helper enforces §0's rule: every `.observe()` call inside a
cascade span attaches the trace-id exemplar. Per-stage emits reuse
the same helper with the `cascade_stage_duration_seconds` histogram
(not shown).

### §6.3 Tracing

OpenTelemetry tracer provider bootstrapped once per process — in the
FastAPI `lifespan` for `graph-engine-api` per `06 §5.1`, and in the
Dramatiq worker's process `on_worker_boot` hook. Exports via OTLP/gRPC
to Alloy (`alloy:4317`), which then fans out to Langfuse over its
OTLP-over-HTTP ingestion endpoint (`/api/public/otel`). Alloy
preserves trace-id / span-id wiring so exemplars in Prometheus
correspond 1:1 to spans in Langfuse. Fast Preview's
`x-langfuse-ingestion-version: 4` header is Cloud-only for now and is
not assumed as a required dependency here.

Lifespan sketch (`engine/app/api/_otel.py`, referenced by `06 §5.1` and `06 §10.1`):

```python
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

def install_tracer_provider(service_name: str) -> TracerProvider:
    resource = Resource.create({"service.name": service_name,
                                "deployment.environment": "dev",
                                "solemd.project": "solemd.graph"})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(
        OTLPSpanExporter(endpoint="alloy:4317", insecure=True)))
    trace.set_tracer_provider(provider)
    return provider
```

Dramatiq workers install the same provider in `on_worker_boot` and
tear it down in `on_worker_shutdown` to prevent span leaks on restart.

### §6.4 Langfuse client init

One module-level `Langfuse` client per process; initialized lazily
with project keys from `1Password` via direnv (`research-distilled §7`).
Cascade code calls `@observe` decorators on per-stage methods; trace
id flows from the OTel context. The engine targets Python SDK v4's
observation-centric surface (`propagate_attributes()`,
`start_as_current_observation()`). If frontend traces land later, the
matching direction is JS/TS SDK v5. Preview-only APIs remain optional,
not a hard dependency of this observability contract. Details in §7.

## §7 Langfuse Cloud

### §7.1 Deployment shape

For the workstation phase, the deployment target is **Langfuse Cloud
Hobby**, not local shared-infra. That removes Langfuse's Postgres,
ClickHouse, Redis, and blob-store footprint from the box entirely.

Current contract:

- Region: choose EU (`https://cloud.langfuse.com`) unless a US region
  requirement appears; US is `https://us.cloud.langfuse.com`.
- Plan: Hobby — 50k units / month included, 30 days data access, 2 users.
- Unit model: billable units are `traces + observations + scores`, so
  benchmark runs and managed evaluators count against the same monthly
  pool as live API traces.
- Credentials: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and
  `LANGFUSE_HOST` stored in 1Password and resolved via direnv.

```bash
export LANGFUSE_HOST=https://cloud.langfuse.com
# or: https://us.cloud.langfuse.com
```

Official Langfuse Fast Preview / Observations API v2 / Metrics API v2
are available on Cloud. They remain optional here; the observability
contract requires Python SDK v4 compatibility, not immediate adoption
of every preview-only API surface.

### §7.2 Placement and tradeoff

**Decision: Langfuse Cloud Hobby now, self-host deferred.** **Locked**
for the workstation phase. Rationale:

- It frees local RAM immediately by removing Langfuse's PG,
  ClickHouse, Redis/cache, and blob-store footprint from shared-infra.
- It removes a second backup / restore / migration surface from
  `11-backup.md`.
- It keeps you on the newest Langfuse features and SDK path without
  inheriting the current self-host feature lag.
- The Hobby envelope is enough for a POC / bench-build phase if traces,
  observations, and scores are used deliberately.

Self-hosting becomes a trigger-gated fallback later if data-residency,
offline operation, cost scaling, or the 30-day access window stop
fitting the project.

### §7.3 Auth, retention, and export discipline

- Auth is managed by Langfuse Cloud accounts / projects; no local
  NextAuth deployment or secrets beyond the API keys.
- Hobby plan data access is **30 days**, not lifetime. This applies to
  the working Langfuse dataset / trace surface and is the real limit
  that matters for benchmark history.
- Benchmark datasets and important experiment runs therefore need an
  **export mirror** if we care about history beyond 30 days on Hobby.
  Langfuse remains the live control plane, but curated benchmark JSON
  snapshots are no longer optional for archival purposes on this plan.
- If 30 days becomes constraining before the backend stabilizes, the
  two clean exits are: upgrade to Core for 90-day access, or move the
  benchmark archive path back under repo / object-storage ownership.
- **Unit-budget discipline (locked).** On Hobby, every stored trace,
  observation, and score counts toward the same 50k monthly pool. So:
  one trace per user request, one observation per coarse cascade stage,
  no per-candidate or per-sentence child spans, and no full retrieved
  paper text in span attributes. Keep large text payloads in logs,
  benchmarks, or warehouse artifacts; spans carry ids, counts, timing,
  model choice, token counts, and short previews only.

### §7.4 Ingestion path

```
graph-engine-api (OTel SDK)
     └─ OTLP/gRPC → alloy:4317
                         ├─ loki.receiver     → shared-loki (logs)
                         └─ otelcol.exporter.otlphttp.langfuse → <cloud-region>/api/public/otel
```

Alloy's OTLP/HTTP exporter with `auth.basic_auth` handles the Langfuse
public/secret key pair. Langfuse's ingestion endpoint is HTTP-based,
not gRPC, on `/api/public/otel`. Region-specific hosts are
`cloud.langfuse.com` (EU) and `us.cloud.langfuse.com` (US).

### §7.5 Eval loop boundary

Datasets, experiments, evaluators, prompt management, score configs —
owned by the `langfuse` skill
(`.claude/skills/langfuse/references/benchmarking.md`). This doc
supplies the infrastructure only.

## §8 Log retention (Loki)

### §8.1 Placement and sizing

Loki is in shared-infra. `graph_loki_data` (NVMe named volume per
`01 §1`) is the chunk + index store, attached to the shared-infra
Loki container. Capacity envelope per `01 §5`: 10 GB steady, 20 GB
peak — well under NVMe budget.

### §8.2 Compactor and retention

Loki 3.x supports per-tenant and per-stream retention via
`retention_stream` rules in the compactor
(<https://grafana.com/docs/loki/latest/operations/storage/retention/>).
SoleMD.Graph runs as a single tenant `solemd-graph`; per-stream
retention rules enforce the label-specific policy:

| Log stream selector | Retention | Rationale |
|---|---|---|
| `{event="auto_explain"}` | 14 d | Plan-shift diagnostics window. |
| `{event=~"serving_runs\\..*"}` | 90 d | Projection lane audit (per `04 §12.3`). |
| `{event=~"cascade\\..*"}` | 30 d | Cascade debug; trace text is longer-lived than metrics. |
| `{event=~"ingest\\..*"}` | 90 d | Ingest-lane audit (per `05 §12.3`). |
| `{level="debug"}` | 7 d | Verbose diagnostics. |
| default (unmatched) | 14 d | Baseline. |

Config snippet:

```yaml
# shared-infra/loki-config.yaml — retention rules
limits_config:
  retention_period: 14d
compactor:
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150
  compaction_interval: 10m
  working_directory: /loki/compactor

overrides_exporter: {}

# Per-stream retention (Loki 3.2+)
overrides:
  solemd-graph:
    retention_stream:
      - selector: '{event=~"serving_runs\\..*"}'
        priority: 10
        period: 90d
      - selector: '{event=~"ingest\\..*"}'
        priority: 10
        period: 90d
      - selector: '{event=~"cascade\\..*"}'
        priority: 20
        period: 30d
      - selector: '{event="auto_explain"}'
        priority: 30
        period: 14d
      - selector: '{level="debug"}'
        priority: 40
        period: 7d
```

### §8.3 Chunk sizing

Defaults from Loki 3.x are appropriate for this volume:
`chunk_target_size: 1572864` (1.5 MB), `chunk_idle_period: 30m`,
`max_chunk_age: 2h`. No override.

### §8.4 Label discipline

Loki has a tight label budget (<15 unique values per label; unbounded
cardinality → slow queries). Bound labels:

- `project`, `cluster`, `role`, `environment` — enum (§0).
- `event` — enum, shape `<lane>.<subject>.<verb>` (e.g.
  `cascade.stage_1.opensearch_called`, `ingest.cycle.started`).
- `level` — `error|warn|info|debug`.

Dynamic log fields (`trace_id`, `corpus_id`, `serving_run_id`,
`ingest_run_id`, `family`, `http_status`, etc.) are **parsed as log
content** via `logfmt`/`json` parsers at query time, not indexed as
labels. This is the 2026 Loki best-practice.

## §9 Dashboards

Authored as Grafonnet under `engine/observability/dashboards/`.
Rendered by Grafana's file-based provisioner
(<https://grafana.com/docs/grafana/latest/administration/provisioning/#dashboards>)
with shared-infra mounting the directory read-only.

### §9.1 Dashboard index

| Dashboard | File | Surface |
|---|---|---|
| RAG Quality | `rag_quality.jsonnet` | Langfuse Cloud UI + cascade latency panels / links |
| RAG Quality (Batch) | `rag_quality_batch.jsonnet` | Postgres-backed daily retrieval-quality metrics from `solemd.rag_quality_metrics` |
| Read-path health | `read_path.jsonnet` | Cascade p50/95/99, cache, OpenSearch |
| Projection-lane health | `projection_lane.jsonnet` | Swap, cohort build, FDW |
| Ingest-lane health | `ingest_lane.jsonnet` | Phase duration, COPY, BioCXML |
| Cluster health | `cluster_health.jsonnet` | CPU/mem/disk/GPU, PG, OS, Redis |
| Alerts overview | `alerts_overview.jsonnet` | Active + recently firing |

### §9.2 RAG Quality dashboard

| Panel | Data source | Query |
|---|---|---|
| Faithfulness (7-day) | Langfuse | Built-in panel query via Langfuse data source |
| Context relevance (7-day) | Langfuse | Built-in |
| Benchmark run outcomes | Langfuse | Dataset-run table |
| Cascade p95 latency by lane | Prometheus | `histogram_quantile(0.95, sum by (lane,le)(rate(cascade_request_duration_seconds_bucket[5m])))` |
| Cache hit ratio (query vector) | Prometheus | `rate(query_vector_cache_hits_total[5m]) / (rate(query_vector_cache_hits_total[5m]) + rate(query_vector_cache_misses_total[5m]))` |
| Degraded response rate | Prometheus | `rate(cascade_degraded_responses_total[5m])` |

The batch companion dashboard `rag_quality_batch.jsonnet` is defined by
`10a-rag-quality-analyzer.md` and reads from
`solemd.rag_quality_metrics`. It remains separate from the live
Langfuse-facing dashboard above: live trace review stays in Langfuse,
batch trend analysis stays in Postgres/Grafana.

### §9.3 Read-path health dashboard

| Panel | Query |
|---|---|
| Cascade p50/95/99 | `histogram_quantile(0.50|0.95|0.99, sum by (le)(rate(cascade_request_duration_seconds_bucket[5m])))` |
| Per-stage p95 | `histogram_quantile(0.95, sum by (stage,le)(rate(cascade_stage_duration_seconds_bucket[5m])))` |
| OpenSearch search latency p95 by query_type | `histogram_quantile(0.95, sum by (query_type,le)(rate(opensearch_search_latency_seconds_bucket[5m])))` |
| OpenSearch k-NN p95 | `histogram_quantile(0.95, sum by (le)(rate(opensearch_knn_search_latency_seconds_bucket[5m])))` |
| Pool acquire p95 | `histogram_quantile(0.95, sum by (pool_name,le)(rate(asyncpg_pool_acquire_duration_seconds_bucket[5m])))` |
| Encoder fallback rate | `rate(cascade_encoder_fallback_total[5m])` |
| FDW failure rate | `rate(cascade_fdw_failures_total[5m])` |

### §9.4 Projection-lane health dashboard

| Panel | Query |
|---|---|
| Swap duration histogram | `histogram_quantile(0.95, sum by (family,le)(rate(projection_swap_duration_ms_bucket[30m])))` |
| Projection build duration | `sum by (family) (rate(projection_build_duration_seconds_sum[30m]) / rate(projection_build_duration_seconds_count[30m]))` |
| Rows written by family | `rate(projection_rows_written_total[30m])` |
| FDW round-trip p95 | `histogram_quantile(0.95, sum by (query_kind,le)(rate(fdw_round_trip_duration_seconds_bucket[5m])))` |
| Orphan `_next` tables | `projection_orphan_next_tables` |
| Active run age | `projection_active_run_age_seconds` |
| Cohort drift violations | `rate(cohort_manifest_drift_violations_total[1h])` |

### §9.5 Ingest-lane health dashboard

| Panel | Query |
|---|---|
| Phase duration p95 | `histogram_quantile(0.95, sum by (source_code,phase,le)(rate(ingest_phase_duration_seconds_bucket[1h])))` |
| COPY throughput | `ingest_copy_throughput_rows_per_second` |
| BioCXML RSS | `ingest_biocxml_rss_bytes` |
| Index build duration | `histogram_quantile(0.95, sum by (family,le)(rate(ingest_index_build_duration_seconds_bucket[1h])))` |
| Orphan UNLOGGED partitions | `ingest_orphan_unlogged_partitions` |
| Stuck runs | `ingest_stuck_runs` |

### §9.6 Cluster health dashboard

| Panel | Source |
|---|---|
| Host CPU / mem / load | `node_exporter` |
| PG autovacuum lag | `seconds_since_autovacuum` (§3.2) |
| PG cache hit ratio | `sum(rate(pg_stat_database_blks_hit[5m])) / sum(rate(pg_stat_database_blks_hit[5m]) + rate(pg_stat_database_blks_read[5m]))` |
| OpenSearch JVM heap | `opensearch_jvm_heap_used_percent` |
| Redis memory | `redis_memory_used_bytes / redis_memory_max_bytes` |
| GPU util / temp / mem | `dcgm-exporter` |
| Disk free (NVMe, E-drive) | `node_exporter` filesystem |
| Container CPU / mem | `cadvisor` |

### §9.7 Alerts overview

Built-in Grafana unified-alerting view; no custom Grafonnet needed
(<https://grafana.com/docs/grafana/latest/alerting/>).

## §10 Alerts

### §10.1 Canonical alert set

Rules committed under `shared-infra/alerts/solemd-graph.rules.yaml`
and mounted into Prometheus via `rule_files`. Alertmanager routes
to ntfy.sh (page) or email (warn) per §0 taxonomy.

```yaml
# shared-infra/alerts/solemd-graph.rules.yaml
# Authority: docs/rag/10-observability.md §10
# All rules scoped by project="solemd.graph" via Prometheus relabel;
# elided below for brevity.

groups:
  - name: solemd-graph-read-path
    interval: 30s
    rules:
      - alert: CascadeP95Slow
        expr: histogram_quantile(0.95, sum by (le) (rate(cascade_request_duration_seconds_bucket[5m]))) > 0.8
        for: 5m
        labels: { severity: page }
        annotations: { summary: "Cascade p95 > 800ms for 5m" }
      - alert: OpenSearchClusterRed
        expr: opensearch_cluster_status == 2
        for: 1m
        labels: { severity: page }
      - alert: CascadeFailureRate
        expr: sum(rate(cascade_opensearch_failures_total[5m])) / sum(rate(cascade_request_duration_seconds_count[5m])) > 0.02
        for: 10m
        labels: { severity: warn }

  - name: solemd-graph-pg
    interval: 60s
    rules:
      - alert: PgServeAutovacuumLag
        expr: max(seconds_since_autovacuum{cluster="serve"}) > 3600
        for: 15m
        labels: { severity: warn }
      - alert: PgServeDown
        expr: up{job="solemd-graph-pg-serve"} == 0
        for: 1m
        labels: { severity: page }
      - alert: PgServeReadPoolSaturated
        expr: histogram_quantile(0.95, sum by (le) (rate(asyncpg_pool_acquire_duration_seconds_bucket{pool_name="serve_read"}[5m]))) > 0.05
        for: 10m
        labels: { severity: warn }

  - name: solemd-graph-projection
    interval: 60s
    rules:
      - alert: ProjectionSwapSlow
        expr: histogram_quantile(0.95, sum by (family,le) (rate(projection_swap_duration_ms_bucket[1h]))) > 500
        for: 30m
        labels: { severity: warn }
      - alert: OpenSearchAliasSwapFailed
        # 07 §8.4: opensearch_alias_swap_status=2 is failed
        expr: max_over_time(opensearch_alias_swap_status{outcome="failed"}[15m]) >= 1
        labels: { severity: page }

  - name: solemd-graph-ingest
    interval: 5m
    rules:
      - alert: IngestRunsFailed
        expr: increase(ingest_runs_status_count{status="failed"}[1h]) > 0
        labels: { severity: warn }
      - alert: IngestStuck
        expr: ingest_stuck_runs > 0
        for: 30m
        labels: { severity: warn }

  - name: solemd-graph-capacity
    interval: 1m
    rules:
      - alert: RedisMemoryPressure
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.8
        for: 15m
        labels: { severity: warn }
      - alert: DiskLowWarn
        expr: (node_filesystem_avail_bytes{mountpoint=~"/var/lib/docker|/mnt/solemd-graph"} / node_filesystem_size_bytes{mountpoint=~"/var/lib/docker|/mnt/solemd-graph"}) < 0.20
        for: 30m
        labels: { severity: warn }
      - alert: DiskLowPage
        expr: (node_filesystem_avail_bytes{mountpoint=~"/var/lib/docker|/mnt/solemd-graph"} / node_filesystem_size_bytes{mountpoint=~"/var/lib/docker|/mnt/solemd-graph"}) < 0.10
        for: 5m
        labels: { severity: page }
      - alert: GpuHot
        expr: DCGM_FI_DEV_GPU_TEMP > 85
        for: 5m
        labels: { severity: warn }
      - alert: OpenSearchJvmHeap
        expr: opensearch_jvm_heap_used_percent > 75
        for: 10m
        labels: { severity: warn }

  - name: solemd-graph-langfuse
    interval: 5m
    rules:
      # Emitted by the engine-side benchmark/Langfuse adapter, not by
      # Langfuse Cloud directly.
      - alert: LangfuseEvaluatorFailures
        expr: rate(langfuse_evaluator_run_total{result="error"}[1h]) / rate(langfuse_evaluator_run_total[1h]) > 0.10
        for: 30m
        labels: { severity: warn }

  - name: solemd-graph-selfmon
    interval: 1m
    rules:
      # Dead-man switch: Alertmanager's deadmansswitch receiver pages
      # on *absence* of this ping (§10.2).
      - alert: PrometheusDown
        expr: vector(1)
        labels: { severity: none, kind: deadmansswitch }
```

### §10.2 Alertmanager routing

```yaml
# shared-infra/alertmanager.yaml — routing
route:
  receiver: default-email
  group_by: [alertname, project, cluster]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - matchers: [severity="page"]
      receiver: ntfy-page
      repeat_interval: 30m
    - matchers: [kind="deadmansswitch"]
      receiver: deadmansswitch

receivers:
  - name: default-email
    email_configs:
      - to: jsolemd@gmail.com
        from: alerts@solemd.internal
        smarthost: smtp.resend.com:587   # or chosen provider
        auth_username: alerts@solemd.internal
        auth_password_file: /run/secrets/alertmanager_smtp
        require_tls: true

  - name: ntfy-page
    webhook_configs:
      - url: https://ntfy.sh/solemd-graph-page-${NTFY_TOPIC_HASH}
        send_resolved: true

  - name: deadmansswitch
    webhook_configs:
      - url: https://cronitor.link/p/${CRONITOR_KEY}/prometheus-alive
        send_resolved: false
```

**ntfy.sh** chosen for page-class (<https://ntfy.sh/> — open, push to
phone with the app; topic with hash suffix prevents drive-bys;
cross-platform). **Pushover** is the deferred alternative if ntfy's
rate limiting or delivery SLA becomes insufficient.

### §10.3 Alert SLO summary

| Metric | SLO | Severity |
|---|---|---|
| Cascade p95 | ≤ 800 ms | page if broken |
| OpenSearch cluster state | GREEN or YELLOW | page if RED |
| Cascade error rate | < 2 % | warn |
| PG serve autovacuum lag | < 1 h | warn |
| PG serve up | 100 % | page |
| Serve-read pool p95 acquire | < 50 ms | warn |
| Projection swap p95 | < 500 ms | warn (SLO 100 ms per `04 §12.2`; 500 ms is alert band) |
| OpenSearch alias swap | success | page on failure |
| Ingest run failures | 0 new/h | warn |
| Redis memory | < 80 % maxmemory | warn |
| Disk free | > 20 % | warn; > 10 % page |
| GPU temp | ≤ 85 C | warn |
| OpenSearch JVM heap | ≤ 75 % | warn |
| Langfuse evaluator failures | < 10 % | warn |

## §11 Exemplars and cross-signal navigation

### §11.1 Metrics → Langfuse (exemplars)

Per §0 and §6.2, every histogram inside a cascade span attaches the
current OTel `trace_id` as an exemplar. Prometheus stores exemplars
alongside samples
(<https://prometheus.io/docs/instrumenting/exposition_formats/#exemplars>);
Grafana renders them as diamond markers on histogram heat-maps
(<https://grafana.com/docs/grafana/latest/fundamentals/exemplars/>).

Data link wiring in the dashboard JSON:

```json
{
  "fieldConfig": {
    "defaults": {
      "links": [
        {
          "title": "View trace in Langfuse",
          "url": "https://<langfuse-host>/trace/${__value.raw}",
          "targetBlank": true
        }
      ]
    }
  }
}
```

### §11.2 Logs → Langfuse (Loki derived fields)

Grafana Loki data source supports derived fields that parse a log
message and inject a clickable URL
(<https://grafana.com/docs/grafana/latest/datasources/loki/#derived-fields>).

```yaml
# shared-infra/grafana-provisioning/datasources/loki.yaml
datasources:
  - name: Loki
    type: loki
    url: http://shared-loki:3100
    jsonData:
      derivedFields:
        - matcherRegex: "trace_id=([a-f0-9-]+)"
          name: TraceID
          url: https://<langfuse-host>/trace/$${__value.raw}
          urlDisplayLabel: "Langfuse trace"
```

### §11.3 Metrics → Logs (Loki in Grafana split-panel)

Any dashboard panel backed by Prometheus supports a "Related logs"
data link targeting Loki with a templated query — e.g. clicking a
cascade latency spike jumps to Loki filtered by the same time window
and `event=~"cascade.*"`. Configured per-panel in Grafonnet.

## §12 Self-monitoring

Solo-dev scale rules: minimal but non-zero.

1. **Dead-man switch** (§10.1 `PrometheusDown`). Cronitor or equivalent
   external heartbeat: Alertmanager posts every minute; no post →
   Cronitor pages via email. Proves Prometheus + Alertmanager + email
   path are all alive.
2. **Alloy → Loki synthetic log**. A cron-driven shell stanza in
   shared-infra Alloy emits `{event="selfmon.heartbeat"}` every
   60 s; a Prometheus rule alerts if fewer than 50 such logs appeared
   in the last 2 minutes.
3. **Grafana up**. Standard `up{job="grafana"}` monitor.
4. Expansion (Prometheus meta-monitoring, Alertmanager clustering,
   redundant pagers) is **deferred** — overkill at solo-dev scale.

## §13 Metrics catalog

Canonical list of every Prometheus metric surfaced by SoleMD.Graph.
Keyed back to the emitting document section. Labels shown are the
per-metric labels; all metrics also carry the §0 mandatory labels
(`project`, `cluster`, `role`, `environment`).

### §13.1 Projection-lane (from `04 §12.2`)

| Metric | Type | Labels |
|---|---|---|
| `projection_swap_duration_ms` | histogram | `family`, `pointer_flip_mode` |
| `projection_build_duration_seconds` | histogram | `family` |
| `projection_rows_written_total` | counter | `family` |
| `projection_failures_total` | counter | `family`, `failure_class` |
| `projection_orphan_next_tables` | gauge | — |
| `projection_active_run_age_seconds` | gauge | — |
| `fdw_round_trip_duration_seconds` | histogram | `query_kind` |
| `cohort_manifest_drift_violations_total` | counter | — |

### §13.2 Ingest-lane (from `05 §12.2` + `05a §10`)

| Metric | Type | Labels |
|---|---|---|
| `ingest_phase_duration_seconds` | histogram | `source_code`, `release_tag`, `phase` |
| `ingest_copy_throughput_rows_per_second` | gauge | `source_code`, `family`, `partition` |
| `ingest_partition_row_count` | gauge | `source_code`, `family`, `partition` |
| `ingest_index_build_duration_seconds` | histogram | `source_code`, `family`, `index_name` |
| `ingest_biocxml_rss_bytes` | gauge | `worker_id`, `tarball` |
| `ingest_failures_total` | counter | `source_code`, `phase`, `failure_class` |
| `ingest_orphan_unlogged_partitions` | gauge | — |
| `ingest_stuck_runs` | gauge | — |
| `ingest_active_lock_age_seconds` | gauge | `release_key` |
| `chunks_assembled_total` | counter | `chunk_version_key`, `policy_key` |
| `chunk_members_assembled_total` | counter | `chunk_version_key`, `policy_key` |
| `evidence_units_written_total` | counter | `chunk_version_key`, `policy_key`, `evidence_kind` |
| `evidence_unit_conflicts_total` | counter | `chunk_version_key` |
| `weak_chunks_dropped_total` | counter | `policy_key` |
| `chunk_assembly_latency_seconds` | histogram | `policy_key` |
| `chunk_assembly_errors_total` | counter | `failure_class` |
| `sentence_segmentation_source_total` | counter | `segmentation_source` |

### §13.3 Async stack (from `06 §10.1 / §10.2`)

| Metric | Type | Labels |
|---|---|---|
| `asyncpg_pool_size` | gauge | `pool_name` |
| `asyncpg_pool_idle` | gauge | `pool_name` |
| `asyncpg_pool_acquire_duration_seconds` | histogram | `pool_name` |
| `asyncpg_pool_acquire_failures_total` | counter | `pool_name`, `failure_class` |
| `asyncpg_query_duration_seconds` | histogram | `pool_name`, `op` |
| `dramatiq_actor_invocations_total` | counter | `actor_name`, `outcome` |
| `dramatiq_actor_duration_seconds` | histogram | `actor_name` |
| `dramatiq_actor_retries_total` | counter | `actor_name` |
| `dramatiq_in_flight_messages` | gauge | `actor_name` |
| `pydantic_validation_errors_total` | counter | `model`, `surface` |
| `serve_read_pool_acquire_latency_seconds` | histogram | — (alias of `asyncpg_pool_acquire_duration_seconds{pool_name="serve_read"}` per `06 §12`) |
| `request_query_duration_seconds` | histogram | `route` |

### §13.4 OpenSearch (from `07 §13.1`)

| Metric | Type | Labels |
|---|---|---|
| `opensearch_search_latency_seconds` | histogram | `index`, `query_type` |
| `opensearch_knn_search_latency_seconds` | histogram | `index` |
| `opensearch_segment_count` | gauge | `index` |
| `opensearch_jvm_heap_used_bytes` | gauge | — |
| `opensearch_jvm_heap_used_percent` | gauge | — |
| `opensearch_circuit_breaker_trips_total` | counter | `breaker_name` |
| `opensearch_bulk_throughput_docs_per_second` | gauge | `index` |
| `opensearch_alias_swap_total` | counter | `index_alias`, `outcome` |
| `opensearch_alias_swap_lag_seconds` | gauge | `index_alias` |
| `opensearch_alias_swap_status` | gauge | `outcome` |
| `opensearch_index_doc_count` | gauge | `index` |
| `opensearch_synonym_reload_total` | counter | `index`, `outcome` |
| `opensearch_cluster_status` | gauge | — (0=green 1=yellow 2=red) |

### §13.5 Retrieval cascade (from `08 §15.3`)

| Metric | Type | Labels |
|---|---|---|
| `cascade_request_duration_seconds` | histogram | `lane`, `outcome` |
| `cascade_stage_duration_seconds` | histogram | `stage`, `lane` |
| `cascade_encoder_fallback_total` | counter | `kind` |
| `cascade_opensearch_failures_total` | counter | `error_class` |
| `cascade_cross_encoder_skips_total` | counter | `kind` |
| `cascade_fdw_failures_total` | counter | `kind` |
| `cascade_pointer_cache_hits_total` | counter | — |
| `cascade_pointer_cache_misses_total` | counter | — |
| `query_vector_cache_hits_total` | counter | — |
| `query_vector_cache_misses_total` | counter | — |
| `cascade_degraded_responses_total` | counter | `degradation_kind` |
| `cascade_card_drift_papers_total` | counter | — |

### §13.6 Infra (from §3 / §5 here)

| Origin | Metric families |
|---|---|
| `postgres_exporter` baseline | `pg_up`, `pg_stat_database_*`, `pg_stat_io_*`, `pg_stat_wal_*`, `pg_locks_*` |
| §3.2 custom queries | `serving_runs_status_count{build_status}`, `ingest_runs_status_count{status,source_code}`, `api_projection_runs_status_count{build_status}`, `seconds_since_autovacuum{table_fqn}`, `pg_stat_statements_top{queryid}` |
| `pgbouncer_exporter` | `pgbouncer_*` (`cl_waiting`, `sv_idle`, `xact_count`, `query_count`) with `database`, `user` |
| `redis_exporter` | `redis_memory_used_bytes`, `redis_memory_max_bytes`, `redis_keyspace_hits/misses_total`, `redis_stream_length`, `redis_slowlog_length`, `redis_latency_spike_last` |
| `dcgm-exporter` | `DCGM_FI_DEV_GPU_TEMP`, `_GPU_UTIL`, `_FB_USED` with `gpu`, `UUID` |
| `node_exporter` | `node_cpu_seconds_total`, `node_memory_*`, `node_filesystem_*`, `node_load1/5/15` |
| `cadvisor` | `container_cpu_usage_seconds_total`, `container_memory_working_set_bytes`, `container_fs_*` with `name`, `image` |

### §13.7 Langfuse adapter metrics

| Metric | Type | Labels | Notes |
|---|---|---|---|
| `langfuse_evaluator_run_total` | counter | `result`, `evaluator` | Emitted by the engine-side Langfuse adapter / benchmark runner, since Langfuse Cloud is not scraped locally |

## §14 Log catalog

All log lines are JSON (`jsonlog` for PG, `structlog`+python-json-logger
for engine, OpenSearch JSON default). Required structured fields
per emitter.

### §14.1 Projection-lane (from `04 §12.3`)

| Event | Fields |
|---|---|
| `projection.cycle.started` | `serving_run_id`, `manifest`, `mode` |
| `projection.family.staging_complete` | `family`, `rows_loaded`, `bytes_written` |
| `projection.family.swap_complete` | `family`, `swap_duration_ms` |
| `projection.cycle.published` | `serving_run_id`, `api_projection_run_id`, `families` |
| `projection.cycle.aborted` | `serving_run_id`, `reason` |
| `projection.cycle.failed` | `serving_run_id`, `family`, `error_class`, `error_message` |

### §14.2 Ingest-lane (from `05 §12.3`)

| Event | Fields |
|---|---|
| `ingest.cycle.started` | `ingest_run_id`, `source_code`, `release_tag`, `plan` |
| `ingest.family.staging_complete` | `family`, `rows_loaded`, `bytes_written` |
| `ingest.family.indexing_complete` | `family`, `index_count`, `duration_s` |
| `ingest.family.set_logged_complete` | `family`, `partitions`, `wal_bytes_written` |
| `ingest.cycle.published` | `ingest_run_id`, `families`, `total_duration_s` |
| `ingest.cycle.aborted` | `ingest_run_id`, `reason` |
| `ingest.cycle.failed` | `ingest_run_id`, `phase`, `family`, `error_class`, `error_message` |

### §14.3 OpenSearch (from `07 §13.2`)

| Event | Fields |
|---|---|
| `opensearch.index.create_started` | `serving_run_id`, `index_name`, `family` |
| `opensearch.index.bulk_progress` | `index_name`, `docs_indexed`, `bytes_indexed` |
| `opensearch.index.bulk_complete` | `index_name`, `total_docs`, `duration_seconds` |
| `opensearch.index.force_merge_complete` | `index_name`, `final_segment_count`, `duration_seconds` |
| `opensearch.index.warmup_complete` | `index_name`, `duration_seconds` |
| `opensearch.alias.swap_attempted` | `serving_run_id`, `actions` |
| `opensearch.alias.swap_success` | `serving_run_id`, `aliases` |
| `opensearch.alias.swap_failed` | `serving_run_id`, `error`, `http_status` |
| `opensearch.snapshot.complete` | `snapshot_name`, `duration_seconds`, `bytes_written` |

### §14.4 Cascade (from `08 §15.4`)

| Event | Fields |
|---|---|
| `cascade.request.received` | `trace_id`, `lane`, `k`, `query_text_hash`, `client_ip` (redacted /24) |
| `cascade.snapshot.fetched` | `trace_id`, `serving_run_id`, `pointer_cache_hit` |
| `cascade.stage_0.cache_hit` / `cache_miss` | `trace_id` |
| `cascade.stage_0.gpu_fallback` | `trace_id`, `error_class` |
| `cascade.stage_1.opensearch_called` | `trace_id`, `index`, `took_ms`, `candidate_count` |
| `cascade.stage_1.opensearch_unavailable` | `trace_id`, `error_class`, `http_status` |
| `cascade.stage_2.rerank_complete` | `trace_id`, `top_n`, `gpu_ms` |
| `cascade.stage_2.cross_encoder_skipped` | `trace_id`, `reason` |
| `cascade.stage_3.promotion_complete` | `trace_id`, `parent_count`, `chunks_per_parent_avg` |
| `cascade.stage_4.cards_hydrated` | `trace_id`, `count`, `missing` |
| `cascade.stage_4.fdw_unavailable` | `trace_id`, `corpus_id`, `error_class` |
| `cascade.response.sent` | `trace_id`, `total_latency_ms`, `degraded`, `http_status` |

### §14.5 Engine pool + request (from `06 §10.3`)

| Event | Fields |
|---|---|
| `pool.acquire` | `pool_name`, `wait_ms` |
| `pool.query` | `pool_name`, `op`, `duration_ms` |
| `actor.started` / `actor.completed` / `actor.failed` | `actor_name`, `message_id`, `serving_run_id`/`ingest_run_id` |
| FastAPI access log | `request_id`, `route`, `corpus_id`, `http_status`, `latency_ms` |

### §14.6 PG logs (jsonlog)

All `auto_explain` plans, `log_lock_waits`, `log_checkpoints`,
`log_autovacuum_min_duration`, `log_temp_files` lines in PG 18
native `jsonlog` format per §3.3.

## §15 Trace catalog

### §15.1 Langfuse span names (cascade — from `08 §15.1`)

One trace per cascade request, name `cascade.retrieve`; five child
spans with fixed names:

| Span name | Stage | Per-span fields |
|---|---|---|
| `stage_0_query_encoding` | 0 | `encoder_revision`, `cache_hit`, `cpu_fallback`, `latency_ms` |
| `stage_1_lane_fusion` | 1 | `os_index_name`, `candidate_count`, `total_hits`, `pre_filter_active`, `score_breakdown`, `latency_ms` |
| `stage_2_cross_encoder_rerank` | 2 | `cross_encoder_revision`, `top_n`, `skipped`, `rerank_scores`, `latency_ms` |
| `stage_3_parent_child_promotion` | 3 | `parent_count`, `chunks_per_paper_max`, `latency_ms` |
| `stage_4_grounding_dereference` | 4 | `cards_hydrated`, `cards_missing`, `evidence_units_resolved`, `evidence_units_failed`, `fdw_degraded_papers`, `grounding_roundtrip_failures`, `latency_ms` |

Trace-level fields: `trace_id`, `serving_run_id`, `graph_run_id`,
`api_projection_run_id`, `cohort_id`, `lane`, `redacted_query` (sha256),
`k`, `total_latency_ms`, `degraded`, `http_status`. PHI-safe: query
text is hashed, not transmitted.

### §15.2 OpenTelemetry span names (non-Langfuse)

OTel spans outside the cascade (e.g. Dramatiq actor runs, ingest
phases) export to Alloy → shared-infra OTel collector → Langfuse if
the project-specific Langfuse project id is set on the resource;
otherwise they stay in Loki-adjacent traces for operational review
only.

| Span name | Source | Shape |
|---|---|---|
| `dramatiq.actor.<actor_name>` | `06 §6` actor wrapper | `actor_name`, `message_id`, `outcome`, `retries` |
| `ingest.phase.<phase>` | `05 §4 / §12` | `ingest_run_id`, `source_code`, `phase`, `rows` |
| `projection.family.<family>` | `04 §3 / §6` | `serving_run_id`, `family`, `stage` |
| `opensearch.bulk.<index_name>` | `07 §8` | `serving_run_id`, `index`, `batch_size` |
| `serve_read.query` | `06 §2.1 / §5` | `pool_name`, `op` |

### §15.3 Trace context propagation

- FastAPI request → OTel HTTP instrumentation creates root span.
- Cascade orchestrator creates `cascade.retrieve` span as child.
- Each stage creates one named child span.
- `asyncpg` query wrapper creates `serve_read.query` span nested
  under the stage span.
- Dramatiq messages carry W3C traceparent in headers so actor spans
  nest under the enqueuing request's trace when applicable.

## Cross-cutting invariants

1. **Every metric emitted by 04–09 appears in §13.** This doc's §13
   must be a superset of the union of `04 §12.2`, `05 §12.2`,
   `06 §10.1 / §10.2`, `07 §13.1`, `08 §15.3`. A metric named
   elsewhere but not cataloged here is a contract bug.
2. **Every structured log event emitted by 04–08 appears in §14.**
   Same rule; same bug class.
3. **Every Langfuse span field declared in `08 §15.2` appears in §15.1.**
4. **Mandatory labels inject at scrape time, never in code.** Engine
   code emits only the per-metric domain labels; `project`, `cluster`,
   `role`, `environment` come from Prometheus `relabel_configs` on the
   shared-infra side.
5. **Exemplars attach only inside cascade span context.** Outside
   `observe_cascade(...)` the helper returns empty-dict and
   `.observe()` records no exemplar — avoids attaching stale trace
   ids from a prior request on shared-pool metrics.
6. **Langfuse and Prometheus are not joined at the data layer.** The
   link is exemplar-based; cross-panel navigation in Grafana is the
   user-facing integration.
7. **Dashboards are Grafonnet-committed.** UI edits are exploration
   only; a committed Jsonnet is the source of truth.
8. **Alert severity is page-or-warn.** No `info`, no `sev-3`, no
   custom label for novelty.
9. **Secrets resolve via 1Password + direnv at start time.** No
   credentials on disk (matches `research-distilled §7`).
10. **Loki labels are enum-bounded.** Dynamic fields live in the log
    payload, parsed at query time.

## §N Decisions — locked / provisional / deferred

### Locked now

| Decision | Rationale |
|---|---|
| Prometheus + Grafana + Loki + Alloy + Alertmanager in shared-infra | Single pane across SoleMD.*; §2.2. |
| Project-scoped exporters (postgres_exporter ×2, pgbouncer_exporter, redis_exporter, opensearch-prometheus-exporter, dcgm-exporter, node_exporter, cadvisor) in SoleMD.Graph compose | Exporter lifecycle matches target; §2.1. |
| Mandatory label set `project/cluster/role/environment` injected at scrape time | §0 cardinality budget; code emits only domain labels. |
| Cardinality blocklist: no per-`corpus_id`, per-`evidence_key`, per-`trace_id`, per-`ingest_run_id`, per-`serving_run_id` Prometheus labels | TSDB cardinality budget; identities live on logs/traces. |
| 15 d Prometheus TSDB retention | Matches `01 §5` sizing envelope; long-term mirror deferred. |
| Loki default retention 14 d with per-stream overrides for audit-class events | Balances disk envelope with investigation needs; §8.2. |
| Langfuse Cloud Hobby for the workstation phase | §7.2 — frees local RAM / ops overhead while staying on the latest SDK and cloud feature path. |
| Langfuse benchmark history is export-backed on Hobby | §7.3 — 30-day data access means JSON snapshots / exports are archival, not optional. |
| prometheus-client for metrics, opentelemetry-python for traces, structlog for logs | §6.1 — 2026-stable Python observability toolchain. |
| Exemplars link Prometheus histograms to Langfuse traces | §11; 2026 metrics-logs-traces pattern. |
| Dashboard-as-code via Grafonnet under `engine/observability/dashboards/` | §0 discipline; UI drift is a CI concern. |
| Alert severity taxonomy is page + warn only | §0; solo-dev scale. |
| ntfy.sh as page-class notification channel | §10.2; cheap, push-native, Android-friendly. |
| Dead-man switch via external Cronitor-style ping | §12.1; proves alerting-path liveness. |
| `pg_stat_statements` (not `pg_stat_monitor`) on both PG clusters | Executor-hook conflict; `09 §N.Locked`. |
| `auto_explain.log_min_duration = 5000` (warehouse) / `250` (serve) | `09 §3 / §4`; this doc adopts unchanged. |
| PG 18 `log_destination = 'stderr,jsonlog'` on both clusters | `09 §3 / §4`; Alloy parses native jsonlog. |
| OpenSearch Prometheus exporter via plugin, not Performance Analyzer scrape | §4.1; plugin matches 3.6 release; PA is diagnostic-only. |
| Loki label set bounded to enums; dynamic fields parsed at query time | §8.4 Loki best-practice. |
| Langfuse eval design stays in the `langfuse` skill | §7.5 boundary. |

### Provisional (revisit after first cycle of real data)

| Decision | Revisit trigger |
|---|---|
| Prometheus scrape interval 15 s for exporters, 30 s for cadvisor | If dashboards show aliasing on short spikes, tighten exporters to 10 s. |
| Loki per-stream retention values (14 / 30 / 90 / 7 d) | First month of investigation activity — extend serving-run audits if 90 d proves short. |
| Langfuse Cloud plan / retention path | Revisit once 50k units/month or 30-day access becomes constraining. |
| Alertmanager group intervals (30 s wait / 5 m group / 4 h repeat) | Real alert-fatigue observations. |
| ntfy-page repeat interval 30 m | If page volume is annoying, raise to 2 h; if missed, drop to 10 m. |
| Cascade p95 alert threshold 800 ms | `08 §12` SLO target baseline; set after first load profile. |
| Serve-read pool acquire p95 alert threshold 50 ms | After pool-sizing validation in `09 §13`. |
| Dashboard panel list | Iterate as usage patterns emerge. |
| `postgres_exporter` scrape interval 15 s | Tune to 30 s if scrape load on serve cluster is measurable. |
| Exact Grafana data-link URL templates | Langfuse hostname and path are implementation details. |

### Deferred (trigger-gated)

| Decision | Trigger |
|---|---|
| Long-term metrics storage (Prometheus `remote_write` → Mimir / Thanos) | Investigation windows exceed 15 d meaningfully. |
| Alertmanager high-availability cluster | Single-point-of-failure pager becomes a real concern. |
| Synthetic check framework (Blackbox Exporter) | Public surface appears (Vercel → engine API). |
| OpenSearch Performance Analyzer scrape integration | Plugin coverage proves insufficient; `07 §N` deferral inherited. |
| `pg_stat_kcache` adoption | `pg_stat_io` (PG 18) insufficient for kernel-timing diagnosis. |
| Langfuse public-exposure hardening (Tailscale Funnel, Cloudflare tunnel) | Share eval dashboards with external reviewers. |
| Pushover as second page-class channel | ntfy.sh reliability issue. |
| Grafana→Slack/Discord integration | Team size grows past one. |
| Per-tenant Loki (multi-project tenant ids) | Cross-project log-query performance is measurably slow. |
| Grafana dashboard drift CI check | Dashboard set stabilizes; deferred until the first 3 dashboards are unchanged for 30 d. |
| Meta-monitoring of Prometheus itself (Prometheus → Prometheus) | A Prometheus outage is missed by the dead-man switch. |
| Alloy remote config (via Grafana Cloud or self-hosted agent management) | Exporter inventory grows beyond one-man-manageable. |

## Open items

Forward-tracked. None block subsequent docs (`11-backup.md`,
`12-migrations.md`):

- **Langfuse evaluator-run metric wiring.** `langfuse_evaluator_run_total`
  in §10.1 now assumes the engine-side benchmark / Langfuse adapter
  emits a Prometheus counter on evaluator completion, since Langfuse
  Cloud is not scraped locally. Confirm once the adapter lands.
- **Benchmark archival discipline on Hobby.** 30-day cloud data access
  means benchmark datasets/runs need a mirror/export path if historical
  comparisons should survive beyond the active window.
- **WSL2 cgroup-v2 quirks for `node_exporter` and `cadvisor`.** Some
  container memory and CPU throttling metrics are missing until
  cgroup hybrid is fully disabled
  (<https://github.com/google/cadvisor/issues/3147>). Acceptable for
  solo-dev; reviewer should note on WSL2 kernel update.
- **Exact ntfy.sh topic hash and Cronitor key** live in 1Password;
  not checked in. Deployment task.
- **Grafana data-link URL template values** (`cloud.langfuse.com` vs
  `us.cloud.langfuse.com`) depend on the chosen Langfuse Cloud region.
- **Dashboard JSON output.** This doc names the panels and queries;
  actual Grafonnet source lives under
  `engine/observability/dashboards/` and is authored as a follow-up PR.
- **OpenSearch per-query-type scrape labels.** The plugin exposes
  some query metrics without `query_type` label; engine-owned counters
  (`opensearch_search_latency_seconds{query_type=...}`) compensate,
  but confirm plugin gaps on first deploy.

## Upstream amendments

Flagged for prior-doc updates. None are blocking — 00–09 are
internally consistent; these are additive follow-ups.

- **`01-storage.md §2.1 / §5` sizing table.** Note that
  `graph_prometheus_data`, `graph_grafana_data`, `graph_loki_data`
  will migrate to shared-infra's volume inventory when shared-infra
  gains its own volumes; until then the SoleMD.Graph-side volumes are
  the live store. **Non-blocking**.
- **`09-tuning.md §3` warehouse conf.** Recommend adding
  `auto_explain.log_format = 'json'` for Loki parsing symmetry with
  serve's §4. Warehouse auto_explain fires rarely (5 s threshold) so
  impact is minimal. **Non-blocking, optional**.
- **`07 §8.4` alias-swap status emit.** Confirm the engine's
  OpenSearch client emits a counter `opensearch_alias_swap_total{outcome}`
  and a gauge `opensearch_alias_swap_status{outcome}` for the §10.1
  `OpenSearchAliasSwapFailed` alert to have a signal. If only the
  JSON log event exists today, add the metric emit in the same PR
  that wires the alert rule. **Non-blocking**.
- **No contradictions discovered** between this doc and 00–09 or
  `research-distilled.md`. The brief's suggested
  `auto_explain.log_min_duration = 500ms` on serve was superseded by
  `09 §4`'s tighter 250 ms; this doc defers to `09` and documents
  the resolution in §3.1.

## Relationship to `docs/rag-future.md`

`rag-future.md §7` sketches an observability posture built around
Langfuse evaluations, Prometheus exporters, and PG 18 jsonlog. This
document lands the physical substrate for that posture — which
containers run where, which metrics are emitted, how the retention
shape handles a 14 M-paper graph's worth of structured logs, and how
the cascade's per-request trace becomes a jump-target from any
Grafana panel. The strategy in `rag-future.md` is unchanged. This
document makes the strategy executable.
