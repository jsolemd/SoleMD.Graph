# BioCXML PMID Index — Infrastructure Task

## Problem

BioCXML archives (~190GB across 10 `.tar.gz` files) contain millions of documents but
have no PMID→archive position index. Finding a specific paper requires sequential tar
decompression. The current manifest covers only ~43K documents (first ~4K-5K per archive).

This means BioCXML overlay backfill for specific papers is effectively broken unless
the paper happens to be in the first few thousand documents of an archive.

## Evidence

- 60 neuropsych papers with PMIDs and PMCIDs: 0/60 found in BioCXML manifests
- All 60 have `text_availability = 'fulltext'` in S2 metadata
- All 60 have PMIDs in `solemd.corpus`
- The BioCXML archives almost certainly contain these papers — we just can't find them
  without scanning millions of tar entries

## Proposed Solution

Build a complete PMID→archive position index as a SQLite sidecar:

```
data/pubtator/releases/2026-03-21/manifests/biocxml.archive_manifest.sqlite
```

### Schema

The `archive_manifest` table already exists with columns:
- `archive_name`, `document_ordinal`, `member_name`, `document_id`

It just needs to be populated for ALL documents, not just the first ~4K per archive.

### Build Command

Dedicated manifest-only script (zero PostgreSQL dependency, 5000-entry batch commits):

```bash
# Parallel indexing across all 10 archives (~7 min total):
cd engine
for i in $(seq 0 9); do
  uv run python scripts/populate_bioc_archive_manifest.py \
    --archive-name "BioCXML.${i}.tar.gz" &
done
wait
```

**Note:** The original proposal used `discover_bioc_archive_targets.py --max-documents 0`
which crashes (`ValueError: max_documents must be positive`). The dedicated
`populate_bioc_archive_manifest.py` script avoids this entirely — it scans unlimited
documents by default and skips all PostgreSQL resolution work.

### Time Estimate

Each archive is ~19GB compressed. Sequential tar scan at ~50MB/s decompression ≈ 
~6-7 minutes per archive. With 10 parallel workers: ~7 minutes total.

### Verification

After indexing:
```sql
SELECT archive_name, count(*) 
FROM archive_manifest 
GROUP BY archive_name 
ORDER BY archive_name;
```

Should show millions of entries per archive instead of ~4K.

Then re-run the overlay backfill:
```bash
uv run python db/scripts/backfill_bioc_overlays.py \
  --run-id neuropsych-bioc-indexed-YYYYMMDD \
  --parser-version parser-v1 \
  --corpus-ids-file .tmp/neuropsych_warehouse_targets.txt \
  --max-bioc-archives 10
```

## Impact

Once the index exists:
- BioCXML overlay for any PMID becomes an instant lookup + targeted archive read
- The 60 neuropsych papers get real structural depth (sections, blocks, sentences, entities)
- Benchmark `front_matter_only` papers transition to `fulltext`
- `grounded_answer_rate` and `direct_passage_support` become meaningful for neuropsych benchmarks

## Files

- Index location: `data/pubtator/releases/2026-03-21/manifests/biocxml.archive_manifest.sqlite`
- Discovery script: `engine/db/scripts/discover_bioc_archive_targets.py`
- Overlay backfill: `engine/db/scripts/backfill_bioc_overlays.py`
- Operator guide: `docs/map/rag.md` → "Warehouse Operator Commands"
