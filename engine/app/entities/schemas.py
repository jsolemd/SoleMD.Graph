"""Pydantic schemas for canonical entity matching and hover detail."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EntitySchema(BaseModel):
    """Shared schema configuration for entity runtime APIs."""

    model_config = ConfigDict(extra="forbid", use_enum_values=True)


class EntityMatchRequest(EntitySchema):
    text: str
    entity_types: list[str] = Field(default_factory=list)
    limit: int = Field(default=24, ge=1, le=64)
    max_tokens_per_alias: int = Field(default=8, ge=1, le=12)

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("text must not be empty")
        return stripped

    @field_validator("entity_types", mode="before")
    @classmethod
    def normalize_entity_types(cls, value: list[str] | None) -> list[str]:
        if value is None:
            return []
        return value

    @field_validator("entity_types")
    @classmethod
    def validate_entity_types(cls, value: list[str]) -> list[str]:
        normalized = []
        seen = set()
        for entity_type in value:
            trimmed = entity_type.strip().lower()
            if not trimmed or trimmed in seen:
                continue
            seen.add(trimmed)
            normalized.append(trimmed)
        return normalized


class EntityTextMatch(EntitySchema):
    match_id: str
    entity_type: str
    concept_namespace: str | None = None
    concept_id: str
    source_identifier: str
    canonical_name: str
    matched_text: str
    alias_text: str
    alias_source: str
    is_canonical_alias: bool = False
    paper_count: int = 0
    start: int
    end: int
    score: float = 1.0


class EntityMatchResponse(EntitySchema):
    matches: list[EntityTextMatch] = Field(default_factory=list)


class EntityDetailRequest(EntitySchema):
    entity_type: str
    source_identifier: str

    @field_validator("entity_type")
    @classmethod
    def validate_entity_type(cls, value: str) -> str:
        stripped = value.strip().lower()
        if not stripped:
            raise ValueError("entity_type must not be empty")
        return stripped

    @field_validator("source_identifier")
    @classmethod
    def validate_source_identifier(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("source_identifier must not be empty")
        return stripped


class EntityAlias(EntitySchema):
    alias_text: str
    is_canonical: bool = False
    alias_source: str | None = None


class EntityDetail(EntitySchema):
    entity_type: str
    concept_namespace: str | None = None
    concept_id: str
    source_identifier: str
    canonical_name: str
    aliases: list[EntityAlias] = Field(default_factory=list)
    paper_count: int = 0
    summary: str | None = None


class EntityDetailResponse(EntitySchema):
    entity: EntityDetail
