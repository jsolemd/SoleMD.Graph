"""Shared FastAPI endpoint helpers for consistent request handling."""

from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from fastapi import HTTPException

T = TypeVar("T")


def run_api(
    operation: Callable[[], T],
    *,
    not_found_detail: str | None = None,
) -> T:
    """Execute an endpoint operation with canonical API error translation."""

    try:
        result = operation()
    except KeyError as exc:
        detail = not_found_detail or _coerce_detail(exc)
        raise HTTPException(status_code=404, detail=detail) from exc
    except LookupError as exc:
        detail = not_found_detail or _coerce_detail(exc)
        raise HTTPException(status_code=404, detail=detail) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=_coerce_detail(exc)) from exc

    if result is None and not_found_detail is not None:
        raise HTTPException(status_code=404, detail=not_found_detail)

    return result


def _coerce_detail(error: Exception) -> str:
    detail = str(error).strip()
    return detail or error.__class__.__name__
