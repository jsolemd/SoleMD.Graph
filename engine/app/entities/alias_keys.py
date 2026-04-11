"""Shared alias text normalization for runtime entity-style lookup."""

from __future__ import annotations

import re

_MULTISPACE_PATTERN = re.compile(r"\s+")


def collapse_alias_whitespace(text: str) -> str:
    """Trim and collapse internal whitespace for alias text storage."""
    return _MULTISPACE_PATTERN.sub(" ", text.strip())


def normalize_alias_key(text: str) -> str:
    """Return the canonical lowercase alias key used by runtime lookup."""
    return collapse_alias_whitespace(text).lower()
