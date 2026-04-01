"""Structural classification helpers for non-prose narrative residues."""

from __future__ import annotations

from collections.abc import Sequence
from enum import StrEnum

from app.rag.parse_contract import PaperBlockRecord
from app.rag_ingest.chunk_quality import (
    MIN_USEFUL_NARRATIVE_TOKENS,
    normalize_chunk_quality_text,
)
from app.rag_ingest.section_context import (
    SectionContext,
    looks_like_structural_heading,
    normalize_heading_label,
)
from app.rag_ingest.tokenization import ChunkTokenBudgeter

_ALPHA_ENUMERATOR_TOKENS = frozenset(
    {
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "g",
        "h",
        "i",
        "j",
        "k",
        "l",
        "m",
        "n",
        "o",
        "p",
        "q",
        "r",
        "s",
        "t",
        "u",
        "v",
        "w",
        "x",
        "y",
        "z",
    }
)
_ROMAN_NUMERAL_TOKENS = frozenset(
    {
        "i",
        "ii",
        "iii",
        "iv",
        "v",
        "vi",
        "vii",
        "viii",
        "ix",
        "x",
    }
)
_PLACEHOLDER_TEXTS = frozenset(
    {
        "n a",
        "na",
        "nil",
        "none",
        "not applicable",
        "removed",
    }
)
_METADATA_HEADING_LABELS = frozenset(
    {
        "acknowledgement",
        "acknowledgements",
        "acknowledgment",
        "acknowledgments",
        "author contribution",
        "author contributions",
        "declaration of competing interest",
        "declaration of competing interests",
        "conflict of interest",
        "conflicts of interest",
        "consent for publication",
        "data availability",
        "data availability statement",
        "disclosure",
        "financial support",
        "financial support and sponsorship",
        "funding",
        "orcid",
        "orcid id",
        "patient and public involvement",
        "supplementary data",
        "supplementary material",
    }
)
_ADMIN_HEADING_LABELS = frozenset(
    {
        "background and terms of reference as provided by the requestor",
        "by patient displays",
        "clinical data policy information about clinical studies",
        "clinical trial registration",
        "correction",
        "data access links",
        "data deposition",
        "data exclusions",
        "discontinued patients",
        "disposition of excluded patients",
        "disposition of patients",
        "display and analysis of adverse events",
        "ethics oversight",
        "field specific reporting",
        "files in database submission",
        "instrument",
        "life sciences study design",
        "methodology sample preparation",
        "nature portfolio reporting summary",
        "novel plant genotypes",
        "patient and public involvement",
        "population characteristics",
        "recruitment",
        "reporting on race ethnicity or other socially relevant groupings",
        "reporting on sex",
        "reporting on sex and gender",
        "reporting summary",
        "response to reviewer",
        "reviewer response",
        "sample size",
        "software",
        "specify in tesla",
        "study timing",
    }
)
_ABBREVIATION_HEADING_LABELS = frozenset({"abbr", "abbreviation", "abbreviations"})
_TABLE_HEADER_HEADING_LABELS = frozenset(
    {
        "variable",
        "variables",
    }
)
_PUBLISHER_MARKERS = (
    "at bmc",
    "biomedcentral",
    "bmc bioinformatics",
    "immunohorizons",
    "research is always in progress",
    "nature portfolio",
    "orcid",
    "s-editor:",
    "l-editor:",
    "p-editor:",
    "s editor",
    "l editor",
    "p editor",
    "doi.org",
    "http://",
    "https://",
    "www.",
)
_TABLE_MARKERS = (
    "mean ± sd",
    "n/%",
    "ref.",
)
_TOKEN_TERMINAL_PUNCTUATION = ".!?"
_REPORTING_INSTRUCTION_PREFIXES = (
    "describe ",
    "indicate ",
    "provide ",
    "state ",
    "explain ",
    "note whether ",
)
_REPORTING_INSTRUCTION_SUBSTRINGS = (
    "if this is not relevant to your study",
    "if blinding was not possible",
    "if allocation was not random",
    "for reference purposes",
)
_TRUNCATED_CROSS_REFERENCE_MARKERS = (
    "see appendix",
    "see supplemental",
    "see supplementary",
    "see table",
    "see figure",
)


class NarrativeBlockClass(StrEnum):
    PROSE = "prose"
    STRUCTURED = "structured"
    TABLE_LIKE = "table_like"
    METADATA = "metadata"
    PLACEHOLDER = "placeholder"


def _nonempty_lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def _normalized_heading_labels(section_context: SectionContext | None) -> tuple[str, ...]:
    if section_context is None:
        return ()
    return tuple(
        normalized
        for label in section_context.heading_path
        if (normalized := normalize_heading_label(label))
    )


def _heading_matches_any(
    heading_labels: Sequence[str],
    label_set: frozenset[str],
) -> bool:
    return any(
        heading in label_set
        or any(
            heading.startswith(f"{label} ")
            or heading.endswith(f" {label}")
            or f" {label} " in heading
            for label in label_set
        )
        for heading in heading_labels
    )


def _looks_like_truncated_cross_reference(
    text: str,
    *,
    normalized_text: str,
    token_count: int,
) -> bool:
    if token_count > MIN_USEFUL_NARRATIVE_TOKENS:
        return False
    if text.rstrip().endswith(_TOKEN_TERMINAL_PUNCTUATION):
        return False
    return any(marker in normalized_text for marker in _TRUNCATED_CROSS_REFERENCE_MARKERS)


def _looks_like_hard_truncated_fragment(
    text: str,
    *,
    token_count: int,
) -> bool:
    if token_count > MIN_USEFUL_NARRATIVE_TOKENS:
        return False
    return text.rstrip().endswith(("-", "("))


def _compact_heading_matches_any(
    heading_labels: Sequence[str],
    label_set: frozenset[str],
) -> bool:
    compact_labels = {_compact_normalized_text(label) for label in label_set}
    return any(
        compact_heading in compact_labels
        for heading in heading_labels
        if (compact_heading := _compact_normalized_text(heading))
    )


def _contains_publisher_metadata(text: str) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in _PUBLISHER_MARKERS)


def _heading_contains_publisher_metadata(heading_labels: Sequence[str]) -> bool:
    return any(_contains_publisher_metadata(heading) for heading in heading_labels)


def _compact_normalized_text(value: str) -> str:
    return "".join(
        character for character in normalize_chunk_quality_text(value) if character.isalnum()
    )


def _first_nonempty_line(text: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return ""


def _looks_like_embedded_metadata_heading(text: str) -> bool:
    first_line = _first_nonempty_line(text)
    compact_line = _compact_normalized_text(first_line)
    if not compact_line:
        return False
    compact_labels = {
        _compact_normalized_text(label)
        for label in (
            *sorted(_METADATA_HEADING_LABELS),
            "author biography",
            "lead author biography",
        )
    }
    return compact_line in compact_labels


def _looks_like_response_to_reviewer(text: str) -> bool:
    first_line = normalize_heading_label(_first_nonempty_line(text))
    compact_line = _compact_normalized_text(_first_nonempty_line(text))
    if first_line.startswith(("reply ", "reviewer ", "response to reviewer")):
        return True
    return compact_line.startswith(("reply", "reviewer", "responsetoreviewer"))


def _heading_looks_like_response_to_reviewer(heading_labels: Sequence[str]) -> bool:
    return any(
        heading.startswith(("reply ", "reviewer ", "response to reviewer"))
        for heading in heading_labels
    )


def _looks_like_reporting_instruction(text: str) -> bool:
    normalized_text = normalize_chunk_quality_text(text)
    return normalized_text.startswith(_REPORTING_INSTRUCTION_PREFIXES) or any(
        marker in normalized_text for marker in _REPORTING_INSTRUCTION_SUBSTRINGS
    )


def _looks_like_abbreviation_glossary(
    text: str,
    *,
    heading_labels: Sequence[str],
    token_budgeter: ChunkTokenBudgeter,
) -> bool:
    if not _heading_matches_any(heading_labels, _ABBREVIATION_HEADING_LABELS):
        return False
    lines = _nonempty_lines(text)
    if len(lines) < 2:
        return False
    short_lines = sum(
        token_budgeter.count_tokens(line) <= max(MIN_USEFUL_NARRATIVE_TOKENS // 2, 1)
        for line in lines
    )
    uppercase_short_labels = sum(
        1
        for line in lines
        if len(line.split()) <= 4
        and any(character.isalpha() for character in line)
        and line.upper() == line
    )
    return short_lines >= max(2, len(lines) // 2) and uppercase_short_labels >= 1


def _looks_like_table_like_text(
    text: str,
    *,
    token_budgeter: ChunkTokenBudgeter,
) -> bool:
    lowered = text.lower()
    if "\t" in text or any(marker in lowered for marker in _TABLE_MARKERS):
        return True

    lines = _nonempty_lines(text)
    if len(lines) > 1:
        short_lines = sum(
            token_budgeter.count_tokens(line) < MIN_USEFUL_NARRATIVE_TOKENS for line in lines
        )
        if short_lines >= max(2, len(lines) // 2):
            return True

    words = [token.strip("()[]{}:;,.") for token in text.split() if token.strip("()[]{}:;,.")]
    if not words:
        return False
    numeric_or_code_words = sum(
        1
        for token in words
        if any(character.isdigit() for character in token)
        or token.lower() in _ROMAN_NUMERAL_TOKENS
        or ("-" in token and any(character.isalpha() for character in token))
    )
    capitalized_cell_words = sum(
        1
        for token in words
        if token
        and (
            token.isupper()
            or token[0].isupper()
            or token.lower() in _ROMAN_NUMERAL_TOKENS
        )
    )
    has_terminal_sentence_punctuation = text.rstrip().endswith(_TOKEN_TERMINAL_PUNCTUATION)
    if (
        len(words) <= 16
        and not has_terminal_sentence_punctuation
        and numeric_or_code_words >= max(4, len(words) // 2)
    ):
        return True
    if (
        len(words) <= 20
        and "  " in text
        and not has_terminal_sentence_punctuation
        and capitalized_cell_words >= max(4, (len(words) * 3) // 5)
    ):
        return True
    if (
        len(words) <= 18
        and not has_terminal_sentence_punctuation
        and sum(token.lower() in _ROMAN_NUMERAL_TOKENS for token in words) >= 2
        and capitalized_cell_words >= max(5, len(words) // 2)
    ):
        return True
    titleish_words = sum(
        1
        for token in words
        if token.isupper()
        or token[0].isupper()
        or any(character.isdigit() for character in token)
    )
    if (
        len(words) <= 8
        and titleish_words >= max(len(words) - 1, 3)
        and not text.rstrip().endswith(".")
    ):
        return True
    return False


def _is_placeholder_like_text(value: str) -> bool:
    normalized = normalize_chunk_quality_text(value)
    if not normalized:
        return True
    if normalized in _PLACEHOLDER_TEXTS:
        return True
    return normalized.isdigit()


def _is_short_generic_notice(normalized_text: str) -> bool:
    return normalized_text.startswith(
        (
            "background and terms of reference as provided by the requestor",
            "the supplementary material",
            "the following are the supplementary data",
            "the online version contains supplementary material",
            "all data is contained within this paper",
            "there are no conflicts of interest",
            "no funding has been received",
            "financial support and sponsorship nil",
        )
    )


def _looks_like_heading_scaffold(text: str) -> bool:
    units = _nonempty_lines(text) or [text.strip()]
    if not units or len(units) > 4:
        return False
    normalized_units = [normalize_heading_label(unit.lstrip(".-•* ")) for unit in units]
    if not all(normalized_units):
        return False
    return all(looks_like_structural_heading(unit) for unit in normalized_units)


def _looks_like_orphan_table_header(
    text: str,
    *,
    heading_labels: Sequence[str],
    token_budgeter: ChunkTokenBudgeter,
) -> bool:
    if not _heading_matches_any(heading_labels, _TABLE_HEADER_HEADING_LABELS):
        return False
    if text.rstrip().endswith("."):
        return False
    token_count = max(token_budgeter.count_tokens(text), 1)
    if token_count > MIN_USEFUL_NARRATIVE_TOKENS:
        return False
    return _looks_like_table_like_text(text, token_budgeter=token_budgeter)


def classify_narrative_block(
    *,
    block: PaperBlockRecord,
    section_context: SectionContext | None,
    token_budgeter: ChunkTokenBudgeter,
) -> NarrativeBlockClass:
    text = block.text.strip()
    normalized_text = normalize_chunk_quality_text(text)
    if not normalized_text:
        return NarrativeBlockClass.PLACEHOLDER

    heading_labels = _normalized_heading_labels(section_context)
    token_count = max(token_budgeter.count_tokens(text), 1)
    lines = _nonempty_lines(text)
    short_line_count = sum(
        token_budgeter.count_tokens(line) < MIN_USEFUL_NARRATIVE_TOKENS for line in lines
    )
    metadata_heading = _heading_matches_any(heading_labels, _METADATA_HEADING_LABELS)
    admin_heading = _heading_matches_any(heading_labels, _ADMIN_HEADING_LABELS)
    compact_metadata_heading = _compact_heading_matches_any(
        heading_labels,
        frozenset(
            {
                *_METADATA_HEADING_LABELS,
                "author biography",
                "lead author biography",
            }
        ),
    )
    embedded_metadata_heading = _looks_like_embedded_metadata_heading(text)
    reviewer_response = _looks_like_response_to_reviewer(
        text
    ) or _heading_looks_like_response_to_reviewer(heading_labels)
    reporting_instruction = _looks_like_reporting_instruction(text)
    publisher_heading = _heading_contains_publisher_metadata(heading_labels)

    if _is_placeholder_like_text(text):
        if metadata_heading or admin_heading:
            return NarrativeBlockClass.METADATA
        return NarrativeBlockClass.PLACEHOLDER

    if _looks_like_hard_truncated_fragment(text, token_count=token_count):
        return NarrativeBlockClass.PLACEHOLDER

    if _looks_like_heading_scaffold(text):
        return NarrativeBlockClass.PLACEHOLDER

    if _looks_like_orphan_table_header(
        text,
        heading_labels=heading_labels,
        token_budgeter=token_budgeter,
    ):
        return NarrativeBlockClass.PLACEHOLDER

    if reviewer_response and token_count <= MIN_USEFUL_NARRATIVE_TOKENS * 2:
        return NarrativeBlockClass.METADATA

    if (
        _heading_matches_any(heading_labels, _ABBREVIATION_HEADING_LABELS)
        and token_count <= MIN_USEFUL_NARRATIVE_TOKENS * 2
    ):
        return NarrativeBlockClass.METADATA

    if (
        embedded_metadata_heading or compact_metadata_heading
    ) and token_count <= MIN_USEFUL_NARRATIVE_TOKENS * 2:
        return NarrativeBlockClass.METADATA

    if _looks_like_truncated_cross_reference(
        text,
        normalized_text=normalized_text,
        token_count=token_count,
    ):
        return NarrativeBlockClass.METADATA

    if _is_short_generic_notice(normalized_text) and token_count <= MIN_USEFUL_NARRATIVE_TOKENS * 2:
        return NarrativeBlockClass.METADATA

    if metadata_heading and (
        token_count <= MIN_USEFUL_NARRATIVE_TOKENS * 2
        or _contains_publisher_metadata(text)
        or _is_short_generic_notice(normalized_text)
    ):
        return NarrativeBlockClass.METADATA

    if admin_heading and reporting_instruction:
        return NarrativeBlockClass.METADATA

    if admin_heading and _looks_like_table_like_text(text, token_budgeter=token_budgeter):
        return NarrativeBlockClass.METADATA

    if (
        _contains_publisher_metadata(text) or publisher_heading
    ) and token_count <= MIN_USEFUL_NARRATIVE_TOKENS:
        return NarrativeBlockClass.METADATA

    if admin_heading and token_count <= MIN_USEFUL_NARRATIVE_TOKENS and (
        "will be " in text.lower()
        or "for reference purposes" in text.lower()
        or not text.rstrip().endswith(".")
    ):
        return NarrativeBlockClass.METADATA

    if _looks_like_abbreviation_glossary(
        text,
        heading_labels=heading_labels,
        token_budgeter=token_budgeter,
    ):
        return NarrativeBlockClass.METADATA

    if _looks_like_table_like_text(text, token_budgeter=token_budgeter):
        return NarrativeBlockClass.TABLE_LIKE

    if "\t" in text or "•" in text or text.count("?") >= 2:
        return NarrativeBlockClass.STRUCTURED

    if len(lines) > 1 and short_line_count >= max(2, len(lines) // 2):
        return NarrativeBlockClass.STRUCTURED

    if str(block.section_role) == "other" and token_count < MIN_USEFUL_NARRATIVE_TOKENS:
        return NarrativeBlockClass.STRUCTURED

    return NarrativeBlockClass.PROSE


def _split_bullet_units(text: str) -> list[str]:
    stripped = text.strip()
    if not stripped:
        return []
    if "•" not in stripped:
        return [stripped]
    units = [segment.strip() for segment in stripped.split("•") if segment.strip()]
    return units or [stripped]


def _split_question_units(text: str) -> list[str]:
    stripped = text.strip()
    if not stripped or "?" not in stripped:
        return [stripped] if stripped else []
    units: list[str] = []
    start = 0
    for index, character in enumerate(stripped):
        if character != "?":
            continue
        unit = stripped[start : index + 1].strip()
        if unit:
            units.append(unit)
        start = index + 1
    tail = stripped[start:].strip()
    if tail:
        units.append(tail)
    return units


def _strip_inline_enumerator_tokens(value: str) -> str:
    tokens = value.split()
    while tokens and (
        tokens[0].isdigit()
        or tokens[0].lower() in _ROMAN_NUMERAL_TOKENS
        or tokens[0].lower() in _ALPHA_ENUMERATOR_TOKENS
    ):
        tokens = tokens[1:]
    while len(tokens) > 1 and (
        tokens[-1].isdigit()
        or tokens[-1].lower() in _ROMAN_NUMERAL_TOKENS
        or tokens[-1].lower() in _ALPHA_ENUMERATOR_TOKENS
    ):
        tokens = tokens[:-1]
    return " ".join(tokens).strip()


def structured_unit_texts(text: str) -> list[str]:
    stripped = text.strip()
    if not stripped:
        return []

    line_units = _nonempty_lines(stripped)
    raw_units = line_units if len(line_units) > 1 else [stripped]
    normalized_units: list[str] = []
    for raw_unit in raw_units:
        for bullet_unit in _split_bullet_units(raw_unit):
            for question_unit in _split_question_units(bullet_unit):
                cleaned = _strip_inline_enumerator_tokens(question_unit)
                if not cleaned or _is_placeholder_like_text(cleaned):
                    continue
                normalized_units.append(cleaned)
    return normalized_units
