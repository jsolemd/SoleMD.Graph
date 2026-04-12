"""Request-size guardrails for hot-path entity APIs."""

from __future__ import annotations

from collections.abc import Iterable

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class RequestBodyLimitMiddleware:
    """Reject oversized request bodies before JSON parsing.

    The entity match/detail/overlay routes are hot-path interactive endpoints.
    Keeping their request bodies small protects both the Next.js proxy and the
    engine from abuse without reintroducing per-surface result caps.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        max_body_bytes: int,
        path_prefixes: Iterable[str],
    ) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes
        self.path_prefixes = tuple(path_prefixes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not _path_is_limited(scope, self.path_prefixes):
            await self.app(scope, receive, send)
            return

        content_length = _parse_content_length(scope)
        if content_length is not None and content_length > self.max_body_bytes:
            await _send_payload_too_large(scope, send, self.max_body_bytes)
            return

        body = await _read_limited_body(receive, self.max_body_bytes)
        if body is None:
            await _send_payload_too_large(scope, send, self.max_body_bytes)
            return

        replayed = False

        async def replay_receive() -> Message:
            nonlocal replayed
            if replayed:
                return {"type": "http.request", "body": b"", "more_body": False}
            replayed = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay_receive, send)


def _path_is_limited(scope: Scope, path_prefixes: tuple[str, ...]) -> bool:
    path = str(scope.get("path") or "")
    return any(path.startswith(prefix) for prefix in path_prefixes)


def _parse_content_length(scope: Scope) -> int | None:
    for key, value in scope.get("headers", []):
        if key == b"content-length":
            try:
                parsed = int(value.decode("latin-1"))
            except ValueError:
                return None
            return parsed if parsed >= 0 else None
    return None


async def _read_limited_body(receive: Receive, max_body_bytes: int) -> bytes | None:
    chunks: list[bytes] = []
    total_bytes = 0
    more_body = True

    while more_body:
        message = await receive()
        if message["type"] == "http.disconnect":
            return b""
        if message["type"] != "http.request":
            continue

        chunk = message.get("body", b"")
        total_bytes += len(chunk)
        if total_bytes > max_body_bytes:
            return None

        if chunk:
            chunks.append(chunk)
        more_body = bool(message.get("more_body", False))

    return b"".join(chunks)


async def _send_payload_too_large(scope: Scope, send: Send, max_body_bytes: int) -> None:
    response = JSONResponse(
        {
            "error_code": "bad_request",
            "error_message": (
                "Entity request body exceeds the allowed size "
                f"({max_body_bytes} bytes max)."
            ),
            "request_id": None,
            "retry_after": None,
        },
        status_code=413,
    )
    await response(scope, _receive_disconnected, send)


async def _receive_disconnected() -> Message:
    return {"type": "http.disconnect"}
