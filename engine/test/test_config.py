"""Tests for app.config path resolution."""

from __future__ import annotations

from pathlib import Path

from app.config import PROJECT_ROOT, Settings


class TestSettingsPaths:
    def test_resolves_default_relative_paths_against_project_root(self):
        settings = Settings(
            _env_file=None,
            data_dir="data",
            pubtator_dir="data/pubtator",
            semantic_scholar_dir="data/semantic-scholar",
            pubtator_release_id="2026-03-21",
            s2_release_id="2026-03-10",
        )

        assert settings.project_root_path == PROJECT_ROOT
        assert settings.data_root_path == (PROJECT_ROOT / "data").resolve(strict=False)
        assert settings.pubtator_root_path == (PROJECT_ROOT / "data" / "pubtator").resolve(
            strict=False
        )
        assert settings.semantic_scholar_root_path == (
            PROJECT_ROOT / "data" / "semantic-scholar"
        ).resolve(strict=False)

    def test_derives_expected_nested_paths(self):
        settings = Settings(
            _env_file=None,
            data_dir="data",
            pubtator_dir="data/pubtator",
            semantic_scholar_dir="data/semantic-scholar",
            pubtator_release_id="2026-03-21",
            s2_release_id="2026-03-10",
        )

        # Build expected paths through the same root properties to handle
        # symlinks consistently (data dirs may be symlinked to external drives).
        pubtator_source = settings.pubtator_root_path / "releases" / "2026-03-21"
        s2_root = settings.semantic_scholar_root_path / "releases" / "2026-03-10"

        assert settings.pubtator_source_dir_path == pubtator_source
        assert settings.pubtator_entities_path == pubtator_source / "bioconcepts2pubtator3.gz"
        assert settings.semantic_scholar_papers_dir_path == s2_root / "papers"
        assert settings.vocab_aliases_path == settings.data_root_path / "vocab_aliases.tsv"
        assert settings.nlm_journals_path == (
            settings.data_root_path / "nlm_neuro_psych_journals.json"
        )

    def test_preserves_absolute_paths(self, tmp_path: Path):
        data_root = tmp_path / "graph-data"
        pubtator_root = tmp_path / "pubtator-store"
        s2_root = tmp_path / "s2-store"

        settings = Settings(
            _env_file=None,
            data_dir=str(data_root),
            pubtator_dir=str(pubtator_root),
            semantic_scholar_dir=str(s2_root),
            pubtator_release_id="2026-03-21",
            s2_release_id="2026-03-10",
        )

        assert settings.data_root_path == data_root.resolve(strict=False)
        assert settings.pubtator_root_path == pubtator_root.resolve(strict=False)
        assert settings.semantic_scholar_root_path == s2_root.resolve(strict=False)
