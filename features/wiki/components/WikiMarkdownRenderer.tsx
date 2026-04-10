"use client";

import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import {
  createWikiRemarkPlugins,
  createWikiRehypePlugins,
  createWikiComponentMap,
  type WikiPipelineData,
  type WikiPipelineCallbacks,
} from "@/features/wiki/lib/markdown-pipeline";
import { preprocessWikilinks } from "@/features/wiki/lib/remark-wikilinks";
import { WikiLink } from "./elements/WikiLink";
import { PaperCitation } from "./elements/PaperCitation";
import { Callout } from "./elements/Callout";

interface WikiMarkdownRendererProps {
  contentMd: string
  resolvedLinks: Record<string, string>
  paperGraphRefs: Record<number, string>
  onNavigate: (slug: string) => void
  onPaperClick?: (graphPaperRef: string) => void
}

const ELEMENTS = { WikiLink, PaperCitation, Callout } as const;
const rehypePlugins = createWikiRehypePlugins();

/**
 * Renders wiki markdown content with interactive wikilinks, PMID citations,
 * and Obsidian-style callouts.
 *
 * Wikilinks are preprocessed (string replacement) before parsing because
 * CommonMark consumes `[[…]]` as nested bracket syntax, making them
 * unreachable as text nodes in the AST.
 */
function WikiMarkdownRendererInner({
  contentMd,
  resolvedLinks,
  paperGraphRefs,
  onNavigate,
  onPaperClick,
}: WikiMarkdownRendererProps) {
  const data: WikiPipelineData = useMemo(
    () => ({ resolvedLinks, paperGraphRefs }),
    [resolvedLinks, paperGraphRefs],
  );

  const callbacks: WikiPipelineCallbacks = useMemo(
    () => ({ onNavigate, onPaperClick }),
    [onNavigate, onPaperClick],
  );

  // Preprocess wikilinks before the CommonMark parser sees them
  const processedMd = useMemo(
    () => preprocessWikilinks(contentMd, resolvedLinks),
    [contentMd, resolvedLinks],
  );

  const remarkPlugins = useMemo(
    () => createWikiRemarkPlugins(data),
    [data],
  );

  const components = useMemo(
    () => createWikiComponentMap(data, callbacks, ELEMENTS),
    [data, callbacks],
  );

  return (
    <div className="wiki-content">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {processedMd}
      </ReactMarkdown>
    </div>
  );
}

export const WikiMarkdownRenderer = memo(WikiMarkdownRendererInner);
