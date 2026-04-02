from __future__ import annotations

from app.rag.text_alignment import score_text_alignment


def test_score_text_alignment_detects_exact_sentence_containment():
    score = score_text_alignment(
        "This cohort found that reduced physical performance predicted decline.",
        "Reduced physical performance predicted decline",
    )

    assert score.containment == 1
    assert score.token_overlap >= 5
    assert score.longest_common_span >= 5
    assert score.query_coverage == 1.0


def test_score_text_alignment_handles_near_exact_title_variants():
    score = score_text_alignment(
        (
            "EFFECTS OF PRENATAL ETHANOL EXPOSURE ON PHYSICAL GROWTH, "
            "SENSORY REFLEX MATURATION AND BRAIN DEVELOPMENT IN THE RAT"
        ),
        (
            "Effects of prenatal ethanol exposure on physical growths, "
            "sensory reflex maturation and brain development in the rat"
        ),
    )

    assert score.containment == 0
    assert score.longest_common_span >= 6
    assert score.query_coverage >= 0.8


def test_score_text_alignment_returns_empty_score_for_blank_inputs():
    score = score_text_alignment("", None)

    assert score.containment == 0
    assert score.token_overlap == 0
    assert score.longest_common_span == 0
