"""Reusable entity runtime for live text matching and hover detail."""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Protocol

from app.entities.repository import (
    EntityAliasCatalogRow,
    EntityAliasDetailRow,
    EntityCatalogRepository,
)
from app.entities.schemas import (
    EntityAlias,
    EntityDetail,
    EntityDetailRequest,
    EntityDetailResponse,
    EntityMatchRequest,
    EntityMatchResponse,
    EntityTextMatch,
)
from app.rag.entity_runtime_keys import (
    infer_catalog_concept_namespace,
    normalize_catalog_concept_id,
)

_TOKEN_PATTERN = re.compile(r"\b[\w][\w/-]*\b", re.UNICODE)
_MULTISPACE_PATTERN = re.compile(r"\s+")


@dataclass(frozen=True)
class AliasCandidate:
    alias_key: str
    matched_text: str
    start: int
    end: int
    token_count: int


class EntityServiceRepository(Protocol):
    def fetch_alias_matches(
        self,
        *,
        alias_keys: Iterable[str],
        entity_types: Iterable[str],
    ) -> list[EntityAliasCatalogRow]: ...

    def fetch_entity_detail(
        self,
        *,
        entity_type: str,
        source_identifier: str,
        alias_limit: int = 8,
    ) -> tuple[dict[str, object] | None, list[EntityAliasDetailRow]]: ...


class EntityService:
    """Resolve runtime entities from small text windows and hover identities."""

    def __init__(
        self,
        *,
        repository: EntityServiceRepository | None = None,
    ) -> None:
        self._repository = repository or EntityCatalogRepository()

    def match_entities(self, request: EntityMatchRequest) -> EntityMatchResponse:
        candidates = list(
            iter_alias_candidates(
                request.text,
                max_tokens_per_alias=request.max_tokens_per_alias,
            )
        )
        if not candidates:
            return EntityMatchResponse()

        alias_rows = self._repository.fetch_alias_matches(
            alias_keys=[candidate.alias_key for candidate in candidates],
            entity_types=request.entity_types,
        )
        matches = resolve_text_matches(
            candidates=candidates,
            alias_rows=alias_rows,
            limit=request.limit,
        )
        return EntityMatchResponse(matches=matches)

    def get_entity_detail(
        self,
        request: EntityDetailRequest,
    ) -> EntityDetailResponse:
        detail_row, aliases = self._repository.fetch_entity_detail(
            entity_type=request.entity_type,
            source_identifier=request.source_identifier,
        )
        if detail_row is None:
            raise LookupError(
                "Unknown entity detail target: "
                f"{request.entity_type}:{request.source_identifier}"
            )

        entity_type = str(detail_row["entity_type"])
        source_identifier = str(detail_row["source_identifier"])
        entity = EntityDetail(
            entity_type=entity_type,
            concept_namespace=infer_catalog_concept_namespace(
                entity_type,
                source_identifier,
            ),
            concept_id=normalize_catalog_concept_id(
                entity_type,
                source_identifier,
            ),
            source_identifier=source_identifier,
            canonical_name=str(detail_row["canonical_name"]),
            aliases=[
                EntityAlias(
                    alias_text=alias["alias_text"],
                    is_canonical=alias["is_canonical"],
                    alias_source=alias["alias_source"],
                )
                for alias in aliases
            ],
            paper_count=int(detail_row["paper_count"]),
            summary=None,
        )
        return EntityDetailResponse(entity=entity)


def iter_alias_candidates(
    text: str,
    *,
    max_tokens_per_alias: int,
) -> Iterable[AliasCandidate]:
    tokens = list(_TOKEN_PATTERN.finditer(text))
    if not tokens:
        return []

    candidates: list[AliasCandidate] = []
    seen_spans = set()
    for start_index, start_token in enumerate(tokens):
        max_end_index = min(len(tokens), start_index + max_tokens_per_alias)
        for end_index in range(start_index, max_end_index):
            end_token = tokens[end_index]
            start = start_token.start()
            end = end_token.end()
            if (start, end) in seen_spans:
                continue
            matched_text = text[start:end].strip()
            alias_key = normalize_alias_key(matched_text)
            if len(alias_key) < 3:
                continue
            seen_spans.add((start, end))
            candidates.append(
                AliasCandidate(
                    alias_key=alias_key,
                    matched_text=matched_text,
                    start=start,
                    end=end,
                    token_count=end_index - start_index + 1,
                )
            )
    return candidates


def normalize_alias_key(text: str) -> str:
    return _MULTISPACE_PATTERN.sub(" ", text.strip()).lower()


def resolve_text_matches(
    *,
    candidates: Iterable[AliasCandidate],
    alias_rows: Iterable[EntityAliasCatalogRow],
    limit: int,
) -> list[EntityTextMatch]:
    rows_by_alias_key: dict[str, list[EntityAliasCatalogRow]] = defaultdict(list)
    for row in alias_rows:
        rows_by_alias_key[row["alias_key"]].append(row)

    scored_matches: list[tuple[tuple[int, int, int, int], EntityTextMatch]] = []
    for candidate in candidates:
        candidate_rows = rows_by_alias_key.get(candidate.alias_key)
        if not candidate_rows:
            continue

        best_row = max(candidate_rows, key=_row_rank_key)
        entity_type = best_row["entity_type"]
        source_identifier = best_row["source_identifier"]
        match = EntityTextMatch(
            match_id=build_entity_match_id(
                entity_type=entity_type,
                source_identifier=source_identifier,
                start=candidate.start,
                end=candidate.end,
            ),
            entity_type=entity_type,
            concept_namespace=infer_catalog_concept_namespace(
                entity_type,
                source_identifier,
            ),
            concept_id=normalize_catalog_concept_id(
                entity_type,
                source_identifier,
            ),
            source_identifier=source_identifier,
            canonical_name=best_row["canonical_name"],
            matched_text=candidate.matched_text,
            alias_text=best_row["alias_text"],
            alias_source=best_row["alias_source"],
            is_canonical_alias=bool(best_row["is_canonical"]),
            paper_count=int(best_row["paper_count"]),
            start=candidate.start,
            end=candidate.end,
            score=1.0,
        )
        scored_matches.append(
            (
                (
                    candidate.end - candidate.start,
                    candidate.token_count,
                    int(best_row["paper_count"]),
                    1 if best_row["is_canonical"] else 0,
                ),
                match,
            )
        )

    selected: list[EntityTextMatch] = []
    occupied: list[tuple[int, int]] = []
    for _, match in sorted(
        scored_matches,
        key=lambda entry: (
            -entry[0][0],
            -entry[0][1],
            -entry[0][2],
            -entry[0][3],
            entry[1].start,
        ),
    ):
        if any(is_overlapping(match.start, match.end, start, end) for start, end in occupied):
            continue
        occupied.append((match.start, match.end))
        selected.append(match)
        if len(selected) >= limit:
            break

    return sorted(selected, key=lambda match: (match.start, match.end))


def build_entity_match_id(
    *,
    entity_type: str,
    source_identifier: str,
    start: int,
    end: int,
) -> str:
    return f"{entity_type}:{source_identifier}:{start}:{end}"


def is_overlapping(
    left_start: int,
    left_end: int,
    right_start: int,
    right_end: int,
) -> bool:
    return left_start < right_end and right_start < left_end


def _row_rank_key(row: EntityAliasCatalogRow) -> tuple[int, int, int, str]:
    return (
        1 if row["is_canonical"] else 0,
        int(row["paper_count"]),
        len(row["canonical_name"]),
        row["source_identifier"],
    )


_entity_service: EntityService | None = None


def get_entity_service() -> EntityService:
    global _entity_service
    if _entity_service is None:
        _entity_service = EntityService()
    return _entity_service
