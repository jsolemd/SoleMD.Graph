from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
import hashlib
import re

from app.pmc_fulltext.models import (
    NormalizedPassage,
    NormalizedSection,
    PmcFullTextPassageRole,
    PmcFullTextSectionRole,
)


PRIMARY_TITLE_PRIORITY_ROLES = {
    "data_availability",
    "ethics",
    "funding",
    "conflict_of_interest",
    "acknowledgments",
    "author_contributions",
    "limitations",
    "case_report",
    "supplement",
}
EXCLUDED_SECTION_ROLES = {"references"}
NON_RETRIEVABLE_SECTION_ROLES = {
    "data_availability",
    "ethics",
    "funding",
    "conflict_of_interest",
    "acknowledgments",
    "author_contributions",
    "supplement",
    "references",
}
MATERIALIZED_NON_RETRIEVABLE_SECTION_ROLES = NON_RETRIEVABLE_SECTION_ROLES - {"references"}
SECTION_TYPE_ROLES: dict[str, PmcFullTextSectionRole] = {
    "abstract": "abstract",
    "abstr": "abstract",
    "intro": "introduction",
    "introduction": "introduction",
    "background": "introduction",
    "method": "methods",
    "methods": "methods",
    "methodology": "methods",
    "materials": "materials",
    "material": "materials",
    "subjects": "subjects_population",
    "subject": "subjects_population",
    "patients": "subjects_population",
    "participants": "subjects_population",
    "results": "results",
    "result": "results",
    "findings": "results",
    "finding": "results",
    "discuss": "discussion",
    "discussion": "discussion",
    "concl": "conclusion",
    "conclusion": "conclusion",
    "conclusions": "conclusion",
    "limitation": "limitations",
    "limitations": "limitations",
    "cases": "case_report",
    "case": "case_report",
    "data availability": "data_availability",
    "data availability statement": "data_availability",
    "availability of data and materials": "data_availability",
    "ethics": "ethics",
    "ethics statement": "ethics",
    "ethical approval": "ethics",
    "funding": "funding",
    "financial support": "funding",
    "conflict of interest": "conflict_of_interest",
    "conflicts of interest": "conflict_of_interest",
    "competing interests": "conflict_of_interest",
    "comp int": "conflict_of_interest",
    "acknowledgments": "acknowledgments",
    "acknowledgements": "acknowledgments",
    "ack": "acknowledgments",
    "author contributions": "author_contributions",
    "authors contributions": "author_contributions",
    "auth cont": "author_contributions",
    "supplementary material": "supplement",
    "supplementary-material": "supplement",
    "supplementary": "supplement",
    "supplement": "supplement",
    "suppl": "supplement",
    "supp": "supplement",
    "ref": "references",
    "refs": "references",
    "reference": "references",
    "references": "references",
}
EXACT_TITLE_ROLES: dict[str, PmcFullTextSectionRole] = {
    "abstract": "abstract",
    "summary": "conclusion",
    "introduction": "introduction",
    "background": "introduction",
    "methods": "methods",
    "methodology": "methods",
    "materials": "materials",
    "materials and methods": "methods",
    "methods and materials": "methods",
    "patients": "subjects_population",
    "participants": "subjects_population",
    "subjects": "subjects_population",
    "study population": "subjects_population",
    "results": "results",
    "findings": "results",
    "discussion": "discussion",
    "results and discussion": "results",
    "discussion and conclusions": "discussion",
    "conclusion": "conclusion",
    "conclusions": "conclusion",
    "limitations": "limitations",
    "study limitations": "limitations",
    "case": "case_report",
    "case report": "case_report",
    "case presentation": "case_report",
    "case description": "case_report",
    "clinical case": "case_report",
    "data availability": "data_availability",
    "data availability statement": "data_availability",
    "availability of data and materials": "data_availability",
    "ethics": "ethics",
    "ethics statement": "ethics",
    "ethical approval": "ethics",
    "funding": "funding",
    "financial support": "funding",
    "conflict of interest": "conflict_of_interest",
    "conflicts of interest": "conflict_of_interest",
    "competing interests": "conflict_of_interest",
    "declaration of competing interest": "conflict_of_interest",
    "acknowledgments": "acknowledgments",
    "acknowledgements": "acknowledgments",
    "author contributions": "author_contributions",
    "authors contributions": "author_contributions",
    "contributions": "author_contributions",
    "supplementary material": "supplement",
    "supplementary materials": "supplement",
    "supplementary information": "supplement",
    "appendix": "supplement",
    "web resources": "supplement",
    "references": "references",
}
TITLE_PHRASE_PATTERNS: tuple[tuple[re.Pattern[str], PmcFullTextSectionRole], ...] = (
    (re.compile(r"\bdata (availability|accessibility|sharing)\b"), "data_availability"),
    (re.compile(r"\b(ethics?|ethical|irb|institutional review board|human subjects?)\b"), "ethics"),
    (re.compile(r"\b(funding|financial support|grant support)\b"), "funding"),
    (re.compile(r"\b(conflicts? of interest|competing interests?|disclosures?)\b"), "conflict_of_interest"),
    (re.compile(r"\bauthor(?:s| contributions?| contribution)\b"), "author_contributions"),
    (re.compile(r"\backnowledg(?:e)?ments?\b"), "acknowledgments"),
    (re.compile(r"\blimitations?\b"), "limitations"),
    (re.compile(r"\bcase (report|presentation|description|summary)\b"), "case_report"),
    (re.compile(r"\b(materials? and methods?|methods? and materials?)\b"), "methods"),
    (re.compile(r"\bmethods?\b|\bmethodology\b|\bprocedures?\b"), "methods"),
    (re.compile(r"\bmaterials?\b"), "materials"),
    (re.compile(r"\b(subjects?|patients?|participants?|study population)\b"), "subjects_population"),
    (re.compile(r"\bresults?\b|\bfindings?\b"), "results"),
    (re.compile(r"\bdiscussion\b|\binterpretation\b"), "discussion"),
    (re.compile(r"\bconclusions?\b"), "conclusion"),
    (re.compile(r"\bintroduction\b|\bbackground\b|\boverview\b"), "introduction"),
    (re.compile(r"\bweb resources?\b"), "supplement"),
    (re.compile(r"\bsupplement"), "supplement"),
    (re.compile(r"\bappendix\b"), "supplement"),
    (re.compile(r"\breferences?\b"), "references"),
)
FRONT_MATTER_SECTION_TITLES = {
    "contents",
    "table of contents",
}
MAX_RETRIEVABLE_TABLE_BODY_CHARS = 4_000


@dataclass(frozen=True, slots=True)
class SectionRoleMapping:
    primary_role: PmcFullTextSectionRole
    role_codes: tuple[PmcFullTextSectionRole, ...]
    confidence: float
    source: str


UNKNOWN_SECTION_ROLE = SectionRoleMapping(
    primary_role="unknown",
    role_codes=("unknown",),
    confidence=0.0,
    source="unknown",
)


class SectionBuilder:
    def __init__(self) -> None:
        self.sections: list[NormalizedSection] = []
        self._path_by_ordinal: dict[int, tuple[int, ...]] = {}
        self._stack: list[int] = []
        self._sibling_counts: dict[tuple[int, ...], int] = {}

    def create_section(
        self,
        *,
        title: str,
        depth: int,
        role_mapping: SectionRoleMapping,
        section_type: str | None,
        source_type: str | None,
    ) -> NormalizedSection:
        safe_depth = max(1, min(depth, len(self._stack) + 1))
        self._stack = self._stack[: safe_depth - 1]
        parent_ordinal = self._stack[-1] if self._stack else None
        parent_path = (
            self._path_by_ordinal[parent_ordinal]
            if parent_ordinal is not None
            else ()
        )
        role_mapping = self._with_parent_role(role_mapping, parent_ordinal)
        sibling_index = self._sibling_counts.get(parent_path, 0) + 1
        self._sibling_counts[parent_path] = sibling_index
        path = (*parent_path, sibling_index)
        ordinal = len(self.sections)
        section = NormalizedSection(
            section_ordinal=ordinal,
            parent_section_ordinal=parent_ordinal,
            section_ordinal_path=format_ordinal_path(path),
            title=title,
            section_label=title,
            depth=len(path),
            section_type=section_type,
            section_role=role_mapping.primary_role,
            section_role_codes=role_mapping.role_codes,
            section_role_confidence=role_mapping.confidence,
            section_role_source=role_mapping.source,
            source_type=source_type,
        )
        self.sections.append(section)
        self._path_by_ordinal[ordinal] = path
        self._stack.append(ordinal)
        return section

    def ensure_default_section(
        self,
        *,
        title: str,
        role_mapping: SectionRoleMapping,
        section_type: str | None,
        source_type: str | None,
    ) -> NormalizedSection:
        if self._stack:
            current = self.sections[self._stack[-1]]
            if (
                current.section_role == role_mapping.primary_role
                and normalize_text(current.title or "") == title
            ):
                return current
        return self.create_section(
            title=title,
            depth=1,
            role_mapping=role_mapping,
            section_type=section_type,
            source_type=source_type,
        )

    def current_section(self) -> NormalizedSection | None:
        if not self._stack:
            return None
        return self.sections[self._stack[-1]]

    def _with_parent_role(
        self,
        role_mapping: SectionRoleMapping,
        parent_ordinal: int | None,
    ) -> SectionRoleMapping:
        if role_mapping.primary_role != "unknown" or parent_ordinal is None:
            return role_mapping
        parent = self.sections[parent_ordinal]
        if parent.section_role in {"unknown", "other", "abstract", "references"}:
            return role_mapping
        return SectionRoleMapping(
            primary_role=parent.section_role,
            role_codes=parent.section_role_codes,
            confidence=min(parent.section_role_confidence, 0.65),
            source="parent_propagation",
        )


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def format_ordinal_path(path: tuple[int, ...]) -> str:
    return ".".join(f"{item:04d}" for item in path)


def map_section_role(
    *,
    section_type: str,
    label: str | None,
) -> SectionRoleMapping:
    section_type_roles = _roles_from_section_type(section_type)
    exact_title_role = EXACT_TITLE_ROLES.get(_role_key(label or ""))
    title_roles = (exact_title_role,) if exact_title_role is not None else ()
    title_source = "title_exact" if title_roles else "unknown"
    if not title_roles:
        title_roles = _roles_from_title_phrase(label or "")
        title_source = "title_phrase" if title_roles else "unknown"
    section_type_roles = _conservative_section_type_roles(
        section_type_roles=section_type_roles,
        title_roles=title_roles,
        label=label,
    )

    roles = _merge_roles(
        *_ordered_role_groups(
            section_type_roles=section_type_roles,
            title_roles=title_roles,
        )
    )
    if not roles:
        return UNKNOWN_SECTION_ROLE

    confidence = _role_confidence(
        has_section_type=bool(section_type_roles),
        title_source=title_source,
        has_conflict=_has_role_conflict(section_type_roles, title_roles),
    )
    if section_type_roles and title_roles:
        source = "section_type_and_title"
    elif section_type_roles:
        source = "section_type_exact"
    else:
        source = title_source
    return SectionRoleMapping(
        primary_role=roles[0],
        role_codes=roles,
        confidence=confidence,
        source=source,
    )


def is_excluded_section(*, section_type: str, label: str | None) -> bool:
    normalized_label = normalize_text(label or "").lower().replace("_", " ")
    if normalized_label in FRONT_MATTER_SECTION_TITLES:
        return True
    return map_section_role(section_type=section_type, label=label).primary_role in EXCLUDED_SECTION_ROLES


def heading_depth(
    passage_type: str,
    *,
    current_depth: int | None = None,
    current_source_type: str | None = None,
) -> int | None:
    match = re.search(r"(?:^|_)title_(\d+)$", passage_type)
    if match:
        return int(match.group(1))
    if passage_type.startswith("abstract_title"):
        return 1
    if passage_type == "title":
        if current_depth is None:
            return 1
        if current_source_type == "title":
            return current_depth
        return current_depth + 1
    return None


def passage_role(
    *,
    passage_type: str,
    section_role: PmcFullTextSectionRole,
) -> PmcFullTextPassageRole:
    if passage_type == "abstract" or section_role == "abstract":
        return "abstract"
    if section_role in NON_RETRIEVABLE_SECTION_ROLES:
        return "other" if passage_type == "paragraph" else _display_passage_role(passage_type)
    return _display_passage_role(passage_type)


def _display_passage_role(passage_type: str) -> PmcFullTextPassageRole:
    if passage_type == "fig_caption":
        return "figure_caption"
    if passage_type == "table_caption":
        return "table_caption"
    if passage_type in {"table", "table_footnote"}:
        return "table_body"
    if passage_type == "paragraph":
        return "body"
    return "other"


def is_retrievable_passage(
    *,
    role: PmcFullTextPassageRole,
    section_role: PmcFullTextSectionRole,
    text: str,
) -> bool:
    if section_role in NON_RETRIEVABLE_SECTION_ROLES:
        return False
    if role in {"abstract", "body", "figure_caption", "table_caption"}:
        return True
    if role == "table_body":
        return is_clean_table_body(text)
    return False


def should_materialize_nonretrievable_section(section_role: PmcFullTextSectionRole) -> bool:
    return section_role in MATERIALIZED_NON_RETRIEVABLE_SECTION_ROLES


def is_clean_table_body(text: str) -> bool:
    if len(text) < 20:
        return False
    if len(text) > MAX_RETRIEVABLE_TABLE_BODY_CHARS:
        return False
    if "<" in text or ">" in text:
        return False
    words = re.findall(r"[A-Za-z0-9]+", text)
    return len(words) >= 4


def estimate_tokens(text: str) -> int:
    words = re.findall(r"\S+", text)
    return max(1, int(round(len(words) * 1.35)))


def build_passage(
    *,
    pmcid: str,
    parser_version: str,
    section: NormalizedSection,
    passage_ordinal: int,
    role: PmcFullTextPassageRole,
    source_type: str | None,
    text: str,
) -> NormalizedPassage:
    checksum_basis = "\n".join(
        (
            parser_version,
            pmcid,
            role,
            section.section_ordinal_path,
            str(passage_ordinal),
            text,
        )
    )
    return NormalizedPassage(
        section_ordinal=section.section_ordinal,
        section_ordinal_path=section.section_ordinal_path,
        passage_ordinal=passage_ordinal,
        passage_role=role,
        source_type=source_type,
        text=text,
        char_count=len(text),
        token_estimate=estimate_tokens(text),
        text_checksum=hashlib.sha256(checksum_basis.encode("utf-8")).hexdigest(),
        is_retrievable=is_retrievable_passage(
            role=role,
            section_role=section.section_role,
            text=text,
        ),
    )


def _roles_from_section_type(section_type: str) -> tuple[PmcFullTextSectionRole, ...]:
    roles: list[PmcFullTextSectionRole] = []
    for raw_token in re.split(r"[|,;/]+", section_type):
        token = _role_key(raw_token)
        if not token or token == "back":
            continue
        if token in SECTION_TYPE_ROLES:
            roles.append(SECTION_TYPE_ROLES[token])
            continue
        compact_token = token.replace(" ", "")
        if compact_token in SECTION_TYPE_ROLES:
            roles.append(SECTION_TYPE_ROLES[compact_token])
    return _merge_roles(roles)


def _roles_from_title_phrase(label: str) -> tuple[PmcFullTextSectionRole, ...]:
    normalized = _role_key(label)
    if not normalized:
        return ()
    return _merge_roles(
        role
        for pattern, role in TITLE_PHRASE_PATTERNS
        if pattern.search(normalized)
    )


def _conservative_section_type_roles(
    *,
    section_type_roles: tuple[PmcFullTextSectionRole, ...],
    title_roles: tuple[PmcFullTextSectionRole, ...],
    label: str | None,
) -> tuple[PmcFullTextSectionRole, ...]:
    if section_type_roles != ("introduction",) or title_roles:
        return section_type_roles
    if not label:
        return ()
    return section_type_roles if _intro_like_title(label) else ()


def _intro_like_title(label: str) -> bool:
    normalized = _role_key(label)
    return normalized in {"introduction", "background", "overview"}


def _ordered_role_groups(
    *,
    section_type_roles: tuple[PmcFullTextSectionRole, ...],
    title_roles: tuple[PmcFullTextSectionRole, ...],
) -> tuple[tuple[PmcFullTextSectionRole, ...], tuple[PmcFullTextSectionRole, ...]]:
    if title_roles and title_roles[0] in PRIMARY_TITLE_PRIORITY_ROLES:
        return title_roles, section_type_roles
    return section_type_roles, title_roles


def _merge_roles(
    *groups: Iterable[PmcFullTextSectionRole] | PmcFullTextSectionRole,
) -> tuple[PmcFullTextSectionRole, ...]:
    roles: list[PmcFullTextSectionRole] = []
    for group in groups:
        if isinstance(group, str):
            candidates = (group,)
        else:
            candidates = tuple(group)
        for role in candidates:
            if role not in roles:
                roles.append(role)
    if "methods" in roles and "materials" in roles:
        roles = ["methods", *(role for role in roles if role != "methods")]
    return tuple(roles)


def _role_confidence(
    *,
    has_section_type: bool,
    title_source: str,
    has_conflict: bool,
) -> float:
    if has_section_type and title_source == "title_exact":
        confidence = 0.98
    elif has_section_type and title_source == "title_phrase":
        confidence = 0.9
    elif has_section_type:
        confidence = 0.88
    elif title_source == "title_exact":
        confidence = 0.86
    elif title_source == "title_phrase":
        confidence = 0.72
    else:
        confidence = 0.0
    if has_conflict:
        confidence = min(confidence, 0.82)
    return confidence


def _has_role_conflict(
    section_type_roles: tuple[PmcFullTextSectionRole, ...],
    title_roles: tuple[PmcFullTextSectionRole, ...],
) -> bool:
    return bool(
        section_type_roles
        and title_roles
        and set(section_type_roles).isdisjoint(title_roles)
    )


def _role_key(value: str) -> str:
    return re.sub(r"[^a-z0-9|]+", " ", value.lower().replace("_", " ")).strip()
