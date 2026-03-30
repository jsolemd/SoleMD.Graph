"""Generate cluster labels using c-TF-IDF (class-based TF-IDF).

c-TF-IDF is the industry-standard method for labeling text clusters,
used by BERTopic and widely adopted.  It weights terms by how distinctive
they are to each cluster versus the entire corpus, producing meaningful
labels instead of surfacing common words like "the / and / for".

Each cluster gets a single top term, title-cased.  When two clusters
share the same top term, the second-ranked term is used as a qualifier
to produce a unique label (e.g. "Neuropathic Pain" or "Pain & Delirium").
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass

import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.preprocessing import normalize

logger = logging.getLogger(__name__)


# Biomedical boilerplate that sklearn's english list doesn't cover.
# These appear in virtually every PubMed abstract and never differentiate
# clusters.  Extend sparingly — prefer max_df filtering over growing this.
_BIOMEDICAL_STOPWORDS = frozenset({
    "abstract", "aim", "aims", "article", "associated", "available",
    "background", "based", "case", "cases", "clinical", "cohort",
    "compared", "conclusion", "conclusions", "control", "data",
    "demonstrated", "design", "determine", "disease", "effect",
    "effects", "evidence", "findings", "group", "groups", "health",
    "however", "identified", "included", "including", "increase",
    "increased", "intervention", "introduction", "investigate",
    "investigated", "level", "levels", "literature", "main",
    "material", "materials", "measured", "method", "methods",
    "model", "novel", "objective", "objectives", "observed",
    "obtained", "outcome", "outcomes", "participants", "patient",
    "patients", "performed", "population", "present", "primary",
    "procedure", "purpose", "ratio", "received", "recent",
    "related", "reported", "research", "respectively", "result",
    "results", "review", "risk", "role", "sample", "setting",
    "showed", "shown", "significant", "significantly", "studies",
    "study", "subjects", "suggest", "syndrome", "system",
    "total", "treatment", "trials", "use", "used", "using", "values",
})


@dataclass(frozen=True, slots=True)
class ClusterLabel:
    cluster_id: int
    label: str
    label_mode: str
    label_source: str


def _ctfidf_top_terms(
    cluster_texts: dict[int, list[str]],
    *,
    top_n: int = 3,
) -> tuple[dict[int, list[str]], set[str]]:
    """Extract the most distinctive terms per cluster using c-TF-IDF.

    1. Merge all documents per cluster into one mega-document.
    2. Fit a CountVectorizer with sklearn's english stopwords + biomedical
       extensions + max_df/min_df frequency filtering.
    3. Apply class-based IDF: log(total_original_docs / term_freq_across_clusters).
    4. L1-normalize per cluster.
    5. Pick top terms per cluster.

    Returns:
        terms_by_cluster: {cluster_id: [term_strings]}
        bigram_features: set of bigram features present in the vocabulary
    """
    cluster_ids = sorted(cid for cid in cluster_texts if cid != 0)
    if not cluster_ids:
        return {}, set()

    # Merge documents per cluster into mega-documents
    merged_docs: list[str] = []
    total_original_docs = 0
    for cid in cluster_ids:
        texts = cluster_texts[cid]
        total_original_docs += len(texts)
        merged_docs.append(" ".join(texts))

    vectorizer = CountVectorizer(
        stop_words="english",
        max_df=0.80,
        min_df=1,
        ngram_range=(1, 2),
        max_features=10_000,
        token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z0-9-]{2,}\b",
    )

    try:
        tf_matrix = vectorizer.fit_transform(merged_docs)
    except ValueError:
        return {cid: [] for cid in cluster_ids}, set()

    feature_names = vectorizer.get_feature_names_out()

    # Filter biomedical stopwords from the vocabulary post-hoc
    bio_mask = np.array([
        not any(token in _BIOMEDICAL_STOPWORDS for token in name.split())
        for name in feature_names
    ])
    tf_matrix = tf_matrix[:, bio_mask]
    feature_names = feature_names[bio_mask]

    if tf_matrix.shape[1] == 0:
        return {cid: [] for cid in cluster_ids}, set()

    # Collect bigram features for natural compound detection
    bigram_features = {str(f) for f in feature_names if " " in str(f)}

    # c-TF-IDF: class-based IDF using total original document count
    df = np.squeeze(np.asarray(tf_matrix.sum(axis=0)))
    df = np.maximum(df, 1)
    idf = np.log(total_original_docs / df)
    idf_diag = sparse.diags(idf)

    ctfidf = tf_matrix * idf_diag
    ctfidf = normalize(ctfidf, axis=1, norm="l1")

    # Extract top terms per cluster
    terms_result: dict[int, list[str]] = {}

    for idx, cid in enumerate(cluster_ids):
        row = np.squeeze(np.asarray(ctfidf[idx].todense()))
        top_indices = row.argsort()[::-1][:top_n]

        terms: list[str] = []
        for i in top_indices:
            if row[i] <= 0:
                break
            terms.append(str(feature_names[i]))

        terms_result[cid] = terms

    return terms_result, bigram_features


def _deduplicate_labels(
    terms_by_cluster: dict[int, list[str]],
    bigram_features: set[str],
) -> dict[int, str]:
    """Produce unique labels from c-TF-IDF top terms.

    1. Assign top-1 term (title-cased) as each cluster's label.
    2. Detect exact duplicates across clusters.
    3. For each duplicate group, qualify with the second term:
       - If "{term2} {term1}" is a known bigram, use natural compound
         (e.g. "Neuropathic Pain").
       - Otherwise use "{term1} & {term2}" (e.g. "Pain & Delirium").
    4. Fallback: append cluster ID if no second term is available.
    """
    # First pass: assign top-1 term
    labels: dict[int, str] = {}
    for cid, terms in terms_by_cluster.items():
        labels[cid] = terms[0].title() if terms else f"Cluster {cid}"

    # Find duplicates
    label_counts = Counter(labels.values())
    duplicates = {label for label, count in label_counts.items() if count > 1}

    if not duplicates:
        return labels

    # Second pass: disambiguate duplicates using second term
    for cid, terms in terms_by_cluster.items():
        if labels[cid] not in duplicates:
            continue

        if len(terms) >= 2:
            t1, t2 = terms[0], terms[1]
            # Check if "term2 term1" forms a natural bigram
            compound = f"{t2} {t1}"
            if compound in bigram_features:
                labels[cid] = compound.title()
            else:
                labels[cid] = f"{t1.title()} & {t2.title()}"
        else:
            labels[cid] = f"{labels[cid]} ({cid})"

    return labels


def load_vocabulary_terms(
    *,
    min_paper_count: int = 100,
    entity_types: tuple[str, ...] = ("disease", "chemical"),
) -> dict[str, str]:
    """Load canonical entity names from solemd.entities.

    Returns a {lowercase_name: canonical_name} lookup dict, filtered to
    entities with at least ``min_paper_count`` papers and matching
    ``entity_types`` to avoid noise from gene aliases and cell lines.

    Falls back to an empty dict if the table doesn't exist yet.
    """
    from app import db

    placeholders = ", ".join(["%s"] * len(entity_types))
    query = f"""
        SELECT canonical_name
        FROM solemd.entities
        WHERE paper_count >= %s
          AND canonical_name IS NOT NULL
          AND canonical_name != ''
          AND entity_type IN ({placeholders})
    """
    vocab: dict[str, str] = {}
    try:
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute(query, (min_paper_count, *entity_types))
            for row in cur.fetchall():
                name = row["canonical_name"]
                vocab[name.lower()] = name
    except Exception:
        logger.warning("Could not load vocabulary from solemd.entities — using empty vocab")
    return vocab


def get_cluster_keyword_context(
    graph_run_id: str,
    top_n_keywords: int = 10,
    top_n_titles: int = 20,
) -> dict[int, dict]:
    """Return c-TF-IDF keywords and representative titles per cluster.

    Used by llm_labels.py as context for LLM-based labeling.
    Returns {cluster_id: {"keywords": [...], "titles": [...]}}.
    """
    from app import db
    from app.graph.build import _load_cluster_texts

    cluster_texts = _load_cluster_texts(graph_run_id=graph_run_id)
    terms_by_cluster, _ = _ctfidf_top_terms(cluster_texts, top_n=top_n_keywords)

    # Fetch top papers by citation count per cluster for representative titles
    titles_by_cluster: dict[int, list[str]] = {}
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            WITH ranked AS (
                SELECT
                    g.cluster_id,
                    p.title,
                    row_number() OVER (
                        PARTITION BY g.cluster_id
                        ORDER BY COALESCE(p.citation_count, 0) DESC, g.corpus_id
                    ) AS rn
                FROM solemd.graph_points g
                JOIN solemd.papers p ON p.corpus_id = g.corpus_id
                WHERE g.graph_run_id = %s
                  AND g.cluster_id != 0
                  AND p.title IS NOT NULL
            )
            SELECT cluster_id, title
            FROM ranked
            WHERE rn <= %s
            ORDER BY cluster_id, rn
            """,
            (graph_run_id, top_n_titles),
        )
        for row in cur.fetchall():
            cid = int(row["cluster_id"])
            titles_by_cluster.setdefault(cid, []).append(row["title"])

    result: dict[int, dict] = {}
    for cid in sorted(set(terms_by_cluster) | set(titles_by_cluster)):
        result[cid] = {
            "keywords": terms_by_cluster.get(cid, []),
            "titles": titles_by_cluster.get(cid, []),
        }
    return result


def build_cluster_labels(
    cluster_texts: dict[int, list[str]],
) -> list[ClusterLabel]:
    """Build labels for all clusters. Cluster 0 is always labeled 'Noise'.

    Each cluster gets the single most distinctive c-TF-IDF term,
    title-cased for display. Duplicate labels are disambiguated using
    the second-ranked term as a qualifier.
    """
    top_terms, bigram_features = _ctfidf_top_terms(cluster_texts)
    unique_labels = _deduplicate_labels(top_terms, bigram_features)

    labels: list[ClusterLabel] = []
    for cluster_id in sorted(cluster_texts):
        if cluster_id == 0:
            labels.append(
                ClusterLabel(
                    cluster_id=cluster_id,
                    label="Noise",
                    label_mode="fixed",
                    label_source="system",
                )
            )
            continue

        label = unique_labels.get(cluster_id, f"Cluster {cluster_id}")

        labels.append(
            ClusterLabel(
                cluster_id=cluster_id,
                label=label,
                label_mode="ctfidf",
                label_source="ctfidf",
            )
        )
    return labels
