"""Token-budget backends for canonical chunk assembly."""

from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from functools import lru_cache
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as distribution_version
from typing import Protocol

from app.config import settings

DEFAULT_STANZA_BIOMEDICAL_PACKAGES: tuple[str, ...] = ("craft", "genia")
_NON_WHITESPACE_TOKEN_RE = re.compile(r"\S+")


@dataclass(frozen=True, slots=True)
class TokenSpan:
    start_char: int
    end_char: int
    text: str


class TokenizationUnavailable(RuntimeError):
    """Raised when an optional tokenization backend is unavailable."""


class ChunkTokenBudgeter(Protocol):
    tokenizer_name: str
    tokenizer_version: str | None

    def token_spans(self, text: str) -> list[TokenSpan]: ...

    def count_tokens(self, text: str) -> int: ...

    def split_text(self, text: str, *, max_tokens: int) -> list[str]: ...


def split_text_semantically(
    text: str,
    *,
    max_tokens: int,
    token_counter: Callable[[str], int],
    fallback_splitter: Callable[[str, int], list[str]] | None = None,
) -> list[str]:
    """Split prose with semantic boundaries before falling back to plain token windows."""

    if max_tokens <= 0:
        raise ValueError("max_tokens must be positive")
    stripped = text.strip()
    if not stripped:
        return []

    try:
        import semchunk
    except ImportError:  # pragma: no cover - exercised when semchunk is unavailable
        if fallback_splitter is None:
            raise TokenizationUnavailable(
                "Semantic chunk refinement requires semchunk. Install with: uv sync"
            ) from None
        return fallback_splitter(stripped, max_tokens)

    try:
        fragments = semchunk.chunk(
            stripped,
            max_tokens,
            token_counter,
        )
    except Exception:  # pragma: no cover - depends on third-party tokenizer behavior
        if fallback_splitter is None:
            raise
        return fallback_splitter(stripped, max_tokens)

    normalized_fragments = [
        fragment.strip() for fragment in fragments if fragment and fragment.strip()
    ]
    if normalized_fragments:
        return normalized_fragments
    if fallback_splitter is None:
        return []
    return fallback_splitter(stripped, max_tokens)


def _distribution_version(distribution_name: str) -> str | None:
    try:
        return distribution_version(distribution_name)
    except PackageNotFoundError:
        return None


def _trimmed_window(text: str, start: int, end: int) -> str | None:
    window = text[start:end].strip()
    return window or None


def _split_head_by_token_limit(
    text: str,
    *,
    token_limit: int,
    token_counter,
    prefer_word_boundary: bool = True,
) -> tuple[str, str]:
    """Return the largest leading window that fits within the token limit."""

    if token_limit <= 0 or not text:
        return "", text
    if token_counter(text) <= token_limit:
        return text, ""

    lo, hi = 0, len(text)
    best_index: int | None = None
    while lo <= hi:
        mid = (lo + hi) // 2
        head = text[:mid]
        token_count = token_counter(head)
        if token_count <= token_limit:
            best_index = mid
            lo = mid + 1
        else:
            hi = mid - 1

    if best_index is None or best_index <= 0:
        return "", text

    if prefer_word_boundary:
        whitespace_indexes = [text[:best_index].rfind(" "), text[:best_index].rfind("\n")]
        last_boundary = max(whitespace_indexes)
        if last_boundary > 0:
            best_index = last_boundary

    return text[:best_index], text[best_index:]


def _split_text_by_token_limit(
    text: str,
    *,
    token_limit: int,
    token_counter,
) -> list[str]:
    if token_limit <= 0:
        raise ValueError("token_limit must be positive")
    remaining = text.strip()
    if not remaining:
        return []

    windows: list[str] = []
    while remaining:
        head, tail = _split_head_by_token_limit(
            remaining,
            token_limit=token_limit,
            token_counter=token_counter,
        )
        if not head:
            head = remaining[:1]
            tail = remaining[1:]
        window = head.strip()
        if window:
            windows.append(window)
        remaining = tail.lstrip()
    return windows


def _format_stanza_tokenizer_version(packages: Sequence[str]) -> str | None:
    stanza_version = _distribution_version("stanza")
    package_suffix = ",".join(package for package in packages if package)
    if stanza_version and package_suffix:
        return f"{stanza_version}+{package_suffix}"
    return stanza_version or package_suffix or None


@lru_cache(maxsize=4)
def resolve_stanza_tokenize_pipeline(
    packages: tuple[str, ...] = DEFAULT_STANZA_BIOMEDICAL_PACKAGES,
) -> tuple[str, object]:
    """Return the first working biomedical Stanza tokenizer pipeline."""

    try:
        import stanza
    except ImportError as exc:  # pragma: no cover - exercised in environments without stanza
        raise TokenizationUnavailable(
            "Stanza tokenization requires stanza. Install with: uv sync"
        ) from exc

    normalized_packages = (
        tuple(package for package in packages if package) or DEFAULT_STANZA_BIOMEDICAL_PACKAGES
    )
    last_error: Exception | None = None
    for package in normalized_packages:
        kwargs = {
            "lang": "en",
            "processors": "tokenize",
            "package": package,
            "use_gpu": settings.rag_stanza_use_gpu,
        }
        download_method = getattr(getattr(stanza, "DownloadMethod", None), "NONE", None)
        if download_method is not None:
            kwargs["download_method"] = download_method
        try:
            try:
                pipeline = stanza.Pipeline(**kwargs)
            except TypeError:
                kwargs.pop("download_method", None)
                pipeline = stanza.Pipeline(**kwargs)
        except Exception as exc:  # pragma: no cover - depends on local model availability
            last_error = exc
            continue
        return package, pipeline

    message = (
        "No biomedical Stanza tokenizer pipeline is available. "
        "Install stanza, then download a biomedical package such as 'craft' or 'genia'."
    )
    if last_error is not None:
        raise TokenizationUnavailable(message) from last_error
    raise TokenizationUnavailable(message)


class _BaseChunkTokenBudgeter:
    tokenizer_name: str
    tokenizer_version: str | None

    def count_tokens(self, text: str) -> int:
        return len(self.token_spans(text))

    def split_text(self, text: str, *, max_tokens: int) -> list[str]:
        if max_tokens <= 0:
            raise ValueError("max_tokens must be positive")
        spans = self.token_spans(text)
        if not spans:
            return []
        windows: list[str] = []
        for start_index in range(0, len(spans), max_tokens):
            end_index = min(start_index + max_tokens, len(spans))
            window = _trimmed_window(
                text,
                spans[start_index].start_char,
                spans[end_index - 1].end_char,
            )
            if window:
                windows.append(window)
        return windows


class RegexFallbackChunkTokenBudgeter(_BaseChunkTokenBudgeter):
    """Deterministic non-whitespace token budgeting as a last resort."""

    tokenizer_name = "regex_fallback"
    tokenizer_version = "v1"

    def token_spans(self, text: str) -> list[TokenSpan]:
        return [
            TokenSpan(
                start_char=match.start(),
                end_char=match.end(),
                text=match.group(0),
            )
            for match in _NON_WHITESPACE_TOKEN_RE.finditer(text)
        ]


class StanzaBiomedicalChunkTokenBudgeter(_BaseChunkTokenBudgeter):
    """Chunk token budgeting backed by the Stanza biomedical tokenizer."""

    tokenizer_name = "stanza_biomedical_tokens"

    def __init__(
        self,
        *,
        packages: Sequence[str] = DEFAULT_STANZA_BIOMEDICAL_PACKAGES,
    ) -> None:
        self._packages = (
            tuple(package for package in packages if package) or DEFAULT_STANZA_BIOMEDICAL_PACKAGES
        )
        self.tokenizer_version = _format_stanza_tokenizer_version(self._packages)
        self._span_cache: dict[str, tuple[TokenSpan, ...]] = {}

    def token_spans(self, text: str) -> list[TokenSpan]:
        cached = self._span_cache.get(text)
        if cached is not None:
            return list(cached)

        _, pipeline = resolve_stanza_tokenize_pipeline(self._packages)
        document = pipeline(text)
        spans: list[TokenSpan] = []
        for sentence in document.sentences:
            for token in sentence.tokens:
                start = int(token.start_char)
                end = int(token.end_char)
                if end <= start:
                    continue
                token_text = text[start:end]
                if not token_text.strip():
                    continue
                spans.append(
                    TokenSpan(
                        start_char=start,
                        end_char=end,
                        text=token_text,
                    )
                )

        cached_spans = tuple(spans)
        self._span_cache[text] = cached_spans
        return list(cached_spans)


def _normalize_model_tokenizer_name(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip()
    for prefix in ("openai:", "openai/"):
        if normalized.startswith(prefix):
            return normalized[len(prefix) :]
    return normalized


@lru_cache(maxsize=16)
def resolve_tiktoken_encoding(
    model_or_encoding_name: str,
) -> tuple[str, object]:
    """Resolve a tiktoken encoding from either a model or encoding name."""

    try:
        import tiktoken
    except ImportError as exc:  # pragma: no cover - exercised when dependency missing
        raise TokenizationUnavailable(
            "Embedding-token-aware budgeting requires tiktoken. Install with: uv sync"
        ) from exc

    normalized = _normalize_model_tokenizer_name(model_or_encoding_name)
    if not normalized:
        raise TokenizationUnavailable("A model or encoding name is required for tiktoken")

    last_error: Exception | None = None
    for resolver in (tiktoken.encoding_for_model, tiktoken.get_encoding):
        try:
            encoding = resolver(normalized)
            return encoding.name, encoding
        except Exception as exc:  # pragma: no cover - depends on package/model support
            last_error = exc

    message = f"No tiktoken encoding is available for '{normalized}'."
    if last_error is not None:
        raise TokenizationUnavailable(message) from last_error
    raise TokenizationUnavailable(message)


class TiktokenChunkTokenBudgeter:
    """Chunk token budgeting backed by OpenAI's tiktoken encoder."""

    def __init__(
        self,
        *,
        model_name: str | None = None,
        encoding_name: str | None = None,
    ) -> None:
        resolved_input = _normalize_model_tokenizer_name(model_name or encoding_name)
        if not resolved_input:
            raise ValueError("model_name or encoding_name is required")
        resolved_encoding_name, _ = resolve_tiktoken_encoding(resolved_input)
        tiktoken_version = _distribution_version("tiktoken")
        self.tokenizer_name = f"tiktoken:{resolved_encoding_name}"
        version_parts = [
            part for part in (tiktoken_version, _normalize_model_tokenizer_name(model_name)) if part
        ]
        self.tokenizer_version = "+".join(version_parts) or None
        self._encoding_name = resolved_encoding_name
        self._fallback_spans = RegexFallbackChunkTokenBudgeter()

    def _encoding(self):
        _, encoding = resolve_tiktoken_encoding(self._encoding_name)
        return encoding

    def token_spans(self, text: str) -> list[TokenSpan]:
        # Exact token-level offset mappings are not required for chunk assembly; use a
        # deterministic text span fallback for diagnostics.
        return self._fallback_spans.token_spans(text)

    def count_tokens(self, text: str) -> int:
        encoding = self._encoding()
        return len(encoding.encode_ordinary(text))

    def split_text(self, text: str, *, max_tokens: int) -> list[str]:
        return _split_text_by_token_limit(
            text,
            token_limit=max_tokens,
            token_counter=self.count_tokens,
        )


class FallbackChunkTokenBudgeter(_BaseChunkTokenBudgeter):
    """Use the primary tokenizer when available, otherwise a deterministic fallback."""

    def __init__(
        self,
        *,
        primary: ChunkTokenBudgeter,
        fallback: ChunkTokenBudgeter | None = None,
    ) -> None:
        self._primary = primary
        self._fallback = fallback or RegexFallbackChunkTokenBudgeter()
        self.tokenizer_name = primary.tokenizer_name
        self.tokenizer_version = primary.tokenizer_version
        self._using_fallback = False

    def token_spans(self, text: str) -> list[TokenSpan]:
        if not self._using_fallback:
            try:
                return self._primary.token_spans(text)
            except TokenizationUnavailable:
                self._using_fallback = True
                self.tokenizer_name = self._fallback.tokenizer_name
                self.tokenizer_version = self._fallback.tokenizer_version
        return self._fallback.token_spans(text)


def build_default_chunk_token_budgeter() -> ChunkTokenBudgeter:
    """Return the default chunk token-budget backend for ingest."""

    return FallbackChunkTokenBudgeter(
        primary=StanzaBiomedicalChunkTokenBudgeter(),
    )


def build_chunk_token_budgeter(
    *,
    tokenizer_name: str | None = None,
    embedding_model: str | None = None,
) -> ChunkTokenBudgeter:
    """Resolve the most specific available token budgeter for a chunk version."""

    normalized_tokenizer_name = _normalize_model_tokenizer_name(tokenizer_name)
    normalized_embedding_model = _normalize_model_tokenizer_name(embedding_model)

    if normalized_tokenizer_name and normalized_tokenizer_name.startswith("tiktoken:"):
        encoding_name = normalized_tokenizer_name.split(":", 1)[1]
        return FallbackChunkTokenBudgeter(
            primary=TiktokenChunkTokenBudgeter(encoding_name=encoding_name),
        )

    if normalized_tokenizer_name == StanzaBiomedicalChunkTokenBudgeter.tokenizer_name:
        return build_default_chunk_token_budgeter()

    if normalized_tokenizer_name in {"regex_fallback", "simple"}:
        return RegexFallbackChunkTokenBudgeter()

    if normalized_embedding_model:
        try:
            return FallbackChunkTokenBudgeter(
                primary=TiktokenChunkTokenBudgeter(model_name=normalized_embedding_model),
            )
        except TokenizationUnavailable:
            pass

    return build_default_chunk_token_budgeter()


def default_chunk_tokenizer_metadata(
    embedding_model: str | None = None,
) -> tuple[str, str | None]:
    if embedding_model:
        try:
            primary = TiktokenChunkTokenBudgeter(model_name=embedding_model)
            return primary.tokenizer_name, primary.tokenizer_version
        except TokenizationUnavailable:
            pass
    primary = StanzaBiomedicalChunkTokenBudgeter()
    return primary.tokenizer_name, primary.tokenizer_version
