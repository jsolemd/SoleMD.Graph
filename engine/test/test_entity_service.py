from __future__ import annotations

from app.entities.highlight_policy import (
    HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT,
    HIGHLIGHT_MODE_EXACT,
)
from app.entities.schemas import EntityDetailRequest, EntityMatchRequest
from app.entities.service import EntityService


class FakeEntityRepository:
    def __init__(self) -> None:
        self.detail_requests: list[tuple[str, str]] = []

    def fetch_alias_matches(self, *, alias_keys, entity_types):
        del entity_types
        rows = []
        for alias_key in alias_keys:
            if alias_key == "schizophrenia":
                rows.append(
                    {
                        "alias_key": alias_key,
                        "alias_text": "schizophrenia",
                        "is_canonical": True,
                        "alias_source": "canonical_name",
                        "entity_type": "disease",
                        "source_identifier": "MESH:D012559",
                        "canonical_name": "Schizophrenia",
                        "paper_count": 1200,
                        "highlight_mode": HIGHLIGHT_MODE_EXACT,
                    }
                )
            if alias_key == "schizophrenia spectrum disorder":
                rows.append(
                    {
                        "alias_key": alias_key,
                        "alias_text": "schizophrenia spectrum disorder",
                        "is_canonical": False,
                        "alias_source": "synonym",
                        "entity_type": "disease",
                        "source_identifier": "MESH:D012559",
                        "canonical_name": "Schizophrenia",
                        "paper_count": 1200,
                        "highlight_mode": HIGHLIGHT_MODE_EXACT,
                    }
                )
            if alias_key == "dopamine":
                rows.append(
                    {
                        "alias_key": alias_key,
                        "alias_text": "dopamine",
                        "is_canonical": True,
                        "alias_source": "canonical_name",
                        "entity_type": "chemical",
                        "source_identifier": "MESH:D004298",
                        "canonical_name": "Dopamine",
                        "paper_count": 980,
                        "highlight_mode": HIGHLIGHT_MODE_EXACT,
                    }
                )
            if alias_key == "brca1":
                rows.append(
                    {
                        "alias_key": alias_key,
                        "alias_text": "BRCA1",
                        "is_canonical": True,
                        "alias_source": "canonical_name",
                        "entity_type": "gene",
                        "source_identifier": "HGNC:1100",
                        "canonical_name": "BRCA1",
                        "paper_count": 1500,
                        "highlight_mode": HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT,
                    }
                )
        return rows

    def fetch_entity_detail(self, *, entity_type, source_identifier, alias_limit=8):
        del alias_limit
        self.detail_requests.append((entity_type, source_identifier))
        if (entity_type, source_identifier) != ("disease", "MESH:D012559"):
            return None, []
        return (
            {
                "entity_type": "disease",
                "source_identifier": "MESH:D012559",
                "canonical_name": "Schizophrenia",
                "paper_count": 1200,
            },
            [
                {
                    "alias_text": "Schizophrenia",
                    "is_canonical": True,
                    "alias_source": "canonical_name",
                },
                {
                    "alias_text": "schizophrenia spectrum disorder",
                    "is_canonical": False,
                    "alias_source": "synonym",
                },
            ],
        )


def test_entity_match_prefers_longest_non_overlapping_aliases():
    service = EntityService(repository=FakeEntityRepository())

    response = service.match_entities(
        EntityMatchRequest(
            text="Dopamine dysfunction is implicated in schizophrenia spectrum disorder.",
            limit=8,
        )
    )

    assert [match.matched_text for match in response.matches] == [
        "Dopamine",
        "schizophrenia spectrum disorder",
    ]
    assert response.matches[0].concept_namespace == "mesh"
    assert response.matches[0].concept_id == "D004298"
    assert response.matches[1].concept_id == "D012559"


def test_entity_detail_returns_canonical_identity_and_aliases():
    repository = FakeEntityRepository()
    service = EntityService(repository=repository)

    response = service.get_entity_detail(
        EntityDetailRequest(
            entity_type="disease",
            source_identifier="MESH:D012559",
        )
    )

    assert repository.detail_requests == [("disease", "MESH:D012559")]
    assert response.entity.concept_namespace == "mesh"
    assert response.entity.concept_id == "D012559"
    assert [alias.alias_text for alias in response.entity.aliases] == [
        "Schizophrenia",
        "schizophrenia spectrum disorder",
    ]


def test_entity_match_respects_case_sensitive_highlight_mode():
    service = EntityService(repository=FakeEntityRepository())

    uppercase_response = service.match_entities(
        EntityMatchRequest(
            text="BRCA1 is associated with schizophrenia.",
            limit=8,
        )
    )
    lowercase_response = service.match_entities(
        EntityMatchRequest(
            text="brca1 is associated with schizophrenia.",
            limit=8,
        )
    )

    assert [match.matched_text for match in uppercase_response.matches] == [
        "BRCA1",
        "schizophrenia",
    ]
    assert [match.matched_text for match in lowercase_response.matches] == [
        "schizophrenia",
    ]
