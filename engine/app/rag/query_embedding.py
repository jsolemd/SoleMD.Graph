"""Lazy query-embedding adapters for dense scientific paper retrieval."""

from __future__ import annotations

import logging
from functools import lru_cache
from threading import Lock
from typing import Protocol

from app.config import settings

logger = logging.getLogger(__name__)


class RagQueryEmbedder(Protocol):
    """Encode a short retrieval query into the paper-embedding space."""

    def initialize(self) -> bool: ...

    def encode(self, text: str) -> list[float] | None: ...

    def runtime_status(self) -> dict[str, object]: ...


class NoopQueryEmbedder:
    """Fallback embedder used when dense-query retrieval is disabled or unavailable."""

    def initialize(self) -> bool:
        return True

    def encode(self, text: str) -> list[float] | None:
        return None

    def runtime_status(self) -> dict[str, object]:
        return {
            "enabled": False,
            "ready": True,
            "backend": "noop",
            "device": None,
            "active_adapters": None,
            "error": None,
        }


class Specter2AdhocQueryEmbedder:
    """AllenAI SPECTER2 ad-hoc query encoder aligned to SPECTER2 paper embeddings."""

    def __init__(
        self,
        *,
        base_model_name: str,
        adapter_name: str,
        cache_dir: str,
        max_length: int,
        use_gpu: bool,
    ):
        self._base_model_name = base_model_name
        self._adapter_name = adapter_name
        self._cache_dir = cache_dir
        self._max_length = max_length
        self._use_gpu = use_gpu
        self._lock = Lock()
        self._runtime: tuple[object, object, object] | None = None
        self._adapter_setup: object | None = None
        self._runtime_error: str | None = None

    def initialize(self) -> bool:
        try:
            self._runtime_components()
        except Exception as exc:  # pragma: no cover - exercised in integration paths
            self._runtime_error = f"{type(exc).__name__}: {exc}"
            logger.exception("dense_query_encoder_init_failed")
            return False
        return True

    def encode(self, text: str) -> list[float] | None:
        query_text = text.strip()
        if not query_text:
            return None

        if not self.initialize():
            return None

        tokenizer, model, device = self._runtime_components()

        adapter_setup = self._adapter_setup
        import torch
        import torch.nn.functional as F

        encoded = tokenizer(
            query_text,
            max_length=self._max_length,
            padding=False,
            truncation=True,
            return_tensors="pt",
        )
        encoded = {key: value.to(device) for key, value in encoded.items()}
        if adapter_setup is not None:
            from adapters import AdapterSetup

            with AdapterSetup(adapter_setup):
                with torch.inference_mode():
                    outputs = model(**encoded)
        else:
            with torch.inference_mode():
                outputs = model(**encoded)
        pooled = outputs.last_hidden_state[:, 0, :]
        normalized = F.normalize(pooled, p=2, dim=1)
        return normalized[0].detach().cpu().tolist()

    def _runtime_components(self) -> tuple[object, object, object]:
        if self._runtime is not None:
            return self._runtime

        with self._lock:
            if self._runtime is not None:
                return self._runtime

            import torch
            from adapters import AutoAdapterModel
            from transformers import AutoTokenizer

            tokenizer = AutoTokenizer.from_pretrained(
                self._base_model_name,
                cache_dir=self._cache_dir,
            )
            model = AutoAdapterModel.from_pretrained(
                self._base_model_name,
                cache_dir=self._cache_dir,
            )
            adapter_ref = model.load_adapter(
                self._adapter_name,
                source="hf",
                set_active=True,
                cache_dir=self._cache_dir,
            )
            if hasattr(model, "set_active_adapters"):
                model.set_active_adapters(adapter_ref)
            if hasattr(model, "active_adapters"):
                model.active_adapters = adapter_ref
            device = torch.device(
                "cuda" if self._use_gpu and torch.cuda.is_available() else "cpu"
            )
            model = model.to(device)
            model.eval()
            logger.info(
                "dense_query_encoder_ready",
                extra={
                    "base_model": self._base_model_name,
                    "adapter_name": self._adapter_name,
                    "device": str(device),
                    "active_adapters": str(getattr(model, "active_adapters", None)),
                },
            )
            self._adapter_setup = adapter_ref
            self._runtime_error = None
            self._runtime = (tokenizer, model, device)
            return self._runtime

    def runtime_status(self) -> dict[str, object]:
        device = None
        active_adapters = None
        if self._runtime is not None:
            _, model, runtime_device = self._runtime
            device = str(runtime_device)
            active_adapters = str(getattr(model, "active_adapters", None))
        return {
            "enabled": True,
            "ready": self._runtime is not None,
            "backend": "specter2_adhoc_query",
            "base_model": self._base_model_name,
            "adapter_name": self._adapter_name,
            "device": device,
            "active_adapters": active_adapters,
            "error": self._runtime_error,
        }


@lru_cache(maxsize=1)
def get_query_embedder() -> RagQueryEmbedder:
    """Return the configured dense-query embedder."""

    if not settings.rag_dense_query_enabled:
        return NoopQueryEmbedder()
    return Specter2AdhocQueryEmbedder(
        base_model_name=settings.rag_dense_query_base_model,
        adapter_name=settings.rag_dense_query_adapter_name,
        cache_dir=str(settings.rag_model_cache_path),
        max_length=settings.rag_dense_query_max_length,
        use_gpu=settings.rag_dense_query_use_gpu,
    )


def get_query_embedder_status() -> dict[str, object]:
    """Expose the cached dense-query embedder status for diagnostics."""

    return get_query_embedder().runtime_status()
