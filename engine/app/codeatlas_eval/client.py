"""HTTP client for the local CodeAtlas MCP surface."""

from __future__ import annotations

import json
from itertools import count
from typing import Any

import httpx


class CodeAtlasClient:
    """Thin JSON-RPC client for the project-scoped CodeAtlas MCP endpoint."""

    def __init__(
        self,
        *,
        base_url: str = "http://localhost:8100",
        project: str = "solemd.graph",
        timeout_seconds: float = 20.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.project = project
        self._request_ids = count(1)
        self._initialized = False
        self._client = httpx.Client(
            timeout=timeout_seconds,
            headers={"Accept": "application/json, text/event-stream"},
        )

    def __enter__(self) -> "CodeAtlasClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def health(self) -> dict[str, Any]:
        response = self._client.get(f"{self.base_url}/health")
        response.raise_for_status()
        return response.json()

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        self._ensure_initialized()
        payload = self._post_jsonrpc(
            method="tools/call",
            params={"name": name, "arguments": arguments or {}},
        )
        content = payload.get("content", [])
        text_parts = [
            item.get("text", "")
            for item in content
            if isinstance(item, dict) and item.get("type") == "text"
        ]
        if not text_parts:
            return {}
        text = "\n".join(part for part in text_parts if part)
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:  # pragma: no cover - transport corruption
            raise RuntimeError(f"Malformed tool payload for {name}: {exc}: {text}") from exc

    def _ensure_initialized(self) -> None:
        if self._initialized:
            return
        self._post_jsonrpc(
            method="initialize",
            params={
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {
                    "name": "solemd-graph-codeatlas-eval",
                    "version": "0.1.0",
                },
            },
        )
        self._initialized = True

    def _post_jsonrpc(self, *, method: str, params: dict[str, Any]) -> dict[str, Any]:
        request_id = next(self._request_ids)
        response = self._client.post(
            f"{self.base_url}/mcp/{self.project}",
            headers={"Content-Type": "application/json"},
            json={
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params,
            },
        )
        response.raise_for_status()
        payload = response.json()
        if "error" in payload:
            error = payload["error"]
            raise RuntimeError(f"CodeAtlas JSON-RPC error {error}")
        result = payload.get("result", {})
        if result.get("isError"):
            raise RuntimeError(f"CodeAtlas tool error for {method}: {result}")
        return result
