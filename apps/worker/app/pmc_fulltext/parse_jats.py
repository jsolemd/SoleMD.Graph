from __future__ import annotations

from app.pmc_fulltext.models import PmcFullTextParseFailed


PARSER_NAME = "jats"
PARSER_VERSION = "deferred:fixture-gated"


def parse_pmc_jats_fulltext(*_args: object, **_kwargs: object) -> None:
    raise PmcFullTextParseFailed(
        "JATS parsing is disabled until BioC/JATS fixture comparison is promoted"
    )
