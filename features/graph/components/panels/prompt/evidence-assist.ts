import type { Editor } from "@tiptap/core";

export type EvidenceAssistIntent = "support" | "refute" | "both";

export interface EvidenceAssistCommand {
  intent: EvidenceAssistIntent;
  label: string;
  description: string;
}

export interface EvidenceAssistRequest {
  intent: EvidenceAssistIntent;
  queryText: string;
  previewText: string;
  paragraphText: string;
}

interface EvidenceAssistExcerptArgs {
  paragraphText: string;
  cursorOffset: number;
  maxSentences?: number;
  maxChars?: number;
}

interface SentenceSegment {
  text: string;
  start: number;
  end: number;
}

export const EVIDENCE_ASSIST_COMMANDS: EvidenceAssistCommand[] = [
  {
    intent: "support",
    label: "Support",
    description: "Find studies that support the current claim.",
  },
  {
    intent: "refute",
    label: "Refute",
    description: "Find studies that challenge the current claim.",
  },
  {
    intent: "both",
    label: "Support + Refute",
    description: "Find supporting and conflicting studies.",
  },
];

export function selectEvidenceAssistExcerpt({
  paragraphText,
  cursorOffset,
  maxSentences = 3,
  maxChars = 600,
}: EvidenceAssistExcerptArgs): string {
  const normalizedParagraph = paragraphText.trim();
  if (!normalizedParagraph) {
    return "";
  }

  const sentenceSegments = segmentSentences(normalizedParagraph);
  if (sentenceSegments.length === 0) {
    return clampExcerpt(normalizedParagraph, maxChars);
  }

  const safeCursorOffset = Math.max(0, Math.min(cursorOffset, normalizedParagraph.length));
  const activeSentenceIndex = findActiveSentenceIndex(sentenceSegments, safeCursorOffset);
  const selectedSegments = sentenceSegments.slice(
    Math.max(0, activeSentenceIndex - maxSentences + 1),
    activeSentenceIndex + 1,
  );

  return clampExcerpt(
    selectedSegments.map((segment) => segment.text.trim()).join(" "),
    maxChars,
  );
}

export function extractEvidenceAssistRequestFromEditor(
  editor: Editor,
  intent: EvidenceAssistIntent,
): EvidenceAssistRequest | null {
  const parentText = editor.state.selection.$from.parent.textContent.trim();
  const paragraphText = parentText || editor.getText().trim();
  if (!paragraphText) {
    return null;
  }

  const cursorOffset = parentText
    ? editor.state.selection.$from.parentOffset
    : paragraphText.length;
  const queryText = selectEvidenceAssistExcerpt({
    paragraphText,
    cursorOffset,
  });
  if (!queryText) {
    return null;
  }

  return {
    intent,
    queryText,
    previewText: buildPreviewText(queryText),
    paragraphText,
  };
}

function buildPreviewText(text: string, maxChars = 160): string {
  const normalizedText = text.trim();
  if (normalizedText.length <= maxChars) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, maxChars - 1).trimEnd()}…`;
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
    return [{ text, start: 0, end: text.length }];
  }

  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });

  return Array.from(segmenter.segment(text))
    .map((segment) => ({
      text: segment.segment,
      start: segment.index,
      end: segment.index + segment.segment.length,
    }))
    .filter((segment) => segment.text.trim().length > 0);
}
