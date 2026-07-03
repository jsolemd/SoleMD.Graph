from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID


PmcFullTextSelector = Literal["metadata-only-pmcid", "mapped-pmcid"]
PmcFullTextSourceProvider = Literal["pmc_oa", "pmc_oai", "pmc_bioc"]
PmcFullTextDocumentStatus = Literal[
    "parsed",
    "unavailable",
    "fetch_failed",
    "parse_failed",
]
PmcFullTextSectionRole = Literal[
    "unknown",
    "abstract",
    "introduction",
    "methods",
    "materials",
    "subjects_population",
    "results",
    "discussion",
    "conclusion",
    "limitations",
    "case_report",
    "data_availability",
    "ethics",
    "funding",
    "conflict_of_interest",
    "acknowledgments",
    "author_contributions",
    "supplement",
    "references",
    "other",
]
PmcFullTextPassageRole = Literal[
    "abstract",
    "body",
    "figure_caption",
    "table_caption",
    "table_body",
    "other",
]

DEFAULT_SOURCE_ORDER: tuple[PmcFullTextSourceProvider, ...] = (
    "pmc_oa",
    "pmc_oai",
    "pmc_bioc",
)


@dataclass(frozen=True, slots=True)
class PmcFullTextCandidate:
    corpus_id: int
    pmcid: str
    content_status: str
    selector_version: str


@dataclass(frozen=True, slots=True)
class PmcAvailability:
    pmcid: str
    available: bool
    provider: PmcFullTextSourceProvider
    source_url: str
    license: str | None = None
    license_url: str | None = None
    reason: str | None = None


@dataclass(frozen=True, slots=True)
class FetchedPmcPayload:
    pmcid: str
    provider: PmcFullTextSourceProvider
    source_url: str
    payload: bytes
    checksum: str
    fetched_at: datetime
    license: str | None
    license_url: str | None
    license_source_provider: PmcFullTextSourceProvider


@dataclass(frozen=True, slots=True)
class NormalizedSection:
    section_ordinal: int
    parent_section_ordinal: int | None
    section_ordinal_path: str
    title: str | None
    section_label: str | None
    depth: int
    section_type: str | None
    section_role: PmcFullTextSectionRole
    section_role_codes: tuple[PmcFullTextSectionRole, ...]
    section_role_confidence: float
    section_role_source: str
    source_type: str | None


@dataclass(frozen=True, slots=True)
class NormalizedPassage:
    section_ordinal: int
    section_ordinal_path: str
    passage_ordinal: int
    passage_role: PmcFullTextPassageRole
    source_type: str | None
    text: str
    char_count: int
    token_estimate: int
    text_checksum: str
    is_retrievable: bool


@dataclass(frozen=True, slots=True)
class NormalizedPmcFullTextDocument:
    corpus_id: int
    pmcid: str
    parser_name: str
    parser_version: str
    sections: tuple[NormalizedSection, ...]
    passages: tuple[NormalizedPassage, ...]

    @property
    def retrievable_passage_count(self) -> int:
        return sum(1 for passage in self.passages if passage.is_retrievable)


@dataclass(frozen=True, slots=True)
class PmcFullTextRunRequest:
    selector_version: PmcFullTextSelector
    limit: int
    requested_by: str | None = None


@dataclass(frozen=True, slots=True)
class PmcFullTextRetryRequest:
    run_id: UUID
    limit: int | None = None
    requested_by: str | None = None


@dataclass(frozen=True, slots=True)
class PmcFullTextRunSummary:
    run_id: UUID
    status: str
    candidate_count: int
    unavailable_count: int
    fetched_count: int
    parsed_count: int
    promoted_count: int
    skipped_count: int
    failed_count: int


class PmcFullTextError(RuntimeError):
    pass


class PmcFullTextUnavailable(PmcFullTextError):
    def __init__(self, reason: str, *, provider: str | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.provider = provider


class PmcFullTextFetchFailed(PmcFullTextError):
    def __init__(self, reason: str, *, provider: str | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.provider = provider


class PmcFullTextParseFailed(PmcFullTextError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason
