"""FastAPI routes for graph-side point attachment."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api.http import run_api
from app.graph.attachment import (
    GRAPH_POINT_ATTACHMENT_MEDIA_TYPE,
    GraphPointAttachmentRequest,
    GraphPointAttachmentService,
    get_graph_point_attachment_service,
)

router = APIRouter(prefix="/api/v1/graph", tags=["graph"])


@router.post(
    "/attach-points",
    response_class=Response,
    responses={
        200: {
            "content": {
                GRAPH_POINT_ATTACHMENT_MEDIA_TYPE: {},
            }
        }
    },
)
def attach_graph_points(
    request: GraphPointAttachmentRequest,
    service: GraphPointAttachmentService = Depends(get_graph_point_attachment_service),
) -> Response:
    """Return narrow graph point rows for local browser-side attachment."""

    payload = run_api(lambda: service.attach_points(request))

    return Response(
        content=payload,
        media_type=GRAPH_POINT_ATTACHMENT_MEDIA_TYPE,
        headers={"Cache-Control": "no-store"},
    )
