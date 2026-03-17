# SoleMD.Graph

Biomedical knowledge graph for neuroscience, psychiatry, and neurology. Explore literature visually through an interactive graph, search with RAG-powered evidence retrieval, and cite with inline paper suggestions.

## What It Does

- **Explore** -- Navigate 500K-2M papers as a GPU-rendered graph (Cosmograph), clustered by research community
- **Search** -- Ask questions, get cited evidence from abstracts and full-text papers via streaming LLM synthesis
- **Cite** -- Type `@` to find papers matching your current sentence
- **Filter** -- Type a term and watch matching papers light up across the graph in real-time

## Architecture

```
Next.js 16 (frontend) + Python FastAPI (data engine) + PostgreSQL 16 (pgvector)
```

Data comes from PubTator3 (entity annotations, relations) and Semantic Scholar (citations, embeddings, TLDRs) -- no local NER or PDF extraction. Full architecture in `docs/map/architecture.md`.

## Quick Start

```bash
# Start database
docker compose -f docker/compose.yaml up -d

# Frontend
npm install
npm run dev

# Data engine
cd engine
uv sync
uv run uvicorn app.main:app --port 8300
```

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Mantine 8, Tailwind CSS 4 |
| Graph | Cosmograph (cosmos.gl), DuckDB-WASM, Parquet |
| LLM | Vercel AI SDK 6, Gemini 2.5 Flash |
| Database | PostgreSQL 16 + pgvector 0.8.2 |
| Data engine | Python 3.13, FastAPI, Dramatiq, DuckDB |
| Data sources | PubTator3 (NCBI), Semantic Scholar (Allen AI) |

## Documentation

- `docs/map/architecture.md` -- Full architecture and technology decisions
- `docs/map/pubtator3.md` -- PubTator3 download, parse, load guide
- `docs/map/semantic-scholar.md` -- Semantic Scholar datasets guide
