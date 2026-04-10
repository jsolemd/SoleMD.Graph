"""FastAPI routes for canonical entity matching and hover detail."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.entities.schemas import (
    EntityDetailRequest,
    EntityDetailResponse,
    EntityMatchRequest,
    EntityMatchResponse,
)
from app.entities.service import EntityService, get_entity_service

router = APIRouter(prefix="/api/v1/entities", tags=["entities"])


@router.post("/match", response_model=EntityMatchResponse)
def match_entities(
    request: EntityMatchRequest,
    service: EntityService = Depends(get_entity_service),
) -> EntityMatchResponse:
    try:
        return service.match_entities(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/detail", response_model=EntityDetailResponse)
def get_entity_detail(
    request: EntityDetailRequest,
    service: EntityService = Depends(get_entity_service),
) -> EntityDetailResponse:
    try:
        return service.get_entity_detail(request)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
