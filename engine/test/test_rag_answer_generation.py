from __future__ import annotations

from app.rag.answer_generation import _build_evidence_prompt
from app.rag.models import EvidenceBundle, PaperAuthorRecord, PaperEvidenceHit


def test_build_evidence_prompt_includes_author_journal_year_metadata():
    bundle = EvidenceBundle(
        paper=PaperEvidenceHit(
            corpus_id=101,
            paper_id="paper-101",
            semantic_scholar_paper_id="paper-101",
            title="Melatonin for postoperative delirium",
            journal_name="JAMA",
            year=2024,
            doi=None,
            pmid=None,
            pmcid=None,
            abstract="Study abstract.",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
        ),
        score=0.9,
        rank=1,
        snippet="Melatonin reduced postoperative delirium incidence.",
        authors=[
            PaperAuthorRecord(
                corpus_id=101,
                author_position=1,
                author_id="author-1",
                name="Jane Doe",
            ),
            PaperAuthorRecord(
                corpus_id=101,
                author_position=2,
                author_id="author-2",
                name="John Smith",
            ),
        ],
    )

    prompt = _build_evidence_prompt([bundle], "Does melatonin reduce delirium?")

    assert "[1] | Doe et al. | JAMA | 2024 | Melatonin for postoperative delirium" in prompt
    assert "Melatonin reduced postoperative delirium incidence." in prompt
