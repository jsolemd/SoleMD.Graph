"""Generate cluster labels using c-TF-IDF (class-based TF-IDF).

c-TF-IDF is the industry-standard method for labeling text clusters,
used by BERTopic and widely adopted.  It weights terms by how distinctive
they are to each cluster versus the entire corpus, producing meaningful
labels instead of surfacing common words like "the / and / for".

When a vocabulary is provided (from solemd.entities), entity terms get a
score boost during c-TF-IDF ranking so they are preferentially selected
as cluster labels over generic words.  The canonical form from the
vocabulary replaces the raw extracted term in the final label.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.preprocessing import normalize

logger = logging.getLogger(__name__)

# Boost factor applied to c-TF-IDF scores for terms matching the vocabulary.
# 3x means an entity term needs only ~1/3 the raw statistical distinctiveness
# of a non-entity term to win a top-N slot.
VOCAB_BOOST = 3.0


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


def _build_vocab_index(
    feature_names: np.ndarray,
    vocab: dict[str, str],
) -> tuple[np.ndarray, dict[int, str]]:
    """Build a boolean mask and canonical-name map for features matching vocab.

    Returns:
        mask: boolean array, True for features that match a vocab entry.
        canonical_map: {feature_index: canonical_name} for matched features.
    """
    mask = np.zeros(len(feature_names), dtype=bool)
    canonical_map: dict[int, str] = {}

    # Build reverse index: for each vocab entry, store all its word tokens
    # so we can match both unigrams and bigrams efficiently.
    vocab_lower = set(vocab.keys())

    for i, name in enumerate(feature_names):
        key = name.lower()

        # Exact match: "delirium" or "serotonin syndrome"
        if key in vocab_lower:
            mask[i] = True
            canonical_map[i] = vocab[key]
            continue

        # Partial match: unigram/bigram is a component of a canonical name.
        # Only for terms >= 5 chars to avoid noise.
        if len(key) >= 5:
            for vocab_key, canonical in vocab.items():
                if vocab_key.startswith(key + " ") or vocab_key.endswith(" " + key):
                    mask[i] = True
                    canonical_map[i] = canonical
                    break

    return mask, canonical_map


def _ctfidf_top_terms(
    cluster_texts: dict[int, list[str]],
    *,
    top_n: int = 3,
    vocab: dict[str, str] | None = None,
    vocab_boost: float = VOCAB_BOOST,
) -> tuple[dict[int, list[str]], dict[int, bool]]:
    """Extract the most distinctive terms per cluster using c-TF-IDF.

    1. Merge all documents per cluster into one mega-document.
    2. Fit a CountVectorizer with sklearn's english stopwords + biomedical
       extensions + max_df/min_df frequency filtering.
    3. Apply class-based IDF: log(total_original_docs / term_freq_across_clusters).
    4. L1-normalize per cluster.
    5. If vocab provided, boost scores for entity terms by ``vocab_boost``.
    6. Pick top terms, using canonical forms for vocab-matched terms.

    Returns:
        terms_by_cluster: {cluster_id: [term_strings]}
        vocab_matched: {cluster_id: True if any term was vocab-boosted}
    """
    cluster_ids = sorted(cid for cid in cluster_texts if cid != 0)
    if not cluster_ids:
        return {}, {}

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
        return {cid: [] for cid in cluster_ids}, {cid: False for cid in cluster_ids}

    feature_names = vectorizer.get_feature_names_out()

    # Filter biomedical stopwords from the vocabulary post-hoc
    bio_mask = np.array([
        not any(token in _BIOMEDICAL_STOPWORDS for token in name.split())
        for name in feature_names
    ])
    tf_matrix = tf_matrix[:, bio_mask]
    feature_names = feature_names[bio_mask]

    if tf_matrix.shape[1] == 0:
        return {cid: [] for cid in cluster_ids}, {cid: False for cid in cluster_ids}

    # c-TF-IDF: class-based IDF using total original document count
    df = np.squeeze(np.asarray(tf_matrix.sum(axis=0)))
    df = np.maximum(df, 1)
    idf = np.log(total_original_docs / df)
    idf_diag = sparse.diags(idf)

    ctfidf = tf_matrix * idf_diag
    ctfidf = normalize(ctfidf, axis=1, norm="l1")

    # Build vocab boost mask if vocabulary is available
    vocab_mask: np.ndarray | None = None
    canonical_map: dict[int, str] = {}
    if vocab:
        vocab_mask, canonical_map = _build_vocab_index(feature_names, vocab)
        if canonical_map:
            logger.info(
                "Vocab boost: %d of %d features matched canonical entities",
                len(canonical_map), len(feature_names),
            )

    # Extract top terms per cluster with vocab boosting
    terms_result: dict[int, list[str]] = {}
    matched_result: dict[int, bool] = {}

    for idx, cid in enumerate(cluster_ids):
        row = np.squeeze(np.asarray(ctfidf[idx].todense()))

        # Apply vocab boost: multiply entity term scores so they rank higher
        if vocab_mask is not None and vocab_mask.any():
            boosted = row.copy()
            boosted[vocab_mask] *= vocab_boost
        else:
            boosted = row

        top_indices = boosted.argsort()[::-1][:top_n]

        terms: list[str] = []
        has_match = False
        for i in top_indices:
            if row[i] <= 0:
                break
            if i in canonical_map:
                terms.append(canonical_map[i])
                has_match = True
            else:
                terms.append(feature_names[i])

        terms_result[cid] = terms
        matched_result[cid] = has_match

    return terms_result, matched_result


def load_vocabulary_terms(*, min_paper_count: int = 10) -> dict[str, str]:
    """Load canonical entity names from solemd.entities.

    Returns a {lowercase_name: canonical_name} lookup dict, filtered to
    entities with at least ``min_paper_count`` papers to avoid noise.

    Falls back to an empty dict if the table doesn't exist yet.
    """
    from app import db

    query = """
        SELECT canonical_name
        FROM solemd.entities
        WHERE paper_count >= %s
          AND canonical_name IS NOT NULL
          AND canonical_name != ''
    """
    vocab: dict[str, str] = {}
    try:
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute(query, (min_paper_count,))
            for row in cur.fetchall():
                name = row["canonical_name"]
                vocab[name.lower()] = name
    except Exception:
        logger.warning("Could not load vocabulary from solemd.entities — using empty vocab")
    return vocab


def _match_vocab_term(term: str, vocab: dict[str, str]) -> str | None:
    """Match a single term against the vocabulary.

    Tries exact match first, then checks if any canonical name
    contains the term as a word boundary component.

    Returns the canonical form if matched, None otherwise.
    """
    key = term.lower()

    if key in vocab:
        return vocab[key]

    if len(key) >= 5:
        for vocab_key, canonical in vocab.items():
            if vocab_key.startswith(key + " ") or vocab_key.endswith(" " + key):
                return canonical

    return None


def build_cluster_labels(
    cluster_texts: dict[int, list[str]],
    *,
    vocab_terms: dict[str, str] | None = None,
) -> list[ClusterLabel]:
    """Build labels for all clusters. Cluster 0 is always labeled 'Noise'.

    When ``vocab_terms`` is provided, entity terms receive a score boost
    during c-TF-IDF ranking so they are preferentially selected over
    generic words.  Matched terms use the canonical form from the vocabulary.
    """
    top_terms, vocab_matched = _ctfidf_top_terms(
        cluster_texts,
        vocab=vocab_terms,
    )

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

        terms = top_terms.get(cluster_id, [])
        has_match = vocab_matched.get(cluster_id, False)

        if terms:
            # Canonical terms from vocab are already in proper case;
            # non-vocab terms get .title() casing.
            display_terms = []
            for term in terms:
                if vocab_terms and _match_vocab_term(term, vocab_terms):
                    # Already canonical form from _ctfidf_top_terms
                    display_terms.append(term)
                else:
                    display_terms.append(term.title())
            label = " / ".join(display_terms)
        else:
            label = f"Cluster {cluster_id}"

        labels.append(
            ClusterLabel(
                cluster_id=cluster_id,
                label=label,
                label_mode="ctfidf",
                label_source="ctfidf+vocab" if has_match else "title_terms",
            )
        )
    return labels
