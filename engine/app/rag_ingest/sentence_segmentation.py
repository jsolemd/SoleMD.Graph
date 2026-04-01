"""Pluggable sentence segmentation adapters for canonical parser quality."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

from app.rag.parse_contract import PaperBlockKind, SentenceSegmentationSource
from app.rag_ingest.tokenization import (
    DEFAULT_STANZA_BIOMEDICAL_PACKAGES,
    TokenizationUnavailable,
    resolve_stanza_tokenize_pipeline,
)

_PROSE_FALLBACK_BLOCK_KINDS = frozenset(
    {
        PaperBlockKind.NARRATIVE_PARAGRAPH,
        PaperBlockKind.FIGURE_CAPTION,
        PaperBlockKind.TABLE_CAPTION,
        PaperBlockKind.TABLE_FOOTNOTE,
    }
)
_DECIMAL_SPLIT_PREVIOUS_RE = re.compile(r"\b\d+\.$")
_NUMERIC_CONTINUATION_RE = re.compile(r"^\d+(?:[.,:/%]\d+)*\b")


@dataclass(frozen=True, slots=True)
class SegmentedSentenceSpan:
    source_start_offset: int
    source_end_offset: int
    text: str
    segmentation_source: SentenceSegmentationSource


class SentenceSegmentationUnavailable(RuntimeError):
    """Raised when an optional sentence segmentation backend is unavailable."""


class SentenceSegmenter(Protocol):
    def segment(
        self,
        *,
        text: str,
        absolute_start: int,
        block_kind: PaperBlockKind,
        source_spans: Sequence[tuple[int, int]] | None = None,
    ) -> list[SegmentedSentenceSpan]: ...


def _trimmed_relative_span(text: str, start: int, end: int) -> tuple[int, int] | None:
    slice_text = text[start:end]
    left = 0
    right = len(slice_text)
    while left < right and slice_text[left].isspace():
        left += 1
    while right > left and slice_text[right - 1].isspace():
        right -= 1
    if left == right:
        return None
    return start + left, start + right


def _build_segmented_span(
    *,
    text: str,
    absolute_start: int,
    relative_start: int,
    relative_end: int,
    segmentation_source: SentenceSegmentationSource,
) -> SegmentedSentenceSpan | None:
    trimmed = _trimmed_relative_span(text, relative_start, relative_end)
    if trimmed is None:
        return None
    start, end = trimmed
    return SegmentedSentenceSpan(
        source_start_offset=absolute_start + start,
        source_end_offset=absolute_start + end,
        text=text[start:end],
        segmentation_source=segmentation_source,
    )


def _should_merge_adjacent_spans(
    previous: SegmentedSentenceSpan,
    current: SegmentedSentenceSpan,
) -> bool:
    if previous.segmentation_source != current.segmentation_source:
        return False
    previous_text = previous.text.rstrip()
    current_text = current.text.lstrip()
    if not previous_text or not current_text:
        return False
    return bool(
        _DECIMAL_SPLIT_PREVIOUS_RE.search(previous_text)
        and _NUMERIC_CONTINUATION_RE.match(current_text)
    )


def _repair_segmented_spans(
    *,
    text: str,
    absolute_start: int,
    spans: Sequence[SegmentedSentenceSpan],
) -> list[SegmentedSentenceSpan]:
    if len(spans) < 2:
        return list(spans)
    repaired: list[SegmentedSentenceSpan] = [spans[0]]
    for span in spans[1:]:
        previous = repaired[-1]
        if not _should_merge_adjacent_spans(previous, span):
            repaired.append(span)
            continue
        merged = _build_segmented_span(
            text=text,
            absolute_start=absolute_start,
            relative_start=previous.source_start_offset - absolute_start,
            relative_end=span.source_end_offset - absolute_start,
            segmentation_source=previous.segmentation_source,
        )
        if merged is None:
            repaired.append(span)
            continue
        repaired[-1] = merged
    return repaired


class SourceAnnotationSentenceSegmenter:
    """Normalize source-provided sentence spans onto one block."""

    def __init__(
        self,
        *,
        segmentation_source: SentenceSegmentationSource = (
            SentenceSegmentationSource.S2ORC_ANNOTATION
        ),
    ) -> None:
        self._segmentation_source = segmentation_source

    def segment(
        self,
        *,
        text: str,
        absolute_start: int,
        block_kind: PaperBlockKind,
        source_spans: Sequence[tuple[int, int]] | None = None,
    ) -> list[SegmentedSentenceSpan]:
        del block_kind
        if not source_spans:
            return []
        block_end = absolute_start + len(text)
        spans: list[SegmentedSentenceSpan] = []
        seen: set[tuple[int, int]] = set()
        for start, end in sorted((int(start), int(end)) for start, end in source_spans):
            if end <= absolute_start or start >= block_end:
                continue
            clipped_start = max(start, absolute_start)
            clipped_end = min(end, block_end)
            relative_start = clipped_start - absolute_start
            relative_end = clipped_end - absolute_start
            span = _build_segmented_span(
                text=text,
                absolute_start=absolute_start,
                relative_start=relative_start,
                relative_end=relative_end,
                segmentation_source=self._segmentation_source,
            )
            if span is None:
                continue
            key = (span.source_start_offset, span.source_end_offset)
            if key in seen:
                continue
            seen.add(key)
            spans.append(span)
        return _repair_segmented_spans(
            text=text,
            absolute_start=absolute_start,
            spans=spans,
        )


class DeterministicSentenceSegmenter:
    """Last-resort punctuation splitter for plain text."""

    def segment(
        self,
        *,
        text: str,
        absolute_start: int,
        block_kind: PaperBlockKind,
        source_spans: Sequence[tuple[int, int]] | None = None,
    ) -> list[SegmentedSentenceSpan]:
        del block_kind, source_spans
        spans: list[SegmentedSentenceSpan] = []
        start = 0
        for idx, ch in enumerate(text):
            if ch not in ".?!":
                continue
            next_is_boundary = idx + 1 == len(text) or text[idx + 1].isspace()
            if not next_is_boundary:
                continue
            span = _build_segmented_span(
                text=text,
                absolute_start=absolute_start,
                relative_start=start,
                relative_end=idx + 1,
                segmentation_source=SentenceSegmentationSource.DETERMINISTIC_FALLBACK,
            )
            if span is not None:
                spans.append(span)
            start = idx + 1
        tail_span = _build_segmented_span(
            text=text,
            absolute_start=absolute_start,
            relative_start=start,
            relative_end=len(text),
            segmentation_source=SentenceSegmentationSource.DETERMINISTIC_FALLBACK,
        )
        if tail_span is not None:
            spans.append(tail_span)
        return _repair_segmented_spans(
            text=text,
            absolute_start=absolute_start,
            spans=spans,
        )


class SyntokSentenceSegmenter:
    """Deterministic tokenizer-driven sentence segmentation."""

    def segment(
        self,
        *,
        text: str,
        absolute_start: int,
        block_kind: PaperBlockKind,
        source_spans: Sequence[tuple[int, int]] | None = None,
    ) -> list[SegmentedSentenceSpan]:
        del block_kind, source_spans
        try:
            import syntok.segmenter as syntok_segmenter
        except ImportError as exc:  # pragma: no cover - exercised in environments without syntok
            raise SentenceSegmentationUnavailable(
                "Sentence segmentation with syntok requires syntok. Install with: uv sync"
            ) from exc

        spans: list[SegmentedSentenceSpan] = []
        for paragraph in syntok_segmenter.analyze(text):
            for sentence in paragraph:
                tokens = list(sentence)
                if not tokens:
                    continue
                start = int(tokens[0].offset)
                last_token = tokens[-1]
                token_value = getattr(last_token, "value", str(last_token))
                end = int(last_token.offset) + len(token_value)
                span = _build_segmented_span(
                    text=text,
                    absolute_start=absolute_start,
                    relative_start=start,
                    relative_end=end,
                    segmentation_source=SentenceSegmentationSource.SYNTOK,
                )
                if span is not None:
                    spans.append(span)
        return _repair_segmented_spans(
            text=text,
            absolute_start=absolute_start,
            spans=spans,
        )


class StanzaSentenceSegmenter:
    """Biomedical Stanza sentence segmentation for English prose."""

    def __init__(
        self,
        *,
        packages: Sequence[str] = DEFAULT_STANZA_BIOMEDICAL_PACKAGES,
    ) -> None:
        self._packages = (
            tuple(package for package in packages if package) or DEFAULT_STANZA_BIOMEDICAL_PACKAGES
        )

    def _resolve_pipeline(self):
        try:
            _, pipeline = resolve_stanza_tokenize_pipeline(self._packages)
        except TokenizationUnavailable as exc:
            raise SentenceSegmentationUnavailable(str(exc)) from exc
        return pipeline

    def segment(
        self,
        *,
        text: str,
        absolute_start: int,
        block_kind: PaperBlockKind,
        source_spans: Sequence[tuple[int, int]] | None = None,
    ) -> list[SegmentedSentenceSpan]:
        del block_kind, source_spans
        pipeline = self._resolve_pipeline()
        document = pipeline(text)
        spans: list[SegmentedSentenceSpan] = []
        for sentence in document.sentences:
            if not sentence.tokens:
                continue
            start = int(sentence.tokens[0].start_char)
            end = int(sentence.tokens[-1].end_char)
            span = _build_segmented_span(
                text=text,
                absolute_start=absolute_start,
                relative_start=start,
                relative_end=end,
                segmentation_source=SentenceSegmentationSource.STANZA_BIOMEDICAL,
            )
            if span is not None:
                spans.append(span)
        return _repair_segmented_spans(
            text=text,
            absolute_start=absolute_start,
            spans=spans,
        )


class RoutingSentenceSegmenter:
    """Route sentence segmentation by source availability and block kind."""

    def __init__(
        self,
        *,
        annotation_segmenter: SentenceSegmenter | None = None,
        prose_segmenters: Sequence[SentenceSegmenter] | None = None,
        deterministic_segmenter: SentenceSegmenter | None = None,
    ) -> None:
        self._annotation_segmenter = annotation_segmenter or SourceAnnotationSentenceSegmenter()
        self._prose_segmenters = tuple(
            prose_segmenters or (StanzaSentenceSegmenter(), SyntokSentenceSegmenter())
        )
        self._deterministic_segmenter = deterministic_segmenter or DeterministicSentenceSegmenter()

    def _segment_prose_without_annotations(
        self,
        *,
        text: str,
        absolute_start: int,
        block_kind: PaperBlockKind,
    ) -> list[SegmentedSentenceSpan]:
        if block_kind not in _PROSE_FALLBACK_BLOCK_KINDS:
            return self._deterministic_segmenter.segment(
                text=text,
                absolute_start=absolute_start,
                block_kind=block_kind,
            )
        for segmenter in self._prose_segmenters:
            try:
                spans = segmenter.segment(
                    text=text,
                    absolute_start=absolute_start,
                    block_kind=block_kind,
                )
            except SentenceSegmentationUnavailable:
                continue
            if spans:
                return spans
        return self._deterministic_segmenter.segment(
            text=text,
            absolute_start=absolute_start,
            block_kind=block_kind,
        )

    def _segment_annotation_gaps(
        self,
        *,
        text: str,
        absolute_start: int,
        block_kind: PaperBlockKind,
        annotation_spans: Sequence[SegmentedSentenceSpan],
    ) -> list[SegmentedSentenceSpan]:
        if block_kind == PaperBlockKind.TABLE_BODY_TEXT:
            return list(annotation_spans)
        merged: list[SegmentedSentenceSpan] = []
        cursor = 0
        for span in sorted(annotation_spans, key=lambda item: item.source_start_offset):
            relative_start = span.source_start_offset - absolute_start
            relative_end = span.source_end_offset - absolute_start
            gap = _trimmed_relative_span(text, cursor, relative_start)
            if gap is not None:
                gap_start, gap_end = gap
                merged.extend(
                    self._segment_prose_without_annotations(
                        text=text[gap_start:gap_end],
                        absolute_start=absolute_start + gap_start,
                        block_kind=block_kind,
                    )
                )
            merged.append(span)
            cursor = max(cursor, relative_end)
        tail_gap = _trimmed_relative_span(text, cursor, len(text))
        if tail_gap is not None:
            tail_start, tail_end = tail_gap
            merged.extend(
                self._segment_prose_without_annotations(
                    text=text[tail_start:tail_end],
                    absolute_start=absolute_start + tail_start,
                    block_kind=block_kind,
                )
            )
        return sorted(merged, key=lambda item: (item.source_start_offset, item.source_end_offset))

    def segment(
        self,
        *,
        text: str,
        absolute_start: int,
        block_kind: PaperBlockKind,
        source_spans: Sequence[tuple[int, int]] | None = None,
    ) -> list[SegmentedSentenceSpan]:
        annotation_spans = self._annotation_segmenter.segment(
            text=text,
            absolute_start=absolute_start,
            block_kind=block_kind,
            source_spans=source_spans,
        )
        if annotation_spans:
            return self._segment_annotation_gaps(
                text=text,
                absolute_start=absolute_start,
                block_kind=block_kind,
                annotation_spans=annotation_spans,
            )
        if block_kind == PaperBlockKind.TABLE_BODY_TEXT:
            return []
        return self._segment_prose_without_annotations(
            text=text,
            absolute_start=absolute_start,
            block_kind=block_kind,
        )


@lru_cache(maxsize=1)
def build_default_sentence_segmenter() -> SentenceSegmenter:
    return RoutingSentenceSegmenter()
