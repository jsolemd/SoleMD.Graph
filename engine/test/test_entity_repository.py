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


def test_fetch_page_context_uses_combined_serving_projections(monkeypatch):
    queries_executed: list[tuple[str, object]] = []

    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, query, params):
            queries_executed.append((str(query), params))

        def fetchall(self):
            return [
                {
                    "total_corpus_paper_count": 42,
                    "pmid": 123,
                    "graph_paper_ref": "paper:123",
                    "paper_title": "Paper 123",
                    "year": 2024,
                    "venue": "JAMA",
                    "citation_count": 55,
                }
            ]

        def fetchone(self):
            return {"total_graph_paper_count": 12}

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self):
            return FakeCursor()

    monkeypatch.setattr("app.entities.repository.db.pooled", lambda: FakeConnection())

    repository = EntityGraphProjectionRepository()
    context = repository.fetch_page_context(
        entity_type="disease",
        source_identifier="MESH:D003693",
        graph_run_id="run-1",
        limit=5,
    )

    assert context["total_corpus_paper_count"] == 42
    assert context["total_graph_paper_count"] == 12
    assert context["top_graph_papers"] == [
        {
            "pmid": 123,
            "graph_paper_ref": "paper:123",
            "paper_title": "Paper 123",
            "year": 2024,
            "venue": "JAMA",
            "citation_count": 55,
        }
    ]

    # Two queries: top papers + graph count
    assert len(queries_executed) == 2

    top_papers_query, top_papers_params = queries_executed[0]
    assert "FROM solemd.entity_corpus_presence ecp" in top_papers_query
    assert "JOIN solemd.graph_paper_summary gps" in top_papers_query
    assert "EXISTS" in top_papers_query
    assert "LEFT JOIN solemd.papers p" not in top_papers_query
    assert "FROM pubtator.entity_annotations" not in top_papers_query
    assert top_papers_params == (
        "disease", "MESH:D003693",           # corpus count subquery
        "disease", "MESH:D003693", "run-1",  # main query + EXISTS
        5,                                    # LIMIT
    )

    graph_count_query, graph_count_params = queries_executed[1]
    assert "COUNT(*)::int" in graph_count_query
    assert graph_count_params == ("disease", "MESH:D003693", "run-1")
