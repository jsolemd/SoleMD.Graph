from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from app.document_schema import DOCUMENT_SOURCE_KIND_PMC_BIOC
from app.corpus.models import (
    CorpusAdmissionPolicy,
    EvidencePolicy,
    MappedPolicy,
    SelectionPolicy,
)


PUBTATOR_ENTITY_TYPE_GENE = 1
PUBTATOR_ENTITY_TYPE_DISEASE = 2
PUBTATOR_ENTITY_TYPE_CHEMICAL = 3

PUBTATOR_RELATION_TYPE_CAUSE = 4

DEFAULT_MAPPED_MIN_PUBLICATION_YEAR = 1945
DEFAULT_EVIDENCE_LOOKBACK_YEARS = 10
DEFAULT_EVIDENCE_MIN_PRIORITY_SCORE = 150


@dataclass(frozen=True, slots=True)
class EntityRuleRecord:
    entity_type: int
    concept_id_raw: str
    canonical_name: str
    family_key: str
    confidence: str
    min_reference_count: int = 0


@dataclass(frozen=True, slots=True)
class RelationRuleRecord:
    subject_type: int
    relation_type: int
    object_type: int
    object_id_raw: str
    canonical_name: str
    family_key: str
    min_reference_count: int = 0


VENUE_PATTERN_RULES: tuple[tuple[str, str, bool], ...] = (
    ("frontiers_in_neuro", "frontiers in neuro%", True),
    ("frontiers_in_psychiatry", "frontiers in psychiatr%", True),
    ("frontiers_in_pharmacology", "frontiers in pharmacol%", True),
    ("frontiers_in_aging_neuroscience", "frontiers in aging neuroscience", True),
    (
        "frontiers_in_behavioral_neuroscience",
        "frontiers in behavioral neuroscience",
        True,
    ),
    ("brain_research_family", "brain research%", True),
    ("brain_sciences", "brain sciences", True),
    ("neuropharmacology_family", "%neuropharmacol%", True),
    ("psychopharmacology_family", "%psychopharmacol%", True),
    ("neuropsychiatry_family", "%neuropsychiatr%", True),
    ("neuroimmunology_family", "%neuroimmunol%", True),
    ("neuroendocrinology_family", "%neuroendocrinol%", True),
    ("neuropathology_family", "%neuropathol%", True),
    ("neurotoxicology_family", "%neurotoxicol%", True),
)

ENTITY_RULES: tuple[EntityRuleRecord, ...] = (
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D010554",
        "Aggression",
        "behavior",
        "high",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D007174",
        "Impulsivity",
        "behavior",
        "high",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D003072",
        "Cognitive impairment",
        "behavior",
        "high",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D003693",
        "Delirium",
        "behavior",
        "high",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D011595",
        "Agitation",
        "behavior",
        "high",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D002389",
        "Catatonia",
        "behavior",
        "high",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D006212",
        "Hallucinations",
        "behavior",
        "high",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D063726",
        "Delusions",
        "behavior",
        "high",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D001927",
        "Encephalopathy",
        "systemic_bridge",
        "high",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D020230",
        "Serotonin syndrome",
        "iatrogenic_syndrome",
        "high",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D009459",
        "Neuroleptic malignant syndrome",
        "iatrogenic_syndrome",
        "high",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_GENE,
        "627",
        "BDNF",
        "neurotransmitter_gene",
        "requires_second_gate",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_GENE,
        "6531",
        "DAT",
        "neurotransmitter_gene",
        "requires_second_gate",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_GENE,
        "6532",
        "SERT",
        "neurotransmitter_gene",
        "requires_second_gate",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_GENE,
        "1312",
        "COMT",
        "neurotransmitter_gene",
        "requires_second_gate",
    ),
    EntityRuleRecord(
        PUBTATOR_ENTITY_TYPE_GENE,
        "4128",
        "MAOA",
        "neurotransmitter_gene",
        "requires_second_gate",
    ),
)

RELATION_RULES: tuple[RelationRuleRecord, ...] = (
    RelationRuleRecord(
        PUBTATOR_ENTITY_TYPE_CHEMICAL,
        PUBTATOR_RELATION_TYPE_CAUSE,
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D015430",
        "Weight gain",
        "metabolic_toxicity",
    ),
    RelationRuleRecord(
        PUBTATOR_ENTITY_TYPE_CHEMICAL,
        PUBTATOR_RELATION_TYPE_CAUSE,
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D024821",
        "Metabolic syndrome",
        "metabolic_toxicity",
    ),
    RelationRuleRecord(
        PUBTATOR_ENTITY_TYPE_CHEMICAL,
        PUBTATOR_RELATION_TYPE_CAUSE,
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D006943",
        "Hyperglycemia",
        "metabolic_toxicity",
    ),
    RelationRuleRecord(
        PUBTATOR_ENTITY_TYPE_CHEMICAL,
        PUBTATOR_RELATION_TYPE_CAUSE,
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D009205",
        "Myocarditis",
        "cardiac_toxicity",
    ),
    RelationRuleRecord(
        PUBTATOR_ENTITY_TYPE_CHEMICAL,
        PUBTATOR_RELATION_TYPE_CAUSE,
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D000380",
        "Agranulocytosis",
        "hematologic_toxicity",
    ),
    RelationRuleRecord(
        PUBTATOR_ENTITY_TYPE_CHEMICAL,
        PUBTATOR_RELATION_TYPE_CAUSE,
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D009503",
        "Neutropenia",
        "hematologic_toxicity",
    ),
    RelationRuleRecord(
        PUBTATOR_ENTITY_TYPE_CHEMICAL,
        PUBTATOR_RELATION_TYPE_CAUSE,
        PUBTATOR_ENTITY_TYPE_DISEASE,
        "MESH:D045823",
        "Ileus",
        "gi_toxicity",
    ),
)


def build_selection_policy(*, selector_version: str) -> SelectionPolicy:
    del selector_version
    return SelectionPolicy(
        corpus_admission=CorpusAdmissionPolicy(),
        mapped=MappedPolicy(
            min_publication_year=DEFAULT_MAPPED_MIN_PUBLICATION_YEAR,
        ),
    )


def build_evidence_policy(*, wave_policy_key: str, now: datetime | None = None) -> EvidencePolicy:
    del wave_policy_key
    clock = now or datetime.now(UTC)
    return EvidencePolicy(
        publication_year_floor=clock.year - DEFAULT_EVIDENCE_LOOKBACK_YEARS,
        min_evidence_priority_score=DEFAULT_EVIDENCE_MIN_PRIORITY_SCORE,
        require_locator_candidate=True,
        missing_document_source_kind=DOCUMENT_SOURCE_KIND_PMC_BIOC,
    )
