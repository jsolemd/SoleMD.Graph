# Semantic Scholar: Deep-Dive

> **Service #13** in the [architecture](architecture.md) service inventory
> **Date**: 2026-03-16
> **Status**: Implementation guide -- verified against Datasets API documentation
> **Scope**: API-first data acquisition (bulk papers + batch API), domain
> filtering, PostgreSQL loading, monthly refresh, and SoleMD.Graph integration

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

**Full catalog size**: ~1 TB compressed if all datasets were downloaded. With the
API-first strategy (Section 4), we download only `papers` + `paper-ids` (~55 GB)
and pull the rest via the batch API for domain papers only.

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

### Data Acquisition Strategy: API-First

Instead of downloading every S2 bulk dataset (~1.2 TB), we download only the
`papers` dataset for local filtering and pull everything else through the S2
**batch API**. This reduces total download from ~1.2 TB to ~60 GB.

| Dataset | Strategy | Download Size | Rationale |
|---------|----------|---------------|-----------|
| `papers` | **Bulk download**, filter locally with DuckDB | ~45 GB | Has `s2fieldsofstudy` inline -- needed for domain filtering |
| `paper-ids` | **Bulk download**, filter locally with DuckDB | ~8 GB | Complete PMID cross-reference mapping |
| `abstracts` | **Batch API** (`fields=abstract`) | ~0 (API) | Pull only for domain corpus IDs -- no need for 54 GB bulk |
| `citations` | **Batch API** (`fields=citations`) | ~0 (API) | Pull per citing paper -- no need for 255 GB bulk |
| `embeddings` | **Batch API** (`fields=embedding.specter_v2`) | ~0 (API) | Pull only domain vectors -- no need for 840 GB bulk |
| `tldrs` | **Batch API** (`fields=tldr`) | ~0 (API) | Pull only domain TLDRs -- no need for 3 GB bulk |
| `s2orc` | Defer to Phase 2 | - | Only needed for deep RAG |
| `authors` | Defer | - | Not needed for MVP graph |
| `publication-venues` | Download (tiny) | ~10 MB | Useful for venue metadata |

**Total download: ~55 GB** (papers + paper-ids + venues) plus API traffic for
domain papers. Start small with ~200K psychiatry-core papers, expand to full
2M domain set incrementally.

### Hot/Cold Split

| Layer | Contents | Storage |
|-------|----------|---------|
| **Hot** (PostgreSQL) | 500K-2M domain papers + metadata, 5-10M SPECTER2 vectors (halfvec), 50-100M citation edges (domain-expanded), TLDRs | ~50-70 GB |
| **Cold** (Parquet on NVMe) | Full S2 papers + paper-ids (DuckDB-queryable) | ~60 GB Parquet |

---

## 4. Download & Acquisition Procedure

### Prerequisites

- **API key**: Free, obtain from https://www.semanticscholar.org/product/api
- **Disk space**: ~80 GB for bulk downloads + filtered Parquet
- **Bandwidth**: Expect 2-6 hours for bulk download depending on connection
- **Tools**: Python 3.11+, `requests`, `tqdm`, `duckdb`

### Phase 1: Bulk Download (Papers + Paper-IDs Only)

Only two datasets are downloaded in full. Everything else comes from the batch
API after domain filtering.

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

**Step 3: Download shards (papers + paper-ids only)**

```python
"""Download bulk shards for Semantic Scholar papers and paper-ids."""
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

# Usage -- only papers and paper-ids are downloaded in bulk
if __name__ == "__main__":
    base = Path("data/semantic-scholar/raw")
    for ds in ["paper-ids", "papers"]:
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

### Phase 2: Batch API for Domain Data

After DuckDB filtering produces the domain corpus ID list (see Section 5), pull
embeddings, abstracts, citations, and TLDRs via the S2 batch API. This avoids
downloading ~1.1 TB of data we do not need.

**Batch API endpoint**: `POST https://api.semanticscholar.org/graph/v1/paper/batch`

- **Limit**: 500 paper IDs per request
- **Rate limit**: 1 request/second (authenticated)
- **Auth**: `x-api-key` header (required)

**Request format**:

```json
POST /graph/v1/paper/batch?fields=embedding.specter_v2,abstract,tldr,citations.citedPaper.paperId,citations.isInfluential,citations.intents,citations.contexts
{
  "ids": ["CorpusId:203012345", "CorpusId:198765432", "CorpusId:212345678", "...up to 500"]
}
```

**Response format** (abbreviated):

```json
[
  {
    "paperId": "abc123def456",
    "embedding": {
      "model": "specter2",
      "vector": [0.0234, -0.1567, 0.0891, ...]
    },
    "abstract": "The prefrontal cortex plays a critical role...",
    "tldr": {
      "model": "tldr@v2.0.0",
      "text": "D2 receptors on PFC interneurons modulate gamma..."
    },
    "citations": [
      {
        "citedPaper": {"paperId": "xyz789"},
        "isInfluential": true,
        "intents": ["Background"],
        "contexts": ["Building on the seminal observation..."]
      }
    ]
  },
  null
]
```

Papers not found return `null` in the response array. Always handle nulls.

**Batch API client with rate limiting**:

```python
"""Pull domain paper data via S2 batch API with rate limiting."""
import os
import time
import requests
from typing import Iterator

S2_API_KEY = os.environ["S2_API_KEY"]
BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch"
BATCH_SIZE = 500    # Max per request
RATE_LIMIT = 1.0    # Seconds between requests
MAX_RETRIES = 5

def chunked(ids: list[str], size: int) -> Iterator[list[str]]:
    """Yield successive chunks of the given size."""
    for i in range(0, len(ids), size):
        yield ids[i : i + size]

def fetch_batch(
    corpus_ids: list[int],
    fields: str,
) -> list[dict | None]:
    """Fetch a batch of papers with exponential backoff."""
    ids = [f"CorpusId:{cid}" for cid in corpus_ids]
    params = {"fields": fields}
    headers = {"x-api-key": S2_API_KEY, "Content-Type": "application/json"}

    for attempt in range(MAX_RETRIES):
        resp = requests.post(
            BATCH_URL,
            params=params,
            headers=headers,
            json={"ids": ids},
        )
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code == 429:
            wait = 2 ** attempt
            print(f"Rate limited, waiting {wait}s (attempt {attempt + 1})")
            time.sleep(wait)
            continue
        resp.raise_for_status()

    raise RuntimeError(f"Failed after {MAX_RETRIES} retries")

def fetch_all_papers(
    corpus_ids: list[int],
    fields: str,
) -> Iterator[dict]:
    """Fetch all papers in batches, respecting rate limits."""
    for batch in chunked(corpus_ids, BATCH_SIZE):
        results = fetch_batch(batch, fields)
        for result in results:
            if result is not None:
                yield result
        time.sleep(RATE_LIMIT)  # Honor 1 req/sec limit
```

**Time estimates for batch API** (at 1 req/sec, 500 IDs/request):

| Corpus Size | Requests | Wall Time |
|-------------|----------|-----------|
| 200K papers (psychiatry core) | 400 | ~7 min |
| 500K papers (neuro core) | 1,000 | ~17 min |
| 2M papers (full domain) | 4,000 | ~67 min |
| 5M papers (+ citation neighbors) | 10,000 | ~2.8 hr |

### Rate Limiting & Backoff (Required)

The S2 API enforces strict rate limits. Keys that do not respect them get
temporarily blocked.

- **Authenticated rate**: 1 request/second (hard limit)
- **429 response**: Must use exponential backoff: wait `2^n` seconds where
  `n` is the retry count (1s, 2s, 4s, 8s, 16s...)
- **Max retries**: 5 attempts before failing the batch
- **Header**: `x-api-key` (case-sensitive) -- include on every request
- **Tip**: Sleep 1.0s between batches preemptively; do not fire-and-throttle

### Local Directory Structure

```
data/semantic-scholar/
├── raw/                       # Downloaded .jsonl.gz shards (bulk only)
│   ├── paper-ids/             # ~10 shards, ~8 GB total
│   ├── papers/                # ~30 shards, ~45 GB total
│   └── publication-venues/    # 1 shard, ~10 MB
├── filtered/                  # DuckDB-filtered domain corpus IDs
│   ├── domain_corpus_ids.parquet
│   └── expanded_corpus_ids.parquet
└── release_metadata.json      # Tracks current release IDs
```

Note: abstracts, embeddings, citations, and TLDRs are NOT stored locally as
intermediate files. They flow directly from the batch API into PostgreSQL.

### Incremental Start: Begin Small

Start with a narrow domain and expand:

```
Phase A:  200K psychiatry-core papers         →  ~7 min API time
Phase B:  500K neuro/psych papers             →  ~17 min API time
Phase C:  2M full domain (Medicine+Biology+Psychology, MeSH-filtered)
Phase D:  5-10M expanded (+ 1st-order citation neighbors)
```

Each phase reuses the same pipeline -- just expand the corpus ID list and re-run
the batch API fetch. PostgreSQL loading uses UPSERT so new data merges cleanly.

---

## 5. Processing Pipeline

### Overview

The processing pipeline has two phases: (1) DuckDB filters the bulk-downloaded
`papers` and `paper-ids` datasets to produce domain corpus IDs, then (2) the
batch API pulls detailed data for those IDs directly into PostgreSQL.

### Domain Filtering Workflow

```
1. Build PMID -> Corpus ID mapping      (paper-ids bulk dataset, DuckDB)
2. Get domain PMIDs                     (PubMed MeSH query, external step)
3. Map domain PMIDs -> corpus IDs       (DuckDB join)
4. Cross-ref with fields of study       (papers bulk dataset, DuckDB filter)
5. Export domain corpus ID list         (DuckDB -> Parquet)
6. Batch API: pull embeddings           (POST /paper/batch, 500/req -> PostgreSQL)
7. Batch API: pull abstracts + TLDRs    (POST /paper/batch, 500/req -> PostgreSQL)
8. Batch API: pull citations            (POST /paper/batch, 500/req -> PostgreSQL)
```

DuckDB is used ONLY for steps 1-5 (filtering the two bulk datasets). Steps 6-8
go directly from the S2 API into PostgreSQL via psycopg COPY or INSERT.

### Step-by-Step: DuckDB Domain Filtering

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

**Step 4: Cross-reference with fields of study from the papers dataset**

The `papers` bulk dataset includes inline `s2fieldsofstudy`. Use this to
validate domain membership and add papers that lack PMIDs but match our
field-of-study criteria:

```sql
-- Papers in our field-of-study filter that also have PMIDs
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
        s2fieldsofstudy: 'JSON[]',
        url: 'VARCHAR'
    }
) p
JOIN domain_corpus_ids d ON p.corpusid = d.corpusid;
```

**Step 5: Export domain corpus ID list**

```sql
-- Export the filtered corpus IDs for batch API consumption
COPY (SELECT corpusid FROM domain_corpus_ids ORDER BY corpusid)
TO 'data/semantic-scholar/filtered/domain_corpus_ids.parquet'
(FORMAT PARQUET, COMPRESSION 'ZSTD');

-- Also export basic paper metadata for PostgreSQL loading
COPY (SELECT * FROM domain_papers ORDER BY corpusid)
TO 'data/semantic-scholar/filtered/domain_papers.parquet'
(FORMAT PARQUET, COMPRESSION 'ZSTD');
```

### Step-by-Step: Batch API to PostgreSQL

After DuckDB produces the domain corpus ID list, the batch API pulls remaining
data and loads it directly into PostgreSQL -- no intermediate Parquet files.

**Step 6: Pull embeddings via batch API**

```python
"""Pull SPECTER2 embeddings for domain papers and load into PostgreSQL."""
import duckdb
import psycopg

def load_embeddings_from_api(corpus_ids: list[int], db_url: str) -> int:
    """Fetch embeddings via batch API, INSERT directly into PostgreSQL."""
    conn = psycopg.connect(db_url)
    total = 0

    with conn.cursor() as cur:
        for paper in fetch_all_papers(corpus_ids, "embedding.specter_v2"):
            emb = paper.get("embedding")
            if not emb or not emb.get("vector"):
                continue
            vec_str = "[" + ",".join(str(v) for v in emb["vector"]) + "]"
            cur.execute(
                """INSERT INTO solemd.s2_embeddings (corpus_id, embedding)
                   VALUES (%s, %s::halfvec(768))
                   ON CONFLICT (corpus_id) DO UPDATE SET embedding = EXCLUDED.embedding""",
                (paper["corpusId"], vec_str),
            )
            total += 1
            if total % 10_000 == 0:
                conn.commit()

    conn.commit()
    conn.close()
    return total

# Load corpus IDs from DuckDB-filtered Parquet
db = duckdb.connect()
ids = db.execute(
    "SELECT corpusid FROM read_parquet('data/semantic-scholar/filtered/domain_corpus_ids.parquet')"
).fetchall()
corpus_ids = [row[0] for row in ids]
load_embeddings_from_api(corpus_ids, DB_URL)
```

**Step 7: Pull abstracts + TLDRs via batch API**

```python
def load_abstracts_tldrs_from_api(corpus_ids: list[int], db_url: str) -> int:
    """Fetch abstracts and TLDRs, UPDATE existing paper rows."""
    conn = psycopg.connect(db_url)
    total = 0

    with conn.cursor() as cur:
        for paper in fetch_all_papers(corpus_ids, "abstract,tldr"):
            abstract = paper.get("abstract")
            tldr_obj = paper.get("tldr")
            tldr = tldr_obj["text"] if tldr_obj else None
            cur.execute(
                """UPDATE solemd.s2_papers
                   SET abstract = %s, tldr = %s
                   WHERE corpus_id = %s""",
                (abstract, tldr, paper["corpusId"]),
            )
            total += 1
            if total % 10_000 == 0:
                conn.commit()

    conn.commit()
    conn.close()
    return total
```

**Step 8: Pull citations via batch API**

```python
def load_citations_from_api(corpus_ids: list[int], db_url: str) -> int:
    """Fetch citations per paper, INSERT into PostgreSQL."""
    conn = psycopg.connect(db_url)
    total = 0
    fields = "citations.citedPaper.paperId,citations.citedPaper.corpusId,citations.isInfluential,citations.intents,citations.contexts"

    with conn.cursor() as cur:
        for paper in fetch_all_papers(corpus_ids, fields):
            citing_id = paper.get("corpusId")
            for cite in (paper.get("citations") or []):
                cited = cite.get("citedPaper", {})
                cited_id = cited.get("corpusId")
                if not cited_id:
                    continue
                context = (cite.get("contexts") or [None])[0]
                cur.execute(
                    """INSERT INTO solemd.s2_citations
                       (citing_corpus_id, cited_corpus_id, is_influential, intents, context_text)
                       VALUES (%s, %s, %s, %s, %s)
                       ON CONFLICT DO NOTHING""",
                    (citing_id, cited_id, cite.get("isInfluential", False),
                     cite.get("intents"), context),
                )
                total += 1
            if total % 50_000 == 0:
                conn.commit()

    conn.commit()
    conn.close()
    return total
```

### Processing Time Estimates

| Step | What | Expected Time |
|------|------|---------------|
| DuckDB: Paper-IDs parse + filter | 8 GB gz | ~5-10 min |
| DuckDB: Papers filter | 45 GB gz | ~15-30 min |
| DuckDB: Export corpus ID list | in-memory | ~1 min |
| Batch API: Embeddings (2M papers) | 4,000 requests | ~67 min |
| Batch API: Abstracts + TLDRs (2M) | 4,000 requests | ~67 min |
| Batch API: Citations (2M papers) | 4,000 requests | ~67 min |
| PostgreSQL: HNSW index build | 2M halfvec(768) | ~15-30 min |
| **Total** | | **~4-5 hr** |

Start with 200K psychiatry-core papers (~7 min per API phase) to validate the
pipeline end-to-end before scaling to the full 2M domain set.

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

With the API-first strategy, data flows into PostgreSQL from two sources:

1. **Papers metadata**: DuckDB-filtered Parquet (Section 5, Step 5) -> psycopg COPY
2. **Embeddings, abstracts, TLDRs, citations**: Batch API -> direct INSERT/UPDATE
   (Section 5, Steps 6-8)

### Loading Papers (from DuckDB-filtered Parquet)

Papers are the only table loaded from local Parquet. Use COPY with a staging
table for atomic load:

```python
"""Load domain-filtered S2 papers from Parquet into PostgreSQL."""
import duckdb
import psycopg

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
            SELECT corpusid, pmid, doi, pmc, title,
                   year, venue, journal_name, journal_volume, journal_pages,
                   publication_date, reference_count, citation_count,
                   influential_citation_count, is_open_access,
                   fields_of_study, publication_types, s2_url, is_domain_core
            FROM read_parquet('{parquet_path}')
        """).fetchall()

        with cur.copy("""
            COPY solemd._s2_papers_staging (
                corpus_id, pmid, doi, pmc, title,
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

Note: `abstract` and `tldr` columns are NULL after this step. They are populated
by the batch API in Step 7 of Section 5 via UPDATE.

### Citations and Embeddings (from Batch API)

Citations and embeddings are loaded directly from the S2 batch API into
PostgreSQL -- see Section 5, Steps 6 and 8. There are no intermediate Parquet
files for these datasets.

### Post-Load: HNSW Index Build

After batch API loading completes, build the HNSW index on embeddings:

```sql
SET maintenance_work_mem = '4GB';

-- Build HNSW index (~15-30 min for 2M vectors, longer for 5-10M)
CREATE INDEX CONCURRENTLY idx_s2_embeddings_hnsw
    ON solemd.s2_embeddings
    USING hnsw (embedding halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

### Loading Time Estimates

| Step | Rows | Time |
|------|------|------|
| Papers COPY (from Parquet) | 2M | ~5-10 min |
| Batch API: embeddings -> INSERT | 2M | ~67 min (API-bound) |
| Batch API: abstracts + TLDRs -> UPDATE | 2M | ~67 min (API-bound) |
| Batch API: citations -> INSERT | 2M papers | ~67 min (API-bound) |
| HNSW index build | 2M vectors | ~15-30 min |
| **Total** | | **~3.5-4 hr** |

The batch API at 1 req/sec is the bottleneck, not PostgreSQL I/O. For 200K
papers (Phase A), total load time drops to ~30 min.

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

    for dataset in ["paper-ids", "papers"]:
        diff = get_diffs(current, latest, dataset)
        # Download update files (upserts)
        for url in diff.get("update_files", []):
            download_shard(url, Path(f"data/semantic-scholar/diffs/{dataset}/"))
        # Download delete files
        for url in diff.get("delete_files", []):
            download_shard(url, Path(f"data/semantic-scholar/diffs/{dataset}/"))

    # Re-run domain filtering pipeline on updated data
    # Then re-fetch via batch API for new/changed domain papers
    # Then reload PostgreSQL tables
    meta["papers"]["release_id"] = latest
    meta_path.write_text(json.dumps(meta, indent=2))
```

### Refresh Strategy by Dataset

| Dataset | Strategy | Rationale |
|---------|----------|-----------|
| `paper-ids` | Incremental diff (bulk) | Small diffs, need current PMID mapping |
| `papers` | Incremental diff (bulk) | Apply upserts + deletes to filtered Parquet |
| `abstracts` | Batch API re-fetch for new papers | Only new domain papers need abstracts |
| `tldrs` | Batch API re-fetch for new papers | Only new domain papers need TLDRs |
| `citations` | Batch API re-fetch for new papers | Pull citations only for newly added corpus IDs |
| `embeddings` | Batch API re-fetch for new papers | Pull SPECTER2 only for newly added corpus IDs |

### Monthly Refresh Workflow

```
1. Check current release vs latest release
2. Download diffs for paper-ids and papers (bulk)
3. Apply diffs to local filtered Parquet
4. Re-run DuckDB domain filtering to identify new corpus IDs
5. Batch API: fetch embeddings, abstracts, TLDRs, citations for new IDs only
6. UPSERT new data into PostgreSQL
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
S2 Batch API (POST /paper/batch, fields=embedding.specter_v2)
  |
  v
SPECTER2 768d vectors (per domain paper)
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

**Option A: Pull SPECTER2 via S2 batch API (chosen)**
- Cost: $0 (pre-computed by S2)
- Quality: Citation-aware, trained on academic papers
- Coverage: 200M+ papers available
- Effort: Batch API fetch for domain papers (~67 min for 2M papers)

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
Semantic Scholar
    |
    +-- [Datasets API: bulk download]
    |   +-- paper-ids -----> DuckDB filter -> PMID bridge -> PubTator3
    |   +-- papers --------> DuckDB filter -> domain corpus IDs
    |                      -> psycopg COPY -> solemd.s2_papers
    |
    +-- [Graph API: batch endpoint, domain IDs only]
    |   +-- abstracts -----> INSERT/UPDATE -> solemd.s2_papers.abstract
    |   |                 -> MedCPT embed -> pgvector HNSW -> RAG
    |   +-- citations -----> INSERT -> solemd.s2_citations
    |   |                 -> corpus_links.parquet -> Cosmograph edges
    |   +-- embeddings ----> INSERT -> solemd.s2_embeddings
    |   |                 -> UMAP 2D -> corpus_points.parquet -> Cosmograph
    |   +-- tldrs ---------> UPDATE -> solemd.s2_papers.tldr
    |
    +-- s2orc ------------> (Phase 2) chunk + MedCPT -> deep RAG
```

### API Rate Limits (Reference)

The Datasets API provides pre-signed S3 URLs (no rate limit on downloads) for
bulk datasets (papers, paper-ids). The Graph API batch endpoint is used
extensively to pull embeddings, abstracts, citations, and TLDRs for domain
papers.

| Tier | Rate | Notes |
|------|------|-------|
| Unauthenticated | ~5,000 req / 5 min (shared pool) | Do not rely on this |
| Authenticated (new key) | 1 req/sec | **Core rate for batch API workflow** |
| Higher rates | Available on request | Contact S2 team |
| Batch endpoint | 500 paper IDs per request | `POST /graph/v1/paper/batch` |
| Author batch | 1,000 author IDs per request | `POST /graph/v1/author/batch` |
| Response cap | 10 MB per response | Paginate large results |
| Auth header | `x-api-key` (case-sensitive) | Include in all requests |

**Exponential backoff** is required. On 429 responses, wait 2^n seconds before
retrying (n = retry count). The S2 API will temporarily block keys that do not
respect rate limits. Sleep 1.0s between batch requests preemptively.

For SoleMD.Graph, the batch API is the primary data acquisition channel for
everything except the `papers` and `paper-ids` bulk datasets. The live
single-paper API is useful for:

- Verifying a single paper's current data during debugging
- Looking up a paper not yet in the local dataset
- Testing API connectivity before starting a batch run
