from pathlib import Path

from app.config import settings
from app.graph.export_bundle import _publish_checksum_bundle_alias


def test_publish_checksum_bundle_alias_creates_and_reuses_checksum_path(
    tmp_path: Path,
    monkeypatch,
) -> None:
    bundles_root = tmp_path / "bundles"
    run_dir = bundles_root / "run-id"
    run_dir.mkdir(parents=True)
    monkeypatch.setattr(settings, "graph_dir", str(tmp_path))

    alias_path = _publish_checksum_bundle_alias(run_dir, "bundle-checksum")

    assert alias_path == bundles_root / "by-checksum" / "bundle-checksum"
    assert alias_path.is_symlink()
    assert alias_path.resolve(strict=True) == run_dir.resolve(strict=True)

    reused_path = _publish_checksum_bundle_alias(run_dir, "bundle-checksum")
    assert reused_path == alias_path
    assert reused_path.resolve(strict=True) == run_dir.resolve(strict=True)
