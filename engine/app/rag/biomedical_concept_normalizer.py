"""Canonical expert-language concept normalizer for biomedical RAG retrieval.

Interprets vocab-derived entity resolution results and applies confidence
gating policy.  Does not own SQL execution or DB connections — those live in
``repository_seed_search.py`` and ``_queries_paper_core.py``.

The typed ``VocabConceptMatch`` and ``ConceptConfidencePolicy`` are the domain
interpretation layer that separates "did the SQL match?" from "should this
concept seed retrieval, enrich the shortlist, or be discarded?"
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.entities.alias_keys import normalize_alias_key

# ---------------------------------------------------------------------------
# Ambiguity suppression
# ---------------------------------------------------------------------------

# Single-token alias keys that are common English words likely to appear in
# general text.  These terms are valid biomedical concepts but are too short
# and generic to safely bypass surface-alignment when promoted.
#
# Maintain precision-first: add entries here only when Langfuse trace review
# shows false-positive concept injection.  All entries must be lowercase.
AMBIGUOUS_SINGLE_TOKEN_ALIAS_KEYS: frozenset[str] = frozenset(
    {
        "anger",
        "attention",
        "diet",
        "rash",
    }
)

# Categories where even high-quality aliases should not bypass surface
# alignment.  These categories contain generic terms that overlap heavily
# with everyday language.
SUPPRESSED_PROMOTION_CATEGORIES: frozenset[str] = frozenset(
    {
        "psychosocial.environmental_factor",
    }
)


# ---------------------------------------------------------------------------
# Typed concept match
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class VocabConceptMatch:
    """Typed concept match from the curated vocab alias catalog."""

    raw_query_phrase: str
    preferred_term: str
    matched_alias: str
    alias_type: str | None
    quality_score: int | None
    is_preferred: bool
    umls_cui: str | None
    term_id: str
    category: str | None
    mesh_id: str | None
    entity_type: str | None
    source_surface: str
    provenance: str  # "vocab_aliases" | "entity_aliases" | "combined"
    confidence: str  # "high" | "medium" | "low"


# ---------------------------------------------------------------------------
# Confidence gating policy
# ---------------------------------------------------------------------------


class ConceptConfidencePolicy:
    """Confidence gating policy for vocab-derived concept matches.

    The policy is intentionally precision-first for the initial rollout:

    * MeSH-backed aliases remain the only ones that may seed exact entity recall.
    * Non-MeSH aliases may still contribute to lexical/dense concept rescue when
      they are preferred, high-quality, and UMLS-backed.
    * ``"high"`` requires *either* a curated entity_rule *or* a preferred
      high-quality alias that is not in the ambiguity suppression set.
    * ``"medium"`` requires either a quality >= 70 MeSH-backed concept, or a
      preferred high-quality non-MeSH concept with a UMLS CUI.
    * Everything else is ``"low"`` and excluded from serving.
    """

    HIGH_QUALITY_THRESHOLD = 90
    MEDIUM_QUALITY_THRESHOLD = 70
    SEED_CONFIDENCE_LEVELS: frozenset[str] = frozenset({"high"})
    ENRICHMENT_CONFIDENCE_LEVELS: frozenset[str] = frozenset({"high", "medium"})

    @classmethod
    def classify_confidence(
        cls,
        *,
        quality_score: int | None,
        is_preferred: bool,
        has_entity_rule: bool,
        mesh_id: str | None,
        umls_cui: str | None,
        category: str | None,
        alias_key: str | None,
    ) -> str:
        if not mesh_id:
            if (
                umls_cui
                and is_preferred
                and (quality_score or 0) >= cls.HIGH_QUALITY_THRESHOLD
                and (category or "") not in SUPPRESSED_PROMOTION_CATEGORIES
                and (alias_key or "") not in AMBIGUOUS_SINGLE_TOKEN_ALIAS_KEYS
            ):
                return "medium"
            return "low"

        # An entity_rule on the MeSH-backed entity is the strongest signal.
        if has_entity_rule:
            return "high"

        # Preferred + high quality — but not if the alias is ambiguous.
        if (
            is_preferred
            and (quality_score or 0) >= cls.HIGH_QUALITY_THRESHOLD
            and (category or "") not in SUPPRESSED_PROMOTION_CATEGORIES
            and (alias_key or "") not in AMBIGUOUS_SINGLE_TOKEN_ALIAS_KEYS
        ):
            return "high"

        # Medium: MeSH-backed with reasonable quality.
        if (quality_score or 0) >= cls.MEDIUM_QUALITY_THRESHOLD:
            return "medium"

        return "low"

    @classmethod
    def should_seed_retrieval(cls, confidence: str) -> bool:
        """High-confidence concepts may seed entity recall lanes."""
        return confidence in cls.SEED_CONFIDENCE_LEVELS

    @classmethod
    def should_enrich_shortlist(cls, confidence: str) -> bool:
        """Medium+ confidence concepts may assist shortlist enrichment."""
        return confidence in cls.ENRICHMENT_CONFIDENCE_LEVELS


# ---------------------------------------------------------------------------
# Match construction
# ---------------------------------------------------------------------------


def build_vocab_concept_matches(
    *,
    raw_phrases: Sequence[str],
    vocab_concepts: Sequence[_VocabConceptRow],
    entity_rule_concept_ids: frozenset[str],
) -> list[VocabConceptMatch]:
    """Build typed ``VocabConceptMatch`` objects from resolved vocab rows.

    Parameters
    ----------
    raw_phrases:
        Original query phrases sent to resolution.
    vocab_concepts:
        Rows from the vocab alias UNION branch, already parsed into
        ``_VocabConceptRow`` named tuples.
    entity_rule_concept_ids:
        Concept IDs (e.g. ``"MESH:D008094"``) that have an entity_rule
        with confidence >= ``'medium'``.
    """
    phrase_keys = {normalize_alias_key(p): p for p in raw_phrases}
    matches: list[VocabConceptMatch] = []

    for row in vocab_concepts:
        raw_phrase = phrase_keys.get(row.alias_key, row.alias_key)

        concept_id = f"MESH:{row.mesh_id}" if row.mesh_id else ""
        has_entity_rule = concept_id in entity_rule_concept_ids

        confidence = ConceptConfidencePolicy.classify_confidence(
            quality_score=row.quality_score,
            is_preferred=row.is_preferred,
            has_entity_rule=has_entity_rule,
            mesh_id=row.mesh_id,
            umls_cui=row.umls_cui,
            category=row.category,
            alias_key=row.alias_key,
        )

        provenance = "combined" if has_entity_rule else "vocab_aliases"

        matches.append(
            VocabConceptMatch(
                raw_query_phrase=raw_phrase,
                preferred_term=row.preferred_term,
                matched_alias=row.matched_alias,
                alias_type=row.alias_type,
                quality_score=row.quality_score,
                is_preferred=row.is_preferred,
                umls_cui=row.umls_cui,
                term_id=row.term_id,
                category=row.category,
                mesh_id=row.mesh_id,
                entity_type=row.entity_type,
                source_surface=row.source_surface,
                provenance=provenance,
                confidence=confidence,
            )
        )

    return matches


def vocab_concept_seed_terms(matches: Sequence[VocabConceptMatch]) -> list[str]:
    """Return preferred terms from high-confidence vocab concept matches."""
    seen: set[str] = set()
    terms: list[str] = []
    for m in matches:
        if (
            ConceptConfidencePolicy.should_seed_retrieval(m.confidence)
            and m.preferred_term
        ):
            key = m.preferred_term.casefold()
            if key not in seen:
                seen.add(key)
                terms.append(m.preferred_term)
    return terms


def vocab_concept_seed_matches(
    matches: Sequence[VocabConceptMatch],
) -> list[VocabConceptMatch]:
    """Return high-confidence MeSH-backed matches eligible for exact seeding."""

    deduped: list[VocabConceptMatch] = []
    seen: set[tuple[str, str | None, str]] = set()
    for match in matches:
        if not (
            ConceptConfidencePolicy.should_seed_retrieval(match.confidence)
            and match.mesh_id
            and match.preferred_term
        ):
            continue
        key = (
            match.mesh_id,
            match.entity_type,
            match.preferred_term.casefold(),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(match)
    return deduped


def vocab_concept_enrichment_terms(
    matches: Sequence[VocabConceptMatch],
) -> list[str]:
    """Return preferred terms from medium+ confidence vocab concept matches."""
    seen: set[str] = set()
    terms: list[str] = []
    for m in matches:
        if (
            ConceptConfidencePolicy.should_enrich_shortlist(m.confidence)
            and m.preferred_term
        ):
            key = m.preferred_term.casefold()
            if key not in seen:
                seen.add(key)
                terms.append(m.preferred_term)
    return terms


# ---------------------------------------------------------------------------
# Internal row type used during construction
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _VocabConceptRow:
    """Intermediate representation of a vocab alias SQL row."""

    alias_key: str
    preferred_term: str
    matched_alias: str
    alias_type: str | None
    quality_score: int | None
    is_preferred: bool
    umls_cui: str | None
    term_id: str
    category: str | None
    mesh_id: str | None
    entity_type: str | None
    source_surface: str
