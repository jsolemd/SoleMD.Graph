"""GPU-aware biomedical encoder and reranker loaders for offline retrieval experiments."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from contextlib import contextmanager, nullcontext
from functools import lru_cache
from importlib import import_module
from threading import Lock
from typing import Any, Protocol

from app.config import settings

logger = logging.getLogger(__name__)

_ADAPTER_MODEL_MIXIN_MODULE = "adapters.model_mixin"
_KNOWN_ADAPTER_LOAD_WARNING = (
    "There are adapters available but none are activated for the forward pass."
)


@contextmanager
def suppress_known_adapter_load_warning():
    try:
        model_mixin = import_module(_ADAPTER_MODEL_MIXIN_MODULE)
    except ModuleNotFoundError:
        yield
        return
    original_warning = model_mixin.logger.warning

    def _warning(message: str, *args: object, **kwargs: object) -> None:
        if message == _KNOWN_ADAPTER_LOAD_WARNING:
            return
        original_warning(message, *args, **kwargs)

    model_mixin.logger.warning = _warning
    try:
        yield
    finally:
        model_mixin.logger.warning = original_warning


def active_adapter_state(model: Any) -> str | None:
    """Return the active adapter state, accommodating adapter-transformers variants."""

    active_adapters = getattr(model, "active_adapters", None)
    if active_adapters:
        return str(active_adapters)
    adapters_config = getattr(model, "adapters_config", None)
    active_setup = getattr(adapters_config, "active_setup", None)
    if active_setup:
        return str(active_setup)
    return None


class BiomedicalEncoder(Protocol):
    """Common runtime surface for local encoder experiments."""

    def initialize(self) -> bool: ...

    def runtime_status(self) -> dict[str, object]: ...


def _normalize_tokenizer_batch_item(item: str | Sequence[str]) -> str | tuple[str, str]:
    """Normalize one tokenizer batch item to the HF-supported single/pair contract."""

    if isinstance(item, str):
        return item

    parts = [str(part).strip() for part in item if str(part).strip()]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return (parts[0], " ".join(parts[1:]))


class _BaseBatchEncoder:
    """Shared lazy loading and batched inference for HF encoders."""

    def __init__(
        self,
        *,
        model_name: str,
        max_length: int,
        use_gpu: bool,
        backend_name: str,
    ):
        self._model_name = model_name
        self._max_length = max_length
        self._use_gpu = use_gpu
        self._backend_name = backend_name
        self._cache_dir = str(settings.rag_model_cache_path)
        self._lock = Lock()
        self._runtime: tuple[object, object, object] | None = None
        self._runtime_error: str | None = None

    def initialize(self) -> bool:
        try:
            self._runtime_components()
        except Exception as exc:  # pragma: no cover - integration exercised
            self._runtime_error = f"{type(exc).__name__}: {exc}"
            logger.exception("biomedical_model_init_failed", extra={"backend": self._backend_name})
            return False
        return True

    def _runtime_components(self) -> tuple[object, object, object]:
        raise NotImplementedError

    def _encode_batch(
        self,
        items: Sequence[str] | Sequence[Sequence[str]],
        *,
        batch_size: int,
    ) -> list[list[float]]:
        if not items:
            return []
        if not self.initialize():
            return []

        tokenizer, model, device = self._runtime_components()

        import torch

        vectors: list[list[float]] = []
        autocast_context = (
            torch.autocast(device_type="cuda", dtype=torch.float16)
            if str(device).startswith("cuda")
            else nullcontext()
        )
        for start in range(0, len(items), batch_size):
            batch = items[start : start + batch_size]
            encoded = tokenizer(
                [_normalize_tokenizer_batch_item(item) for item in batch],
                truncation=True,
                padding=True,
                return_tensors="pt",
                max_length=self._max_length,
            )
            encoded = {key: value.to(device) for key, value in encoded.items()}
            with torch.inference_mode():
                with autocast_context:
                    outputs = model(**encoded)
            pooled = outputs.last_hidden_state[:, 0, :]
            vectors.extend(pooled.float().detach().cpu().tolist())
        return vectors

    def runtime_status(self) -> dict[str, object]:
        device = None
        if self._runtime is not None:
            _, _, runtime_device = self._runtime
            device = str(runtime_device)
        return {
            "enabled": True,
            "ready": self._runtime is not None,
            "backend": self._backend_name,
            "model_name": self._model_name,
            "device": device,
            "error": self._runtime_error,
        }


class _TransformersBatchEncoder(_BaseBatchEncoder):
    """Lazy AutoModel-based encoder."""

    def _runtime_components(self) -> tuple[object, object, object]:
        if self._runtime is not None:
            return self._runtime

        with self._lock:
            if self._runtime is not None:
                return self._runtime

            import torch
            from transformers import AutoModel, AutoTokenizer

            tokenizer = AutoTokenizer.from_pretrained(
                self._model_name,
                cache_dir=self._cache_dir,
            )
            model = AutoModel.from_pretrained(
                self._model_name,
                cache_dir=self._cache_dir,
            )
            device = torch.device(
                "cuda" if self._use_gpu and torch.cuda.is_available() else "cpu"
            )
            model = model.to(device)
            model.eval()
            self._runtime_error = None
            self._runtime = (tokenizer, model, device)
            return self._runtime


class _AdapterBatchEncoder(_BaseBatchEncoder):
    """Lazy adapter-transformers encoder."""

    def __init__(
        self,
        *,
        base_model_name: str,
        adapter_name: str,
        max_length: int,
        use_gpu: bool,
        backend_name: str,
    ):
        super().__init__(
            model_name=base_model_name,
            max_length=max_length,
            use_gpu=use_gpu,
            backend_name=backend_name,
        )
        self._base_model_name = base_model_name
        self._adapter_name = adapter_name

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
            with suppress_known_adapter_load_warning():
                adapter_ref = model.load_adapter(
                    self._adapter_name,
                    source="hf",
                    set_active=False,
                    cache_dir=self._cache_dir,
                )
                if not hasattr(model, "set_active_adapters"):
                    raise RuntimeError("Loaded adapter model does not support activation")
                model.set_active_adapters(adapter_ref)
            if not active_adapter_state(model):
                raise RuntimeError(f"Failed to activate adapter '{self._adapter_name}'")
            device = torch.device(
                "cuda" if self._use_gpu and torch.cuda.is_available() else "cpu"
            )
            model = model.to(device)
            model.eval()
            self._runtime_error = None
            self._runtime = (tokenizer, model, device)
            return self._runtime

    def runtime_status(self) -> dict[str, object]:
        status = super().runtime_status()
        active_adapters = None
        if self._runtime is not None:
            _, model, _ = self._runtime
            active_adapters = active_adapter_state(model)
        status.update(
            {
                "base_model": self._base_model_name,
                "adapter_name": self._adapter_name,
                "active_adapters": active_adapters,
            }
        )
        return status


class Specter2ProximityPaperEncoder(_AdapterBatchEncoder):
    """Encode papers into the SPECTER2 retrieval/proximity space."""

    def __init__(self) -> None:
        super().__init__(
            base_model_name=settings.rag_dense_query_base_model,
            adapter_name=settings.rag_specter2_proximity_adapter_name,
            max_length=settings.rag_dense_query_max_length,
            use_gpu=settings.rag_dense_query_use_gpu,
            backend_name="specter2_proximity",
        )

    def encode_articles(
        self,
        articles: Sequence[Sequence[str]],
        *,
        batch_size: int | None = None,
    ) -> list[list[float]]:
        return self._encode_batch(
            list(articles),
            batch_size=batch_size or settings.rag_biomedical_encoder_batch_size,
        )


class MedCPTQueryEncoder(_TransformersBatchEncoder):
    """Encode short biomedical search queries."""

    def __init__(self) -> None:
        super().__init__(
            model_name=settings.rag_medcpt_query_model_name,
            max_length=64,
            use_gpu=settings.rag_dense_query_use_gpu,
            backend_name="medcpt_query",
        )

    def encode_queries(
        self,
        queries: Sequence[str],
        *,
        batch_size: int | None = None,
    ) -> list[list[float]]:
        return self._encode_batch(
            list(queries),
            batch_size=batch_size or settings.rag_biomedical_encoder_batch_size,
        )


class MedCPTArticleEncoder(_TransformersBatchEncoder):
    """Encode biomedical article title/abstract pairs."""

    def __init__(self) -> None:
        super().__init__(
            model_name=settings.rag_medcpt_article_model_name,
            max_length=512,
            use_gpu=settings.rag_dense_query_use_gpu,
            backend_name="medcpt_article",
        )

    def encode_articles(
        self,
        articles: Sequence[Sequence[str]],
        *,
        batch_size: int | None = None,
    ) -> list[list[float]]:
        return self._encode_batch(
            list(articles),
            batch_size=batch_size or settings.rag_biomedical_encoder_batch_size,
        )


class MedCPTReranker:
    """Cross-encoder reranker for query/article pairs."""

    def __init__(self) -> None:
        self._model_name = settings.rag_medcpt_cross_encoder_model_name
        self._cache_dir = str(settings.rag_model_cache_path)
        self._use_gpu = settings.rag_dense_query_use_gpu
        self._lock = Lock()
        self._runtime: tuple[object, object, object] | None = None
        self._runtime_error: str | None = None

    def initialize(self) -> bool:
        try:
            self._runtime_components()
        except Exception as exc:  # pragma: no cover - integration exercised
            self._runtime_error = f"{type(exc).__name__}: {exc}"
            logger.exception("biomedical_reranker_init_failed")
            return False
        return True

    def _runtime_components(self) -> tuple[object, object, object]:
        if self._runtime is not None:
            return self._runtime

        with self._lock:
            if self._runtime is not None:
                return self._runtime

            import torch
            from transformers import AutoModelForSequenceClassification, AutoTokenizer

            tokenizer = AutoTokenizer.from_pretrained(
                self._model_name,
                cache_dir=self._cache_dir,
            )
            model = AutoModelForSequenceClassification.from_pretrained(
                self._model_name,
                cache_dir=self._cache_dir,
            )
            device = torch.device(
                "cuda" if self._use_gpu and torch.cuda.is_available() else "cpu"
            )
            model = model.to(device)
            model.eval()
            self._runtime_error = None
            self._runtime = (tokenizer, model, device)
            return self._runtime

    def score_pairs(
        self,
        pairs: Sequence[Sequence[str]],
        *,
        batch_size: int | None = None,
    ) -> list[float]:
        if not pairs:
            return []
        if not self.initialize():
            return []

        tokenizer, model, device = self._runtime_components()

        import torch

        scores: list[float] = []
        autocast_context = (
            torch.autocast(device_type="cuda", dtype=torch.float16)
            if str(device).startswith("cuda")
            else nullcontext()
        )
        window = batch_size or settings.rag_biomedical_reranker_batch_size
        for start in range(0, len(pairs), window):
            batch = pairs[start : start + window]
            encoded = tokenizer(
                batch,
                truncation=True,
                padding=True,
                return_tensors="pt",
                max_length=512,
            )
            encoded = {key: value.to(device) for key, value in encoded.items()}
            with torch.inference_mode():
                with autocast_context:
                    logits = model(**encoded).logits.squeeze(dim=1)
            scores.extend(logits.float().detach().cpu().tolist())
        return [float(score) for score in scores]

    def runtime_status(self) -> dict[str, object]:
        device = None
        if self._runtime is not None:
            _, _, runtime_device = self._runtime
            device = str(runtime_device)
        return {
            "enabled": True,
            "ready": self._runtime is not None,
            "backend": "medcpt_cross_encoder",
            "model_name": self._model_name,
            "device": device,
            "error": self._runtime_error,
        }


@lru_cache(maxsize=1)
def get_specter2_proximity_paper_encoder() -> Specter2ProximityPaperEncoder:
    return Specter2ProximityPaperEncoder()


@lru_cache(maxsize=1)
def get_medcpt_query_encoder() -> MedCPTQueryEncoder:
    return MedCPTQueryEncoder()


@lru_cache(maxsize=1)
def get_medcpt_article_encoder() -> MedCPTArticleEncoder:
    return MedCPTArticleEncoder()


@lru_cache(maxsize=1)
def get_medcpt_reranker() -> MedCPTReranker:
    return MedCPTReranker()
