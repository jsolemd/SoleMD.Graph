interface TextContextWindowArgs {
  paragraphText: string;
  cursorOffset: number;
  maxSentences?: number;
  maxChars?: number;
}

interface SentenceSegment {
  text: string;
  start: number;
}

export function selectTextContextWindow({
  paragraphText,
  cursorOffset,
  maxSentences = 3,
  maxChars = 600,
}: TextContextWindowArgs): string {
  const normalizedParagraph = paragraphText.trim();
  if (!normalizedParagraph) {
    return "";
  }

  const sentenceSegments = segmentSentences(normalizedParagraph);
  if (sentenceSegments.length === 0) {
    return clampExcerpt(normalizedParagraph, maxChars);
  }

  const safeCursorOffset = Math.max(
    0,
    Math.min(cursorOffset, normalizedParagraph.length),
  );
  const activeSentenceIndex = findActiveSentenceIndex(
    sentenceSegments,
    safeCursorOffset,
  );
  const selectedSegments = sentenceSegments.slice(
    Math.max(0, activeSentenceIndex - maxSentences + 1),
    activeSentenceIndex + 1,
  );

  return clampExcerpt(
    selectedSegments.map((segment) => segment.text.trim()).join(" "),
    maxChars,
  );
}

function clampExcerpt(text: string, maxChars: number): string {
  const normalizedText = text.trim();
  if (normalizedText.length <= maxChars) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, maxChars - 1).trimEnd()}…`;
}

function findActiveSentenceIndex(
  sentenceSegments: SentenceSegment[],
  cursorOffset: number,
): number {
  for (let index = sentenceSegments.length - 1; index >= 0; index -= 1) {
    if (
      cursorOffset > sentenceSegments[index].start ||
      (index === 0 && cursorOffset === sentenceSegments[index].start)
    ) {
      return index;
    }
  }

  return sentenceSegments.length - 1;
}

function segmentSentences(text: string): SentenceSegment[] {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter === "undefined") {
    return [{ text, start: 0 }];
  }

  const segmenter = new Intl.Segmenter(undefined, {
    granularity: "sentence",
  });

  return Array.from(segmenter.segment(text))
    .map((segment) => ({
      text: segment.segment,
      start: segment.index,
    }))
    .filter((segment) => segment.text.trim().length > 0);
}
