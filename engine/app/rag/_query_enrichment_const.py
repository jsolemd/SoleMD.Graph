"""Constants and data types for query enrichment.

This module is the single source of truth for all tuning parameters
and vocabulary sets. It has no imports from sibling rag modules to
avoid circular dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.rag.types import QueryRetrievalProfile  # noqa: F401 — re-exported

MAX_QUERY_PHRASE_TOKENS = 4
MAX_QUERY_PHRASES = 48
MAX_ENTITY_RESOLUTION_PHRASES = 12
MIN_EXACT_TITLE_PRECHECK_CHARS = 96
MIN_EXACT_TITLE_PRECHECK_WORDS = 12
MAX_TITLE_LIKE_QUERY_CHARS = 220
MAX_TITLE_LIKE_QUERY_WORDS = 24
MAX_EXTENDED_TITLE_LIKE_QUERY_WORDS = 40
MAX_TITLE_SUBTITLE_WORDS = 10
MAX_AUTO_RELATION_QUERY_WORDS = 12
MIN_CHUNK_LEXICAL_QUERY_WORDS = 4
MIN_EXTENDED_TITLE_LIKE_QUERY_CHARS = 120
MAX_ENTITY_ACRONYM_TOKEN_CHARS = 8
MIN_ENTITY_PROPER_NOUN_CHARS = 4
DEFAULT_QUERY_SYMBOLS = frozenset({":", "-", "_"})
ENTITY_QUERY_SYMBOLS = frozenset({":", "-", "_", "/", "+"})
RUNTIME_ENTITY_NOISE_TOKENS = frozenset(
    {
        "a",
        "an",
        "and",
        "association",
        "associations",
        "at",
        "by",
        "comparison",
        "comparisons",
        "diagnosis",
        "effect",
        "effects",
        "evaluation",
        "evaluations",
        "for",
        "from",
        "impact",
        "impacts",
        "in",
        "incidence",
        "management",
        "of",
        "on",
        "or",
        "outcome",
        "outcomes",
        "overview",
        "prevalence",
        "review",
        "risk",
        "risks",
        "role",
        "roles",
        "studies",
        "study",
        "to",
        "use",
        "uses",
        "utility",
        "with",
        "without",
    }
)
PROSE_CLAUSE_TOKENS = frozenset(
    {
        "aimed",
        "before",
        "during",
        "after",
        "because",
        "emerged",
        "measured",
        "proposed",
        "that",
        "which",
        "were",
        "was",
        "is",
        "are",
        "had",
        "has",
        "have",
        # Narrow paraphrase markers — "from" (causal origin) and "against"
        # (adversarial comparison) rarely appear inside legitimate paper
        # titles but are common in natural-language paraphrases that should
        # flip out of the title lane (e.g. "liver problems from psychiatric
        # medications", "efficacy against placebo controls").
        "from",
        "against",
    }
)
SENTENCE_OPENING_PREFIXES = frozenset(
    {
        ("this",),
        ("these",),
        ("those",),
        ("we",),
        ("our",),
        ("here",),
        ("in", "this"),
        ("this", "is"),
        ("this", "study"),
        ("we", "show"),
        ("we", "investigated"),
        ("our", "results"),
    }
)
STATISTICAL_ANCHOR_PREFIXES = frozenset({"p", "n", "r"})

NEGATION_SIGNALS = frozenset(
    {"not", "without", "vs", "versus", "nor", "neither", "none"}
)
SHORT_KEYWORD_TITLE_PUNCT = frozenset({":", ";", "?", "!", ".", "—", "–"})
MAX_SHORT_KEYWORD_TOKENS = 3
COMPARISON_PREFIXES = (
    "difference between",
    "compared to",
    "risk of",
    "effect of",
    "association between",
    "relationship between",
    "role of",
    "impact of",
    "incidence of",
    "prevalence of",
)
INTERROGATIVE_OPENERS = frozenset(
    {
        "what",
        "how",
        "why",
        "does",
        "is",
        "can",
        "are",
        "which",
        "do",
        "could",
        "should",
        "when",
        "where",
    }
)

# Narrow paraphrase markers that indicate colloquial "X from/against Y"
# shape. Deliberately narrower than PROSE_CLAUSE_TOKENS — these two are
# the only prose markers that reliably distinguish paraphrased lay-speak
# queries ("liver problems from psychiatric medications") from clinical
# passage claims ("structure undergoes remodeling during development").
PARAPHRASE_MARKER_TOKENS = frozenset({"from", "against"})

# Upper bound on paraphrase query length. Real paraphrases are short lay
# descriptions (all observed semantic_recall_v2 seeds are ≤ 9 tokens);
# anything longer is almost certainly a full clinical sentence that
# belongs in the passage lane even if our passage-verb set does not
# recognize the specific verb it uses. This cap keeps Rule B from
# regressing the SENTENCE_GLOBAL runtime benchmarks, whose representative
# sentences are ~30 tokens.
MAX_PARAPHRASE_QUERY_TOKENS = 10
MAX_SEMANTIC_LOOKUP_TOKENS = 12

# Small curated set of verb-like tokens that reliably mark sentence-shaped
# clinical passage claims. Intentionally not a general POS tagger — any
# token here is strong evidence the query is a claim to be anchored in a
# passage, not a paraphrased lookup. Keep tight; false positives here
# block paraphrase demotion.
PASSAGE_VERB_TOKENS = frozenset(
    {
        "affect",
        "affects",
        "associated",
        "characterized",
        "classified",
        "cause",
        "causes",
        "differ",
        "differs",
        "found",
        "has",
        "have",
        "improve",
        "improves",
        "include",
        "includes",
        "increased",
        "induce",
        "induces",
        "involve",
        "involves",
        "lead",
        "leads",
        "participate",
        "participates",
        "predict",
        "predicts",
        "prevent",
        "prevents",
        "reduced",
        "require",
        "requires",
        "show",
        "shows",
        "undergo",
        "undergoes",
    }
)

PARAPHRASE_TITLE_PUNCT = frozenset({":", ";", "—", "–"})

# Lowercase-dominant biomedical semantic prompts frequently describe an
# entity/relation/property lookup rather than a pasted title. These
# anchors are intentionally noun-heavy and conservative: they capture
# relation / response / dosing / criteria style questions that should use
# the broad GENERAL fusion, while exact-title rescue still protects real
# titles entered in sentence case.
SEMANTIC_LOOKUP_ANCHOR_TOKENS = frozenset(
    {
        "allele",
        "alleles",
        "accuracy",
        "classification",
        "classifications",
        "criteria",
        "dose",
        "doses",
        "dosage",
        "dosing",
        "diagnosis",
        "diagnostic",
        "dysfunction",
        "efficacy",
        "genotype",
        "genotypes",
        "grading",
        "mechanism",
        "mechanisms",
        "metabolizer",
        "metabolizers",
        "mutation",
        "mutations",
        "nomenclature",
        "neuroinflammation",
        "occupancy",
        "outcome",
        "outcomes",
        "pathophysiology",
        "polymorphism",
        "polymorphisms",
        "progression",
        "response",
        "responses",
        "risk",
        "risks",
        "status",
        "susceptibility",
        "threshold",
        "thresholds",
        "treatment",
        "treatments",
        "variant",
        "variants",
    }
)

# Canonical PubTator relation labels currently exercised in the live dataset.
SUPPORTED_RELATION_TYPES = frozenset(
    {
        "associate",
        "cause",
        "compare",
        "cotreat",
        "drug_interact",
        "inhibit",
        "interact",
        "negative_correlate",
        "positive_correlate",
        "prevent",
        "stimulate",
        "treat",
    }
)


@dataclass(frozen=True, slots=True)
class QueryEnrichmentTerms:
    entity_terms: list[str]
    relation_terms: list[str]
