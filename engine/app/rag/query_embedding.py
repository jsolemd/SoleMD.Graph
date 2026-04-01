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

    def encode(self, text: str) -> list[float] | None: ...


class NoopQueryEmbedder:
    """Fallback embedder used when dense-query retrieval is disabled or unavailable."""

    def encode(self, text: str) -> list[float] | None:
        return None


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

    def encode(self, text: str) -> list[float] | None:
        query_text = text.strip()
        if not query_text:
            return None

        try:
            tokenizer, model, device = self._runtime_components()
        except Exception:  # pragma: no cover - exercised in integration paths
            logger.exception("dense_query_encoder_init_failed")
            return None

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
                },
            )
            self._runtime = (tokenizer, model, device)
            return self._runtime


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
