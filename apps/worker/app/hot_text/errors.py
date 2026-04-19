from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.hot_text.models import ResolvedLocator


class HotTextError(RuntimeError):
    """Base error for the targeted hot-text acquisition lane."""


class PaperNotFound(HotTextError):
    """The requested corpus_id does not exist in the warehouse."""


class PaperTextUnavailable(HotTextError):
    """No eligible external full-text surface could be resolved for the paper."""

    def __init__(self, message: str, *, locator: "ResolvedLocator | None" = None) -> None:
        super().__init__(message)
        self.locator = locator


class InvalidPmcBiocPayload(HotTextError):
    """The fetched PMC BioC payload could not be parsed into the canonical spine."""
