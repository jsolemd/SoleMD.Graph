from __future__ import annotations

from app.actors.hot_text import acquire_for_paper
from app.hot_text.models import AcquirePaperTextRequest


def parse_paper_text_request(
    *,
    corpus_id: int,
    force_refresh: bool,
    requested_by: str | None,
) -> AcquirePaperTextRequest:
    return AcquirePaperTextRequest.model_validate(
        {
            "corpus_id": corpus_id,
            "force_refresh": force_refresh,
            "requested_by": requested_by,
        }
    )


def enqueue_paper_text_request(request: AcquirePaperTextRequest) -> None:
    acquire_for_paper.send(**request.model_dump(mode="json"))

