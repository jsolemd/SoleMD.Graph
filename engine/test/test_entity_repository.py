from __future__ import annotations

from app.entities.repository import EntityCatalogRepository, EntityGraphProjectionRepository


def test_fetch_alias_matches_uses_runtime_alias_serving_table(monkeypatch):
    executed: dict[str, object] = {}

    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, query, params):
            executed["query"] = query
            executed["params"] = params

        def fetchall(self):
            return []

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self):
            return FakeCursor()

    monkeypatch.setattr("app.entities.repository.db.pooled", lambda: FakeConnection())

    repository = EntityCatalogRepository()
    repository.fetch_alias_matches(alias_keys=["and", "schizophrenia"], entity_types=[])

    assert "FROM solemd.entity_runtime_aliases era" in str(executed["query"])
    assert "highlight_mode = ANY" not in str(executed["query"])
    assert "ea.is_canonical = true" not in str(executed["query"])
    assert executed["params"] == [["and", "schizophrenia"]]


def test_fetch_entity_detail_uses_serving_alias_projection(monkeypatch):
    executed: list[tuple[str, object]] = []

    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, query, params):
            executed.append((str(query), params))

        def fetchone(self):
            return {
                "entity_type": "disease",
                "source_identifier": "MESH:D003693",
                "canonical_name": "Delirium",
                "paper_count": 42,
            }

        def fetchall(self):
            return [
                {
                    "alias_text": "delirium",
                    "is_canonical": True,
                    "alias_source": "canonical_name",
                }
            ]

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self):
            return FakeCursor()

    monkeypatch.setattr("app.entities.repository.db.pooled", lambda: FakeConnection())

    repository = EntityCatalogRepository()
    detail, aliases = repository.fetch_entity_detail(
        entity_type="disease",
        source_identifier="MESH:D003693",
    )

    assert detail is not None
    assert aliases == [
        {
            "alias_text": "delirium",
            "is_canonical": True,
            "alias_source": "canonical_name",
        }
    ]
    assert "WHERE e.entity_type = %s" in executed[0][0]
    assert "lower(e.entity_type)" not in executed[0][0]
    assert "FROM solemd.entity_runtime_aliases" in executed[1][0]
    assert "FROM solemd.entity_aliases" not in executed[1][0]
    assert "WHERE entity_type = %s" in executed[1][0]
    assert "lower(entity_type)" not in executed[1][0]


def test_fetch_page_context_top_papers_uses_entity_corpus_presence_projection(monkeypatch):
    executed: dict[str, object] = {}

    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, query, params):
            executed["query"] = str(query)
            executed["params"] = params

        def fetchall(self):
            return [
                {
                    "pmid": 123,
                    "graph_paper_ref": "paper:123",
                    "paper_title": "Paper 123",
                    "year": 2024,
                    "venue": "JAMA",
                    "citation_count": 55,
                }
            ]

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self):
            return FakeCursor()

    monkeypatch.setattr("app.entities.repository.db.pooled", lambda: FakeConnection())

    repository = EntityGraphProjectionRepository()
    rows = repository.fetch_page_context_top_papers(
        entity_type="disease",
        source_identifier="MESH:D003693",
        graph_run_id="run-1",
        limit=5,
    )

    assert rows == [
        {
            "pmid": 123,
            "graph_paper_ref": "paper:123",
            "paper_title": "Paper 123",
            "year": 2024,
            "venue": "JAMA",
            "citation_count": 55,
        }
    ]
    assert "FROM solemd.entity_corpus_presence ecp" in executed["query"]
    assert "LEFT JOIN solemd.graph_paper_summary gps" in executed["query"]
    assert "LEFT JOIN solemd.papers p" not in executed["query"]
    assert "FROM pubtator.entity_annotations" not in executed["query"]
    assert executed["params"] == ("run-1", "disease", "MESH:D003693", 5)
