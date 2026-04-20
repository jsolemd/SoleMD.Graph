from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re

import asyncpg

from app.config import Settings, settings
from app.corpus.errors import MissingCuratedAssets
from app.corpus.models import AssetManifestEntry
from app.corpus.policies import ENTITY_RULES, RELATION_RULES, VENUE_PATTERN_RULES


_LEADING_THE_RE = re.compile(r"^\s*the\s+")
_SUBTITLE_RE = re.compile(r"\s*:\s+.*$")
_PAREN_RE = re.compile(r"\s*\(.*?\)\s*$")

@dataclass(frozen=True, slots=True)
class CuratedCorpusAssets:
    vocab_terms_path: Path
    vocab_aliases_path: Path
    journal_inventory_path: Path
    vocab_terms_asset: AssetManifestEntry
    vocab_aliases_asset: AssetManifestEntry
    journal_inventory_asset: AssetManifestEntry
    venue_patterns_asset: AssetManifestEntry
    entity_rules_asset: AssetManifestEntry
    relation_rules_asset: AssetManifestEntry
    journal_names: tuple[str, ...]
    venue_patterns: tuple[tuple[str, str, bool], ...]
    entity_rules: tuple[tuple[int, str, str, str, str, int], ...]
    relation_rules: tuple[tuple[int, int, int, str, str, str, int], ...]

    @property
    def asset_manifest(self) -> dict[str, AssetManifestEntry]:
        return {
            "vocab_terms": self.vocab_terms_asset,
            "vocab_aliases": self.vocab_aliases_asset,
            "journal_inventory": self.journal_inventory_asset,
            "venue_patterns": self.venue_patterns_asset,
            "entity_rules": self.entity_rules_asset,
            "relation_rules": self.relation_rules_asset,
        }

    @property
    def asset_checksums(self) -> dict[str, str]:
        return {
            key: manifest.sha256
            for key, manifest in self.asset_manifest.items()
        }


def build_curated_assets(runtime_settings: Settings = settings) -> CuratedCorpusAssets:
    vocab_terms_path = runtime_settings.resolve_project_path(
        runtime_settings.corpus_vocab_terms_path
    )
    vocab_aliases_path = runtime_settings.resolve_project_path(
        runtime_settings.corpus_vocab_aliases_path
    )
    journal_inventory_path = runtime_settings.resolve_project_path(
        runtime_settings.corpus_journal_inventory_path
    )
    missing = [
        str(path)
        for path in (vocab_terms_path, vocab_aliases_path, journal_inventory_path)
        if not path.exists()
    ]
    if missing:
        raise MissingCuratedAssets(
            "missing curated corpus asset(s): " + ", ".join(sorted(missing))
        )

    journal_names = _load_journal_names(journal_inventory_path)
    patterns_payload = json.dumps(
        [
            {
                "pattern_key": pattern_key,
                "like_pattern": like_pattern,
                "promotes_to_mapped": promotes_to_mapped,
            }
            for pattern_key, like_pattern, promotes_to_mapped in VENUE_PATTERN_RULES
        ],
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    entity_rules_payload = json.dumps(
        [
            {
                "entity_type": rule.entity_type,
                "concept_id_raw": rule.concept_id_raw,
                "canonical_name": rule.canonical_name,
                "family_key": rule.family_key,
                "confidence": rule.confidence,
                "min_reference_count": rule.min_reference_count,
            }
            for rule in ENTITY_RULES
        ],
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    relation_rules_payload = json.dumps(
        [
            {
                "subject_type": rule.subject_type,
                "relation_type": rule.relation_type,
                "object_type": rule.object_type,
                "object_id_raw": rule.object_id_raw,
                "canonical_name": rule.canonical_name,
                "family_key": rule.family_key,
                "min_reference_count": rule.min_reference_count,
            }
            for rule in RELATION_RULES
        ],
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return CuratedCorpusAssets(
        vocab_terms_path=vocab_terms_path,
        vocab_aliases_path=vocab_aliases_path,
        journal_inventory_path=journal_inventory_path,
        vocab_terms_asset=_fingerprint_file(vocab_terms_path),
        vocab_aliases_asset=_fingerprint_file(vocab_aliases_path),
        journal_inventory_asset=_fingerprint_file(journal_inventory_path),
        venue_patterns_asset=AssetManifestEntry(
            asset_uri="embedded://corpus/venue_patterns",
            sha256=hashlib.sha256(patterns_payload).hexdigest(),
            byte_count=len(patterns_payload),
        ),
        entity_rules_asset=AssetManifestEntry(
            asset_uri="embedded://corpus/entity_rules",
            sha256=hashlib.sha256(entity_rules_payload).hexdigest(),
            byte_count=len(entity_rules_payload),
        ),
        relation_rules_asset=AssetManifestEntry(
            asset_uri="embedded://corpus/relation_rules",
            sha256=hashlib.sha256(relation_rules_payload).hexdigest(),
            byte_count=len(relation_rules_payload),
        ),
        journal_names=journal_names,
        venue_patterns=VENUE_PATTERN_RULES,
        entity_rules=tuple(
            (
                rule.entity_type,
                rule.concept_id_raw,
                rule.canonical_name,
                rule.family_key,
                rule.confidence,
                rule.min_reference_count,
            )
            for rule in ENTITY_RULES
        ),
        relation_rules=tuple(
            (
                rule.subject_type,
                rule.relation_type,
                rule.object_type,
                rule.object_id_raw,
                rule.canonical_name,
                rule.family_key,
                rule.min_reference_count,
            )
            for rule in RELATION_RULES
        ),
    )


async def materialize_curated_vocab(
    connection: asyncpg.Connection,
    assets: CuratedCorpusAssets,
) -> tuple[int, int]:
    await connection.execute(
        """
        CREATE TEMP TABLE corpus_vocab_terms_stage (
            id UUID,
            canonical_name TEXT,
            category TEXT,
            umls_cui TEXT,
            rxnorm_cui TEXT,
            semantic_types TEXT[],
            semantic_groups TEXT[],
            organ_systems TEXT[]
        ) ON COMMIT DROP
        """
    )
    await connection.execute(
        """
        CREATE TEMP TABLE corpus_vocab_aliases_stage (
            term_id UUID,
            alias TEXT,
            alias_type TEXT,
            quality_score INTEGER,
            is_preferred BOOLEAN,
            umls_cui TEXT
        ) ON COMMIT DROP
        """
    )
    with assets.vocab_terms_path.open("rb") as vocab_terms_file:
        await connection.copy_to_table(
            "corpus_vocab_terms_stage",
            schema_name="pg_temp",
            source=vocab_terms_file,
            format="csv",
            delimiter="\t",
            header=True,
        )
    with assets.vocab_aliases_path.open("rb") as vocab_aliases_file:
        await connection.copy_to_table(
            "corpus_vocab_aliases_stage",
            schema_name="pg_temp",
            source=vocab_aliases_file,
            format="csv",
            delimiter="\t",
            header=True,
        )

    await connection.execute("DELETE FROM solemd.vocab_term_aliases")
    await connection.execute("DELETE FROM solemd.vocab_terms")
    await connection.execute(
        """
        INSERT INTO solemd.vocab_terms (
            term_id,
            canonical_name,
            category,
            umls_cui,
            rxnorm_cui,
            semantic_types,
            semantic_groups,
            organ_systems,
            source_asset_sha256
        )
        SELECT
            stage.id,
            btrim(stage.canonical_name),
            btrim(stage.category),
            NULLIF(btrim(stage.umls_cui), ''),
            NULLIF(btrim(stage.rxnorm_cui), ''),
            coalesce(stage.semantic_types, ARRAY[]::TEXT[]),
            coalesce(stage.semantic_groups, ARRAY[]::TEXT[]),
            coalesce(stage.organ_systems, ARRAY[]::TEXT[]),
            $1
        FROM pg_temp.corpus_vocab_terms_stage stage
        WHERE NULLIF(btrim(stage.canonical_name), '') IS NOT NULL
        """,
        assets.vocab_terms_asset.sha256,
    )
    await connection.execute(
        """
        INSERT INTO solemd.vocab_term_aliases (
            term_id,
            alias,
            alias_type,
            quality_score,
            is_preferred,
            umls_cui,
            source_asset_sha256
        )
        SELECT
            stage.term_id,
            btrim(stage.alias),
            NULLIF(btrim(stage.alias_type), ''),
            stage.quality_score,
            coalesce(stage.is_preferred, false),
            NULLIF(btrim(stage.umls_cui), ''),
            $1
        FROM pg_temp.corpus_vocab_aliases_stage stage
        WHERE NULLIF(btrim(stage.alias), '') IS NOT NULL
        """,
        assets.vocab_aliases_asset.sha256,
    )
    term_count = await connection.fetchval("SELECT count(*) FROM solemd.vocab_terms")
    alias_count = await connection.fetchval("SELECT count(*) FROM solemd.vocab_term_aliases")
    return int(term_count), int(alias_count)


async def prepare_selector_temp_tables(
    connection: asyncpg.Connection,
    assets: CuratedCorpusAssets,
) -> None:
    await connection.execute("DROP TABLE IF EXISTS pg_temp.selector_journal_names")
    await connection.execute("DROP TABLE IF EXISTS pg_temp.selector_journal_patterns")
    await connection.execute("DROP TABLE IF EXISTS pg_temp.selector_entity_rules")
    await connection.execute("DROP TABLE IF EXISTS pg_temp.selector_relation_rules")
    await connection.execute(
        """
        CREATE TEMP TABLE selector_journal_names (
            normalized_venue TEXT PRIMARY KEY
        )
        """
    )
    await connection.execute(
        """
        CREATE TEMP TABLE selector_journal_patterns (
            pattern_key TEXT PRIMARY KEY,
            like_pattern TEXT NOT NULL,
            promotes_to_mapped BOOLEAN NOT NULL DEFAULT true
        )
        """
    )
    await connection.execute(
        """
        CREATE TEMP TABLE selector_entity_rules (
            entity_type SMALLINT NOT NULL,
            concept_id_raw TEXT NOT NULL,
            canonical_name TEXT NOT NULL,
            family_key TEXT NOT NULL,
            confidence TEXT NOT NULL,
            min_reference_count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (entity_type, concept_id_raw)
        )
        """
    )
    await connection.execute(
        """
        CREATE TEMP TABLE selector_relation_rules (
            subject_type SMALLINT NOT NULL,
            relation_type SMALLINT NOT NULL,
            object_type SMALLINT NOT NULL,
            object_id_raw TEXT NOT NULL,
            canonical_name TEXT NOT NULL,
            family_key TEXT NOT NULL,
            min_reference_count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (subject_type, relation_type, object_type, object_id_raw)
        )
        """
    )
    if assets.journal_names:
        await connection.copy_records_to_table(
            "selector_journal_names",
            schema_name="pg_temp",
            columns=("normalized_venue",),
            records=[(value,) for value in assets.journal_names],
        )
    if assets.venue_patterns:
        await connection.copy_records_to_table(
            "selector_journal_patterns",
            schema_name="pg_temp",
            columns=("pattern_key", "like_pattern", "promotes_to_mapped"),
            records=list(assets.venue_patterns),
        )
    if assets.entity_rules:
        await connection.copy_records_to_table(
            "selector_entity_rules",
            schema_name="pg_temp",
            columns=(
                "entity_type",
                "concept_id_raw",
                "canonical_name",
                "family_key",
                "confidence",
                "min_reference_count",
            ),
            records=list(assets.entity_rules),
        )
    if assets.relation_rules:
        await connection.copy_records_to_table(
            "selector_relation_rules",
            schema_name="pg_temp",
            columns=(
                "subject_type",
                "relation_type",
                "object_type",
                "object_id_raw",
                "canonical_name",
                "family_key",
                "min_reference_count",
            ),
            records=list(assets.relation_rules),
        )


def _load_journal_names(path: Path) -> tuple[str, ...]:
    journals = json.loads(path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for journal in journals:
        for raw_name in (journal.get("title"), journal.get("medline_abbr")):
            normalized = _clean_venue(raw_name)
            if normalized and len(normalized) > 2:
                names.add(normalized)
    return tuple(sorted(names))


def _clean_venue(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower().rstrip(".")
    normalized = _LEADING_THE_RE.sub("", normalized)
    normalized = _SUBTITLE_RE.sub("", normalized)
    normalized = _PAREN_RE.sub("", normalized)
    normalized = normalized.strip()
    return normalized or None


def _fingerprint_file(path: Path) -> AssetManifestEntry:
    return AssetManifestEntry(
        asset_uri=str(path.resolve()),
        sha256=_sha256_path(path),
        byte_count=path.stat().st_size,
    )


def _sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
