"""LLM-powered cluster labeling.

Uses Gemini 2.5 Flash to generate clinical/scientific labels for graph
clusters, replacing or augmenting the c-TF-IDF keyword labels with
human-readable names and short descriptions.
"""

from __future__ import annotations

import json
import logging
import time
from collections import defaultdict
from dataclasses import dataclass

from google import genai
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable

from app import db
from app.config import settings
from app.langfuse_config import (
    SCORE_GRAPH_CLUSTER_ERRORS,
    SCORE_GRAPH_CLUSTER_LABELED,
    SCORE_GRAPH_CLUSTER_TOTAL,
    SPAN_GRAPH_LABEL_BATCH,
    SPAN_GRAPH_LABEL_CLUSTERS,
    SPAN_GRAPH_LABEL_CONTEXT,
    SPAN_GRAPH_LABEL_RELABEL,
    flush as _langfuse_flush,
    get_langfuse as _get_langfuse,
    get_prompt as _get_langfuse_prompt,
    observe,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate-limiting / retry constants
# ---------------------------------------------------------------------------
_MAX_RPM = 200
_MIN_REQUEST_INTERVAL = 60.0 / _MAX_RPM  # 0.3 seconds between requests
_MAX_RETRIES = 5
_INITIAL_BACKOFF = 2.0  # seconds
_BATCH_POLL_INTERVAL = 10.0  # seconds between batch status polls
_BATCH_TIMEOUT = 1800  # 30 min max wait for batch completion

# ---------------------------------------------------------------------------
# Prompt templates — fetched from Langfuse, local fallbacks for offline use
# ---------------------------------------------------------------------------
_FALLBACK_CLUSTER_LABEL = """\
You are a consultation-liaison psychiatrist and neuropsychiatry expert labeling \
research community clusters in a neuroscience/psychiatry knowledge graph.

Each cluster represents a RESEARCH COMMUNITY — papers clustered by semantic \
similarity of their embeddings. A single disease (e.g., schizophrenia) may appear \
in multiple clusters representing different research approaches (genetics vs \
pharmacology vs neuroimaging).

For each cluster you receive:
- cluster_id: integer identifier
- member_count: total papers in the cluster
- keywords: distinctive terms from c-TF-IDF (often too generic — treat as a hint only)
- top_journals: the 5 most common journals in this cluster with paper counts. \
  This is often the STRONGEST signal for the cluster's research field.
- median_year: median publication year
- avg_citations: average citation count
- entity_families: which curated entity families are most represented
- top_entities: the most frequent curated medical/psychiatric entities with paper counts
- titles: 20 representative paper titles (stratified: 5 landmark, 5 recent, 10 random)

Rules for labels:
1. 1-4 words, title case. Maximally specific. Single words are PREFERRED when \
   precise (e.g. "Catatonia", "Narcolepsy", "Alpha-Synucleinopathies"). \
   Don't pad to fill 4 words.
2. Established acronyms MUST be ALL CAPS: PTSD, TBI, ADHD, ECT, TMS, SSRI, \
   fMRI, EEG, CBT, DBT, GAD, OCD, ASD, SUD, DBS, tDCS, NMDA, GABA, HPA. \
   Never write "Ect", "Ptsd", "Tbi", etc.
3. Do NOT append generic filler words: "Research", "Studies", "Analysis", \
   "Investigation", "in Psychiatry", "Mechanisms". These waste label space. \
   Exception: established clinical subspecialty names are real field names, not \
   filler — "Forensic Psychiatry", "Consultation-Liaison Psychiatry", \
   "Computational Neuroscience", "Psycho-Oncology" are all fine.
4. Top journals are your strongest signal — they tell you the FIELD. \
   "Journal of the American Psychoanalytic Association" → Psychoanalytic, not "Theory". \
   "Epilepsia" → the cluster is about epilepsy, regardless of keywords.
5. Titles (especially landmark papers) tell you the TOPIC within the field.
6. Entity families tell you the CLINICAL DOMAIN (psychiatric, neurological, medication).
7. IGNORE ubiquitous entities: "mental disorders", "Major Depressive Disorder", \
   "Cognitive Impairment" appear in 80%+ of clusters. Focus on entities that are \
   distinctive to THIS cluster.
8. When titles and entities disagree, trust titles + journals.
9. Differentiate clusters by RESEARCH APPROACH, not just disease. Two clusters \
   about the same disease MUST have different labels reflecting their distinct \
   angle. Use the methodology as the differentiator: \
   "Schizophrenia Genetics" vs "Antipsychotic Pharmacology" vs \
   "Psychosis Neuroimaging" vs "Schizophrenia Epidemiology".
10. Cross-domain clusters: when a cluster bridges neuroscience and psychiatry, \
    name the BRIDGE, not just one side. "Neuroimmunology" not "Inflammation". \
    "Gut-Brain Axis" not "Microbiome". "Sleep & Mood" not "Sleep".
11. UNIQUENESS IS MANDATORY. Every label must be globally unique across the \
    entire graph (~700 clusters). To achieve this, always qualify by the \
    cluster's distinguishing angle — the methodology, model system, clinical \
    context, or molecular focus that makes this community distinct. \
    Two clusters about the same disease MUST differ: \
    "Hepatic Encephalopathy Clinical" vs "Hepatic Encephalopathy Neurochemistry", \
    "Alzheimer's Drug Discovery" vs "Alzheimer's Clinical Trials". \
    When in doubt, use the top journals as the tiebreaker — they reveal the \
    community's methodological identity.

{used_labels_block}
Examples of BAD → GOOD:
  "Theory"           → "Psychoanalytic Theory"
  "Face"             → "Social Cognition & Faces"
  "Bone"             → "Osteoporosis Pharmacology"
  "Delivery"         → "Drug Delivery Systems"
  "Motor & Movement" → "Motor Cortex Stimulation"
  "Ect"              → "ECT Efficacy"
  "Mental & Criminal"→ "Forensic Psychiatry"
  "Cocaine"          → "Cocaine Addiction"
  "Suicide"          → "Suicide Risk & Prevention"
  "Brain Tumors"     → "Glioma Molecular Biology" (if genetics/molecular focus)
  "Brain Tumors"     → "CNS Tumor Epidemiology" (if epidemiology/registry focus)
  "Sleep"            → "Insomnia & Circadian" (if mood/circadian focus)
  "Sleep"            → "Obstructive Sleep Apnea" (if respiratory/OSA focus)
  "Inflammation"     → "Neuroimmunology" (if CNS-immune interface)

Return a JSON array (no markdown fences) of objects with exactly these keys:
- "cluster_id": integer (echo back the input cluster_id)
- "label": string, 1-4 words, clinical terminology, title case (acronyms ALL CAPS)
- "description": string, 15-25 words stating the distinct research focus

Clusters:
{clusters_json}
"""

def _get_prompt() -> str:
    """Fetch cluster-label prompt from Langfuse Prompt Management (cached), fall back to local."""
    return _get_langfuse_prompt("graph-cluster-label", fallback=_FALLBACK_CLUSTER_LABEL)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class ClusterContext:
    """Input context for one cluster sent to the LLM."""
    cluster_id: int
    member_count: int
    keywords: list[str]
    titles: list[str]
    entity_families: dict[str, int]    # family_key → paper_count
    top_entities: list[tuple[str, str, int]]  # (name, family, count) — top 10
    top_journals: list[tuple[str, int]]  # (journal_name, paper_count), top 5
    median_year: int | None
    avg_citations: int | None


@dataclass(frozen=True, slots=True)
class ClusterLLMLabel:
    """Result of LLM labeling for one cluster."""
    cluster_id: int
    label: str
    description: str


# ---------------------------------------------------------------------------
# Gemini client helpers
# ---------------------------------------------------------------------------
_last_request_time: float = 0.0


@observe(as_type="generation", name=SPAN_GRAPH_LABEL_BATCH)
def _rate_limited_generate(
    client: genai.Client,
    *,
    model: str,
    contents: str,
    batch_cluster_ids: list[int] | None = None,
) -> str:
    """Call Gemini with rate limiting, exponential backoff, and Langfuse generation span."""
    global _last_request_time

    # Enforce minimum interval between requests
    elapsed = time.monotonic() - _last_request_time
    if elapsed < _MIN_REQUEST_INTERVAL:
        time.sleep(_MIN_REQUEST_INTERVAL - elapsed)

    lf = _get_langfuse()
    if lf is not None:
        lf.update_current_generation(
            input=contents,
            model=model,
            metadata={"batch_cluster_ids": batch_cluster_ids} if batch_cluster_ids else None,
        )

    backoff = _INITIAL_BACKOFF
    for attempt in range(_MAX_RETRIES):
        try:
            _last_request_time = time.monotonic()
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=genai.types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.3,
                    safety_settings=[
                        genai.types.SafetySetting(
                            category="HARM_CATEGORY_DANGEROUS_CONTENT",
                            threshold="BLOCK_NONE",
                        ),
                        genai.types.SafetySetting(
                            category="HARM_CATEGORY_HARASSMENT",
                            threshold="BLOCK_NONE",
                        ),
                        genai.types.SafetySetting(
                            category="HARM_CATEGORY_HATE_SPEECH",
                            threshold="BLOCK_NONE",
                        ),
                        genai.types.SafetySetting(
                            category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
                            threshold="BLOCK_NONE",
                        ),
                    ],
                ),
            )
            text = response.text or ""
            if lf is not None:
                usage_details = {}
                um = getattr(response, "usage_metadata", None)
                if um is not None:
                    usage_details = {
                        "input": getattr(um, "prompt_token_count", None),
                        "output": getattr(um, "candidates_token_count", None),
                        "total": getattr(um, "total_token_count", None),
                    }
                lf.update_current_generation(
                    output=text,
                    usage_details=usage_details or None,
                )
            return text
        except (ResourceExhausted, ServiceUnavailable) as exc:
            if attempt == _MAX_RETRIES - 1:
                raise
            logger.warning(
                "Gemini %s (attempt %d/%d), backing off %.1fs",
                type(exc).__name__,
                attempt + 1,
                _MAX_RETRIES,
                backoff,
            )
            time.sleep(backoff)
            backoff *= 2

    raise RuntimeError("Exhausted retries for Gemini API call")


def _get_client() -> genai.Client:
    """Build a Gemini client from settings."""
    if not settings.gemini_api_key:
        raise ValueError(
            "GEMINI_API_KEY is required for LLM labeling. Set it in .env.local"
        )
    return genai.Client(api_key=settings.gemini_api_key)


# ---------------------------------------------------------------------------
# Database loaders
# ---------------------------------------------------------------------------
@observe(name=SPAN_GRAPH_LABEL_CONTEXT)
def get_cluster_label_context(graph_run_id: str) -> list[ClusterContext]:
    """Load keywords, stratified titles, and entity signal for each cluster.

    Keywords come from the existing c-TF-IDF labels in graph_clusters.
    Titles are stratified: 5 landmark (highest-cited), 5 recent, 10 random.
    Entity families and top entities come from entity_rule + entity_annotations.
    """
    with db.connect() as conn, conn.cursor() as cur:
        # ── Keywords + member counts from c-TF-IDF labels ─────────
        cur.execute(
            """
            SELECT cluster_id, label, member_count
            FROM solemd.graph_clusters
            WHERE graph_run_id = %s
              AND cluster_id != 0
              AND label IS NOT NULL
            ORDER BY cluster_id
            """,
            (graph_run_id,),
        )
        cluster_keywords: dict[int, list[str]] = {}
        cluster_member_counts: dict[int, int] = {}
        for row in cur.fetchall():
            cid = int(row["cluster_id"])
            label = row["label"]
            keywords = [w.strip() for w in label.replace("&", ",").split(",") if w.strip()]
            cluster_keywords[cid] = keywords
            cluster_member_counts[cid] = int(row["member_count"] or 0)

        # ── Stratified title sampling ─────────────────────────────
        # 5 highest-cited (landmark), 5 most-recent, 10 random (deterministic)
        cur.execute(
            """
            WITH ranked AS (
                SELECT
                    g.cluster_id, p.title,
                    ROW_NUMBER() OVER (
                        PARTITION BY g.cluster_id
                        ORDER BY COALESCE(p.citation_count, 0) DESC, g.corpus_id
                    ) AS cite_rank,
                    ROW_NUMBER() OVER (
                        PARTITION BY g.cluster_id
                        ORDER BY p.year DESC NULLS LAST, g.corpus_id
                    ) AS recency_rank,
                    ROW_NUMBER() OVER (
                        PARTITION BY g.cluster_id
                        ORDER BY hashtext(g.corpus_id::text)
                    ) AS random_rank
                FROM solemd.graph_points g
                JOIN solemd.papers p ON p.corpus_id = g.corpus_id
                WHERE g.graph_run_id = %s
                  AND g.cluster_id IS NOT NULL
                  AND g.cluster_id != 0
                  AND p.title IS NOT NULL
            )
            SELECT cluster_id, title
            FROM ranked
            WHERE cite_rank <= 5 OR recency_rank <= 5 OR random_rank <= 10
            ORDER BY cluster_id, cite_rank
            """,
            (graph_run_id,),
        )
        cluster_titles: dict[int, list[str]] = defaultdict(list)
        for row in cur.fetchall():
            cid = int(row["cluster_id"])
            title = row["title"]
            # Deduplicate — a paper may qualify for multiple strata
            if title and title not in cluster_titles[cid]:
                cluster_titles[cid].append(title)

        # ── Entity family distribution per cluster ────────────────
        cur.execute(
            """
            SELECT g.cluster_id, er.family_key,
                COUNT(DISTINCT g.corpus_id)::INTEGER AS paper_count
            FROM solemd.graph_points g
            JOIN solemd.corpus c ON c.corpus_id = g.corpus_id
            JOIN pubtator.entity_annotations ea ON ea.pmid = c.pmid
            JOIN solemd.entity_rule er
                ON er.entity_type = ea.entity_type AND er.concept_id = ea.concept_id
            WHERE g.graph_run_id = %s
              AND g.cluster_id IS NOT NULL AND g.cluster_id != 0
            GROUP BY g.cluster_id, er.family_key
            ORDER BY g.cluster_id, paper_count DESC
            """,
            (graph_run_id,),
        )
        cluster_entity_families: dict[int, dict[str, int]] = defaultdict(dict)
        for row in cur.fetchall():
            cid = int(row["cluster_id"])
            cluster_entity_families[cid][row["family_key"]] = row["paper_count"]

        # ── Top entity concepts per cluster (top 10) ──────────────
        cur.execute(
            """
            WITH entity_counts AS (
                SELECT g.cluster_id, er.canonical_name, er.family_key,
                    COUNT(DISTINCT g.corpus_id)::INTEGER AS paper_count,
                    ROW_NUMBER() OVER (
                        PARTITION BY g.cluster_id
                        ORDER BY COUNT(DISTINCT g.corpus_id) DESC
                    ) AS rn
                FROM solemd.graph_points g
                JOIN solemd.corpus c ON c.corpus_id = g.corpus_id
                JOIN pubtator.entity_annotations ea ON ea.pmid = c.pmid
                JOIN solemd.entity_rule er
                    ON er.entity_type = ea.entity_type
                   AND er.concept_id = ea.concept_id
                   AND er.confidence = 'high'
                WHERE g.graph_run_id = %s
                  AND g.cluster_id IS NOT NULL AND g.cluster_id != 0
                GROUP BY g.cluster_id, er.canonical_name, er.family_key
            )
            SELECT cluster_id, canonical_name, family_key, paper_count
            FROM entity_counts
            WHERE rn <= 10
            ORDER BY cluster_id, paper_count DESC
            """,
            (graph_run_id,),
        )
        cluster_top_entities: dict[int, list[tuple[str, str, int]]] = defaultdict(list)
        for row in cur.fetchall():
            cid = int(row["cluster_id"])
            cluster_top_entities[cid].append(
                (row["canonical_name"], row["family_key"], row["paper_count"])
            )

        # ── Top journals per cluster (strongest field signal) ────
        cur.execute(
            """
            WITH journal_counts AS (
                SELECT g.cluster_id,
                    lower(COALESCE(p.journal_name, p.venue, '')) AS journal_key,
                    COALESCE(p.journal_name, p.venue) AS journal,
                    count(*)::INTEGER AS paper_count,
                    ROW_NUMBER() OVER (
                        PARTITION BY g.cluster_id
                        ORDER BY count(*) DESC
                    ) AS rn
                FROM solemd.graph_points g
                JOIN solemd.papers p ON p.corpus_id = g.corpus_id
                WHERE g.graph_run_id = %s
                  AND g.cluster_id IS NOT NULL AND g.cluster_id != 0
                  AND COALESCE(p.journal_name, p.venue) IS NOT NULL
                GROUP BY g.cluster_id, journal_key, COALESCE(p.journal_name, p.venue)
            )
            SELECT cluster_id, journal, paper_count
            FROM journal_counts
            WHERE rn <= 5 AND paper_count >= 5
            ORDER BY cluster_id, paper_count DESC
            """,
            (graph_run_id,),
        )
        cluster_journals: dict[int, list[tuple[str, int]]] = defaultdict(list)
        for row in cur.fetchall():
            cid = int(row["cluster_id"])
            cluster_journals[cid].append((row["journal"], row["paper_count"]))

        # ── Year stats + citation average per cluster ────────────
        cur.execute(
            """
            SELECT g.cluster_id,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY p.year)::INTEGER AS median_year,
                avg(COALESCE(p.citation_count, 0))::INTEGER AS avg_citations
            FROM solemd.graph_points g
            JOIN solemd.papers p ON p.corpus_id = g.corpus_id
            WHERE g.graph_run_id = %s
              AND g.cluster_id IS NOT NULL AND g.cluster_id != 0
              AND p.year IS NOT NULL
            GROUP BY g.cluster_id
            """,
            (graph_run_id,),
        )
        cluster_year_stats: dict[int, tuple[int | None, int | None]] = {}
        for row in cur.fetchall():
            cid = int(row["cluster_id"])
            cluster_year_stats[cid] = (row["median_year"], row["avg_citations"])

    # ── Merge all signals into ClusterContext ─────────────────────
    all_cids = sorted(
        set(cluster_keywords) | set(cluster_titles)
        | set(cluster_entity_families) | set(cluster_top_entities)
        | set(cluster_journals) | set(cluster_year_stats)
    )
    contexts = []
    for cid in all_cids:
        year_stats = cluster_year_stats.get(cid, (None, None))
        contexts.append(
            ClusterContext(
                cluster_id=cid,
                member_count=cluster_member_counts.get(cid, 0),
                keywords=cluster_keywords.get(cid, []),
                titles=cluster_titles.get(cid, [])[:20],
                entity_families=dict(cluster_entity_families.get(cid, {})),
                top_entities=cluster_top_entities.get(cid, [])[:10],
                top_journals=cluster_journals.get(cid, [])[:5],
                median_year=year_stats[0],
                avg_citations=year_stats[1],
            )
        )

    logger.info(
        "Loaded label context for %d clusters (graph_run_id=%s)",
        len(contexts),
        graph_run_id,
    )
    return contexts


# ---------------------------------------------------------------------------
# LLM labeling
# ---------------------------------------------------------------------------
def _parse_label_response(text: str) -> list[dict]:
    """Parse Gemini JSON response, stripping markdown fences if present."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Strip ```json ... ``` fences
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)
    return json.loads(cleaned)


def _build_batch_prompts(
    contexts: list[ClusterContext],
    batch_size: int = 10,
    already_used_labels: list[str] | None = None,
) -> list[tuple[list[int], str]]:
    """Build (cluster_ids, prompt) pairs for each batch of clusters.

    ``already_used_labels`` seeds the used-label list so that Batch API
    submissions (which can't accumulate labels across sequential calls)
    still get the full dedup context from prior runs.
    """
    prompt_template = _get_prompt()
    used_labels: list[str] = list(already_used_labels or [])
    batches = []
    for i in range(0, len(contexts), batch_size):
        batch = contexts[i : i + batch_size]
        batch_ids = [c.cluster_id for c in batch]
        clusters_json = json.dumps(
            [
                {
                    "cluster_id": c.cluster_id,
                    "member_count": c.member_count,
                    "keywords": c.keywords,
                    "top_journals": [
                        {"name": j, "papers": cnt}
                        for j, cnt in c.top_journals[:5]
                    ],
                    "median_year": c.median_year,
                    "avg_citations": c.avg_citations,
                    "entity_families": c.entity_families,
                    "top_entities": [
                        {"name": name, "family": fam, "papers": count}
                        for name, fam, count in c.top_entities[:10]
                    ],
                    "titles": c.titles[:20],
                }
                for c in batch
            ],
            indent=2,
        )

        if used_labels:
            used_block = (
                "Labels already assigned to other clusters (DO NOT reuse these):\n"
                + ", ".join(f'"{l}"' for l in used_labels)
            )
        else:
            used_block = "No labels assigned yet — you are labeling the first batch."

        prompt = prompt_template.format(
            clusters_json=clusters_json,
            used_labels_block=used_block,
        )
        batches.append((batch_ids, prompt))

        # For sequential mode: accumulate placeholder labels so the next batch
        # sees them. Real labels replace these after parsing each response.
        # For batch mode this list is fully pre-populated and static.
        for c in batch:
            used_labels.append(f"[cluster {c.cluster_id} pending]")

    return batches


_GEMINI_SAFETY_SETTINGS = [
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
]


@observe(name=SPAN_GRAPH_LABEL_CLUSTERS)
def label_clusters_with_llm(
    graph_run_id: str,
    model: str = "gemini-2.5-flash",
    use_batch_api: bool = False,
) -> dict:
    """Label all non-noise clusters using Gemini.

    When ``use_batch_api=True``, submits all prompts via the Gemini Batch API
    for 50% cost savings (but minutes-to-hours turnaround). Default is
    sequential at 200 RPM which completes ~715 clusters in under 30 seconds.

    Returns summary dict with counts.
    """
    contexts = get_cluster_label_context(graph_run_id)
    if not contexts:
        logger.warning("No clusters to label for graph_run_id=%s", graph_run_id)
        return {"labeled": 0, "errors": 0, "total": 0}

    already_labeled = _get_llm_labeled_cluster_ids(graph_run_id)
    if already_labeled:
        before = len(contexts)
        contexts = [c for c in contexts if c.cluster_id not in already_labeled]
        logger.info(
            "Resuming: %d/%d clusters already LLM-labeled, %d remaining",
            before - len(contexts), before, len(contexts),
        )

    if not contexts:
        return {"labeled": len(already_labeled), "errors": 0, "total": len(already_labeled)}

    if use_batch_api:
        return _label_clusters_batch(graph_run_id, contexts, already_labeled, model)
    return _label_clusters_concurrent(graph_run_id, contexts, already_labeled, model)


def _label_clusters_batch(
    graph_run_id: str,
    contexts: list[ClusterContext],
    already_labeled: set[int],
    model: str,
) -> dict:
    """Submit all prompts via Gemini Batch API (50% cost, async processing)."""
    client = _get_client()
    existing_labels = _get_existing_labels(graph_run_id, already_labeled)
    prompt_batches = _build_batch_prompts(contexts, already_used_labels=existing_labels)

    # Build inline requests for the Batch API
    inline_requests = []
    for _batch_ids, prompt in prompt_batches:
        inline_requests.append({
            "contents": [{"parts": [{"text": prompt}], "role": "user"}],
            "config": {
                "response_mime_type": "application/json",
                "temperature": 0.3,
                "safety_settings": _GEMINI_SAFETY_SETTINGS,
            },
        })

    logger.info(
        "Submitting %d batch requests (%d clusters) to Gemini Batch API",
        len(inline_requests), len(contexts),
    )

    batch_job = client.batches.create(
        model=model,
        src=inline_requests,
        config={"display_name": f"cluster-labels-{graph_run_id[:8]}"},
    )
    job_name = batch_job.name
    logger.info("Batch job created: %s", job_name)

    # Poll for completion
    completed_states = {
        "JOB_STATE_SUCCEEDED",
        "JOB_STATE_FAILED",
        "JOB_STATE_CANCELLED",
        "JOB_STATE_EXPIRED",
    }
    start = time.monotonic()
    while True:
        batch_job = client.batches.get(name=job_name)
        state = batch_job.state.name if hasattr(batch_job.state, "name") else str(batch_job.state)
        if state in completed_states:
            break
        elapsed = time.monotonic() - start
        if elapsed > _BATCH_TIMEOUT:
            raise RuntimeError(
                f"Batch job {job_name} timed out after {_BATCH_TIMEOUT}s (state: {state})"
            )
        logger.info("Batch job %s: %s (%.0fs elapsed)", job_name, state, elapsed)
        time.sleep(_BATCH_POLL_INTERVAL)

    elapsed = time.monotonic() - start
    logger.info("Batch job %s completed: %s in %.0fs", job_name, state, elapsed)

    if state != "JOB_STATE_SUCCEEDED":
        raise RuntimeError(f"Batch job {job_name} ended with state: {state}")

    # Process results
    labeled_count = len(already_labeled)
    error_count = 0
    responses = batch_job.dest.inlined_responses or []

    for idx, inline_response in enumerate(responses):
        batch_ids = prompt_batches[idx][0] if idx < len(prompt_batches) else []
        if inline_response.error:
            error_count += 1
            logger.error(
                "Batch response %d (clusters %s) failed: %s",
                idx, batch_ids, inline_response.error,
            )
            continue

        try:
            text = inline_response.response.text or ""
            parsed = _parse_label_response(text)
            batch_labels = [
                ClusterLLMLabel(
                    cluster_id=int(item["cluster_id"]),
                    label=str(item["label"])[:200],
                    description=str(item.get("description", ""))[:200],
                )
                for item in parsed
            ]
            _write_llm_labels(graph_run_id, batch_labels)
            labeled_count += len(batch_labels)
        except Exception:
            error_count += 1
            logger.exception("Failed to parse batch response %d (clusters %s)", idx, batch_ids)

    # Log Langfuse trace with batch metadata
    lf = _get_langfuse()
    if lf is not None:
        try:
            lf.update_current_span(
                output={
                    "batch_job": job_name,
                    "batch_requests": len(inline_requests),
                    "batch_elapsed_s": round(elapsed, 1),
                    "labeled": labeled_count,
                    "errors": error_count,
                },
            )
        except Exception:
            pass

    _langfuse_flush()
    return {
        "labeled": labeled_count,
        "errors": error_count,
        "total": labeled_count + error_count * 10,
        "batch_job": job_name,
    }


def _label_clusters_sequential(
    graph_run_id: str,
    contexts: list[ClusterContext],
    already_labeled: set[int],
    model: str,
) -> dict:
    """Label clusters with synchronous sequential requests (fallback).

    In sequential mode, used labels accumulate across batches so each
    subsequent batch knows which labels are taken.
    """
    client = _get_client()
    existing_labels = _get_existing_labels(graph_run_id, already_labeled)
    used_labels = list(existing_labels)
    prompt_template = _get_prompt()
    labeled_count = len(already_labeled)
    error_count = 0
    batch_size = 10

    for i in range(0, len(contexts), batch_size):
        batch = contexts[i : i + batch_size]
        batch_ids = [c.cluster_id for c in batch]
        clusters_json = json.dumps(
            [
                {
                    "cluster_id": c.cluster_id,
                    "member_count": c.member_count,
                    "keywords": c.keywords,
                    "top_journals": [
                        {"name": j, "papers": cnt}
                        for j, cnt in c.top_journals[:5]
                    ],
                    "median_year": c.median_year,
                    "avg_citations": c.avg_citations,
                    "entity_families": c.entity_families,
                    "top_entities": [
                        {"name": name, "family": fam, "papers": count}
                        for name, fam, count in c.top_entities[:10]
                    ],
                    "titles": c.titles[:20],
                }
                for c in batch
            ],
            indent=2,
        )

        if used_labels:
            used_block = (
                "Labels already assigned to other clusters (DO NOT reuse these):\n"
                + ", ".join(f'"{l}"' for l in used_labels)
            )
        else:
            used_block = "No labels assigned yet — you are labeling the first batch."

        prompt = prompt_template.format(
            clusters_json=clusters_json,
            used_labels_block=used_block,
        )

        try:
            raw = _rate_limited_generate(
                client,
                model=model,
                contents=prompt,
                batch_cluster_ids=batch_ids,
            )
            parsed = _parse_label_response(raw)

            batch_labels = [
                ClusterLLMLabel(
                    cluster_id=int(item["cluster_id"]),
                    label=str(item["label"])[:200],
                    description=str(item.get("description", ""))[:200],
                )
                for item in parsed
            ]

            _write_llm_labels(graph_run_id, batch_labels)
            labeled_count += len(batch_labels)

            # Accumulate real labels for dedup in subsequent batches
            for lbl in batch_labels:
                used_labels.append(lbl.label)

            logger.info(
                "Labeled batch %d-%d (%d clusters, %d total)",
                batch_ids[0], batch_ids[-1], len(parsed), labeled_count,
            )
        except Exception:
            error_count += 1
            logger.exception("Failed to label batch %d-%d", batch_ids[0], batch_ids[-1])

        _langfuse_flush()

    return {"labeled": labeled_count, "errors": error_count, "total": labeled_count + error_count * 10}


_CONCURRENT_WORKERS = 8


def _label_clusters_concurrent(
    graph_run_id: str,
    contexts: list[ClusterContext],
    already_labeled: set[int],
    model: str,
) -> dict:
    """Label clusters with concurrent Gemini requests.

    Fires up to ``_CONCURRENT_WORKERS`` requests in parallel. Each request
    gets the dedup context from already-labeled clusters (from DB) but not
    from sister concurrent requests — a post-hoc dedup pass isn't needed
    because the v4 prompt's rule 11 + used_labels_block prevents most
    collisions, and the agentic review catches any remaining dupes.

    Results are written to DB per-batch as they complete, so partial runs
    survive interruption.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    client = _get_client()
    existing_labels = _get_existing_labels(graph_run_id, already_labeled)
    prompt_batches = _build_batch_prompts(contexts, already_used_labels=existing_labels)

    labeled_count = len(already_labeled)
    error_count = 0

    logger.info(
        "Concurrent labeling: %d batches, %d workers, %d clusters",
        len(prompt_batches), _CONCURRENT_WORKERS, len(contexts),
    )

    def _process_batch(batch_ids: list[int], prompt: str) -> list[ClusterLLMLabel]:
        raw = _rate_limited_generate(
            client, model=model, contents=prompt, batch_cluster_ids=batch_ids,
        )
        parsed = _parse_label_response(raw)
        return [
            ClusterLLMLabel(
                cluster_id=int(item["cluster_id"]),
                label=str(item["label"])[:200],
                description=str(item.get("description", ""))[:200],
            )
            for item in parsed
        ]

    with ThreadPoolExecutor(max_workers=_CONCURRENT_WORKERS) as pool:
        futures = {
            pool.submit(_process_batch, batch_ids, prompt): batch_ids
            for batch_ids, prompt in prompt_batches
        }
        for future in as_completed(futures):
            batch_ids = futures[future]
            try:
                batch_labels = future.result()
                _write_llm_labels(graph_run_id, batch_labels)
                labeled_count += len(batch_labels)
                logger.info(
                    "Labeled batch %d-%d (%d clusters, %d total)",
                    batch_ids[0], batch_ids[-1], len(batch_labels), labeled_count,
                )
            except Exception:
                error_count += 1
                logger.exception("Failed to label batch %d-%d", batch_ids[0], batch_ids[-1])

    _langfuse_flush()
    return {"labeled": labeled_count, "errors": error_count, "total": labeled_count + error_count * 10}


def _get_llm_labeled_cluster_ids(graph_run_id: str) -> set[int]:
    """Return cluster IDs that already have LLM labels (for resume support)."""
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT cluster_id FROM solemd.graph_clusters
            WHERE graph_run_id = %s AND label_mode = 'llm'
            """,
            (graph_run_id,),
        )
        return {int(row["cluster_id"]) for row in cur.fetchall()}


def _get_existing_labels(graph_run_id: str, cluster_ids: set[int]) -> list[str]:
    """Return labels already assigned to clusters (for dedup context)."""
    if not cluster_ids:
        return []
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT label FROM solemd.graph_clusters
            WHERE graph_run_id = %s AND label_mode = 'llm'
              AND label IS NOT NULL
            ORDER BY member_count DESC
            """,
            (graph_run_id,),
        )
        return [row["label"] for row in cur.fetchall()]


def _write_llm_labels(graph_run_id: str, labels: list[ClusterLLMLabel]) -> None:
    """Persist LLM labels back to graph_clusters."""
    with db.connect() as conn, conn.cursor() as cur:
        cur.executemany(
            """
            UPDATE solemd.graph_clusters
            SET label = %s,
                label_mode = 'llm',
                label_source = 'gemini',
                description = %s,
                updated_at = now()
            WHERE graph_run_id = %s
              AND cluster_id = %s
            """,
            [
                (lbl.label, lbl.description, graph_run_id, lbl.cluster_id)
                for lbl in labels
            ],
        )
        conn.commit()
    logger.info("Wrote %d LLM labels to graph_clusters", len(labels))


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
@observe(name=SPAN_GRAPH_LABEL_RELABEL, capture_input=False, capture_output=False)
def relabel_graph_run(graph_run_id: str) -> dict:
    """Full relabeling pipeline: LLM labels for leaf clusters.

    Labels all non-noise clusters with Gemini (batched, rate-limited).

    Returns summary dict.
    """
    lf = _get_langfuse()
    if lf is not None:
        lf.update_current_span(
            input={"graph_run_id": graph_run_id},
        )

    logger.info("Starting relabel pipeline for graph_run_id=%s", graph_run_id)

    label_result = label_clusters_with_llm(graph_run_id)
    logger.info(
        "LLM labeling complete: %d labeled, %d errors",
        label_result["labeled"],
        label_result["errors"],
    )

    # Push scores to the trace
    lf = _get_langfuse()
    if lf is not None:
        try:
            lf.score_current_trace(
                name=SCORE_GRAPH_CLUSTER_LABELED,
                value=float(label_result["labeled"]),
            )
            lf.score_current_trace(
                name=SCORE_GRAPH_CLUSTER_ERRORS,
                value=float(label_result["errors"]),
            )
            lf.score_current_trace(
                name=SCORE_GRAPH_CLUSTER_TOTAL,
                value=float(label_result.get("total", label_result["labeled"] + label_result["errors"])),
            )
        except Exception:
            logger.debug("Failed to push cluster labeling scores", exc_info=True)

    result = {
        "graph_run_id": graph_run_id,
        "llm_labeling": label_result,
    }

    if lf is not None:
        lf.update_current_span(output=result)

    _langfuse_flush()

    return result
