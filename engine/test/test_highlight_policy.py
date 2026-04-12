from app.entities.highlight_policy import (
    HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT,
    HIGHLIGHT_MODE_DISABLED,
    HIGHLIGHT_MODE_EXACT,
    HIGHLIGHT_MODE_SEARCH_ONLY,
    resolve_highlight_mode,
)


def test_resolve_highlight_mode_disables_ambiguous_alias_keys() -> None:
    assert (
        resolve_highlight_mode(
            alias_text="Cell",
            alias_key="cell",
            is_canonical=True,
        )
        == HIGHLIGHT_MODE_DISABLED
    )


def test_resolve_highlight_mode_promotes_umls_alias_sources() -> None:
    assert (
        resolve_highlight_mode(
            alias_text="Haldol",
            alias_key="haldol",
            is_canonical=False,
            alias_source="umls_tradename",
        )
        == HIGHLIGHT_MODE_EXACT
    )


def test_resolve_highlight_mode_keeps_noncanonical_plain_synonyms_search_only() -> None:
    assert (
        resolve_highlight_mode(
            alias_text="major depression",
            alias_key="major depression",
            is_canonical=False,
            alias_source="synonym",
        )
        == HIGHLIGHT_MODE_SEARCH_ONLY
    )


def test_resolve_highlight_mode_requires_case_sensitive_exact_for_short_upper_aliases() -> None:
    assert (
        resolve_highlight_mode(
            alias_text="DLPFC",
            alias_key="dlpfc",
            is_canonical=True,
        )
        == HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT
    )


def test_resolve_highlight_mode_disables_common_word_curated_aliases() -> None:
    assert (
        resolve_highlight_mode(
            alias_text="today",
            alias_key="today",
            is_canonical=False,
            alias_source="umls_tradename",
        )
        == HIGHLIGHT_MODE_DISABLED
    )
