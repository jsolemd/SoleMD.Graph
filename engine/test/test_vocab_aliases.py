"""Tests for app.corpus.vocab_aliases."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from app.corpus.vocab_aliases import (
    _MIN_ALIAS_LEN,
    VocabAliasRecord,
    build_vocab_term_aliases_table,
    load_vocab_alias_records,
)


class TestLoadVocabAliasRecords:
    def test_loads_and_normalizes_alias_rows(self, tmp_path: Path):
        tsv = tmp_path / "vocab_aliases.tsv"
        tsv.write_text(
            "\n".join(
                [
                    "term_id\talias\talias_type\tquality_score\tis_preferred\tumls_cui",
                    "00000000-0000-0000-0000-000000000001\t  Dopamine   \tSY\t90\tt\tC0011581",
                    "00000000-0000-0000-0000-000000000001\tDopamine receptor\tSY\t85\tf\t",
                ]
            )
        )

        result = load_vocab_alias_records(tsv)

        assert result == [
            VocabAliasRecord(
                term_id="00000000-0000-0000-0000-000000000001",
                alias_text="Dopamine",
                alias_key="dopamine",
                alias_type="SY",
                quality_score=90,
                is_preferred=True,
                umls_cui="C0011581",
            ),
            VocabAliasRecord(
                term_id="00000000-0000-0000-0000-000000000001",
                alias_text="Dopamine receptor",
                alias_key="dopamine receptor",
                alias_type="SY",
                quality_score=85,
                is_preferred=False,
                umls_cui=None,
            ),
        ]

    def test_deduplicates_same_term_and_alias_key_by_preference_then_quality(self, tmp_path: Path):
        tsv = tmp_path / "vocab_aliases.tsv"
        tsv.write_text(
            "\n".join(
                [
                    "term_id\talias\talias_type\tquality_score\tis_preferred\tumls_cui",
                    "00000000-0000-0000-0000-000000000001\tAmyloid beta\tSY\t80\tf\tC0078939",
                    "00000000-0000-0000-0000-000000000001\t  amyloid   beta \tPT\t95\tt\tC0078939",
                ]
            )
        )

        result = load_vocab_alias_records(tsv)

        assert result == [
            VocabAliasRecord(
                term_id="00000000-0000-0000-0000-000000000001",
                alias_text="amyloid beta",
                alias_key="amyloid beta",
                alias_type="PT",
                quality_score=95,
                is_preferred=True,
                umls_cui="C0078939",
            )
        ]

    def test_derives_acronym_aliases_from_parenthetical_and_dashed_surfaces(self, tmp_path: Path):
        tsv = tmp_path / "vocab_aliases.tsv"
        tsv.write_text(
            "\n".join(
                [
                    "term_id\talias\talias_type\tquality_score\tis_preferred\tumls_cui",
                    (
                        "00000000-0000-0000-0000-000000000001\t"
                        "Selective Serotonin Reuptake Inhibitor (SSRI)\tSY\t100\tt\tC4552594"
                    ),
                    (
                        "00000000-0000-0000-0000-000000000001\t"
                        "SSRI - Selective serotonin reuptake inhibitor\tSY\t85\tf\tC4552594"
                    ),
                ]
            )
        )

        result = load_vocab_alias_records(tsv)

        assert result == [
            VocabAliasRecord(
                term_id="00000000-0000-0000-0000-000000000001",
                alias_text="Selective Serotonin Reuptake Inhibitor (SSRI)",
                alias_key="selective serotonin reuptake inhibitor (ssri)",
                alias_type="SY",
                quality_score=100,
                is_preferred=True,
                umls_cui="C4552594",
            ),
            VocabAliasRecord(
                term_id="00000000-0000-0000-0000-000000000001",
                alias_text="SSRI",
                alias_key="ssri",
                alias_type="derived_acronym",
                quality_score=100,
                is_preferred=True,
                umls_cui="C4552594",
            ),
            VocabAliasRecord(
                term_id="00000000-0000-0000-0000-000000000001",
                alias_text="SSRI - Selective serotonin reuptake inhibitor",
                alias_key="ssri - selective serotonin reuptake inhibitor",
                alias_type="SY",
                quality_score=85,
                is_preferred=False,
                umls_cui="C4552594",
            ),
        ]

    def test_skips_short_blank_and_missing_term_rows(self, tmp_path: Path):
        tsv = tmp_path / "vocab_aliases.tsv"
        tsv.write_text(
            "\n".join(
                [
                    "term_id\talias\talias_type\tquality_score\tis_preferred\tumls_cui",
                    "\tDopamine\tSY\t90\tt\tC0011581",
                    "00000000-0000-0000-0000-000000000001\t \tSY\t90\tt\tC0011581",
                    "00000000-0000-0000-0000-000000000001\tMAO\tSY\t90\tt\tC0011581",
                    "00000000-0000-0000-0000-000000000001\tGABA\tSY\t90\tt\tC0011581",
                ]
            )
        )

        result = load_vocab_alias_records(tsv)

        assert len(result) == 1
        assert result[0].alias_key == "gaba"
        assert len(result[0].alias_key) == _MIN_ALIAS_LEN


class _FakeCopy:
    def __init__(self) -> None:
        self.rows: list[tuple] = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def write_row(self, row: tuple) -> None:
        self.rows.append(row)


class _FakeCursor:
    def __init__(self) -> None:
        self.executed: list[tuple[str, object | None]] = []
        self.copy_context = _FakeCopy()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql: str, params=None) -> None:
        self.executed.append((sql, params))

    def copy(self, sql: str) -> _FakeCopy:
        self.executed.append((sql, None))
        return self.copy_context

    def fetchone(self):
        return {"cnt": len(self.copy_context.rows)}


class _FakeConnection:
    def __init__(self) -> None:
        self.cursor_obj = _FakeCursor()
        self.commit_calls = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def cursor(self) -> _FakeCursor:
        return self.cursor_obj

    def commit(self) -> None:
        self.commit_calls += 1


def test_build_vocab_term_aliases_table_copies_rows_and_logs(tmp_path: Path):
    tsv = tmp_path / "vocab_aliases.tsv"
    tsv.write_text(
        "\n".join(
            [
                "term_id\talias\talias_type\tquality_score\tis_preferred\tumls_cui",
                "00000000-0000-0000-0000-000000000001\tDopamine\tSY\t90\tt\tC0011581",
                "00000000-0000-0000-0000-000000000002\tSerotonin\tSY\t88\tf\tC0036763",
            ]
        )
    )
    fake_conn = _FakeConnection()

    with (
        patch("app.corpus.vocab_aliases.db.connect", return_value=fake_conn),
        patch("app.corpus.vocab_aliases.log_etl_run") as mock_log_etl_run,
    ):
        result = build_vocab_term_aliases_table(tsv_path=tsv)

    assert result["inserted"] == 2
    assert result["total_aliases"] == 2
    assert result["distinct_terms"] == 2
    assert fake_conn.commit_calls == 1
    assert fake_conn.cursor_obj.copy_context.rows == [
        (
            "00000000-0000-0000-0000-000000000001",
            "Dopamine",
            "dopamine",
            "SY",
            90,
            True,
            "C0011581",
        ),
        (
            "00000000-0000-0000-0000-000000000002",
            "Serotonin",
            "serotonin",
            "SY",
            88,
            False,
            "C0036763",
        ),
    ]
    mock_log_etl_run.assert_called_once()


def test_build_vocab_term_aliases_table_dry_run_reports_counts(tmp_path: Path):
    tsv = tmp_path / "vocab_aliases.tsv"
    tsv.write_text(
        "\n".join(
            [
                "term_id\talias\talias_type\tquality_score\tis_preferred\tumls_cui",
                "00000000-0000-0000-0000-000000000001\tDopamine\tSY\t90\tt\tC0011581",
            ]
        )
    )

    result = build_vocab_term_aliases_table(dry_run=True, tsv_path=tsv)

    assert result["dry_run"] is True
    assert result["total_aliases"] == 1
    assert result["distinct_terms"] == 1
