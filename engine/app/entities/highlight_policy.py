"""Single-source highlight eligibility policy for entity aliases.

The AMBIGUOUS set gates which canonical alias keys are excluded from
entity highlighting.  Words here are still searchable (mode = disabled
means 'no highlight', not 'invisible').  The list is derived from
standard NLP English stopword corpora (sklearn, spaCy, NLTK) plus
short biomedical-ambiguous words that overlap common English.
"""

from __future__ import annotations

HIGHLIGHT_MODE_EXACT = "exact"
HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT = "case_sensitive_exact"
HIGHLIGHT_MODE_SEARCH_ONLY = "search_only"
HIGHLIGHT_MODE_DISABLED = "disabled"
HIGHLIGHT_RUNTIME_MODES: tuple[str, ...] = (
    HIGHLIGHT_MODE_EXACT,
    HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT,
)
HIGHLIGHT_ELIGIBLE_ALIAS_SOURCES: tuple[str, ...] = (
    "umls",
    "umls_tradename",
    "vocab",
)

# ---------------------------------------------------------------------------
# English stopwords and short ambiguous words that should never be highlighted
# even when they appear as canonical entity names.  Sourced from the union of
# sklearn.feature_extraction.text.ENGLISH_STOP_WORDS, spaCy en_core_web_sm
# stop_words, and NLTK english stopwords — filtered to single words ≤12 chars.
# Domain-ambiguous short words (gene symbols that collide with English) are
# appended at the end.
# ---------------------------------------------------------------------------
AMBIGUOUS_CANONICAL_ALIAS_KEYS: frozenset[str] = frozenset({
    # ── Articles, determiners, pronouns ──
    "a", "an", "the",
    "this", "that", "these", "those",
    "my", "your", "his", "her", "its", "our", "their",
    "me", "him", "us", "them",
    "i", "we", "you", "he", "she", "it", "they",
    "who", "whom", "whose", "which", "what",
    "myself", "yourself", "himself", "herself", "itself",
    "ourselves", "themselves",
    "each", "every", "both", "all", "any", "few", "more", "most",
    "other", "some", "such", "no", "nor", "own",
    # ── Prepositions ──
    "at", "by", "for", "from", "in", "into", "of", "off", "on",
    "onto", "out", "over", "per", "to", "up", "upon", "with",
    "about", "above", "across", "after", "against", "along",
    "among", "around", "as", "before", "behind", "below",
    "beneath", "beside", "besides", "between", "beyond",
    "but", "despite", "down", "during", "except", "inside",
    "near", "next", "outside", "past", "since", "through",
    "throughout", "toward", "towards", "under", "underneath",
    "unlike", "until", "within", "without",
    # ── Conjunctions ──
    "and", "or", "nor", "so", "yet", "than", "whether",
    "although", "because", "however", "therefore", "moreover",
    "furthermore", "nevertheless", "otherwise", "whereas",
    # ── Auxiliary / modal verbs ──
    "am", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "having",
    "do", "does", "did", "doing", "done",
    "can", "could", "may", "might", "must", "shall", "should",
    "will", "would",
    # ── Common verbs / verb forms ──
    "get", "got", "go", "went", "gone", "come", "came",
    "make", "made", "take", "took", "taken", "give", "gave",
    "keep", "kept", "let", "put", "say", "said", "see", "saw",
    "seem", "show", "shown", "tell", "told", "think", "know",
    "knew", "known", "find", "found", "give", "given",
    "become", "became", "call", "called",
    # ── Adverbs ──
    "also", "always", "ever", "never", "now", "then",
    "here", "there", "where", "when", "how", "why",
    "just", "only", "very", "too", "quite", "rather",
    "still", "already", "often", "sometimes", "usually",
    "well", "much", "even", "back", "else", "enough",
    "perhaps", "really", "almost", "anyway",
    # ── Negation / affirmation ──
    "not", "yes",
    # ── Quantifiers / number words ──
    "one", "two", "three", "four", "five", "six", "first",
    "last", "many", "several", "less", "least", "more", "most",
    # ── Common nouns too generic for entity highlighting ──
    "part", "role", "case", "form", "type", "kind", "sort",
    "way", "end", "side", "area", "line", "point", "place",
    "name", "time", "year", "day", "work", "fact", "thing",
    "use", "need", "set", "act", "key", "map",
    "data", "text", "rest", "fast",
    # ── Biomedical-ambiguous short words (gene/protein symbols that ──
    # ── collide with common English; safe to exclude from highlight) ──
    "cell", "gene", "test", "risk", "rate", "loss", "lead",
    "base", "dose", "mark", "mass", "peak", "salt", "term",
    "unit", "age", "aim", "aid", "arm", "bed", "cap", "care",
    "coat", "copy", "core", "cost", "cure", "diet", "drop",
    "drug", "face", "fall", "feed", "film", "fire", "fish",
    "flag", "flow", "fold", "food", "foot", "gain", "gap",
    "goal", "gold", "grip", "grow", "half", "hand", "harm",
    "head", "heat", "help", "high", "host", "lack", "late",
    "left", "life", "link", "load", "lock", "long", "loop",
    "main", "mean", "mild", "mind", "miss", "mode", "move",
    "node", "note", "open", "oral", "pair", "pass", "path",
    "plan", "play", "plot", "pool", "poor", "post", "pull",
    "pump", "push", "rare", "read", "rise", "root", "rule",
    "safe", "same", "save", "seed", "self", "ship", "sign",
    "site", "size", "skin", "slow", "snap", "soft", "sole",
    "span", "spot", "star", "stem", "step", "stop", "sure",
    "tail", "task", "thin", "tied", "tool", "tops", "tree",
    "trim", "true", "tube", "turn", "vary", "view", "walk",
    "wall", "ward", "wash", "wave", "weak", "wide", "wild",
    "wire", "zone",
})


def resolve_highlight_mode(
    *, alias_text: str, alias_key: str, is_canonical: bool,
    alias_source: str = "",
) -> str:
    """Determine the highlight_mode for an entity alias row.

    Vocab-sourced aliases (UMLS brand names, preferred synonyms) are promoted
    to highlight-eligible even when not canonical, because they are curated
    and clinically recognizable (e.g. "Haldol" for haloperidol).
    """
    if alias_key in AMBIGUOUS_CANONICAL_ALIAS_KEYS:
        return HIGHLIGHT_MODE_DISABLED
    if alias_source in HIGHLIGHT_ELIGIBLE_ALIAS_SOURCES:
        if alias_text == alias_text.upper() and len(alias_text) <= 6:
            return HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT
        return HIGHLIGHT_MODE_EXACT
    if not is_canonical:
        return HIGHLIGHT_MODE_SEARCH_ONLY
    if alias_text == alias_text.upper() and len(alias_text) <= 6:
        return HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT
    return HIGHLIGHT_MODE_EXACT
