from __future__ import annotations

import pytest

from app.config import Settings
from app.pmc_fulltext.availability import PmcAvailabilityResolver, parse_pmc_oa_response


@pytest.mark.asyncio
async def test_resolver_rejects_oa_none_license_without_oai_license() -> None:
    resolver = PmcAvailabilityResolver(
        _settings(),
        _FakeAvailabilityFetcher(
            oa_payload=b'<OA><records><record id="PMC1" license="none" /></records></OA>',
            oai_payload=(
                b'<OAI-PMH><error code="idDoesNotExist">'
                b"licensed full text unavailable"
                b"</error></OAI-PMH>"
            ),
        ),
    )

    availability = await resolver.resolve("PMC1")

    assert availability.available is False
    assert availability.provider == "pmc_oa"
    assert availability.license is None
    assert availability.reason == "PMC OA result did not include license provenance"


@pytest.mark.asyncio
async def test_resolver_falls_back_to_oai_when_oa_license_is_none() -> None:
    resolver = PmcAvailabilityResolver(
        _settings(),
        _FakeAvailabilityFetcher(
            oa_payload=b'<OA><records><record id="PMC1" license="none" /></records></OA>',
            oai_payload=b"""<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns:xlink="http://www.w3.org/1999/xlink">
  <GetRecord>
    <record>
      <metadata>
        <article>
          <permissions>
            <license xlink:href="https://creativecommons.org/licenses/by/4.0/">
              <license-p>CC BY 4.0</license-p>
            </license>
          </permissions>
        </article>
      </metadata>
    </record>
  </GetRecord>
</OAI-PMH>
""",
        ),
    )

    availability = await resolver.resolve("PMC1")

    assert availability.available is True
    assert availability.provider == "pmc_oai"
    assert availability.license == "CC BY 4.0"
    assert availability.license_url == "https://creativecommons.org/licenses/by/4.0/"


def test_parse_pmc_oa_response_normalizes_none_license_to_missing() -> None:
    availability = parse_pmc_oa_response(
        b'<OA><records><record id="PMC1" license="none" /></records></OA>',
        pmcid="PMC1",
        source_url="https://example.test/oa",
    )

    assert availability.available is True
    assert availability.license is None


class _FakeAvailabilityFetcher:
    def __init__(self, *, oa_payload: bytes, oai_payload: bytes) -> None:
        self._oa_payload = oa_payload
        self._oai_payload = oai_payload

    async def fetch_bytes(self, *, provider: str, **_: object) -> bytes:
        if provider == "pmc_oa":
            return self._oa_payload
        if provider == "pmc_oai":
            return self._oai_payload
        raise AssertionError(f"unexpected provider {provider}")


def _settings() -> Settings:
    return Settings(
        REDIS_URL="redis://127.0.0.1:57379/0",
        WORKER_METRICS_PORT="",
    )
