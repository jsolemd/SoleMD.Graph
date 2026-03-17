# Semantic Scholar: Deep-Dive

> **Service #13** in the [architecture](architecture.md) service inventory
> **Date**: 2026-03-16
> **Status**: Implementation guide -- verified against Datasets API documentation
> **Scope**: Bulk dataset acquisition, domain filtering, PostgreSQL loading,
> monthly refresh, and integration with the SoleMD.Graph pipeline

---

## 1. What Semantic Scholar Is

Semantic Scholar is Allen AI's open academic graph. It indexes **225M+ papers**
across all scientific disciplines, connects them with **2.8B citation edges**,
and computes derived artifacts -- SPECTER2 embeddings, TLDRs, author profiles,
field-of-study labels -- at a scale no single team could replicate.

### Why It Is Essential

SoleMD.Graph has three data pillars. PubTator3 provides entity annotations and
relations. PubMed E-utilities provides MeSH-based domain filtering. Semantic
Scholar provides everything else:

| Capability | What S2 Gives Us | What PubTator Does NOT Have |
|------------|------------------|-----------------------------|
| Citation graph | 2.8B directed edges with intent labels | No citation data at all |
| Paper embeddings | SPECTER2 768d for 200M+ papers (free, pre-computed) | No embeddings |
| Paper summaries | TLDRs for 60M papers (machine-generated) | No summaries |
| Full-text | S2ORC structured text for 12M papers | Abstracts only |
| Broader coverage | 225M papers across all fields | PubMed-indexed papers only (~36M) |
| Cross-references | DOI, PMID, arXiv, ACL, DBLP mappings | PMID only |

### The Bridge: PMID

Papers with PMIDs appear in both Semantic Scholar and PubTator3. The S2
`paper-ids` dataset provides the cross-reference mapping between S2 corpus IDs
and PMIDs. This bridge is the foundation of domain filtering -- PubMed MeSH
queries yield PMID sets, which map to S2 corpus IDs via `paper-ids`, which
unlock citations, embeddings, and TLDRs for those same papers.

### Complement, Not Replacement

S2 and PubTator3 serve different purposes and neither can replace the other:

- **S2** = graph structure (who cites whom), embedding space (what clusters
  together), and metadata (titles, venues, years)
- **PubTator3** = biomedical annotations (genes, diseases, chemicals, mutations,
  species, cell lines) and relations (binds, correlates, interacts)

Together they produce a knowledge graph where papers are positioned by
intellectual lineage (SPECTER2 + citations) and annotated with biomedical
semantics (PubTator3 entities and relations).

---

## 2. Data Inventory

All datasets are available through the Datasets API as gzipped newline-delimited
JSON (`.jsonl.gz`). Each release contains multiple shards per dataset.

### Dataset Summary

| Dataset | Records | Shards | Compressed Size | Description |
|---------|---------|--------|-----------------|-------------|
| `papers` | ~225M | ~30 | ~20 GB | Title, authors, year, venue, fields of study, external IDs |
| `abstracts` | ~100M | ~30 | ~54 GB | Full abstract text |
| `citations` | ~2.8B | ~30 | ~80 GB | Directed edges with context, intent, influential flag |
| `s2fieldsofstudy` | ~225M | ~10 | ~5 GB | Field-of-study labels per paper |
| `embeddings` | ~200M+ | ~30 | ~600 GB | SPECTER2 768d float vectors |
| `tldrs` | ~60M | ~10 | ~3 GB | Machine-generated single-sentence summaries |
| `s2orc` | ~12M | ~30 | ~200 GB | Full-text structured papers |
| `paper-ids` | ~225M | ~10 | ~8 GB | Cross-reference mapping (PMID, DOI, arXiv, etc.) |
| `authors` | ~105M | ~10 | ~10 GB | Author metadata + affiliations |
| `publication-venues` | ~195K | 1 | ~10 MB | Venue/journal metadata |

**Total initial download**: ~1 TB compressed. Domain-filtered output is 20-50x
smaller.

### Sample Records

**papers** (one line from the JSONL):

```json
{
  "corpusid": 203012345,
  "externalids": {
    "DOI": "10.1038/s41586-023-06789-1",
    "PubMed": "37654321",
    "ArXiv": null,
    "ACL": null,
    "DBLP": null,
    "PubMedCentral": "PMC10234567"
  },
  "url": "https://www.semanticscholar.org/paper/abc123",
  "title": "Dopamine D2 receptor signaling in prefrontal cortex interneurons",
  "authors": [
    {"authorId": "12345678", "name": "J. Smith"},
    {"authorId": "23456789", "name": "A. Chen"}
  ],
  "venue": "Nature",
  "publicationvenueid": "abc-def-123",
  "year": 2023,
  "referencecount": 45,
  "citationcount": 128,
  "influentialcitationcount": 12,
  "isopenaccess": true,
  "s2fieldsofstudy": [
    {"category": "Medicine", "source": "s2-fos-model"},
    {"category": "Biology", "source": "s2-fos-model"}
  ],
  "publicationtypes": ["JournalArticle"],
  "publicationdate": "2023-06-15",
  "journal": {"name": "Nature", "volume": "618", "pages": "345-352"},
  "updated": "2024-01-15T00:00:00.000Z"
}
```

**abstracts** (one line):

```json
{
  "corpusid": 203012345,
  "abstract": "The prefrontal cortex (PFC) plays a critical role in working memory and executive function. Here we show that dopamine D2 receptors on parvalbumin-positive interneurons modulate gamma oscillations through..."
}
```

**citations** (one line):

```json
{
  "citingcorpusid": 203012345,
  "citedcorpusid": 198765432,
  "isinfluential": true,
  "contexts": [
    "Building on the seminal observation that D2 receptor blockade disrupts PFC gamma oscillations [12]..."
  ],
  "intents": ["Background"]
}
```

**embeddings** (one line):

```json
{
  "corpusid": 203012345,
  "vector": [0.0234, -0.1567, 0.0891, 0.2345, -0.0678, ...]
}
```

The `vector` field contains 768 floats (SPECTER2 dimensions). Each float is
stored as a JSON number.

**tldrs** (one line):

```json
{
  "corpusid": 203012345,
  "model": "tldr@v2.0.0",
  "text": "D2 receptors on PFC interneurons modulate gamma oscillations and working memory performance through a mechanism independent of canonical dopamine signaling."
}
```

**paper-ids** (one line):

```json
{
  "corpusid": 203012345,
  "externalids": {
    "DOI": "10.1038/s41586-023-06789-1",
    "PubMed": "37654321",
    "ArXiv": null,
    "ACL": null,
    "DBLP": null,
    "PubMedCentral": "PMC10234567",
    "MAG": null
  }
}
```

---

## 3. What We Need vs Available

### Domain Filtering Strategy

"Neuroscience" and "Psychiatry" are NOT separate fields of study in S2. They
fall under **Medicine**, **Biology**, and/or **Psychology**. S2 uses 23 coarse
categories classified by SVM on character n-gram TF-IDF. Papers can have up to 3
fields (multilabel).

The 23 S2 fields of study: Agriculture and Food Sciences, Art, Biology,
Business, Chemistry, Computer Science, Economics, Education, Engineering,
Environmental Science, Geography, Geology, History, Law, Linguistics, Materials
Science, Mathematics, Medicine, Philosophy, Physics, Political Science,
Psychology, Sociology.

Approximate paper counts for relevant fields:

| Field | Papers |
|-------|--------|
| Medicine | ~31.8M |
| Biology | ~20.4M |
| Psychology | ~6.2M |

**Two-stage filtering** is required:

1. **Coarse filter** (S2 fields): Keep papers tagged Medicine, Biology, or
   Psychology. This yields ~50M papers (with overlap across fields).
2. **Precise filter** (PubMed MeSH): Cross-reference PMIDs with PubMed MeSH
   terms for neuroscience, psychiatry, and neurology descriptors. This narrows
   to 500K-2M papers in the exact domain.

### Volume Estimates

```
Full S2 dataset:        225M papers
Coarse filter (M+B+P):  ~50M papers (many have PMIDs)
Precise filter (MeSH):  500K-2M domain papers
+ 1st-order neighbors:  5-10M total (for citation context)
```

The "expanded domain set" includes first-order citation neighbors -- papers cited
by or citing a domain paper. These neighbors provide citation context even if
they are outside the strict domain (e.g., a methods paper from computer science
cited by a neuroscience paper).

### What to Download vs What to Filter Locally

| Dataset | Strategy | Rationale |
|---------|----------|-----------|
| `paper-ids` | Download full, filter locally | Small (8 GB), need complete PMID mapping |
| `papers` | Download full, filter locally | Need metadata for domain + neighbors |
| `abstracts` | Download full, filter locally | Need abstracts for domain papers |
| `citations` | Download full, filter locally | Must find edges touching domain papers |
| `embeddings` | Download full, filter locally | Must extract domain paper vectors |
| `tldrs` | Download full, filter locally | Small, need domain paper TLDRs |
| `s2orc` | Defer to Phase 2 | Large (200 GB), only needed for deep RAG |
| `authors` | Defer | Not needed for MVP graph |
| `publication-venues` | Download (tiny) | Useful for venue metadata |

### Hot/Cold Split

| Layer | Contents | Storage |
|-------|----------|---------|
| **Hot** (PostgreSQL) | 500K-2M domain papers + metadata, 5-10M SPECTER2 vectors (halfvec), 50-100M citation edges (domain-expanded), TLDRs | ~50-70 GB |
| **Cold** (Parquet on NVMe) | Full S2 papers, citations, embeddings, abstracts | ~600 GB Parquet |

---

## 4. Download Procedure

### Prerequisites

- **API key**: Free, obtain from https://www.semanticscholar.org/product/api
- **Disk space**: ~1.5 TB for raw downloads + processed Parquet
- **Bandwidth**: Expect 12-48 hours for the full initial download depending on
  connection speed
- **Tools**: Python 3.11+, `requests`, `tqdm`

### API Workflow

**Step 1: List available releases**

```bash
curl -s -H "x-api-key: $S2_API_KEY" \
  "https://api.semanticscholar.org/datasets/v1/release/" | python -m json.tool
```

Returns a JSON array of release date strings (e.g., `["2026-03-01", "2026-02-01", ...]`).

**Step 2: Get dataset manifest for the latest release**

```bash
curl -s -H "x-api-key: $S2_API_KEY" \
  "https://api.semanticscholar.org/datasets/v1/release/latest/dataset/papers" \
  | python -m json.tool
```

Returns:

```json
{
  "name": "papers",
  "description": "...",
  "README": "...",
  "files": [
    "https://ai2-s2-datasets.s3.amazonaws.com/..._000.jsonl.gz?...",
    "https://ai2-s2-datasets.s3.amazonaws.com/..._001.jsonl.gz?...",
    "..."
  ]
}
```

The `files` array contains pre-signed S3 URLs for each shard.

**Step 3: Download shards**

```python
"""Download all shards for a Semantic Scholar dataset."""
import os
import requests
from pathlib import Path
from tqdm import tqdm

S2_API_KEY = os.environ["S2_API_KEY"]
BASE_URL = "https://api.semanticscholar.org/datasets/v1/release"
HEADERS = {"x-api-key": S2_API_KEY}

def get_latest_release() -> str:
    """Get the latest release ID."""
    resp = requests.get(f"{BASE_URL}/", headers=HEADERS)
    resp.raise_for_status()
    releases = resp.json()
    return releases[0]  # Most recent first

def get_dataset_urls(release_id: str, dataset_name: str) -> list[str]:
    """Get pre-signed S3 URLs for all shards of a dataset."""
    resp = requests.get(
        f"{BASE_URL}/{release_id}/dataset/{dataset_name}",
        headers=HEADERS,
    )
    resp.raise_for_status()
    return resp.json()["files"]

def download_shard(url: str, dest: Path) -> None:
    """Download a single shard with resume support."""
    headers = {}
    existing_size = dest.stat().st_size if dest.exists() else 0
    if existing_size > 0:
        headers["Range"] = f"bytes={existing_size}-"

    resp = requests.get(url, headers=headers, stream=True)
    if resp.status_code == 416:
        return  # Already complete
    resp.raise_for_status()

    total = int(resp.headers.get("content-length", 0)) + existing_size
    mode = "ab" if existing_size > 0 else "wb"

    with open(dest, mode) as f:
        with tqdm(total=total, initial=existing_size, unit="B",
                  unit_scale=True, desc=dest.name) as pbar:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
                pbar.update(len(chunk))

def download_dataset(dataset_name: str, output_dir: Path) -> None:
    """Download all shards for a dataset."""
    release_id = get_latest_release()
    urls = get_dataset_urls(release_id, dataset_name)

    output_dir.mkdir(parents=True, exist_ok=True)
    for i, url in enumerate(urls):
        shard_path = output_dir / f"{dataset_name}_{i:03d}.jsonl.gz"
        download_shard(url, shard_path)

    # Record the release ID for incremental updates
    meta_path = output_dir.parent / "release_metadata.json"
    import json
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    meta[dataset_name] = {"release_id": release_id, "shard_count": len(urls)}
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"Downloaded {len(urls)} shards for {dataset_name} (release {release_id})")

# Usage
if __name__ == "__main__":
    base = Path("data/semantic-scholar/raw")
    # Download in priority order
    for ds in ["paper-ids", "papers", "abstracts", "citations",
               "tldrs", "embeddings"]:
        download_dataset(ds, base / ds)
```

**Step 4: Verify downloads**

```bash
# Check shard counts match manifest
ls -la data/semantic-scholar/raw/papers/ | wc -l
# Verify gzip integrity
for f in data/semantic-scholar/raw/papers/*.jsonl.gz; do
  gzip -t "$f" && echo "OK: $f" || echo "CORRUPT: $f"
done
```

### Local Directory Structure

```
data/semantic-scholar/
├── raw/                       # Downloaded .jsonl.gz shards
│   ├── paper-ids/             # ~10 shards, ~8 GB total
│   ├── papers/                # ~30 shards, ~20 GB total
│   ├── abstracts/             # ~30 shards, ~54 GB total
│   ├── citations/             # ~30 shards, ~80 GB total
│   ├── embeddings/            # ~30 shards, ~600 GB total
│   ├── tldrs/                 # ~10 shards, ~3 GB total
│   ├── publication-venues/    # 1 shard, ~10 MB
│   └── s2orc/                 # Phase 2 (~200 GB total)
├── parquet/                   # Processed domain-filtered output
│   ├── papers.parquet
│   ├── abstracts.parquet
│   ├── tldrs.parquet
│   ├── paper_ids.parquet
│   ├── citations/             # Hive-partitioned
│   └── embeddings/            # Hive-partitioned
└── release_metadata.json      # Tracks current release IDs
```

### Download Priority Order

| Priority | Dataset | Why First |
|----------|---------|-----------|
| 1 | `paper-ids` | Needed for PMID cross-referencing; everything else depends on it |
| 2 | `papers` | Core metadata for domain filtering |
| 3 | `abstracts` | Needed for RAG embedding (MedCPT) |
| 4 | `citations` | Citation graph structure |
| 5 | `tldrs` | Paper detail panel display |
| 6 | `embeddings` | SPECTER2 for UMAP layout (largest download, start early) |
| 7 | `s2orc` | Phase 2 -- deep RAG from full-text |

### Expected Download Times

| Connection | paper-ids (8 GB) | papers (20 GB) | abstracts (54 GB) | citations (80 GB) | embeddings (600 GB) |
|------------|------------------|----------------|--------------------|--------------------|---------------------|
| 100 Mbps | ~11 min | ~27 min | ~72 min | ~107 min | ~13 hr |
| 500 Mbps | ~2 min | ~5 min | ~14 min | ~21 min | ~2.7 hr |
| 1 Gbps | ~1 min | ~3 min | ~7 min | ~11 min | ~1.3 hr |

Start the embeddings download first (in the background) since it dominates
total time.

---

## 5. Processing Pipeline

### Overview

Raw JSONL shards are too large to work with directly. The processing pipeline
filters them to the domain of interest and writes optimized Parquet files for
fast querying by DuckDB.

### Domain Filtering Workflow

```
1. Build PMID -> Corpus ID mapping      (paper-ids dataset)
2. Get domain PMIDs                     (PubMed MeSH query, external step)
3. Map domain PMIDs -> corpus IDs       (join #1 and #2)
4. Get domain papers                    (filter papers to domain corpus IDs)
5. Expand domain set                    (add first-order citation neighbors)
6. Filter citations                     (both endpoints in expanded set)
7. Filter embeddings                    (expanded set)
8. Filter abstracts                     (expanded set)
9. Filter TLDRs                         (expanded set)
10. Write Parquet                       (sorted, partitioned, ZSTD compressed)
```

### Step-by-Step with DuckDB

DuckDB reads gzipped JSONL natively and handles the filtering without loading
everything into memory. All queries below assume DuckDB is started with
sufficient memory:

```bash
duckdb -c "SET memory_limit='32GB'; SET threads TO 8;"
```

**Step 1: Build PMID cross-reference table**

```sql
-- Load paper-ids and extract PMID mapping
CREATE TABLE paper_id_mapping AS
SELECT
    corpusid,
    CAST(externalids->>'PubMed' AS INTEGER) AS pmid,
    externalids->>'DOI' AS doi,
    externalids->>'PubMedCentral' AS pmc
FROM read_json(
    'data/semantic-scholar/raw/paper-ids/*.jsonl.gz',
    format = 'newline_delimited',
    compression = 'gzip',
    columns = {corpusid: 'BIGINT', externalids: 'JSON'}
)
WHERE externalids->>'PubMed' IS NOT NULL;

-- Result: ~100M rows (papers with PMIDs)
```

**Step 2: Load domain PMIDs**

Domain PMIDs come from a PubMed E-utilities MeSH query (see `pubmed-eutils.md`).
The result is a flat file of PMIDs:

```sql
-- Assume domain_pmids.csv has been generated by the PubMed MeSH query
CREATE TABLE domain_pmids AS
SELECT CAST(column0 AS INTEGER) AS pmid
FROM read_csv('data/domain_pmids.csv', header = false);

-- Result: 500K-2M rows
```

**Step 3: Map domain PMIDs to S2 corpus IDs**

```sql
CREATE TABLE domain_corpus_ids AS
SELECT p.corpusid, p.pmid
FROM paper_id_mapping p
JOIN domain_pmids d ON p.pmid = d.pmid;

-- Result: 500K-2M rows (some PMIDs may not have S2 entries)
```

**Step 4: Filter papers to domain**

```sql
CREATE TABLE domain_papers AS
SELECT p.*
FROM read_json(
    'data/semantic-scholar/raw/papers/*.jsonl.gz',
    format = 'newline_delimited',
    compression = 'gzip',
    columns = {
        corpusid: 'BIGINT', title: 'VARCHAR', year: 'INTEGER',
        venue: 'VARCHAR', referencecount: 'INTEGER',
        citationcount: 'INTEGER', influentialcitationcount: 'INTEGER',
        isopenaccess: 'BOOLEAN', publicationdate: 'VARCHAR',
        journal: 'JSON', publicationtypes: 'VARCHAR[]',
        url: 'VARCHAR'
    }
) p
JOIN domain_corpus_ids d ON p.corpusid = d.corpusid;
```

**Step 5: Expand to first-order citation neighbors**

```sql
-- Find all corpus IDs that cite or are cited by domain papers
CREATE TABLE expanded_corpus_ids AS
SELECT corpusid FROM domain_corpus_ids
UNION
SELECT c.citedcorpusid AS corpusid
FROM read_json(
    'data/semantic-scholar/raw/citations/*.jsonl.gz',
    format = 'newline_delimited',
    compression = 'gzip',
    columns = {citingcorpusid: 'BIGINT', citedcorpusid: 'BIGINT'}
) c
JOIN domain_corpus_ids d ON c.citingcorpusid = d.corpusid
UNION
SELECT c.citingcorpusid AS corpusid
FROM read_json(
    'data/semantic-scholar/raw/citations/*.jsonl.gz',
    format = 'newline_delimited',
    compression = 'gzip',
    columns = {citingcorpusid: 'BIGINT', citedcorpusid: 'BIGINT'}
) c
JOIN domain_corpus_ids d ON c.citedcorpusid = d.corpusid;

-- Result: 5-10M rows (domain papers + their citation neighborhood)
```

**Step 6: Filter citations**

```sql
-- Keep only edges where BOTH endpoints are in the expanded set
COPY (
    SELECT c.citingcorpusid, c.citedcorpusid,
           c.isinfluential, c.intents, c.contexts
    FROM read_json(
        'data/semantic-scholar/raw/citations/*.jsonl.gz',
        format = 'newline_delimited',
        compression = 'gzip',
        columns = {
            citingcorpusid: 'BIGINT', citedcorpusid: 'BIGINT',
            isinfluential: 'BOOLEAN', intents: 'VARCHAR[]',
            contexts: 'VARCHAR[]'
        }
    ) c
    JOIN expanded_corpus_ids e1 ON c.citingcorpusid = e1.corpusid
    JOIN expanded_corpus_ids e2 ON c.citedcorpusid = e2.corpusid
    ORDER BY c.citingcorpusid
)
TO 'data/semantic-scholar/parquet/citations'
(FORMAT PARQUET, COMPRESSION 'ZSTD', ROW_GROUP_SIZE 100000,
 PARTITION_BY (citingcorpusid // 1000000));
```

**Step 7: Filter embeddings**

```sql
COPY (
    SELECT e.corpusid, e.vector
    FROM read_json(
        'data/semantic-scholar/raw/embeddings/*.jsonl.gz',
        format = 'newline_delimited',
        compression = 'gzip',
        columns = {corpusid: 'BIGINT', vector: 'FLOAT[768]'}
    ) e
    JOIN expanded_corpus_ids d ON e.corpusid = d.corpusid
    ORDER BY e.corpusid
)
TO 'data/semantic-scholar/parquet/embeddings'
(FORMAT PARQUET, COMPRESSION 'ZSTD', ROW_GROUP_SIZE 50000,
 PARTITION_BY (corpusid // 1000000));
```

**Step 8: Filter abstracts**

```sql
COPY (
    SELECT a.corpusid, a.abstract
    FROM read_json(
        'data/semantic-scholar/raw/abstracts/*.jsonl.gz',
        format = 'newline_delimited',
        compression = 'gzip',
        columns = {corpusid: 'BIGINT', abstract: 'VARCHAR'}
    ) a
    JOIN expanded_corpus_ids d ON a.corpusid = d.corpusid
    ORDER BY a.corpusid
)
TO 'data/semantic-scholar/parquet/abstracts.parquet'
(FORMAT PARQUET, COMPRESSION 'ZSTD');
```

**Step 9: Filter TLDRs**

```sql
COPY (
    SELECT t.corpusid, t.text AS tldr
    FROM read_json(
        'data/semantic-scholar/raw/tldrs/*.jsonl.gz',
        format = 'newline_delimited',
        compression = 'gzip',
        columns = {corpusid: 'BIGINT', model: 'VARCHAR', text: 'VARCHAR'}
    ) t
    JOIN expanded_corpus_ids d ON t.corpusid = d.corpusid
    ORDER BY t.corpusid
)
TO 'data/semantic-scholar/parquet/tldrs.parquet'
(FORMAT PARQUET, COMPRESSION 'ZSTD');
```

### Processing Time Estimates

| Step | Data Scanned | Expected Time |
|------|-------------|---------------|
| Paper-IDs parse + filter | 8 GB gz | ~5-10 min |
| Papers filter | 20 GB gz | ~10-20 min |
| Citation expansion + filter | 80 GB gz (2 passes) | ~60-90 min |
| Embeddings filter | 600 GB gz | ~3-6 hr |
| Abstracts filter | 54 GB gz | ~20-40 min |
| TLDRs filter | 3 GB gz | ~2-5 min |
| **Total** | | **~5-8 hr** |

The embeddings dataset dominates processing time. DuckDB will stream through
600 GB of gzipped JSON, extracting only the 5-10M matching vectors. This can
run unattended.

---

## 6. PostgreSQL Schema

Domain-filtered S2 data is loaded into PostgreSQL as the "hot" data layer.
These tables extend the existing `solemd` schema.

```sql
-- ============================================================
-- solemd.s2_papers: Semantic Scholar paper metadata
-- ============================================================
CREATE TABLE solemd.s2_papers (
    corpus_id       BIGINT PRIMARY KEY,
    pmid            INTEGER,
    doi             TEXT,
    pmc             TEXT,
    title           TEXT NOT NULL,
    abstract        TEXT,
    tldr            TEXT,
    year            SMALLINT,
    venue           TEXT,
    journal_name    TEXT,
    journal_volume  TEXT,
    journal_pages   TEXT,
    publication_date DATE,
    reference_count     INTEGER NOT NULL DEFAULT 0,
    citation_count      INTEGER NOT NULL DEFAULT 0,
    influential_citation_count INTEGER NOT NULL DEFAULT 0,
    is_open_access  BOOLEAN NOT NULL DEFAULT FALSE,
    fields_of_study TEXT[],           -- e.g., {'Medicine','Biology'}
    publication_types TEXT[],         -- e.g., {'JournalArticle'}
    s2_url          TEXT,
    is_domain_core  BOOLEAN NOT NULL DEFAULT FALSE,  -- true = matched MeSH filter; false = citation neighbor
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_s2_papers_pmid ON solemd.s2_papers (pmid) WHERE pmid IS NOT NULL;
CREATE INDEX idx_s2_papers_doi ON solemd.s2_papers (doi) WHERE doi IS NOT NULL;
CREATE INDEX idx_s2_papers_year ON solemd.s2_papers (year);
CREATE INDEX idx_s2_papers_domain ON solemd.s2_papers (is_domain_core) WHERE is_domain_core;
CREATE INDEX idx_s2_papers_citation_count ON solemd.s2_papers (citation_count DESC);

-- ============================================================
-- solemd.s2_citations: Citation edges between papers
-- ============================================================
CREATE TABLE solemd.s2_citations (
    citing_corpus_id BIGINT NOT NULL REFERENCES solemd.s2_papers(corpus_id),
    cited_corpus_id  BIGINT NOT NULL REFERENCES solemd.s2_papers(corpus_id),
    is_influential   BOOLEAN NOT NULL DEFAULT FALSE,
    intents          TEXT[],           -- {'Background','Methodology','ResultComparison'}
    context_text     TEXT,             -- Citation context sentence (first context only)
    PRIMARY KEY (citing_corpus_id, cited_corpus_id)
);

CREATE INDEX idx_s2_citations_cited ON solemd.s2_citations (cited_corpus_id);
CREATE INDEX idx_s2_citations_influential
    ON solemd.s2_citations (citing_corpus_id, cited_corpus_id)
    WHERE is_influential;

-- ============================================================
-- solemd.s2_embeddings: SPECTER2 768d vectors for graph layout
-- ============================================================
CREATE TABLE solemd.s2_embeddings (
    corpus_id  BIGINT PRIMARY KEY REFERENCES solemd.s2_papers(corpus_id),
    embedding  halfvec(768) NOT NULL   -- pgvector halfvec for 50% storage savings
);

-- HNSW index for nearest-neighbor queries (e.g., "related papers")
-- Use cosine distance -- SPECTER2 embeddings are L2-normalized
CREATE INDEX idx_s2_embeddings_hnsw
    ON solemd.s2_embeddings
    USING hnsw (embedding halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================================
-- solemd.s2_graph_layout: Pre-computed 2D coordinates from UMAP
-- ============================================================
CREATE TABLE solemd.s2_graph_layout (
    corpus_id   BIGINT PRIMARY KEY REFERENCES solemd.s2_papers(corpus_id),
    x           REAL NOT NULL,
    y           REAL NOT NULL,
    cluster_id  INTEGER,
    cluster_label TEXT
);

CREATE INDEX idx_s2_graph_layout_cluster ON solemd.s2_graph_layout (cluster_id);
```

### Storage Estimates

| Table | Rows | Row Size | Total |
|-------|------|----------|-------|
| `s2_papers` | 5-10M | ~500 bytes avg | ~3-5 GB |
| `s2_citations` | 50-100M | ~80 bytes avg | ~4-8 GB |
| `s2_embeddings` | 5-10M | ~1.6 KB (halfvec 768) | ~8-16 GB |
| `s2_graph_layout` | 5-10M | ~28 bytes | ~140-280 MB |
| **Indexes** | | | ~5-10 GB |
| **Total** | | | **~20-40 GB** |

Using `halfvec(768)` instead of `vector(768)` cuts embedding storage by 50%
(2 bytes per float instead of 4). SPECTER2 vectors have sufficient precision
for cosine similarity at half precision.

---

## 7. Loading into PostgreSQL

### Loading Papers

```sql
-- Use COPY with a staging table for atomic load
CREATE UNLOGGED TABLE solemd._s2_papers_staging (LIKE solemd.s2_papers INCLUDING ALL);

-- From Python/psycopg:
-- 1. Read domain-filtered Parquet with DuckDB
-- 2. Write to CSV pipe
-- 3. COPY into staging table
-- 4. Atomic swap
```

Python loading script:

```python
"""Load domain-filtered S2 data from Parquet into PostgreSQL."""
import duckdb
import psycopg
from psycopg import sql

DB_URL = "postgresql://user:pass@localhost:5432/solemd"

def load_papers(parquet_path: str) -> int:
    """Load papers from Parquet into PostgreSQL via COPY."""
    conn = psycopg.connect(DB_URL)
    conn.autocommit = False

    with conn.cursor() as cur:
        # Create staging table
        cur.execute("""
            CREATE UNLOGGED TABLE IF NOT EXISTS solemd._s2_papers_staging
            (LIKE solemd.s2_papers INCLUDING DEFAULTS)
        """)
        cur.execute("TRUNCATE solemd._s2_papers_staging")

        # Read Parquet and stream into staging via COPY
        db = duckdb.connect()
        reader = db.execute(f"""
            SELECT corpusid, pmid, doi, pmc, title, abstract, tldr,
                   year, venue, journal_name, journal_volume, journal_pages,
                   publication_date, reference_count, citation_count,
                   influential_citation_count, is_open_access,
                   fields_of_study, publication_types, s2_url, is_domain_core
            FROM read_parquet('{parquet_path}')
        """).fetchall()

        with cur.copy("""
            COPY solemd._s2_papers_staging (
                corpus_id, pmid, doi, pmc, title, abstract, tldr,
                year, venue, journal_name, journal_volume, journal_pages,
                publication_date, reference_count, citation_count,
                influential_citation_count, is_open_access,
                fields_of_study, publication_types, s2_url, is_domain_core
            ) FROM STDIN
        """) as copy:
            for row in reader:
                copy.write_row(row)

        row_count = cur.execute(
            "SELECT count(*) FROM solemd._s2_papers_staging"
        ).fetchone()[0]

        # Atomic swap
        cur.execute("DROP TABLE IF EXISTS solemd.s2_papers_old")
        cur.execute("ALTER TABLE solemd.s2_papers RENAME TO s2_papers_old")
        cur.execute("ALTER TABLE solemd._s2_papers_staging RENAME TO s2_papers")
        cur.execute("DROP TABLE solemd.s2_papers_old")

    conn.commit()
    conn.close()
    return row_count
```

### Loading Citations

Citations are the largest table. Use `COPY` in binary format for maximum speed:

```python
def load_citations(parquet_dir: str) -> int:
    """Load citations from partitioned Parquet."""
    conn = psycopg.connect(DB_URL)
    conn.autocommit = False

    with conn.cursor() as cur:
        cur.execute("""
            CREATE UNLOGGED TABLE IF NOT EXISTS solemd._s2_citations_staging
            (LIKE solemd.s2_citations INCLUDING DEFAULTS)
        """)
        cur.execute("TRUNCATE solemd._s2_citations_staging")

        db = duckdb.connect()
        # Stream partitioned Parquet
        result = db.execute(f"""
            SELECT citingcorpusid, citedcorpusid, isinfluential,
                   intents, contexts[1] AS context_text
            FROM read_parquet('{parquet_dir}/**/*.parquet')
        """)

        batch_size = 100_000
        total = 0
        while True:
            batch = result.fetchmany(batch_size)
            if not batch:
                break
            with cur.copy("""
                COPY solemd._s2_citations_staging (
                    citing_corpus_id, cited_corpus_id, is_influential,
                    intents, context_text
                ) FROM STDIN
            """) as copy:
                for row in batch:
                    copy.write_row(row)
            total += len(batch)

        # Build indexes on staging table before swap
        cur.execute("""
            CREATE INDEX ON solemd._s2_citations_staging (cited_corpus_id)
        """)

        # Atomic swap
        cur.execute("DROP TABLE IF EXISTS solemd.s2_citations_old CASCADE")
        cur.execute("ALTER TABLE solemd.s2_citations RENAME TO s2_citations_old")
        cur.execute(
            "ALTER TABLE solemd._s2_citations_staging RENAME TO s2_citations"
        )
        cur.execute("DROP TABLE solemd.s2_citations_old")

    conn.commit()
    conn.close()
    return total
```

### Loading SPECTER2 Embeddings

Embeddings require special handling -- 768 floats per row must be formatted as
pgvector's text representation:

```python
def load_embeddings(parquet_dir: str) -> int:
    """Load SPECTER2 embeddings into pgvector halfvec."""
    conn = psycopg.connect(DB_URL)
    conn.autocommit = False

    with conn.cursor() as cur:
        cur.execute("""
            CREATE UNLOGGED TABLE IF NOT EXISTS solemd._s2_embeddings_staging (
                corpus_id BIGINT PRIMARY KEY,
                embedding halfvec(768) NOT NULL
            )
        """)
        cur.execute("TRUNCATE solemd._s2_embeddings_staging")

        db = duckdb.connect()
        result = db.execute(f"""
            SELECT corpusid, vector
            FROM read_parquet('{parquet_dir}/**/*.parquet')
        """)

        batch_size = 10_000
        total = 0
        while True:
            batch = result.fetchmany(batch_size)
            if not batch:
                break
            # Format vectors as pgvector text: '[0.1,0.2,...,0.3]'
            rows = []
            for corpus_id, vector in batch:
                vec_str = "[" + ",".join(str(v) for v in vector) + "]"
                rows.append((corpus_id, vec_str))

            with cur.copy("""
                COPY solemd._s2_embeddings_staging (corpus_id, embedding)
                FROM STDIN
            """) as copy:
                for row in rows:
                    copy.write_row(row)
            total += len(batch)

        # Build HNSW index (takes 30-60 min for 5-10M vectors)
        cur.execute("""
            CREATE INDEX ON solemd._s2_embeddings_staging
            USING hnsw (embedding halfvec_cosine_ops)
            WITH (m = 16, ef_construction = 64)
        """)

        # Atomic swap
        cur.execute("DROP TABLE IF EXISTS solemd.s2_embeddings_old CASCADE")
        cur.execute("ALTER TABLE solemd.s2_embeddings RENAME TO s2_embeddings_old")
        cur.execute(
            "ALTER TABLE solemd._s2_embeddings_staging RENAME TO s2_embeddings"
        )
        cur.execute("DROP TABLE solemd.s2_embeddings_old")

    conn.commit()
    conn.close()
    return total
```

### Loading Time Estimates

| Table | Rows | COPY Time | Index Time | Total |
|-------|------|-----------|------------|-------|
| `s2_papers` | 5-10M | ~5-10 min | ~2-5 min | ~10-15 min |
| `s2_citations` | 50-100M | ~30-60 min | ~15-30 min | ~45-90 min |
| `s2_embeddings` | 5-10M | ~20-40 min | ~30-60 min (HNSW) | ~50-100 min |
| `s2_graph_layout` | 5-10M | ~3-5 min | ~1-2 min | ~5-7 min |
| **Total** | | | | **~2-3.5 hr** |

The HNSW index build on 5-10M halfvec(768) vectors is the bottleneck. It runs
single-threaded in PostgreSQL and requires holding the full index in memory
(~8-16 GB for halfvec at this scale). Ensure `maintenance_work_mem` is set to
at least 4 GB:

```sql
SET maintenance_work_mem = '4GB';
```

---

## 8. Monthly Refresh

S2 releases monthly snapshots with incremental diffs between releases. The
Datasets API supports both full snapshots and diff-based updates.

### Diff-Based Updates

```python
"""Fetch incremental diffs between S2 releases."""
import json
import requests
from pathlib import Path

def get_diffs(
    current_release: str,
    latest_release: str,
    dataset_name: str,
) -> dict:
    """Get diff files between two releases.

    Returns dict with 'update_files' (upserts) and 'delete_files'.
    """
    resp = requests.get(
        f"https://api.semanticscholar.org/datasets/v1/diffs/"
        f"{current_release}/to/{latest_release}/{dataset_name}",
        headers={"x-api-key": S2_API_KEY},
    )
    resp.raise_for_status()
    return resp.json()


def apply_monthly_refresh() -> None:
    """Apply incremental updates from S2."""
    meta_path = Path("data/semantic-scholar/release_metadata.json")
    meta = json.loads(meta_path.read_text())
    current = meta["papers"]["release_id"]

    latest = get_latest_release()
    if current == latest:
        print("Already up to date")
        return

    for dataset in ["paper-ids", "papers", "abstracts", "tldrs"]:
        diff = get_diffs(current, latest, dataset)
        # Download update files (upserts)
        for url in diff.get("update_files", []):
            download_shard(url, Path(f"data/semantic-scholar/diffs/{dataset}/"))
        # Download delete files
        for url in diff.get("delete_files", []):
            download_shard(url, Path(f"data/semantic-scholar/diffs/{dataset}/"))

    # Re-run domain filtering pipeline on updated data
    # Then reload PostgreSQL tables
    meta["papers"]["release_id"] = latest
    meta_path.write_text(json.dumps(meta, indent=2))
```

### Refresh Strategy by Dataset

| Dataset | Strategy | Rationale |
|---------|----------|-----------|
| `paper-ids` | Incremental diff | Small diffs, need current PMID mapping |
| `papers` | Incremental diff | Apply upserts + deletes to existing Parquet |
| `abstracts` | Incremental diff | Same as papers |
| `tldrs` | Incremental diff | Small dataset, fast to update |
| `citations` | Full re-download + re-filter | Citation graph changes are complex; re-filtering from scratch is simpler and safer than patching 2.8B edges |
| `embeddings` | Full re-download + re-filter | New papers get new embeddings; diffing 200M vectors is impractical |

### Monthly Refresh Workflow

```
1. Check current release vs latest release
2. Download diffs for paper-ids, papers, abstracts, tldrs
3. Apply diffs to local Parquet files
4. Re-download citations and embeddings (if full refresh month)
5. Re-run domain filtering pipeline
6. Reload PostgreSQL tables via atomic swap
7. Re-run UMAP .transform() for new papers (incremental layout)
8. Rebuild graph Parquet bundles
9. Upload to R2
10. Update release_metadata.json
```

**Incremental UMAP**: Between full recomputes, new papers can be projected
onto the existing 2D layout using `umap_model.transform(new_vectors)`. This
avoids GPU rental for minor monthly updates. Full recompute (GPU UMAP from
scratch) should happen quarterly or when >20% of the corpus is new.

---

## 9. Access Patterns

### Paper Metadata Lookup

```sql
-- By PMID
SELECT corpus_id, title, year, venue, citation_count, tldr,
       fields_of_study, is_domain_core
FROM solemd.s2_papers
WHERE pmid = 37654321;

-- By S2 corpus ID
SELECT * FROM solemd.s2_papers WHERE corpus_id = 203012345;

-- By DOI
SELECT * FROM solemd.s2_papers WHERE doi = '10.1038/s41586-023-06789-1';
```

### Citation Graph Traversal

```sql
-- Papers cited by a given paper (outgoing references)
SELECT p.corpus_id, p.title, p.year, c.intents, c.is_influential
FROM solemd.s2_citations c
JOIN solemd.s2_papers p ON c.cited_corpus_id = p.corpus_id
WHERE c.citing_corpus_id = 203012345
ORDER BY p.citation_count DESC;

-- Papers citing a given paper (incoming citations)
SELECT p.corpus_id, p.title, p.year, c.intents, c.is_influential
FROM solemd.s2_citations c
JOIN solemd.s2_papers p ON c.citing_corpus_id = p.corpus_id
WHERE c.cited_corpus_id = 203012345
ORDER BY p.year DESC;

-- Mutual citations (co-citation): papers cited together with a given paper
SELECT p.corpus_id, p.title, count(*) AS co_citation_count
FROM solemd.s2_citations c1
JOIN solemd.s2_citations c2
    ON c1.citing_corpus_id = c2.citing_corpus_id
    AND c1.cited_corpus_id != c2.cited_corpus_id
JOIN solemd.s2_papers p ON c2.cited_corpus_id = p.corpus_id
WHERE c1.cited_corpus_id = 203012345
GROUP BY p.corpus_id, p.title
ORDER BY co_citation_count DESC
LIMIT 20;

-- Citation context: see the sentence where a paper was cited
SELECT c.context_text, c.intents, c.is_influential,
       p.title AS citing_paper
FROM solemd.s2_citations c
JOIN solemd.s2_papers p ON c.citing_corpus_id = p.corpus_id
WHERE c.cited_corpus_id = 203012345
  AND c.context_text IS NOT NULL
ORDER BY c.is_influential DESC
LIMIT 10;
```

### Citation Intent Filtering

```sql
-- Show only methodology citations (how was this paper's method used?)
SELECT p.title, p.year, c.context_text
FROM solemd.s2_citations c
JOIN solemd.s2_papers p ON c.citing_corpus_id = p.corpus_id
WHERE c.cited_corpus_id = 203012345
  AND 'Methodology' = ANY(c.intents);

-- Influential citations only (high-signal references)
SELECT p.title, p.year, c.intents
FROM solemd.s2_citations c
JOIN solemd.s2_papers p ON c.citing_corpus_id = p.corpus_id
WHERE c.cited_corpus_id = 203012345
  AND c.is_influential = true
ORDER BY p.year DESC;
```

### SPECTER2 Nearest Neighbors

```sql
-- Find papers most similar to a given paper (cosine similarity)
SELECT p.corpus_id, p.title, p.year, p.citation_count,
       1 - (e.embedding <=> target.embedding) AS similarity
FROM solemd.s2_embeddings e
JOIN solemd.s2_papers p ON e.corpus_id = p.corpus_id
CROSS JOIN (
    SELECT embedding FROM solemd.s2_embeddings WHERE corpus_id = 203012345
) target
WHERE e.corpus_id != 203012345
ORDER BY e.embedding <=> target.embedding
LIMIT 20;

-- Find papers similar to a query embedding (from MedCPT or SPECTER2)
-- $1 = '[0.023, -0.156, ...]'::halfvec(768)
SELECT p.corpus_id, p.title, p.year,
       1 - (e.embedding <=> $1::halfvec(768)) AS similarity
FROM solemd.s2_embeddings e
JOIN solemd.s2_papers p ON e.corpus_id = p.corpus_id
ORDER BY e.embedding <=> $1::halfvec(768)
LIMIT 20;
```

### Papers by Field of Study

```sql
-- Papers in Medicine AND Biology
SELECT corpus_id, title, year, citation_count
FROM solemd.s2_papers
WHERE fields_of_study @> ARRAY['Medicine', 'Biology']
ORDER BY citation_count DESC
LIMIT 50;
```

### TLDRs for Detail Panel

```sql
-- Fast paper preview without LLM calls
SELECT corpus_id, title, year, venue, tldr, citation_count,
       influential_citation_count
FROM solemd.s2_papers
WHERE corpus_id = 203012345;
```

---

## 10. SPECTER2 Embeddings in Detail

### What SPECTER2 Is

SPECTER2 is a SciBERT-based model trained on 6 million citation triplets across
23 fields of study. It produces 768-dimensional vectors that capture the
**intellectual lineage** of a paper, not just its surface-level text content.

Papers that share citation neighborhoods -- that cite and are cited by the same
works -- cluster together in SPECTER2 space even if their abstracts use
different terminology. This is the critical property for graph layout: a
cognitive neuroscience paper and a clinical psychiatry paper studying the same
dopamine pathway will cluster together because they share citations, even if
one discusses "mesolimbic projection" and the other discusses "reward circuitry."

### Why SPECTER2 for Graph Layout (Not Self-Embedding)

| Property | SPECTER2 | Self-Embedded (MedCPT/Qwen3) |
|----------|----------|------------------------------|
| Clustering basis | Citation neighborhoods (intellectual lineage) | Surface text semantics (word similarity) |
| Pre-computed | Yes, 200M+ papers, zero GPU cost | No, must embed 2M+ papers |
| Dimensionality | 768d | 768d (MedCPT) or 1024d (Qwen3) |
| Training data | 6M citation triplets | Search queries / general text |
| Cluster meaning | "Papers in the same research community" | "Papers using similar words" |
| GPU cost | $0 | ~$2-5 for 2M papers |

The key insight: **clustering by citation graph structure reveals research
communities**, while clustering by text similarity reveals topic overlap. For a
graph where users want to see "where a paper fits in the field," citation-aware
embeddings are strictly better.

Self-embedding with MedCPT is still used -- but for RAG retrieval, where text
similarity is the right metric. The two embedding spaces serve different
purposes and should not be confused.

### SPECTER2 to UMAP to Cosmograph

The data flow from S2 embeddings to the rendered graph:

```
S2 Datasets API
  |
  v
SPECTER2 768d vectors (per paper)
  |
  v
GPU cuML UMAP (768d --> 2D)           # ~60 sec for 2M points on H100
  |
  v
2D coordinates (x, y per paper)
  |
  v
Leiden clustering (on kNN graph from UMAP intermediate 10d)
  |
  v
corpus_points.parquet                  # corpus_id, x, y, cluster_id, metadata
  |
  v
Cloudflare R2 / local /public
  |
  v
DuckDB-WASM loads Parquet in browser
  |
  v
Cosmograph renders scatter plot (embedding mode, pre-computed coords)
```

### Storage: halfvec for 50% Savings

pgvector supports `halfvec` (16-bit floats) in addition to `vector` (32-bit
floats). For SPECTER2 cosine similarity, half precision is sufficient:

| Type | Bytes per Vector | 5M Vectors | 10M Vectors |
|------|-----------------|------------|-------------|
| `vector(768)` | 3,072 | 15.4 GB | 30.7 GB |
| `halfvec(768)` | 1,536 | 7.7 GB | 15.4 GB |

The HNSW index adds approximately 1.5-2x the table size in additional storage.
With `halfvec`, 10M vectors + HNSW index fits in ~40-45 GB total, well within
the 128 GB RAM budget of the target server.

### Comparison to Alternative Embedding Approaches

**Option A: Download SPECTER2 from S2 (chosen)**
- Cost: $0 (pre-computed)
- Quality: Citation-aware, trained on academic papers
- Coverage: 200M+ papers
- Effort: Download + filter (~3-6 hr processing)

**Option B: Self-embed with SPECTER2 from HuggingFace**
- Model: `allenai/specter2` (Apache 2.0 license)
- Cost: ~$2-5 GPU rental for 2M papers
- Advantage: Can embed papers not in S2 dataset
- Disadvantage: Redundant work -- S2 already computed these vectors

**Option C: Self-embed with MedCPT or Qwen3**
- Cost: ~$2-10 GPU rental
- Disadvantage: Clusters by text similarity, not citation structure
- Use for: RAG retrieval (MedCPT), not graph layout

Decision: Use pre-computed SPECTER2 from S2 for graph layout. Self-embed with
MedCPT for RAG retrieval. Never conflate the two.

---

## 11. Integration with SoleMD.Graph

This section maps each S2 dataset to its downstream consumer in the
SoleMD.Graph architecture.

### Graph Visualization (Cosmograph)

| S2 Data | Integration | Consumer |
|---------|-------------|----------|
| SPECTER2 embeddings | UMAP 768d to 2D coordinates | `corpus_points.parquet` -> Cosmograph scatter plot |
| Citations | Directed edges between papers | `corpus_links.parquet` -> Cosmograph edge rendering |
| Citation intent | Edge color/thickness encoding | Background=gray, Methodology=blue, Result=orange |
| Influential flag | Edge weight / visual emphasis | Influential edges rendered thicker or brighter |
| Fields of study | Node color facets | Filter/color papers by field |

### Paper Detail Panel

| S2 Data | Integration | Display |
|---------|-------------|---------|
| TLDRs | Instant paper preview | Single-sentence summary shown on hover or panel open, no LLM call needed |
| Abstract | Full abstract text | Expandable section below TLDR |
| Citation count | Authority signal | Shown as badge, sortable |
| Influential citation count | High-signal metric | Shown alongside citation count |
| Year / Venue | Metadata | Displayed in paper header |

### RAG Retrieval

| S2 Data | Integration | Pipeline |
|---------|-------------|----------|
| Abstracts | MedCPT Article Encoder embedding | Abstract -> MedCPT -> pgvector HNSW -> retrieval |
| S2ORC full-text (Phase 2) | Chunking + MedCPT embedding | Sections -> chunks -> MedCPT -> pgvector -> deeper RAG |
| Citation context | Evidence enrichment | Show how a cited paper was referenced in its citing papers |

### Cross-Source Bridge

| S2 Data | Integration | Purpose |
|---------|-------------|---------|
| Paper-IDs (PMID mapping) | Bridge to PubTator3 | PMID links S2 paper -> PubTator entity annotations + relations |
| Paper-IDs (DOI mapping) | External links | Link to publisher pages, Sci-Hub, Unpaywall |
| Paper-IDs (PMC mapping) | Full-text access | Link to PubMed Central for open-access full text |

### Entity Highlighting (Client-Side)

When a user types a term in the graph interface, DuckDB-WASM queries
`corpus_points.parquet` to find matching papers. The matching logic combines:

- PubTator entity annotations (loaded into the Parquet bundle during graph build)
- S2 paper titles and TLDRs (full-text search within DuckDB-WASM)
- S2 fields of study (facet filtering)

This runs entirely in the browser at <10ms latency.

### Data Flow Summary

```
Semantic Scholar Datasets API
    |
    +-- paper-ids -----> PMID bridge -----> PubTator3 annotations
    |
    +-- papers --------> solemd.s2_papers -> metadata display
    |                                     -> DuckDB-WASM search
    |
    +-- abstracts -----> MedCPT embed ----> pgvector HNSW -> RAG
    |
    +-- citations -----> solemd.s2_citations -> citation graph queries
    |                 -> corpus_links.parquet -> Cosmograph edges
    |
    +-- embeddings ----> UMAP 2D ---------> corpus_points.parquet -> Cosmograph
    |                 -> solemd.s2_embeddings -> nearest-neighbor queries
    |
    +-- tldrs ---------> solemd.s2_papers.tldr -> detail panel preview
    |
    +-- s2orc ---------> (Phase 2) chunk + MedCPT -> deep RAG
```

### API Rate Limits (Reference)

All bulk data comes from the Datasets API (pre-signed S3 URLs, no rate limit on
downloads). The live API is used only for spot lookups and has these limits:

| Tier | Rate | Notes |
|------|------|-------|
| Unauthenticated | ~5,000 req / 5 min (shared pool) | Do not rely on this |
| Authenticated (new key) | 1 req/sec | Sufficient for spot lookups |
| Higher rates | Available on request | Contact S2 team |
| Batch endpoint | 500 paper IDs per request | `POST /graph/v1/paper/batch` |
| Author batch | 1,000 author IDs per request | `POST /graph/v1/author/batch` |
| Response cap | 10 MB per response | Paginate large results |
| Auth header | `x-api-key` (case-sensitive) | Include in all requests |

**Exponential backoff** is required. On 429 responses, wait 2^n seconds before
retrying (n = retry count). The S2 API will temporarily block keys that do not
respect rate limits.

For SoleMD.Graph, the live API is rarely needed -- all bulk data flows through
the Datasets API, and the PostgreSQL hot store handles all application queries.
The live API is useful for:

- Verifying a single paper's current data during debugging
- Looking up a paper not yet in the local dataset
- Testing API connectivity before starting a bulk download
