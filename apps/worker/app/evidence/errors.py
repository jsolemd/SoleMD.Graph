from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.evidence.models import ResolvedLocator


class EvidenceTextAcquisitionError(RuntimeError):
    """Base error for the targeted evidence-text acquisition lane."""


class PaperNotFound(EvidenceTextAcquisitionError):
    """The requested corpus_id does not exist in the warehouse."""


class PaperTextUnavailable(EvidenceTextAcquisitionError):
    """No eligible external full-text surface could be resolved for the paper."""

    def __init__(self, message: str, *, locator: "ResolvedLocator | None" = None) -> None:
        super().__init__(message)
        self.locator = locator


class PaperTextFetchFailed(EvidenceTextAcquisitionError):
    """The upstream fetch failed in a way that should stop the acquisition run."""

    def __init__(self, message: str, *, locator: "ResolvedLocator | None" = None) -> None:
        super().__init__(message)
        self.locator = locator


class InvalidPmcBiocPayload(EvidenceTextAcquisitionError):
    """The fetched PMC BioC payload could not be parsed into the canonical spine."""
