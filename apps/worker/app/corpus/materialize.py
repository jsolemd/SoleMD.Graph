from __future__ import annotations

from app.corpus.materialize_baseline import materialize_corpus_baseline
from app.corpus.materialize_mapped import materialize_mapped_surfaces


CORPUS_BASELINE_PHASE_NAME = "corpus_baseline_materialization"
MAPPED_SURFACES_PHASE_NAME = "mapped_surface_materialization"

__all__ = [
    "CORPUS_BASELINE_PHASE_NAME",
    "MAPPED_SURFACES_PHASE_NAME",
    "materialize_corpus_baseline",
    "materialize_mapped_surfaces",
]
