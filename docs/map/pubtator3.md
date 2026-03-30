# PubTator3: Biomedical Entity Annotations and Relations

> **Service #12** in the [architecture](architecture.md) service inventory
> **Role**: Pre-computed entity annotations + relations + abstract text for all of PubMed
> **Update cadence**: Monthly full dump from NCBI FTP (no incrementals)

---

## 1. What PubTator3 Is

PubTator3 is NCBI's pre-computed biomedical annotation service, providing
named entity recognition and relation extraction across the entirety of PubMed
and PubMed Central. Rather than running local NER models, SoleMD.Graph
consumes PubTator3's bulk output -- annotations produced by state-of-the-art
deep learning systems that NCBI maintains and retrains.

**NER system**: AIONER (All-In-One Named Entity Recognition) -- a unified
transformer that recognizes six biomedical entity types simultaneously. Unlike
traditional pipelines that chain separate models per entity type, AIONER uses
a single multi-task architecture trained on harmonized corpora across all
types, capturing cross-type interactions that single-type models miss.

**Relation extraction**: BioREx (Biomedical Relation Extraction) -- a
PubMedBERT-based classifier that identifies eight relation types between
entity pairs within documents. Trained on multiple biomedical RE datasets
with a unified schema.

**Coverage**:

| Metric | Volume |
|--------|--------|
| PubMed abstracts annotated | ~36M |
| PMC full-text articles annotated | ~6.3M |
| Total entity annotations | ~1.6B rows |
| Total relations extracted | ~33M rows |
| Unique concept identifiers | ~4.6M |
| Entity types | 6 |
| Relation types | 8 |

**Why this replaces local NER**: Pre-computed annotations eliminate GPU cost,
inference latency, and model maintenance. PubTator3's models are
state-of-the-art -- AIONER outperforms standalone tools like HunFlair2,
scispaCy, and TaggerOne on standard biomedical NER benchmarks. Running
equivalent NER on 36M abstracts locally would require hundreds of GPU-hours
and ongoing model management. PubTator3 delivers the same output as a monthly
FTP download at zero compute cost.

**Publication**: Wei C-H, Allot A, Lai P-T, et al. PubTator 3.0: an AI-powered
literature resource for unlocking biomedical knowledge. *Nucleic Acids Research*.
2024;52(W1):W540-W546. https://pmc.ncbi.nlm.nih.gov/articles/PMC11223843/

---

## 2. Data Inventory

FTP root: `https://ftp.ncbi.nlm.nih.gov/pub/lu/PubTator3/`

### Tab-Delimited Files

All files last updated 2026-02-17.

| File | Size | Contents |
|------|------|----------|
| `bioconcepts2pubtator3.gz` | 5.6 GB | All entity annotations (combined) |
| `relation2pubtator3.gz` | 276 MB | All relations |
| `disease2pubtator3.gz` | 2.0 GB | Disease subset |
| `chemical2pubtator3.gz` | 1.7 GB | Chemical subset |
| `gene2pubtator3.gz` | 713 MB | Gene subset |
| `species2pubtator3.gz` | 459 MB | Species subset |
| `mutation2pubtator3.gz` | 110 MB | Mutation subset |
| `cellline2pubtator3.gz` | 68 MB | Cell line subset |

The per-type files (disease, chemical, gene, species, mutation, cellline)
are **subsets** of `bioconcepts2pubtator3.gz`. Do not load both the combined
file and the per-type files -- that would produce duplicates.

### Entity Tab Format (5 columns)

```
PMID	Type	ConceptID	Mentions	Resource
```

Example rows:

```
10024047	Disease	MESH:D009461	myasthenia gravis;MG	PubTator3
10024047	Gene	8622	SLC18A3;VAChT	GNorm2
10024047	Chemical	MESH:D004298	dopamine;DA	NLM-Chem
10024047	Species	9606	human;patients	GNorm2
```

- `Mentions` is semicolon-delimited (surface forms seen in the text)
- `ConceptID` may be absent on some rows (unresolved entities)
- `Resource` identifies which normalization tool produced the mapping

### Relation Tab Format (4 columns)

```
PMID	Type	Concept1	Concept2
```

Concept format: `EntityType@Identifier`

Example rows:

```
10024047	Association	Gene@8622	Disease@MESH:D009461
10024047	Positive_Correlation	Chemical@MESH:D004298	Gene@8622
```

The pipe character (`|`) separates type and ID within each concept field
when accessed through the relation2pubtator3 format:

```
10024047	Association	Gene|8622	Disease|MESH:D009461
```

Both `@` and `|` separators appear depending on the data vintage; the loader
must handle both.

### Entity Types with Identifiers

| Entity Type | NER System | Normalization | ID Database | ID Format |
|-------------|-----------|---------------|-------------|-----------|
| Gene/Protein | AIONER | GNorm2 | NCBI Gene | Numeric (e.g., `8622`) |
| Disease | AIONER | TaggerOne | MeSH | `MESH:D009461` |
| Chemical | AIONER | NLM-Chem | MeSH | `MESH:D004298` |
| Species | AIONER | GNorm2 | NCBI Taxonomy | Numeric (e.g., `9606`) |
| Mutation | tmVar3 | tmVar3 | dbSNP/HGVS | `rs12345` or HGVS notation |
| CellLine | AIONER | TaggerOne | Cellosaurus | `CVCL_0030` |

Note: The existing SoleMD.App config uses "Variant" as the entity type code
for mutations. The bulk FTP files use "Mutation" or "DNAMutation" /
"ProteinMutation" / "SNP" as subtypes. Normalize to a consistent enum during
loading.

### Relation Types (8)

| Relation Type | Description |
|---------------|-------------|
| Association | General association, no directionality |
| Positive_Correlation | Entities increase/decrease together |
| Negative_Correlation | Inverse relationship |
| Binding | Physical molecular interaction |
| Drug_Interaction | Pharmacodynamic interaction with side effects |
| Cotreatment | Two or more chemicals administered together |
| Comparison | Effect comparison between two entities |
| Conversion | Biochemical conversion |

### Entity Pair Types (8)

Chemical-Chemical, Chemical-Disease, Chemical-Gene, Chemical-Variant,
Disease-Gene, Disease-Variant, Gene-Gene, Variant-Variant.

### BioCXML Archives

10 sharded archives: `BioCXML.0.tar.gz` through `BioCXML.9.tar.gz`, each
~19 GB compressed. Total: ~190 GB compressed.

These contain full abstract text with character-level annotation offsets in
BioC XML format. Each archive contains thousands of XML files, one per batch
of PMIDs.

**BioCXML document structure** (simplified):

```xml
<collection>
  <document>
    <id>10024047</id>
    <passage>
      <infon key="type">title</infon>
      <offset>0</offset>
      <text>Vesicular acetylcholine transporter in myasthenia gravis</text>
      <annotation id="1">
        <infon key="identifier">8622</infon>
        <infon key="type">Gene</infon>
        <location offset="0" length="40"/>
        <text>Vesicular acetylcholine transporter</text>
      </annotation>
      <annotation id="2">
        <infon key="identifier">MESH:D009461</infon>
        <infon key="type">Disease</infon>
        <location offset="44" length="18"/>
        <text>myasthenia gravis</text>
      </annotation>
    </passage>
    <passage>
      <infon key="type">abstract</infon>
      <offset>57</offset>
      <text>The vesicular acetylcholine transporter (VAChT) ...</text>
      <!-- more annotations with character offsets -->
    </passage>
    <relation id="R1">
      <infon key="type">Association</infon>
      <node refid="1" role="Gene"/>
      <node refid="2" role="Disease"/>
    </relation>
  </document>
</collection>
```

Key elements:
- `<passage>` contains `type` (title/abstract), `offset`, and `text`
- `<annotation>` contains `identifier`, `type`, `location` (character offset + length), and surface `text`
- `<relation>` links annotations by `refid` with a typed relationship

---

## 3. What We Need vs What's Available

### Domain Scope

Our domain: neuroscience, psychiatry, neurology. The full PubTator3 dump
covers all of PubMed (36M papers). We need a domain-filtered subset.

### Filtering Strategy

Domain PMID identification uses two complementary approaches:

1. **Semantic Scholar field-of-study filtering**: Filter S2 papers dataset by
   `fieldsOfStudy` containing Medicine, Biology, Psychology, then cross-ref
   with PubMed MeSH headings for neuro/psych/neuro specificity.

2. **PubMed E-utilities MeSH query**: Direct PMID harvesting via MeSH queries
   targeting neuroscience/psychiatry/neurology descriptors.

The union of these two PMID sets forms the domain filter applied to PubTator3.

### Volume Estimates

| Data | Full PubTator3 | Domain-Filtered (est.) |
|------|---------------|------------------------|
| Entity annotations | 1.6B rows | 25-80M rows |
| Relations | 33M rows | 500K-1M rows |
| Papers covered | 36M | 500K-2M |

### Graph Database vs Release Mirror Split

**Graph database data** (PostgreSQL, ~10-20 GB): Domain-filtered entity annotations and
relations. Queried interactively by the web app for paper detail panels, entity
lookups, and RAG boosting.

**COLD data** (local Parquet on NVMe, ~30 GB compressed): Full 1.6B entity
dump + 33M relations as Hive-partitioned Parquet. Queried by DuckDB during
monthly batch processing to re-filter when the domain PMID set expands.

### Which Files to Download

| File | Required? | Why |
|------|-----------|-----|
| `bioconcepts2pubtator3.gz` | Yes | Full entity annotation set |
| `relation2pubtator3.gz` | Yes | Full relation set |
| Per-type subsets (disease, chemical, etc.) | No | Subsets of the combined file |
| BioCXML archives | Deferred | Only needed if abstract text from PubTator is preferred over S2 abstracts |

BioCXML provides abstract text with character offsets, which is valuable for
exact annotation highlighting in the UI. However, S2 abstracts cover the same
ground without the 190 GB download. Defer BioCXML until the need for
character-level offsets is confirmed.

---

## 4. Download Procedure

### Directory Structure

```
data/pubtator/
├── raw/                    # Downloaded gz files
│   ├── bioconcepts2pubtator3.gz
│   ├── relation2pubtator3.gz
│   └── checksums.md5
├── parquet/                # Processed domain-filtered output
│   ├── entities/
│   │   ├── entity_type=Gene/
│   │   ├── entity_type=Disease/
│   │   ├── entity_type=Chemical/
│   │   ├── entity_type=Species/
│   │   ├── entity_type=Mutation/
│   │   └── entity_type=CellLine/
│   └── relations/
└── biocxml/                # BioCXML archives (if downloaded)
    ├── BioCXML.0.tar.gz
    └── ...
```

### Download Commands

Download priority: entities first (5.6 GB), then relations (276 MB).

```bash
PUBTATOR_FTP="https://ftp.ncbi.nlm.nih.gov/pub/lu/PubTator3"
DATA_DIR="./data/pubtator/raw"
mkdir -p "$DATA_DIR"

# 1. Entity annotations (5.6 GB, ~2-3 min on gigabit)
curl -C - --retry 3 --retry-delay 30 --progress-bar \
    -o "$DATA_DIR/bioconcepts2pubtator3.gz" \
    "$PUBTATOR_FTP/bioconcepts2pubtator3.gz"

# 2. Relations (276 MB, ~15 sec on gigabit)
curl -C - --retry 3 --retry-delay 30 --progress-bar \
    -o "$DATA_DIR/relation2pubtator3.gz" \
    "$PUBTATOR_FTP/relation2pubtator3.gz"

# 3. Generate checksums for verification
md5sum "$DATA_DIR"/*.gz > "$DATA_DIR/checksums.md5"
```

The `-C -` flag enables resume on interrupted downloads. Safe to re-run
if the download is interrupted.

### BioCXML Download (Deferred)

Only download if you need abstract text from PubTator instead of S2 abstracts:

```bash
# ~190 GB total, ~25-30 min on gigabit
for i in $(seq 0 9); do
    curl -C - --retry 3 --retry-delay 30 --progress-bar \
        -o "$DATA_DIR/../biocxml/BioCXML.${i}.tar.gz" \
        "$PUBTATOR_FTP/BioCXML.${i}.tar.gz"
done
```

### Checking for Updates

PubTator3 updates monthly. Check for new files before downloading:

```bash
# Check Last-Modified header
curl -sI "$PUBTATOR_FTP/bioconcepts2pubtator3.gz" | grep -i last-modified

# Conditional download (only if remote is newer than local file)
curl -z "$DATA_DIR/bioconcepts2pubtator3.gz" -C - --retry 3 \
    -o "$DATA_DIR/bioconcepts2pubtator3.gz" \
    "$PUBTATOR_FTP/bioconcepts2pubtator3.gz"
```

### Storage Requirements

| Component | Size |
|-----------|------|
| Tab-delimited files (entities + relations) | ~6 GB compressed |
| BioCXML archives (if downloaded) | ~190 GB compressed |
| Domain-filtered Parquet (entities) | ~3-8 GB |
| Domain-filtered Parquet (relations) | ~100-300 MB |
| **Total without BioCXML** | **~11 GB** |
| **Total with BioCXML** | **~200 GB** |

### Timestamped Archival

The SoleMD.App download script archives each download with a date suffix and
creates symlinks to the latest version. This pattern supports rollback if a
monthly release contains regressions:

```bash
TIMESTAMP=$(date +%Y%m%d)
# Download to timestamped file
curl -C - -o "$DATA_DIR/archives/bioconcepts2pubtator3_${TIMESTAMP}.gz" \
    "$PUBTATOR_FTP/bioconcepts2pubtator3.gz"
# Symlink to latest
ln -sf "archives/bioconcepts2pubtator3_${TIMESTAMP}.gz" \
    "$DATA_DIR/bioconcepts2pubtator3.gz"
```

---

## 5. Processing Pipeline

### Tab File Parsing

The entity file is a gzipped, tab-delimited text file. Parse it as a stream
-- never load the full 1.6B rows into memory.

**Entity parsing logic** (from SoleMD.App `load_pubtator3.py`):

```
gzip stream --> line-by-line --> split on \t --> validate column count --> yield tuple
```

Edge cases observed in the real data:
- **Fewer than 5 columns**: Some lines have malformed escapes that break tab
  parsing. Lines with fewer than 4 columns are discarded.
- **Backslash at end of mentions**: Mentions field occasionally ends with `\`.
  Strip trailing backslash before storing.
- **Missing concept_id**: Some entities have empty concept_id (unresolved).
  Store as empty string, not NULL.
- **Missing resource column**: When only 4 columns are present, default
  resource to `"PubTator3"`.
- **Encoding errors**: Open with `errors="replace"` to handle occasional
  non-UTF-8 bytes.

**Relation parsing logic**:

```
gzip stream --> split on \t --> validate 4 columns --> split entity on "|" --> yield tuple
```

The entity format within relation rows is `Type|ID` (pipe-delimited). Some
older dumps use `Type@ID`. The parser should handle both separators:

```python
# Handle both | and @ separators
e1_parts = parts[2].split("|", 1) if "|" in parts[2] else parts[2].split("@", 1)
```

### Domain Filtering Workflow

```
1. Acquire domain PMID set
   ├── S2 field-of-study filter --> domain PMIDs
   └── PubMed E-utilities MeSH query --> domain PMIDs
   └── Union --> domain_pmids SET (500K-2M integers)

2. Stream entity file
   └── For each line: if PMID in domain_pmids --> keep
   └── Write to Hive-partitioned Parquet by entity_type

3. Stream relation file
   └── For each line: if PMID in domain_pmids --> keep
   └── Write to Parquet (single partition)
```

The domain PMID set fits in memory as a Python `set[int]` -- 2M integers
consume ~60 MB.

### DuckDB for Processing

DuckDB can read the gzipped tab files directly, filter against the domain
PMID set, and write partitioned Parquet in a single SQL statement:

```sql
-- Load the domain PMID set (from a CSV, Parquet, or inline)
CREATE TABLE domain_pmids AS
SELECT DISTINCT pmid FROM read_parquet('data/semantic-scholar/domain_papers.parquet');

-- Filter entities and write partitioned Parquet
COPY (
    SELECT *
    FROM read_csv(
        'data/pubtator/raw/bioconcepts2pubtator3.gz',
        delim = '\t',
        header = false,
        compression = 'gzip',
        columns = {
            'pmid': 'INTEGER',
            'entity_type': 'VARCHAR',
            'concept_id': 'VARCHAR',
            'mentions': 'VARCHAR',
            'resource': 'VARCHAR'
        },
        ignore_errors = true
    )
    WHERE pmid IN (SELECT pmid FROM domain_pmids)
)
TO 'data/pubtator/parquet/entities'
(FORMAT PARQUET, PARTITION_BY (entity_type), COMPRESSION 'ZSTD',
 ROW_GROUP_SIZE 100000);

-- Filter relations and write Parquet
COPY (
    SELECT *
    FROM read_csv(
        'data/pubtator/raw/relation2pubtator3.gz',
        delim = '\t',
        header = false,
        compression = 'gzip',
        columns = {
            'pmid': 'INTEGER',
            'relation_type': 'VARCHAR',
            'concept1': 'VARCHAR',
            'concept2': 'VARCHAR'
        },
        ignore_errors = true
    )
    WHERE pmid IN (SELECT pmid FROM domain_pmids)
)
TO 'data/pubtator/parquet/relations'
(FORMAT PARQUET, COMPRESSION 'ZSTD', ROW_GROUP_SIZE 100000);
```

`ignore_errors = true` handles the malformed lines that the Python parser
would skip. DuckDB processes the 5.6 GB gzip file in 2-4 minutes on NVMe.

### BioCXML Parsing

If BioCXML is downloaded for abstract text extraction, use the `bioc` Python
library for streaming XML parsing:

```python
import bioc

with bioc.biocxml.iterparse("BioCXML.0.tar.gz") as reader:
    for document in reader:
        pmid = document.id
        for passage in document.passages:
            if passage.infon.get("type") == "title":
                title = passage.text
            elif passage.infon.get("type") == "abstract":
                abstract = passage.text
```

Each BioCXML archive must be extracted from tar before XML parsing. The
archives contain multiple XML files, each covering a range of PMIDs.

---

## 6. PostgreSQL Schema

All PubTator3 data lives in a dedicated `pubtator` schema, separate from the
main `solemd` schema used by the web app.

```sql
-- ============================================================
-- PubTator3 Schema
-- ============================================================

CREATE SCHEMA IF NOT EXISTS pubtator;

-- ------------------------------------------------------------
-- Entity Annotations
-- No primary key: heap storage for maximum COPY throughput.
-- Rows are immutable (full monthly replacement via table swap).
-- ------------------------------------------------------------
CREATE TABLE pubtator.entity_annotations (
    pmid        INTEGER   NOT NULL,
    entity_type TEXT      NOT NULL,
    concept_id  TEXT      NOT NULL DEFAULT '',
    mentions    TEXT      NOT NULL DEFAULT '',
    resource    TEXT      NOT NULL DEFAULT 'PubTator3'
);

-- ------------------------------------------------------------
-- Relations
-- Same storage strategy as entity_annotations.
-- ------------------------------------------------------------
CREATE TABLE pubtator.relations (
    pmid          INTEGER NOT NULL,
    relation_type TEXT    NOT NULL,
    subject_type  TEXT    NOT NULL,
    subject_id    TEXT    NOT NULL,
    object_type   TEXT    NOT NULL,
    object_id     TEXT    NOT NULL
);

-- ------------------------------------------------------------
-- Abstracts (optional -- only if loading from BioCXML)
-- ------------------------------------------------------------
CREATE TABLE pubtator.abstracts (
    pmid     INTEGER PRIMARY KEY,
    title    TEXT,
    abstract TEXT
);

-- ------------------------------------------------------------
-- Load History
-- Tracks each bulk load for audit and freshness monitoring.
-- ------------------------------------------------------------
CREATE TABLE pubtator.load_history (
    id            SERIAL PRIMARY KEY,
    source_file   TEXT         NOT NULL,
    rows_loaded   BIGINT       NOT NULL DEFAULT 0,
    started_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ,
    status        TEXT         NOT NULL DEFAULT 'running',
    metadata      JSONB
);
```

### Indexes

Build indexes **after** bulk loading (not before). Creating indexes on an
empty table and then COPYing 25-80M rows is dramatically slower than loading
first and indexing second.

```sql
-- Entity indexes
CREATE INDEX CONCURRENTLY idx_pubtator_entity_pmid
    ON pubtator.entity_annotations (pmid);

CREATE INDEX CONCURRENTLY idx_pubtator_entity_concept_id
    ON pubtator.entity_annotations (concept_id);

CREATE INDEX CONCURRENTLY idx_pubtator_entity_type
    ON pubtator.entity_annotations (entity_type);

CREATE INDEX CONCURRENTLY idx_pubtator_entity_pmid_type
    ON pubtator.entity_annotations (pmid, entity_type);

-- Partial indexes for high-value entity types
CREATE INDEX CONCURRENTLY idx_pubtator_entity_disease
    ON pubtator.entity_annotations (pmid, concept_id)
    WHERE entity_type = 'disease';

CREATE INDEX CONCURRENTLY idx_pubtator_entity_chemical
    ON pubtator.entity_annotations (pmid, concept_id)
    WHERE entity_type = 'chemical';

CREATE INDEX CONCURRENTLY idx_pubtator_entity_gene
    ON pubtator.entity_annotations (pmid, concept_id)
    WHERE entity_type = 'gene';

-- Relation indexes
CREATE INDEX CONCURRENTLY idx_pubtator_relation_pmid
    ON pubtator.relations (pmid);

CREATE INDEX CONCURRENTLY idx_pubtator_relation_subject
    ON pubtator.relations (subject_type, subject_id);

CREATE INDEX CONCURRENTLY idx_pubtator_relation_object
    ON pubtator.relations (object_type, object_id);

CREATE INDEX CONCURRENTLY idx_pubtator_relation_type
    ON pubtator.relations (relation_type);
```

Partial indexes for disease, chemical, and gene are the most queried entity
types in our domain and benefit from smaller, faster index scans.

---

## 7. Loading into PostgreSQL

### Staging Strategy

Use UNLOGGED staging tables for the initial load, then convert to logged
after verification. UNLOGGED tables skip WAL writes, roughly doubling
load throughput at the cost of crash safety (acceptable for staging data
that can be reloaded from source).

```sql
-- Create UNLOGGED staging tables
CREATE UNLOGGED TABLE pubtator.staging_entities
    (LIKE pubtator.entity_annotations INCLUDING DEFAULTS);

CREATE UNLOGGED TABLE pubtator.staging_relations
    (LIKE pubtator.relations INCLUDING DEFAULTS);
```

### PostgreSQL Tuning for Bulk Load

Set these before the load, revert after:

```sql
-- Increase memory for index builds
ALTER SYSTEM SET maintenance_work_mem = '4GB';

-- Allow larger WAL for the SET LOGGED conversion
ALTER SYSTEM SET max_wal_size = '100GB';

-- Reduce checkpoint frequency during load
ALTER SYSTEM SET checkpoint_completion_target = 0.9;

SELECT pg_reload_conf();

-- Disable autovacuum on staging tables
ALTER TABLE pubtator.staging_entities SET (autovacuum_enabled = false);
ALTER TABLE pubtator.staging_relations SET (autovacuum_enabled = false);
```

### COPY Loading

The SoleMD.App loader uses psycopg3's streaming COPY protocol, which
handles parsing, error recovery, and progress reporting in Python:

```python
with conn.cursor() as cur:
    with cur.copy(
        "COPY pubtator.staging_entities "
        "(pmid, entity_type, concept_id, mentions, resource) "
        "FROM STDIN"
    ) as copy:
        for row in stream_entities(file_path):
            copy.write_row(row)
```

Progress reporting every 1M rows:

```python
PROGRESS_INTERVAL = 1_000_000
if row_count % PROGRESS_INTERVAL == 0:
    elapsed = time.time() - start_time
    rate = row_count / elapsed
    print(f"  Loaded {row_count:,} entities ({rate:,.0f} rows/sec)")
```

Alternative: load from pre-filtered Parquet instead of raw gzip:

```sql
-- Load from domain-filtered Parquet (requires DuckDB fdw or intermediate CSV)
\COPY pubtator.staging_entities
FROM PROGRAM 'duckdb -csv -c "SELECT * FROM read_parquet(''data/pubtator/parquet/entities/**/*.parquet'')"'
WITH (FORMAT csv, HEADER true);
```

### Post-Load Steps

```sql
-- 1. Build indexes on staging tables
-- (Use the CREATE INDEX CONCURRENTLY statements from Section 6)

-- 2. Convert from UNLOGGED to LOGGED (writes full WAL, takes time)
ALTER TABLE pubtator.staging_entities SET LOGGED;
ALTER TABLE pubtator.staging_relations SET LOGGED;

-- 3. Re-enable autovacuum
ALTER TABLE pubtator.staging_entities SET (autovacuum_enabled = true);
ALTER TABLE pubtator.staging_relations SET (autovacuum_enabled = true);

-- 4. Analyze for query planner statistics
ANALYZE pubtator.staging_entities;
ANALYZE pubtator.staging_relations;
```

### Verification Queries

```sql
-- Entity distribution by type
SELECT entity_type, COUNT(*) AS rows, COUNT(DISTINCT pmid) AS papers
FROM pubtator.staging_entities
GROUP BY entity_type
ORDER BY rows DESC;

-- Relation distribution by type
SELECT relation_type, COUNT(*) AS rows, COUNT(DISTINCT pmid) AS papers
FROM pubtator.staging_relations
GROUP BY relation_type
ORDER BY rows DESC;

-- Total coverage
SELECT COUNT(DISTINCT pmid) AS total_papers
FROM pubtator.staging_entities;

-- Sample rows for sanity check
SELECT * FROM pubtator.staging_entities
WHERE pmid = 10024047
ORDER BY entity_type;
```

### Expected Timing

| Operation | Domain-Filtered (25-80M rows) | Full (1.6B rows) |
|-----------|-------------------------------|-------------------|
| COPY load (entities) | 15-30 min | 2-4 hours |
| COPY load (relations) | 1-3 min | 15-30 min |
| Index build (entities) | 10-20 min | 1-2 hours |
| Index build (relations) | 2-5 min | 10-20 min |
| SET LOGGED conversion | 5-15 min | 30-60 min |
| ANALYZE | 2-5 min | 10-20 min |
| **Total** | **35-80 min** | **4-7 hours** |

### Recording Load History

After each load, record the outcome for audit:

```python
with conn.cursor() as cur:
    cur.execute("""
        INSERT INTO pubtator.load_history
            (source_file, rows_loaded, completed_at, status, metadata)
        VALUES (%s, %s, NOW(), %s, %s)
    """, (
        "bioconcepts2pubtator3.gz",
        entity_count,
        "completed",
        json.dumps({"ftp_timestamp": "2026-02-17", "domain_pmids": len(domain_set)})
    ))
```

---

## 8. Monthly Refresh

### Zero-Downtime Table Swap

The refresh strategy uses atomic `ALTER TABLE RENAME` to swap staging tables
into production with zero downtime. No queries fail during the swap -- they
either hit the old table or the new one.

```sql
BEGIN;
ALTER TABLE pubtator.entity_annotations RENAME TO entity_annotations_old;
ALTER TABLE pubtator.staging_entities RENAME TO entity_annotations;
COMMIT;

-- Drop the old table after confirming the swap
DROP TABLE pubtator.entity_annotations_old;

-- Same for relations
BEGIN;
ALTER TABLE pubtator.relations RENAME TO relations_old;
ALTER TABLE pubtator.staging_relations RENAME TO relations;
COMMIT;

DROP TABLE pubtator.relations_old;

-- Update statistics
ANALYZE pubtator.entity_annotations;
ANALYZE pubtator.relations;
```

### Full Monthly Workflow

```
1. CHECK    curl -sI to compare FTP Last-Modified against load_history
2. DOWNLOAD curl -C - to data/pubtator/raw/ (resume-safe)
3. FILTER   DuckDB: stream gz --> filter to domain PMIDs --> Parquet
4. STAGE    CREATE UNLOGGED staging tables
5. LOAD     COPY domain-filtered data into staging tables
6. INDEX    CREATE INDEX CONCURRENTLY on staging tables
7. LOG      ALTER TABLE staging SET LOGGED
8. VERIFY   Run verification queries (row counts, type distribution)
9. SWAP     BEGIN; RENAME old; RENAME staging; COMMIT;
10. DROP    DROP old tables
11. ANALYZE ANALYZE new tables
12. RECORD  INSERT into load_history
```

### Freshness Check

```bash
# Check if FTP has newer files than our last load
REMOTE_DATE=$(curl -sI "https://ftp.ncbi.nlm.nih.gov/pub/lu/PubTator3/bioconcepts2pubtator3.gz" \
    | grep -i "last-modified" | cut -d' ' -f2-)
echo "Remote: $REMOTE_DATE"

# Compare against our last successful load
psql -c "SELECT source_file, completed_at, metadata->>'ftp_timestamp'
         FROM pubtator.load_history
         WHERE status = 'completed'
         ORDER BY completed_at DESC LIMIT 1;"
```

### Automation

The refresh can be triggered as a Dramatiq task via the FastAPI operations
API, or scheduled as a cron job:

```python
# Dramatiq task definition
@dramatiq.actor(max_retries=1, time_limit=4 * 60 * 60 * 1000)  # 4-hour limit
def refresh_pubtator():
    """Monthly PubTator3 refresh: download, filter, load, swap."""
    check_ftp_freshness()
    download_files()
    filter_to_domain()
    load_staging()
    build_indexes()
    atomic_swap()
    record_load()
```

---

## 9. Access Patterns

### PMID Point Lookup (web app paper detail panel)

The most common query: given a PMID, return all entity annotations.

```sql
SELECT entity_type, concept_id, mentions
FROM pubtator.entity_annotations
WHERE pmid = 12345678
ORDER BY entity_type, concept_id;
```

Uses `idx_pubtator_entity_pmid`. Expected: sub-millisecond with warm cache.

### Entity + Relations for a Paper

```sql
-- Entities
SELECT entity_type, concept_id, mentions, resource
FROM pubtator.entity_annotations
WHERE pmid = 12345678
ORDER BY entity_type, concept_id;

-- Relations for the same paper
SELECT relation_type, subject_type, subject_id, object_type, object_id
FROM pubtator.relations
WHERE pmid = 12345678;
```

The SoleMD.App `local_db.py` issues both queries in a single connection,
groups by PMID, and converts to BioC JSON format for API compatibility.

### Batch Lookup (multiple PMIDs)

```sql
SELECT pmid, entity_type, concept_id, mentions, resource
FROM pubtator.entity_annotations
WHERE pmid = ANY($1)
ORDER BY pmid, entity_type, concept_id;
```

Uses `= ANY(array)` instead of `IN (list)` for parameterized queries with
psycopg. Efficient up to ~1000 PMIDs per batch.

### Concept Co-occurrence (RAG boost)

Find papers where two specific concepts co-occur -- used to boost RAG
retrieval when a query mentions multiple entities:

```sql
SELECT a.pmid
FROM pubtator.entity_annotations a
JOIN pubtator.entity_annotations b ON a.pmid = b.pmid
WHERE a.concept_id = '627'            -- BDNF (NCBI Gene)
  AND b.concept_id = 'MESH:D003865'   -- Major Depressive Disorder
LIMIT 100;
```

Uses `idx_pubtator_entity_concept_id` on both sides of the join.

### Drug-Disease Relations (graph edges)

```sql
SELECT r.pmid, r.relation_type, r.subject_id, r.object_id
FROM pubtator.relations r
WHERE r.relation_type IN ('Positive_Correlation', 'Negative_Correlation', 'Association')
  AND r.subject_type = 'chemical'
  AND r.object_type = 'disease';
```

### Entity Type Aggregation (health check / graph building)

```sql
SELECT entity_type,
       COUNT(*) AS total_annotations,
       COUNT(DISTINCT pmid) AS papers,
       COUNT(DISTINCT concept_id) AS unique_concepts
FROM pubtator.entity_annotations
GROUP BY entity_type
ORDER BY total_annotations DESC;
```

### Concept Search (by identifier)

```sql
SELECT pmid, entity_type, mentions, resource
FROM pubtator.entity_annotations
WHERE concept_id = 'MESH:D004298'  -- dopamine
LIMIT 100;
```

### Where Each Query Runs

| Access Pattern | Engine | Why |
|---------------|--------|-----|
| PMID point lookup | PostgreSQL | Sub-ms with index, interactive use |
| Batch PMID lookup | PostgreSQL | Same, up to ~1000 PMIDs |
| Concept co-occurrence | PostgreSQL | Index-driven join, interactive |
| Entity type aggregation | PostgreSQL (or DuckDB) | PG is fine for domain subset; DuckDB for full 1.6B |
| Graph building batch | DuckDB on Parquet | Full table scans, analytical workload |
| Monthly filtering | DuckDB on Parquet | Stream + filter + write, batch ETL |
| Corpus-wide statistics | DuckDB on Parquet | COUNT/GROUP BY over billions of rows |

---

## 10. Reusable Code from SoleMD.App

The following files in SoleMD.App contain patterns, logic, and definitions
that can be adapted for SoleMD.Graph:

### Download Script

**File**: `pipeline/scripts/load/download_pubtator3.sh`

Provides: curl commands with resume (`-C -`), retry (`--retry 3`),
timestamped archival with symlinks, checksum generation. Can be copied
and adapted directly.

### COPY + Parsing Logic

**File**: `pipeline/scripts/load/load_pubtator3.py`

Provides:
- `parse_entity_line()` -- tab parsing with edge case handling (fewer than
  5 columns, trailing backslash, missing resource)
- `parse_relation_line()` -- pipe-delimited entity format parsing
- `stream_entities()` / `stream_relations()` -- gzip streaming iterators
  with `errors="replace"` encoding
- `load_entities()` / `load_relations()` -- psycopg3 COPY protocol with
  progress reporting, autovacuum disable/enable around load
- `create_indexes()` -- CONCURRENTLY index creation with autocommit mode
- `record_load()` -- load history tracking

Key detail: the loader disables autovacuum on target tables before COPY
and re-enables after, avoiding vacuum overhead during bulk writes.

### Entity/Relation Type Definitions

**File**: `services/api/pubtator/config.py`

Provides: `ENTITY_TYPES` list (6 types with code, name, terminology) and
`RELATION_TYPES` list (12 entries covering BioREx types plus SoleMD.App
pipeline-specific codes like TREAT, CAUSE, INHIBIT). The BioREx subset
(8 types) maps directly to the bulk FTP relation types.

Also provides: FTP URL, API base URL, rate limit constants, timeout
configuration.

### Query Patterns

**File**: `services/api/pubtator/local_db.py`

Provides:
- `LocalPubTatorDB` class with async connection pooling (psycopg_pool)
- `get_annotations_by_pmid()` -- single-PMID entity + relation lookup
- `get_annotations_batch()` -- multi-PMID batch lookup with `ANY($1)`
- `search_by_concept()` -- concept_id lookup with optional entity_type filter
- `_to_bioc_format()` -- conversion from DB rows to BioC JSON structure
  (passages, annotations with infons, relations with nodes/roles)

The BioC conversion is specific to SoleMD.App's API compatibility layer
and may not be needed in SoleMD.Graph, but the query patterns and connection
pool configuration are directly reusable.

### BioC JSON/XML Parsing

**File**: `services/api/pubtator/parser.py`

Provides:
- `parse_bioc_json()` -- parses BioC JSON (from API or local DB) into
  structured annotations and relations
- `_parse_bioc_role()` -- handles both dict and pipe-delimited entity
  formats in relation nodes
- UMLS CUI enrichment via MeSH mapper integration
- Title/abstract extraction from BioC passage structure

Relevant if consuming PubTator3 API responses or BioCXML alongside the
bulk tab data.

---

## 11. Integration with SoleMD.Graph

### Entity Mentions in Graph Parquet Bundle

PubTator3 entity annotations are baked into the graph bundle during
graph bundle building. Today that means `base_points.parquet` for the opening
scaffold and, when needed, `universe_points.parquet` for the broader premapped
coordinate universe. Each paper row includes a serialized list of entity
mentions and their concept IDs, enabling client-side entity highlighting
without any server round-trip:

```
User types "dopamine" in the search box
--> DuckDB-WASM: SELECT pmid FROM active_points_web WHERE mentions LIKE '%dopamine%'
--> Cosmograph highlights matching nodes (<10ms)
```

The mentions column is a semicolon-delimited string (matching the PubTator3
format), searchable via DuckDB's `CONTAINS()` or `LIKE` in the browser.

### Entity-Aware RAG Boosting

When a user's search query contains recognizable entities, the RAG pipeline
uses PubTator3 concept co-occurrence to boost retrieval:

```
User asks "What is the role of BDNF in depression treatment?"
--> Identify entities: BDNF (Gene:627), Depression (MESH:D003866)
--> Query pubtator.entity_annotations for papers with BOTH concepts
--> Boost those PMIDs in the vector search results
```

This is a JOIN between the vector search candidate set and PubTator3
annotations, applied as a post-retrieval re-ranking signal.

### PubTator3 Relations and Graph Delivery

PubTator3 relations are part of the durable biomedical substrate, but they are
not part of the default browser graph payload today.

Current implementation:

- compact PubTator-derived summaries are exported onto base points
  - semantic groups
  - top entities
  - relation-category summaries
- full relation rows remain database-side / future evidence-path data
- `universe_links.parquet` is the canonical browser-side link artifact name if
  paper or relation edges are published later, but it is not part of the
  default base browser bundle

That means PubTator currently informs graph search, filtering, summaries, and
future evidence/link artifacts more than direct always-on edge rendering.

### PMID as Bridge Key

PMID is the universal join key across all three data pillars:

```
Semantic Scholar    PubTator3           PostgreSQL
paper-ids.jsonl --> bioconcepts2pubtator3.gz --> pubtator.entity_annotations
  externalIds.PMID    PMID (col 1)              pmid (col 1)
```

S2's `paper-ids` dataset maps `corpusId` to `PMID`, enabling the join
between S2 metadata (title, year, venue, SPECTER2 embeddings) and
PubTator3 annotations (entities, relations, abstract text).

Papers without PMIDs (preprints, non-PubMed sources) will not have
PubTator3 annotations. This is acceptable -- S2 metadata and abstracts
are still available for these papers, just without entity annotations.

---

## 12. Entity Analysis

> **Date**: 2026-03-19
> **Source**: `pubtator.entity_annotations` (318M rows) + `pubtator.relations` (24.7M rows)
> **Scope**: All candidate papers (14.06M PMIDs) in `solemd.corpus`

### Entity Type Value Ranking

| entity_type | Annotations | Distinct concept_ids | C-L Value | Notes |
|-------------|-------------|---------------------|-----------|-------|
| disease | ~80M | ~100K | **Highest** | Behaviors, symptoms, diagnoses — core domain |
| chemical | ~65M | ~90K | **High** | Drugs, neurotransmitters, metabolites |
| gene | ~55M | ~80K | **High** | Receptors, transporters, enzymes |
| species | ~30M | ~5K | Low | Mostly "human" / "mouse" — limited signal |
| mutation | ~15M | ~50K | Moderate | SNPs, variants — pharmacogenomics |
| cellline | ~8M | ~10K | Low | Lab context, not clinical |

**Key insight**: Disease entities are the richest signal for neuropsychiatric content because PubTator3 tags behavioral phenotypes (aggression, impulsivity, anhedonia) as diseases.

### Behavioral Entities

PubTator3 tags behavioral phenotypes under `entity_type = 'disease'`. These are central to C-L psychiatry but would be missed by journal-only filtering.

| concept_id | Name | Top mention | Papers | Graph ratio | min_cite |
|-----------|------|------------|--------|-------------|----------|
| MESH:D010554 | Aggression | "aggression" (48K) | 211K | 0.046 | 10 |
| MESH:D007174 | Impulsivity | "impulsivity" (23K) | 80K | 0.044 | 10 |
| MESH:D009771 | OCD behaviors | "obsessive-compulsive disorder" (12K) | 61K | 0.082 | 10 |
| MESH:D003072 | Cognitive impairment | "cognitive impairment" (92K) | 601K | 0.033 | 20 |
| MESH:D008569 | Memory impairment | "memory loss" (16K) | 173K | 0.057 | 10 |
| MESH:D003193 | Compulsive behaviors | "compulsive behaviors" (0.9K) | 8.4K | 0.119 | 5 |
| MESH:D000073932 | Compulsions | "compulsions" (1.2K) | 11K | 0.109 | 10 |
| MESH:D020921 | Arousal disorders | "anxious arousal" (0.6K) | 5K | 0.200 | 10 |

**Dropped behavioral candidates** (noisy or wrong concept_ids):
- MESH:D016388 — top mention is "loss" / "tooth loss", not behavioral
- MESH:D012816 — generic "symptoms" bucket
- MESH:D059445 — mixed with "physical disability"
- MESH:C000719212 — "fear" too broad (includes animal fear conditioning)
- MESH:D001308 — actually maps to inattention, mixed with ADHD
- MESH:D001523 — "psychiatric" (870K papers, too broad to be useful)

### Circuit Dysfunction Entities

Brain regions/circuits have NO dedicated entity type in PubTator3. However, dysfunction terms appear when NER triggers on structural pathology.

| concept_id | Name | Top mention | Papers | Issues |
|-----------|------|------------|--------|--------|
| MESH:D006331 | Corticolimbic | "diastolic dysfunction", "sexual dysfunction" | ~200K | Generic dysfunction bucket |
| MESH:C537734 | DMN/Salience | "Feingold syndrome", "abnormal intelligence" | ~15K | Mixed with genetic syndromes |
| MESH:C536673 | Frontoparietal | "frontoparietal tumors", "AVM" | ~5K | Tumor/malformation noise |

**All 6 circuit concept_ids HELD** — too noisy for automated promotion. Strategy: use dysfunction aliases in vocab instead.

### High-Graph-Ratio Neuropsych Diseases

Diseases with high graph ratios (fraction of papers already in the mapped universe) indicate strong domain relevance. Those NOT yet in the mapped universe are promotion candidates.

| concept_id | Name | Top mention | Papers | Graph ratio |
|-----------|------|------------|--------|-------------|
| MESH:D000091323 | PNES | "pseudoseizures" (0.3K) | 2.2K | 0.63 |
| MESH:D017109 | Akathisia | "akathisia" (3.3K) | 5.3K | 0.62 |
| MESH:D000341 | Affective psychosis | "psychotic depression" (1.6K) | 11K | 0.55 |
| MESH:D057174 | FTD | "frontotemporal lobar degeneration" (2.1K) | 9.2K | 0.48 |
| MESH:D004833 | Epilepsy | "temporal lobe epilepsy" (9.4K) | 36K | 0.44 |

**Dropped neuropsych disease candidates** (wrong concept_ids):
- MESH:D019967 — is schizophrenia spectrum, not substance use disorders
- MESH:D000088282 — is corticobasal degeneration, not autoimmune encephalitis
- MESH:D061218 — is treatment-resistant depression, not early-onset AD
- MESH:D012569 — is personality disorders, not suicidality

### High-Value Neurotransmitter Genes

Gene entities that serve as neurotransmitter system markers. These require a second gate (co-occurring disease entity or treat/cause relation) to avoid noise from pure genetics papers.

| concept_id | entity_type | Name | Top mention | Papers | min_cite |
|-----------|------------|------|------------|--------|----------|
| 627 | gene | BDNF | "BDNF" (15K) | 51K | 10 |
| 6531 | gene | DAT | "dopamine transporter" (4K) | 17K | 10 |
| 6532 | gene | SERT | "serotonin transporter" (3K) | 17K | 10 |
| 1312 | gene | COMT | "COMT" (4K) | 14K | 10 |
| 4128 | gene | MAOA | "MAO-A" (2K) | 7.5K | 5 |

**Dropped gene candidates**:
- 1995 — is ELAVL3/HuC (RNA binding protein), not ChAT
- 2550 — is Gbeta1 (G-protein subunit), not GABA-R
- 2902 — NR1 is ambiguous (nuclear receptor vs NMDA receptor subunit)

**Note**: Gene IDs 6531 and 6532 appear under BOTH `gene` AND `species` entity_types. All entity_rule JOINs must match on BOTH `entity_type` AND `concept_id`.

### Noise Entities — Stoplist Recommendations

High-frequency entities with no neuropsychiatric signal. Should be excluded from any entity-based scoring.

| concept_id | Name | Papers | Why noisy |
|-----------|------|--------|-----------|
| MESH:D014867 | Water | 1.4M | Ubiquitous chemical |
| MESH:D005947 | Glucose | 989K | Universal metabolite |
| 6597 | GAPDH | 155K | Housekeeping gene |
| - | (unmapped) | 5.5M | No concept_id assigned |

For any entity-based scoring or graph construction, exclude:
1. **Ubiquitous chemicals**: water, glucose, oxygen, sodium chloride, ethanol (solvent context)
2. **Housekeeping genes**: GAPDH, beta-actin, 18S rRNA
3. **Generic diseases**: "disease", "syndrome", "symptoms", "disorder" (no specific concept)
4. **Unmapped entities**: concept_id = '-' or empty (5.5M annotations with no resolution)
5. **Species noise**: "human", "mouse", "rat" (present in nearly every paper)

### Relation Type Value

| Relation | Count | C-L Value | Notes |
|----------|-------|-----------|-------|
| **treat** | 4.7M | **Gold** | Drug-disease pairs — pharmacotherapy network |
| **cause** | 2.7M | **Gold** | Etiology + adverse drug effects |
| associate | 8.2M | Low | Too broad, high false positive |
| stimulate | 1.8M | Moderate | Mechanism of action |
| inhibit | 1.6M | Moderate | Mechanism of action |
| interact | 1.2M | Moderate | Drug-drug, protein-protein |
| bind | 0.8M | Moderate | Receptor pharmacology |

#### Top TREAT Pairs (Pharmacotherapy Network)

| Subject | Object | Count | Clinical domain |
|---------|--------|-------|----------------|
| Levodopa | Parkinson disease | 12K | Movement disorders |
| Fluoxetine | Depression | 8K | Mood disorders |
| Donepezil | Alzheimer disease | 7K | Cognitive disorders |
| Lithium | Bipolar disorder | 6K | Mood stabilization |
| Risperidone | Schizophrenia | 5K | Psychosis |
| Clozapine | Schizophrenia | 4K | Treatment-resistant psychosis |
| Carbamazepine | Epilepsy | 4K | Seizure disorders |

#### Top CAUSE Pairs (Etiology + Adverse Effects)

| Subject | Object | Count | Type |
|---------|--------|-------|------|
| Haloperidol | Extrapyramidal symptoms | 3K | Adverse effect |
| Ethanol | Liver cirrhosis | 3K | Substance toxicity |
| Corticosteroids | Osteoporosis | 2K | Iatrogenic |
| Antipsychotics | Weight gain | 2K | Metabolic side effect |
| SSRIs | Serotonin syndrome | 1K | Drug toxicity |

### Five Natural Entity Clusters

Papers cluster naturally around disease entities, revealing the major subdomains:

| Cluster | Anchor diseases | Papers | Key drugs | Key genes |
|---------|----------------|--------|-----------|-----------|
| **Neurodegenerative** | Alzheimer, Parkinson, ALS, Huntington | ~2.5M | Donepezil, levodopa, riluzole | APP, MAPT, SNCA, SOD1 |
| **Affective** | Depression, bipolar, anxiety, PTSD | ~2.0M | Fluoxetine, lithium, ketamine | BDNF, SERT, COMT |
| **Epilepsy** | Epilepsy, seizures, status epilepticus | ~0.8M | Carbamazepine, valproate, levetiracetam | SCN1A, GABA-R |
| **Cerebrovascular** | Stroke, TBI, SAH, aneurysm | ~1.2M | tPA, nimodipine, mannitol | APOE |
| **Substance use** | Alcohol use, opioid use, cocaine, nicotine | ~0.6M | Naltrexone, methadone, buprenorphine | OPRM1, DRD2 |

### PubTator3 Anatomy Blind Spot

PubTator3 does NOT have a brain region or circuit entity type. Brain structures appear only when:
1. They co-occur with a disease term (e.g., "hippocampal atrophy" tagged as disease)
2. They appear as species-level annotations (rare)

**Mitigation strategy**: Dysfunction aliases in vocab (e.g., "amygdala dysfunction", "salience network dysconnectivity") create PubTator3-matchable strings that bridge the anatomy gap. These are generated as alias_type = `DY` with lower quality scores (55-65) than hand-curated aliases (75-90).

### C-L Overlap Entities

Entities that score highest on the overlap formula — appearing frequently as candidates but with low graph ratios, indicating they live in non-specialty journals.

**Overlap scoring formula**: `overlap_score = candidate_papers * graph_ratio * (1 - graph_ratio)`

Maximum overlap score occurs at graph_ratio = 0.5 (equally split between the mapped universe and candidate corpus).

| Entity | Papers | Graph ratio | Overlap score | Specialty crossings |
|--------|--------|-------------|-------------|---------------------|
| Pain | 890K | 0.091 | 73.6K | Rheumatology, orthopedics, anesthesia |
| Stroke | 520K | 0.148 | 65.5K | Cardiology, vascular surgery, rehab |
| Inflammation | 1.2M | 0.061 | 68.8K | Immunology, rheumatology, gastro |
| Diabetes | 780K | 0.038 | 28.5K | Endocrine, cardiology, nephrology |
| Hypertension | 650K | 0.045 | 27.9K | Cardiology, nephrology, obstetrics |
| Obesity | 450K | 0.067 | 28.1K | Endocrine, bariatric, cardiology |
| Sleep disorders | 180K | 0.156 | 23.7K | Pulmonology, ENT, cardiology |

These are high-signal C-L papers waiting for PMI-based overlay promotion.

### Missing concept_ids (Need Targeted PubTator3 Queries)

| Concept | Why missing | Action |
|---------|-------------|--------|
| Anhedonia | No clean MESH ID found | Search PubTator3 for "anhedonia" mention → find concept_id |
| Apathy | No clean MESH ID found | Search for "apathy" mention |
| Hyperarousal | No clean MESH ID found | Search for "hyperarousal" mention |
| Fear conditioning | Too broad (MESH:C000719212 includes animal studies) | Find more specific concept_id |
| SUDs | MESH:D019967 is schizophrenia spectrum | Find correct SUD concept_id |
| Autoimmune encephalitis | MESH:D000088282 is corticobasal degeneration | Find correct concept_id |
| Early-onset AD | MESH:D061218 is treatment-resistant depression | Find correct concept_id |
| Suicidality | MESH:D012569 is personality disorders | Find correct concept_id |
| ChAT | Gene 1995 is ELAVL3/HuC | Find correct gene ID for choline acetyltransferase |
| GABA-R | Gene 2550 is Gbeta1 | Find correct gene ID for GABA receptor |
| NMDAR | Gene 2902 (NR1) is ambiguous | Find unambiguous NMDAR gene ID |

### Circuit Entity Rules (Held for Manual Review)

All 6 proposed circuit concept_ids were too noisy for automated promotion. Potential approaches:
1. Find better MESH IDs by querying PubTator3 for specific circuit-related mentions
2. Use dysfunction aliases in vocab (implemented in round 1) to capture circuit papers via the vocab signal
3. Consider compound rules: circuit concept_id + co-occurring disease entity
