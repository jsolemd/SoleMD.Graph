"use client";

import type {
  AliasNode,
  ChunkDetail,
  ChunkNode,
  GraphPaperDetail,
  GraphNode,
  PaperDocument,
  PaperNode,
  RelationAssertionNode,
  TermNode,
} from "@/features/graph/types";
import type { GraphNodeDetailResponsePayload } from "@/features/graph/lib/detail-service";

function joinNonEmpty(values: Array<string | null | undefined>) {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : value))
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function getParagraphCandidates(value: string | null | undefined): string[] {
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

export function looksLikeSectionHeading(value: string): boolean {
  const normalized = collapseWhitespace(value);
  const wordCount = normalized.split(" ").length;
  return wordCount <= 6 && !/[.!?]/.test(normalized);
}

export function looksLikeNarrativeParagraph(value: string): boolean {
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

export function findChunkNodeByChunkId(
  chunkNodes: ChunkNode[],
  chunkId: string | null | undefined
): ChunkNode | null {
  if (!chunkId) return null;
  return (
    chunkNodes.find(
      (node) => node.id === chunkId || node.stableChunkId === chunkId
    ) ?? null
  );
}

function normalizeTextBlock(value: string | null | undefined) {
  if (!value) return null;
  const normalized = collapseWhitespace(value);
  return normalized || null;
}

function markdownBulletList(values: string[]) {
  return values.map((value) => `- ${value}`);
}

export function buildPaperNoteMarkdown({
  nodeDisplayPreview,
  paper,
  paperDocument,
  servicePaper,
}: {
  nodeDisplayPreview: string | null;
  paper: GraphPaperDetail | null;
  paperDocument: PaperDocument | null;
  servicePaper: GraphNodeDetailResponsePayload["paper"] | null;
}) {
  const title = servicePaper?.title ?? paper?.title ?? "Untitled paper";
  const meta = joinNonEmpty([
    servicePaper?.journal ?? paper?.journal ?? null,
    servicePaper?.year != null
      ? String(servicePaper.year)
      : paper?.year != null
        ? String(paper.year)
        : null,
    servicePaper?.citekey ?? paper?.citekey ?? null,
  ]);
  const doi = servicePaper?.doi ?? paper?.doi ?? null;
  const authors =
    servicePaper?.authors?.map((author) => author.name) ??
    paper?.authors?.map((author) => author.name) ??
    [];
  const preview = getPreferredPaperPreview({
    abstract: servicePaper?.abstract ?? paper?.abstract ?? null,
    displayPreview: paperDocument?.displayPreview ?? null,
    nodeDisplayPreview,
  }).text;
  const passages =
    servicePaper?.narrative_chunks
      ?.map((chunk) => normalizeTextBlock(chunk.preview))
      .filter((chunk): chunk is string => Boolean(chunk))
      .slice(0, 3) ?? [];

  const lines: string[] = [`# ${title}`];
  if (meta) lines.push("", meta);
  if (doi) lines.push("", `DOI: ${doi}`);
  if (preview) lines.push("", "## Preview", preview);
  if (authors.length) lines.push("", "## Authors", authors.join(", "));
  if (passages.length) {
    lines.push("", "## Key Passages", ...markdownBulletList(passages));
  }

  return lines.join("\n");
}

export function buildChunkNoteMarkdown({
  node,
  chunk,
  serviceChunk,
}: {
  node: ChunkNode;
  chunk: ChunkDetail | null;
  serviceChunk: GraphNodeDetailResponsePayload["chunk"] | null;
}) {
  const title = serviceChunk?.paper?.title ?? chunk?.title ?? node.paperTitle;
  const sourceMeta = joinNonEmpty([
    serviceChunk?.section_canonical ?? chunk?.sectionCanonical ?? node.sectionCanonical,
    serviceChunk?.page_number != null
      ? `p. ${serviceChunk.page_number}`
      : chunk?.pageNumber != null
        ? `p. ${chunk.pageNumber}`
        : node.pageNumber != null
          ? `p. ${node.pageNumber}`
          : null,
    serviceChunk?.chunk_kind ?? chunk?.chunkKind ?? node.chunkKind,
  ]);
  const body =
    normalizeTextBlock(serviceChunk?.chunk_text) ??
    normalizeTextBlock(chunk?.chunkText) ??
    normalizeTextBlock(node.chunkPreview) ??
    "No chunk text available.";
  const entities =
    serviceChunk?.entities
      ?.map((entity) =>
        joinNonEmpty([
          entity.text,
          entity.label,
          entity.umls_cui,
          entity.rxnorm_cui,
        ])
      )
      .filter(Boolean)
      .slice(0, 8) ?? [];

  const lines: string[] = [`## ${title}`];
  if (sourceMeta) lines.push("", sourceMeta);
  lines.push("", "### Passage", body);
  if (entities.length) {
    lines.push("", "### Entities", ...markdownBulletList(entities));
  }

  return lines.join("\n");
}

export function buildCorpusNodeNoteMarkdown(node: GraphNode) {
  if (node.nodeKind === "term") {
    const term = node as TermNode;
    const lines: string[] = [`# ${term.displayLabel ?? term.canonicalName ?? term.id}`];
    if (term.category) lines.push("", term.category);
    const stats = [
      term.mentionCount != null ? `mentions: ${term.mentionCount}` : null,
      term.paperCount != null ? `papers: ${term.paperCount}` : null,
      term.chunkCount != null ? `chunks: ${term.chunkCount}` : null,
      term.relationCount != null ? `relations: ${term.relationCount}` : null,
      term.aliasCount != null ? `aliases: ${term.aliasCount}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    if (stats) lines.push("", stats);
    if (term.semanticGroups) lines.push("", `Semantic groups: ${term.semanticGroups}`);
    if (term.organSystems) lines.push("", `Organ systems: ${term.organSystems}`);
    return lines.join("\n");
  }

  if (node.nodeKind === "alias") {
    const alias = node as AliasNode;
    const lines: string[] = [`# ${alias.aliasText ?? alias.displayLabel ?? alias.id}`];
    if (alias.canonicalName) lines.push("", `Canonical term: ${alias.canonicalName}`);
    const meta = [
      alias.aliasType,
      alias.aliasSource,
      alias.aliasQualityScore != null ? `quality ${alias.aliasQualityScore.toFixed(2)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    if (meta) lines.push("", meta);
    return lines.join("\n");
  }

  if (node.nodeKind === "relation_assertion") {
    const relation = node as RelationAssertionNode;
    const lines: string[] = [`# ${relation.relationType ?? relation.displayLabel ?? relation.id}`];
    const meta = [
      relation.relationCategory,
      relation.relationDirection,
      relation.relationCertainty,
      relation.assertionStatus,
      relation.evidenceStatus,
    ]
      .filter(Boolean)
      .join(" · ");
    if (meta) lines.push("", meta);
    if (relation.chunkPreview) lines.push("", relation.chunkPreview);
    return lines.join("\n");
  }

  return `# ${node.displayLabel ?? node.paperTitle ?? node.id}`;
}
