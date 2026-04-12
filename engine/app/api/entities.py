"""FastAPI routes for canonical entity matching and hover detail."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.http import run_api
from app.entities.schemas import (
    EntityDetailRequest,
    EntityDetailResponse,
    EntityMatchRequest,
    EntityMatchResponse,
    EntityOverlayRequest,
    EntityOverlayResponse,
)
from app.entities.service import EntityService, get_entity_service

router = APIRouter(prefix="/api/v1/entities", tags=["entities"])


@router.post("/match", response_model=EntityMatchResponse)
def match_entities(
    request: EntityMatchRequest,
    service: EntityService = Depends(get_entity_service),
) -> EntityMatchResponse:
    return run_api(lambda: service.match_entities(request))


@router.post("/detail", response_model=EntityDetailResponse)
def get_entity_detail(
    request: EntityDetailRequest,
    service: EntityService = Depends(get_entity_service),
) -> EntityDetailResponse:
    return run_api(lambda: service.get_entity_detail(request))


@router.post("/overlay", response_model=EntityOverlayResponse)
def get_entity_overlay(
    request: EntityOverlayRequest,
    service: EntityService = Depends(get_entity_service),
) -> EntityOverlayResponse:
    return run_api(lambda: service.get_entity_overlay(request))
