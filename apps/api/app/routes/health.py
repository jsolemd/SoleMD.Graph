from __future__ import annotations

import socket
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import DependencyTarget, Settings


router = APIRouter(tags=["system"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    environment: str


class DependencyStatus(BaseModel):
    name: str
    host: str
    port: int
    ok: bool
    error: str | None = None


class ReadinessResponse(BaseModel):
    status: Literal["ready", "not_ready"]
    service: str
    checks: list[DependencyStatus]


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def check_dependency(target: DependencyTarget, timeout: float) -> DependencyStatus:
    try:
        with socket.create_connection((target.host, target.port), timeout=timeout):
            return DependencyStatus(
                name=target.name,
                host=target.host,
                port=target.port,
                ok=True,
            )
    except OSError as exc:
        return DependencyStatus(
            name=target.name,
            host=target.host,
            port=target.port,
            ok=False,
            error=str(exc),
        )


@router.get("/healthz")
async def healthz(request: Request) -> HealthResponse:
    app_settings = get_settings(request)
    return HealthResponse(
        status="ok",
        service=app_settings.service_name,
        environment=app_settings.app_env,
    )


@router.get("/readyz", response_model=None)
async def readyz(request: Request) -> JSONResponse:
    app_settings = get_settings(request)
    checks = [
        check_dependency(target, app_settings.api_readiness_timeout_seconds)
        for target in app_settings.readiness_targets
    ]
    overall = "ready" if all(check.ok for check in checks) else "not_ready"
    payload = ReadinessResponse(
        status=overall,
        service=app_settings.service_name,
        checks=checks,
    )
    status_code = 200 if overall == "ready" else 503
    return JSONResponse(status_code=status_code, content=payload.model_dump())
