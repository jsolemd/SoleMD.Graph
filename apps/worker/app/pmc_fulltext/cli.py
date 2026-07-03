from __future__ import annotations

import argparse
import asyncio
from dataclasses import asdict
import json
import os
from uuid import UUID

from app.config import Settings, settings
from app.db import open_pools
from app.pmc_fulltext.models import (
    PmcFullTextRetryRequest,
    PmcFullTextRunRequest,
    PmcFullTextRunSummary,
)
from app.pmc_fulltext.runtime import (
    qa_pmc_fulltext_run,
    retry_pmc_fulltext_run,
    run_pmc_fulltext,
)


def add_pmc_fulltext_command_parsers(subparsers: argparse._SubParsersAction) -> None:
    parser = subparsers.add_parser(
        "pmc-fulltext",
        help="Run the licensed PMC full-text enrichment lane.",
    )
    command_parsers = parser.add_subparsers(dest="pmc_fulltext_command", required=True)

    pilot_parser = command_parsers.add_parser(
        "pilot",
        help="Run a bounded metadata-only PMCID rescue pilot.",
    )
    pilot_parser.add_argument("--limit", type=int, default=500)
    pilot_parser.add_argument(
        "--selector",
        choices=("metadata-only-pmcid", "mapped-pmcid"),
        default="metadata-only-pmcid",
    )
    pilot_parser.add_argument("--requested-by", default=os.environ.get("USER"))

    run_parser = command_parsers.add_parser(
        "run",
        help="Run PMC full-text enrichment for a selector.",
    )
    run_parser.add_argument(
        "--selector",
        choices=("metadata-only-pmcid", "mapped-pmcid"),
        default="mapped-pmcid",
    )
    run_parser.add_argument("--limit", type=int, required=True)
    run_parser.add_argument("--requested-by", default=os.environ.get("USER"))

    retry_parser = command_parsers.add_parser(
        "retry",
        help="Retry failed/unavailable documents from a previous PMC full-text run.",
    )
    retry_parser.add_argument("--run-id", type=UUID, required=True)
    retry_parser.add_argument("--limit", type=int, default=None)
    retry_parser.add_argument("--requested-by", default=os.environ.get("USER"))

    qa_parser = command_parsers.add_parser(
        "qa",
        help="Summarize document/passages materialized by a PMC full-text run.",
    )
    qa_parser.add_argument("--run-id", type=UUID, required=True)
    qa_parser.add_argument("--sample", type=int, default=25)


def handle_pmc_fulltext_command(
    args: argparse.Namespace,
    *,
    runtime_settings: Settings = settings,
) -> int | None:
    if args.command != "pmc-fulltext":
        return None

    if args.pmc_fulltext_command in {"pilot", "run"}:
        request = PmcFullTextRunRequest(
            selector_version=args.selector,
            limit=args.limit,
            requested_by=args.requested_by,
        )
        payload = asyncio.run(_run_request(request, runtime_settings=runtime_settings))
        _print_json(payload)
        return 0

    if args.pmc_fulltext_command == "retry":
        request = PmcFullTextRetryRequest(
            run_id=args.run_id,
            limit=args.limit,
            requested_by=args.requested_by,
        )
        payload = asyncio.run(_retry_request(request, runtime_settings=runtime_settings))
        _print_json(payload)
        return 0

    if args.pmc_fulltext_command == "qa":
        payload = asyncio.run(
            _qa_request(args.run_id, sample=args.sample, runtime_settings=runtime_settings)
        )
        _print_json(payload)
        return 0

    return None


async def _run_request(
    request: PmcFullTextRunRequest,
    *,
    runtime_settings: Settings,
) -> dict[str, object]:
    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        summary = await run_pmc_fulltext(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
        return _summary_payload(summary)
    finally:
        await pools.close()


async def _retry_request(
    request: PmcFullTextRetryRequest,
    *,
    runtime_settings: Settings,
) -> dict[str, object]:
    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        summary = await retry_pmc_fulltext_run(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
        return _summary_payload(summary)
    finally:
        await pools.close()


def _summary_payload(summary: PmcFullTextRunSummary) -> dict[str, object]:
    return asdict(summary)


def _json_payload(payload: dict[str, object]) -> str:
    return json.dumps(payload, indent=2, sort_keys=True, default=str)


def _print_json(payload: dict[str, object]) -> None:
    print(_json_payload(payload))


async def _qa_request(
    run_id: UUID,
    *,
    sample: int,
    runtime_settings: Settings,
) -> dict[str, object]:
    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        async with pools.get("ingest_write").acquire() as connection:
            return await qa_pmc_fulltext_run(connection, run_id=run_id, sample=sample)
    finally:
        await pools.close()
