"""Enrich solemd.vocab_terms with MeSH crosswalks and PubTator paper counts.

One-off script. Run after migration 023 loads the TSV data:

    cd engine
    uv run python scripts/enrich_vocab_terms.py

Requires:
    - UMLS_API_KEY environment variable
    - httpx: uv add httpx
    - solemd.vocab_terms table populated (migration 023)
    - pubtator.entity_annotations table populated

Steps:
    1. Map category -> pubtator_entity_type
    2. Assign entity_rule_family from category + organ_systems
    3. UMLS CUI -> MeSH crosswalk via UMLS API (cached to JSON)
    4. Count PubTator papers per MeSH ID
    5. Bulk UPDATE vocab_terms
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

import httpx

# Add engine/ to path so app imports work when run as script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db  # noqa: E402
from app.config import settings  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s  %(message)s",
)
logger = logging.getLogger("enrich_vocab_terms")
logging.getLogger("httpx").setLevel(logging.WARNING)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

UMLS_API_BASE = "https://uts-ws.nlm.nih.gov/rest"


def _load_umls_api_key() -> str:
    return os.environ.get("UMLS_API_KEY", "").strip()


UMLS_API_KEY = _load_umls_api_key()
CACHE_PATH = Path(settings.data_dir).resolve()
if not CACHE_PATH.is_absolute():
    CACHE_PATH = settings.project_root_path / settings.data_dir
CACHE_FILE = CACHE_PATH / "umls_mesh_cache.json"

# Stay under UMLS ToS: 20 req/s/IP. Use 15 for safety margin.
UMLS_CONCURRENCY = 15

# ---------------------------------------------------------------------------
# Category -> PubTator entity_type mapping
# ---------------------------------------------------------------------------

CATEGORY_TO_ENTITY_TYPE: dict[str, str] = {
    "clinical.diagnosis": "disease",
    "clinical.symptom": "disease",
    "clinical.symptom.neuropsychiatric": "disease",
    "clinical.syndrome": "disease",
    "intervention.pharmacologic": "chemical",
    "intervention.pharmacologic.class": "chemical",
    "neuroscience.neurotransmitter": "chemical",
    "biology.biomarker": "chemical",
    "biology.gene": "gene",
    "neuroscience.receptor": "gene",
    "neuroscience.structure": "anatomy",
    "neuroscience.network": "anatomy",
}

# Categories we skip (PubTator lacks anatomy/network types)
SKIP_CATEGORIES = {
    "neuroscience.circuit",
    "methods.assessment_instrument",
    "methods.neuroimaging",
    "methods.therapy",
    "intervention.neuromodulation",
    "intervention.psychotherapy",
}

# ---------------------------------------------------------------------------
# Category + organ_systems -> entity_rule_family mapping
# ---------------------------------------------------------------------------


def assign_family(category: str, organ_systems: list[str] | None) -> str | None:
    """Assign entity_rule_family based on category and organ_systems."""
    organs = set(organ_systems or [])

    if category == "clinical.diagnosis":
        if "psychiatric" in organs:
            return "psychiatric_disorder"
        if "neurological" in organs:
            return "neurological_disorder"
        # Mixed or untagged diagnoses — still useful for C-L overlap
        return "cl_disorder"

    if category == "clinical.symptom.neuropsychiatric":
        return "neuropsych_symptom"

    if category == "clinical.symptom":
        if "psychiatric" in organs:
            return "neuropsych_symptom"
        return "clinical_symptom"

    if category == "clinical.syndrome":
        return "clinical_syndrome"

    if category == "intervention.pharmacologic":
        return "psychiatric_medication"

    if category == "intervention.pharmacologic.class":
        return "drug_class"

    if category == "neuroscience.neurotransmitter":
        return "neurotransmitter_system"

    if category == "neuroscience.receptor":
        return "receptor_system"

    if category == "biology.gene":
        return "psychiatric_gene"

    if category == "biology.biomarker":
        return "biomarker"

    if category == "neuroscience.structure":
        return "brain_region"

    if category == "neuroscience.network":
        return "neural_network"

    return None


# ---------------------------------------------------------------------------
# Step 1-2: Map categories and assign families (local, no API)
# ---------------------------------------------------------------------------


def enrich_categories() -> int:
    """Map category -> pubtator_entity_type and assign entity_rule_family."""
    logger.info("Step 1-2: Mapping categories and assigning families...")

    with db.connect() as conn:
        rows = conn.execute(
            "SELECT id, category, organ_systems FROM solemd.vocab_terms"
        ).fetchall()

    updates: list[tuple[str, str | None, str, str]] = []
    skipped = 0

    for row in rows:
        cat = row["category"]
        entity_type = CATEGORY_TO_ENTITY_TYPE.get(cat)
        family = assign_family(cat, row["organ_systems"])

        if entity_type is None:
            skipped += 1
            continue

        updates.append((entity_type, family, row["id"]))

    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                UPDATE solemd.vocab_terms
                SET pubtator_entity_type = %s,
                    entity_rule_family   = %s,
                    updated_at           = now()
                WHERE id = %s
                """,
                updates,
            )
        conn.commit()

    logger.info(
        "Category mapping done: %d updated, %d skipped (no PubTator type)",
        len(updates),
        skipped,
    )
    return len(updates)


# ---------------------------------------------------------------------------
# Step 3: UMLS CUI -> MeSH crosswalk (async + cached)
# ---------------------------------------------------------------------------


def load_cache() -> dict[str, str | None]:
    """Load cached CUI -> MeSH mappings from disk."""
    if CACHE_FILE.exists():
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {}


def save_cache(cache: dict[str, str | None]) -> None:
    """Persist CUI -> MeSH cache to disk."""
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)
    logger.info("Cache saved: %d entries -> %s", len(cache), CACHE_FILE)


def _extract_mesh_descriptor(atoms: list[dict]) -> str | None:
    """Extract MeSH descriptor ID from UMLS atoms response.

    Prefers termType 'MH' (Main Heading). Falls back to any atom with
    a sourceDescriptor containing a MeSH D-number.
    """
    for atom in atoms:
        desc = atom.get("sourceDescriptor", "")
        tt = atom.get("termType", "")
        if tt == "MH" and "/MSH/" in desc:
            # URL like .../source/MSH/D012559 -> D012559
            return desc.rsplit("/", 1)[-1]

    # Fallback: any atom with a MeSH descriptor
    for atom in atoms:
        desc = atom.get("sourceDescriptor", "")
        if "/MSH/" in desc:
            mesh_id = desc.rsplit("/", 1)[-1]
            if mesh_id.startswith("D"):
                return mesh_id
    return None


async def fetch_mesh_id(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    cui: str,
    cache: dict[str, str | None],
) -> tuple[str, str | None]:
    """Fetch MeSH descriptor UI for a single UMLS CUI via atoms endpoint."""
    if cui in cache:
        return cui, cache[cui]

    async with sem:
        # Use CUI atoms endpoint filtered to MeSH source
        url = f"{UMLS_API_BASE}/content/current/CUI/{cui}/atoms"
        params = {
            "sabs": "MSH",
            "language": "ENG",
            "apiKey": UMLS_API_KEY,
        }

        for attempt in range(4):
            try:
                resp = await client.get(url, params=params, timeout=30.0)

                if resp.status_code == 200:
                    data = resp.json()
                    atoms = data.get("result", [])
                    mesh_id = _extract_mesh_descriptor(atoms)
                    cache[cui] = mesh_id
                    return cui, mesh_id

                if resp.status_code in (429, 503):
                    wait = 2 ** (attempt + 1)
                    logger.warning(
                        "Rate limited on %s (HTTP %d), retrying in %ds...",
                        cui,
                        resp.status_code,
                        wait,
                    )
                    await asyncio.sleep(wait)
                    continue

                if resp.status_code == 404:
                    cache[cui] = None
                    return cui, None

                logger.warning(
                    "Unexpected HTTP %d for %s: %s",
                    resp.status_code,
                    cui,
                    resp.text[:200],
                )
                cache[cui] = None
                return cui, None

            except httpx.HTTPError as exc:
                wait = 2 ** (attempt + 1)
                logger.warning(
                    "HTTP error for %s: %s, retrying in %ds...", cui, exc, wait
                )
                await asyncio.sleep(wait)

    logger.error("All retries exhausted for CUI %s", cui)
    cache[cui] = None
    return cui, None


async def run_crosswalk() -> dict[str, str | None]:
    """Run async UMLS -> MeSH crosswalk for all vocab_terms with CUIs."""
    if not UMLS_API_KEY:
        logger.error(
            "UMLS_API_KEY not set. Export it or add it to the plaintext compatibility file. Skipping crosswalk."
        )
        return {}

    cache = load_cache()
    logger.info("Loaded %d cached CUI->MeSH mappings", len(cache))

    with db.connect() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT umls_cui
            FROM solemd.vocab_terms
            WHERE umls_cui IS NOT NULL
              AND umls_cui != ''
              AND pubtator_entity_type IS NOT NULL
            """
        ).fetchall()

    cuis = [r["umls_cui"] for r in rows]
    uncached = [c for c in cuis if c not in cache]
    logger.info(
        "CUIs to crosswalk: %d total, %d cached, %d to fetch",
        len(cuis),
        len(cuis) - len(uncached),
        len(uncached),
    )

    if uncached:
        sem = asyncio.Semaphore(UMLS_CONCURRENCY)
        async with httpx.AsyncClient() as client:
            tasks = [fetch_mesh_id(client, sem, cui, cache) for cui in uncached]
            results = await asyncio.gather(*tasks)

        mapped = sum(1 for _, m in results if m is not None)
        logger.info("Crosswalk done: %d/%d CUIs got MeSH IDs", mapped, len(uncached))
        save_cache(cache)

    # Write MeSH IDs to database
    updates = []
    for cui in cuis:
        mesh = cache.get(cui)
        if mesh:
            updates.append((mesh, cui))

    if updates:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    UPDATE solemd.vocab_terms
                    SET mesh_id    = %s,
                        updated_at = now()
                    WHERE umls_cui = %s
                      AND mesh_id IS NULL
                    """,
                    updates,
                )
            conn.commit()
        logger.info("Wrote %d MeSH IDs to vocab_terms", len(updates))

    return cache


# ---------------------------------------------------------------------------
# Step 4: PubTator paper counts via PubTator3 search API
# ---------------------------------------------------------------------------

PUBTATOR_API_BASE = "https://www.ncbi.nlm.nih.gov/research/pubtator3-api"
PUBTATOR_CONCURRENCY = 3  # NCBI public API; 3 concurrent + 0.2s delay

ENTITY_TYPE_TO_PUBTATOR_PREFIX: dict[str, str] = {
    "disease": "DISEASE",
    "chemical": "CHEMICAL",
    "gene": "GENE",
}


async def fetch_pubtator_count(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    mesh_id: str,
    entity_type: str,
) -> tuple[str, int]:
    """Get paper count for a MeSH ID from PubTator3 search API."""
    prefix = ENTITY_TYPE_TO_PUBTATOR_PREFIX.get(entity_type, "DISEASE")
    query = f"@{prefix}_MESH:{mesh_id}"

    async with sem:
        # Small delay between requests to stay under NCBI rate limits
        await asyncio.sleep(0.2)
        for attempt in range(5):
            try:
                resp = await client.get(
                    f"{PUBTATOR_API_BASE}/search/",
                    params={"text": query, "page_size": 1},
                    timeout=30.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return mesh_id, data.get("count", 0)

                if resp.status_code in (429, 503):
                    wait = 2 ** (attempt + 1)
                    logger.warning(
                        "PubTator rate limited on %s (HTTP %d), retrying in %ds...",
                        mesh_id, resp.status_code, wait,
                    )
                    await asyncio.sleep(wait)
                    continue

                logger.warning("PubTator HTTP %d for %s", resp.status_code, mesh_id)
                return mesh_id, 0

            except httpx.HTTPError as exc:
                wait = 2 ** (attempt + 1)
                logger.warning("PubTator error for %s: %s, retrying...", mesh_id, exc)
                await asyncio.sleep(wait)

    return mesh_id, 0


async def count_pubtator_papers_async() -> int:
    """Get paper counts via PubTator3 search API for all enriched vocab_terms.

    Uses sequential batching (batch of 3 + 1s pause) to respect NCBI rate limits.
    """
    logger.info("Step 4: Counting PubTator papers via API...")

    with db.connect() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT mesh_id, pubtator_entity_type
            FROM solemd.vocab_terms
            WHERE mesh_id IS NOT NULL
              AND pubtator_entity_type IS NOT NULL
              AND (pubtator_paper_count IS NULL OR pubtator_paper_count = 0)
            """
        ).fetchall()

    total = len(rows)
    logger.info("Fetching paper counts for %d MeSH IDs...", total)

    results: list[tuple[str, int]] = []
    sem = asyncio.Semaphore(PUBTATOR_CONCURRENCY)
    batch_size = PUBTATOR_CONCURRENCY

    async with httpx.AsyncClient() as client:
        for i in range(0, total, batch_size):
            batch = rows[i : i + batch_size]
            batch_tasks = [
                fetch_pubtator_count(client, sem, r["mesh_id"], r["pubtator_entity_type"])
                for r in batch
            ]
            batch_results = await asyncio.gather(*batch_tasks)
            results.extend(batch_results)

            done = min(i + batch_size, total)
            if done % 50 == 0 or done == total:
                logger.info("PubTator progress: %d/%d", done, total)

            # Pause between batches to stay under NCBI rate limits
            await asyncio.sleep(1.0)

    # Bulk update
    updates = [(count, mesh_id) for mesh_id, count in results if count > 0]
    if updates:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    UPDATE solemd.vocab_terms
                    SET pubtator_paper_count = %s,
                        updated_at = now()
                    WHERE mesh_id = %s
                    """,
                    updates,
                )
            conn.commit()

    logger.info(
        "PubTator paper counts: %d/%d MeSH IDs have papers",
        len(updates), total,
    )
    return len(updates)


# ---------------------------------------------------------------------------
# Validation report
# ---------------------------------------------------------------------------


def print_report() -> None:
    """Print enrichment summary."""
    with db.connect() as conn:
        stats = conn.execute(
            """
            SELECT
                COUNT(*) AS total,
                COUNT(pubtator_entity_type) AS has_entity_type,
                COUNT(entity_rule_family) AS has_family,
                COUNT(mesh_id) AS has_mesh,
                COUNT(pubtator_paper_count) FILTER (WHERE pubtator_paper_count > 0) AS has_papers
            FROM solemd.vocab_terms
            """
        ).fetchone()

        families = conn.execute(
            """
            SELECT entity_rule_family, COUNT(*) AS cnt,
                   COUNT(mesh_id) AS with_mesh,
                   COUNT(pubtator_paper_count)
                       FILTER (WHERE pubtator_paper_count > 0) AS with_papers
            FROM solemd.vocab_terms
            WHERE entity_rule_family IS NOT NULL
            GROUP BY entity_rule_family
            ORDER BY cnt DESC
            """
        ).fetchall()

        # Check validation targets
        validations = conn.execute(
            """
            SELECT canonical_name, mesh_id, entity_rule_family, pubtator_paper_count
            FROM solemd.vocab_terms
            WHERE canonical_name IN (
                'Schizophrenia', 'Major Depressive Disorder', 'Bipolar Disorder',
                'PTSD', 'Obsessive-Compulsive Disorder', 'Insomnia',
                'Anhedonia', 'Tardive Dyskinesia',
                'Haloperidol', 'Olanzapine', 'Clozapine', 'Lithium', 'Ketamine',
                'Dopamine', 'Serotonin', 'GABA'
            )
            ORDER BY canonical_name
            """
        ).fetchall()

    print("\n" + "=" * 70)
    print("ENRICHMENT REPORT")
    print("=" * 70)
    print(f"  Total terms:          {stats['total']}")
    print(f"  With entity_type:     {stats['has_entity_type']}")
    print(f"  With family:          {stats['has_family']}")
    print(f"  With MeSH ID:         {stats['has_mesh']}")
    print(f"  With PubTator papers: {stats['has_papers']}")

    print("\nBy entity_rule_family:")
    print(f"  {'Family':<30} {'Count':>6} {'MeSH':>6} {'Papers':>8}")
    print(f"  {'-'*30} {'-'*6} {'-'*6} {'-'*8}")
    for row in families:
        print(
            f"  {row['entity_rule_family']:<30} "
            f"{row['cnt']:>6} "
            f"{row['with_mesh']:>6} "
            f"{row['with_papers']:>8}"
        )

    if validations:
        print("\nValidation targets:")
        print(f"  {'Name':<35} {'MeSH':<18} {'Family':<25} {'Papers':>8}")
        print(f"  {'-'*35} {'-'*18} {'-'*25} {'-'*8}")
        for row in validations:
            papers = row["pubtator_paper_count"] or 0
            print(
                f"  {row['canonical_name']:<35} "
                f"{(row['mesh_id'] or '-'):<18} "
                f"{(row['entity_rule_family'] or '-'):<25} "
                f"{papers:>8}"
            )

    # Estimate entity_rule yield
    with db.connect() as conn:
        yield_count = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM solemd.vocab_terms
            WHERE mesh_id IS NOT NULL
              AND pubtator_entity_type IS NOT NULL
              AND entity_rule_family IS NOT NULL
              AND pubtator_paper_count > 0
            """
        ).fetchone()

    print(f"\nEstimated entity_rules to generate: {yield_count['cnt']}")
    print("=" * 70 + "\n")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    t0 = time.time()
    logger.info("Starting vocab_terms enrichment...")

    # Steps 1-2: Category mapping + family assignment
    enrich_categories()

    # Step 3: UMLS -> MeSH crosswalk
    asyncio.run(run_crosswalk())

    # Step 4: PubTator paper counts (via API — much faster than local JOIN)
    asyncio.run(count_pubtator_papers_async())

    # Report
    print_report()

    elapsed = time.time() - t0
    logger.info("Enrichment complete in %.1fs", elapsed)


if __name__ == "__main__":
    main()
