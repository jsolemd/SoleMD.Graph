# SoleMD.Graph - Biomedical Knowledge Graph

> **SCOPE**: You are working in **SoleMD.Graph** only.
> Do NOT modify files in other SoleMD.* projects unless explicitly requested.
>
> - Project: `solemd.graph`
> - Schemas: `solemd`, `pubtator`
> - Workspace: `/workspaces/SoleMD.Graph`
>
> **TRUSTED RELATIONSHIPS** (Safe to reference read-only):
> - Infra: Shared services (db, kong)
> - App: Reusable code patterns (chunker, graph builder, service clients)
>
> **FORBIDDEN**: Never modify other SoleMD.* project source files.
> **HAND-OFF**: See `/workspaces/CLAUDE.md` for cross-project protocol.

---

## TL;DR

- Monorepo: Next.js 16 frontend (root) + Python data engine (`engine/`)
- Cosmograph graph visualization + DuckDB-WASM client-side analytics
- PostgreSQL 16 + pgvector (self-hosted Docker, NOT Supabase)
- PubTator3 + Semantic Scholar pre-computed data (no local NER)
- Architecture docs in `docs/map/`

**When stuck**: Check `docs/map/architecture.md`, run `docker compose -f docker/compose.yaml ps`.

> Infrastructure, MCP tools, agent helpers (`solemd doctor`, `asroot`), and code-search rules are in `/workspaces/CLAUDE.md`.

---

## Environment

| Context | Details |
|---------|---------|
| Workspace | `/workspaces/SoleMD.Graph` |
| Container | Devcontainer on `solemd-infra` network |
| Frontend | Next.js 16 with App Router, Mantine 8, Tailwind CSS 4 |
| Data engine | Python 3.13 (uv-managed) in `engine/` |
| Database | PostgreSQL 16 + pgvector 0.8.2 (Docker, port 5433) |
| Task queue | Dramatiq + Redis (Docker, port 6380) |

## Documentation

| Topic | Location |
|-------|----------|
| **Architecture** (start here) | `docs/map/architecture.md` |
| **PubTator3** (download, parse, load) | `docs/map/pubtator3.md` |
| **Semantic Scholar** (datasets, filtering) | `docs/map/semantic-scholar.md` |
| **Design system** | `app/globals.css`, `lib/mantine-theme.ts` |

## Skills & Commands

| Skill | When to Use |
|-------|-------------|
| `/code-search` | **ALWAYS use instead of grep/rg**. Find components, hooks, patterns |
| `/docker` | Start/stop services |
| `/schema` | Explore database schemas |
| `/chrome-dev` | Browser automation, visual testing |
| `/cosmograph` | Graph canvas, DuckDB-WASM, Parquet bundles |

### Frontend (Next.js)

| Command | Action |
|---------|--------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript check |

### Data Engine (Python)

| Command | Action |
|---------|--------|
| `cd engine && uv run uvicorn app.main:app --port 8300` | Start FastAPI |
| `cd engine && uv run pytest` | Run tests |
| `cd engine && uv sync` | Install/update dependencies |
| `cd engine && uv sync --extra ml` | Install ML models (torch, transformers) |
| `cd engine && uv sync --extra graph` | Install graph tools (UMAP, HDBSCAN) |

### Docker Services

| Command | Action |
|---------|--------|
| `docker compose -f docker/compose.yaml up -d` | Start PostgreSQL + Redis |
| `docker compose -f docker/compose.yaml down` | Stop services |
| `docker exec solemd-graph-db psql -U solemd -d solemd_graph` | Connect to DB |

## Project Structure

```
SoleMD.Graph/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Graph dashboard
│   └── api/                # API routes
├── components/             # React components
│   ├── graph/              # Cosmograph, panels, filters
│   ├── ui/                 # Shared Mantine components
│   └── ...
├── lib/                    # Frontend utilities
│   ├── graph/              # DuckDB-WASM, stores, queries
│   ├── supabase/           # Supabase client (legacy, being removed)
│   └── mantine-theme.ts    # Design system
├── features/               # Feature modules
├── engine/                 # Python data engine
│   ├── app/                # FastAPI application
│   │   ├── main.py         # App factory
│   │   └── config.py       # Settings (pydantic-settings)
│   ├── test/               # pytest tests
│   └── pyproject.toml      # uv-managed dependencies
├── docker/                 # Local dev services
│   ├── compose.yaml        # PostgreSQL 16 + pgvector + Redis
│   └── init.sql            # Schema + extension init
├── data/                   # .gitignored bulk downloads
│   ├── pubtator/           # PubTator3 FTP files
│   └── semantic-scholar/   # S2 dataset shards
├── docs/map/               # Architecture + deep-dive docs
└── package.json            # Next.js dependencies
```

## Key Patterns

### Data Architecture

- **Database**: PostgreSQL with pgvector — connected via Drizzle ORM (frontend) and psycopg (engine)
- **NOT Supabase**: We use raw PostgreSQL. No PostgREST, no Supabase Auth (yet). Direct SQL.
- **Hot/Cold split**: Domain-filtered data in PostgreSQL (~50-150 GB), full bulk data as local Parquet
- **DuckDB**: Embedded in Python for batch processing Parquet files. DuckDB-WASM in browser for graph interaction.

### Frontend Data Flow

```typescript
// Server Component — fetch from PostgreSQL via Drizzle ORM
import { db } from '@/lib/db';
const papers = await db.select().from(papers).limit(100);

// Client Component — query DuckDB-WASM over Parquet
const result = await duckdb.query('SELECT * FROM corpus_points WHERE ...');
```

### Engine Data Flow

```python
# FastAPI endpoint
from app.config import settings
import psycopg

conn = psycopg.connect(settings.database_url)

# Batch processing with DuckDB on local Parquet
import duckdb
result = duckdb.sql("SELECT * FROM read_parquet('data/pubtator/parquet/*.parquet')")
```

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| React Components | PascalCase | `GraphCanvas.tsx` |
| Hooks | camelCase with `use` | `useGraphBundle.ts` |
| TypeScript utilities | camelCase | `formatDate.ts` |
| Pages | lowercase | `page.tsx` |
| Routes | kebab-case | `paper/[id]/page.tsx` |
| Python files | snake_case | `load_pubtator.py` |
| Python classes | CamelCase | `PubTatorLoader` |

## Testing

### Frontend
| Command | Purpose |
|---------|---------|
| `npm test` | Run Jest tests |
| `npm run test:watch` | Watch mode |

### Engine
| Command | Purpose |
|---------|---------|
| `cd engine && uv run pytest` | Run all tests |
| `cd engine && uv run pytest -m unit` | Unit tests only |
| `cd engine && uv run pytest -m integration` | Integration tests |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| PostgreSQL not running | `docker compose -f docker/compose.yaml up -d` |
| Port 5433 in use | Check for other PostgreSQL containers: `docker ps` |
| Python import errors | `cd engine && uv sync` |
| Node modules missing | `npm install` |
| DuckDB-WASM errors | Check `next.config.ts` for `serverExternalPackages` |
| Graph not rendering | Verify Parquet bundle exists and Cosmograph config |
