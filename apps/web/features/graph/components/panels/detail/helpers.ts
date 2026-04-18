import type {
  GraphPaperDetail,
  PaperDocument,
  PaperNode,
} from "@solemd/graph";

function joinNonEmpty(values: Array<string | null | undefined>) {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : value))
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getParagraphCandidates(value: string | null | undefined): string[] {
  if (!value) return [];

  return value
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const trimmed = block.trim();
      if (!trimmed) return [];

      if (trimmed.includes("\n") && trimmed.length < 240) {
        return trimmed
          .split(/\n+/)
          .map(collapseWhitespace)
          .filter(Boolean);
      }

      return [collapseWhitespace(trimmed)];
    });
}

function looksLikeSectionHeading(value: string): boolean {
  const normalized = collapseWhitespace(value);
  const wordCount = normalized.split(" ").length;
  return wordCount <= 6 && !/[.!?]/.test(normalized);
}

function looksLikeNarrativeParagraph(value: string): boolean {
  const normalized = collapseWhitespace(value);
  const wordCount = normalized.split(" ").length;
  return wordCount >= 16 && /[.!?]/.test(normalized) && !looksLikeSectionHeading(normalized);
}

export function getPreferredPaperPreview({
  abstract,
  displayPreview,
  nodeDisplayPreview,
}: {
  abstract: string | null;
  displayPreview: string | null;
  nodeDisplayPreview: string | null;
}): { source: "abstract" | "display" | null; text: string | null } {
  const displayCandidates = getParagraphCandidates(displayPreview ?? nodeDisplayPreview);
  const displayParagraph = displayCandidates.find(looksLikeNarrativeParagraph);

  if (displayParagraph) {
    return { source: "display", text: displayParagraph };
  }

  const abstractCandidates = getParagraphCandidates(abstract);
  const abstractParagraph =
    abstractCandidates.find(looksLikeNarrativeParagraph) ?? abstractCandidates[0];

  if (abstractParagraph) {
    return { source: "abstract", text: abstractParagraph };
  }

  return {
    source: displayCandidates[0] ? "display" : null,
    text: displayCandidates[0] ?? null,
  };
}

export function findPaperNodeByPaperId(
  paperNodes: PaperNode[],
  paperId: string | null | undefined
): PaperNode | null {
  if (!paperId) return null;
  return (
    paperNodes.find((node) => node.paperId === paperId || node.id === paperId) ??
    null
  );
}

export function buildPaperNoteMarkdown({
  nodeDisplayPreview,
  paper,
  paperDocument,
}: {
  nodeDisplayPreview: string | null;
  paper: GraphPaperDetail | null;
  paperDocument: PaperDocument | null;
}) {
  const title = paper?.title ?? "Untitled paper";
  const meta = joinNonEmpty([
    paper?.journal ?? null,
    paper?.year != null ? String(paper.year) : null,
    paper?.citekey ?? null,
  ]);
  const doi = paper?.doi ?? null;
  const authors = paper?.authors?.map((author) => author.name) ?? [];
  const preview = getPreferredPaperPreview({
    abstract: paper?.abstract ?? null,
    displayPreview: paperDocument?.displayPreview ?? null,
    nodeDisplayPreview,
  }).text;

  const lines: string[] = [`# ${title}`];
  if (meta) lines.push("", meta);
  if (doi) lines.push("", `DOI: ${doi}`);
  if (preview) lines.push("", "## Preview", preview);
  if (authors.length) lines.push("", "## Authors", authors.join(", "));

  return lines.join("\n");
}
