from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


CorpusSelectionPhase = Literal[
    "assets",
    "corpus_admission",
    "mapped_promotion",
    "corpus_baseline_materialization",
    "mapped_surface_materialization",
    "selection_summary",
]
CorpusWavePhase = Literal["member_selection", "enqueue"]
SelectionTrigger = Literal["manual", "dispatch"]
WavePolicyKey = Literal["evidence_missing_pmc_bioc"]
EntityRuleConfidence = Literal["high", "moderate", "requires_second_gate"]

CORPUS_SELECTION_PHASES: tuple[CorpusSelectionPhase, ...] = (
    "assets",
    "corpus_admission",
    "mapped_promotion",
    "corpus_baseline_materialization",
    "mapped_surface_materialization",
    "selection_summary",
)
CORPUS_WAVE_PHASES: tuple[CorpusWavePhase, ...] = (
    "member_selection",
    "enqueue",
)


class StartCorpusSelectionRequest(BaseModel):
    s2_release_tag: str = Field(min_length=1)
    pt3_release_tag: str = Field(min_length=1)
    selector_version: str = Field(min_length=1)
    force_new_run: bool = False
    trigger: SelectionTrigger = "manual"
    requested_by: str | None = None
    phase_allowlist: tuple[CorpusSelectionPhase, ...] | None = None

    @model_validator(mode="after")
    def normalize(self) -> "StartCorpusSelectionRequest":
        if self.phase_allowlist:
            normalized = tuple(
                phase
                for phase in CORPUS_SELECTION_PHASES
                if phase in set(self.phase_allowlist)
            )
            if not normalized:
                raise ValueError("phase_allowlist must contain at least one valid phase")
            self.phase_allowlist = normalized
        return self


class DispatchEvidenceWaveRequest(BaseModel):
    s2_release_tag: str = Field(min_length=1)
    pt3_release_tag: str = Field(min_length=1)
    selector_version: str = Field(min_length=1)
    wave_policy_key: WavePolicyKey
    force_new_run: bool = False
    requested_by: str | None = None
    max_papers: int | None = Field(default=None, ge=1)


class CorpusAdmissionPolicy(BaseModel):
    enable_journal_match: bool = True
    enable_venue_pattern_match: bool = True
    enable_vocab_entity_match: bool = True
    reason_precedence: tuple[str, ...] = (
        "journal_and_vocab",
        "journal_match",
        "pattern_match",
        "vocab_entity_match",
        "selection_retired",
    )


class MappedPolicy(BaseModel):
    enable_journal_match: bool = True
    enable_venue_pattern_match: bool = True
    enable_entity_rule_match: bool = True
    enable_relation_rule_match: bool = True
    min_publication_year: int = Field(default=1945, ge=0)
    direct_entity_confidences: tuple[EntityRuleConfidence, ...] = ("high", "moderate")
    second_gate_entity_confidences: tuple[EntityRuleConfidence, ...] = (
        "requires_second_gate",
    )


class EvidencePolicy(BaseModel):
    publication_year_floor: int = Field(ge=0)
    min_evidence_priority_score: int = Field(default=150, ge=0)
    require_locator_candidate: bool = True
    missing_document_source_kind: int = Field(ge=1)


class SelectionPolicy(BaseModel):
    corpus_admission: CorpusAdmissionPolicy = Field(
        default_factory=CorpusAdmissionPolicy
    )
    mapped: MappedPolicy = Field(default_factory=MappedPolicy)


class AssetManifestEntry(BaseModel):
    asset_uri: str = Field(min_length=1)
    sha256: str = Field(min_length=64, max_length=64)
    byte_count: int = Field(ge=0)


class CorpusPlan(BaseModel):
    schema_version: int = 1
    s2_release_tag: str
    pt3_release_tag: str
    s2_source_release_id: int
    pt3_source_release_id: int
    selector_version: str
    phases: tuple[CorpusSelectionPhase, ...] = CORPUS_SELECTION_PHASES
    selection_policy: SelectionPolicy
    asset_checksums: dict[str, str]
    asset_manifest: dict[str, AssetManifestEntry]
    journal_name_count: int = Field(ge=0)
    venue_pattern_count: int = Field(ge=0)
    entity_rule_count: int = Field(ge=0)
    relation_rule_count: int = Field(ge=0)
    materialization_bucket_count: int = Field(default=256, ge=1)
    plan_checksum: str = Field(min_length=64, max_length=64)


class CorpusSelectionRunRecord(BaseModel):
    corpus_selection_run_id: UUID
    status: int
    phases_completed: tuple[str, ...] = ()
    last_completed_phase: str | None = None
    plan_checksum: str
    plan_manifest: dict


class CorpusWavePlan(BaseModel):
    schema_version: int = 1
    corpus_selection_run_id: UUID
    s2_release_tag: str
    pt3_release_tag: str
    selector_version: str
    wave_policy_key: WavePolicyKey
    max_papers: int | None = Field(default=None, ge=1)
    phases: tuple[CorpusWavePhase, ...] = CORPUS_WAVE_PHASES
    evidence_policy: EvidencePolicy
    plan_checksum: str = Field(min_length=64, max_length=64)


class CorpusWaveRunRecord(BaseModel):
    corpus_wave_run_id: UUID
    status: int
    phases_completed: tuple[str, ...] = ()
    last_completed_phase: str | None = None
    plan_checksum: str
    plan_manifest: dict
