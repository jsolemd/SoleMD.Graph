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
import { AnimationEmbed } from "./elements/AnimationEmbed";

interface WikiMarkdownRendererProps {
  contentMd: string
  resolvedLinks: Record<string, string>
  paperGraphRefs: Record<number, string>
  linkedEntities: Record<string, { entity_type: string; concept_id: string }>
  onNavigate: (slug: string) => void
  onPaperClick?: (graphPaperRef: string) => void
}

const ELEMENTS = { WikiLink, PaperCitation, Callout, AnimationEmbed } as const;
const rehypePlugins = createWikiRehypePlugins();

/**
 * Custom URL transform that preserves wiki: and pmid: scheme URLs.
 * React-markdown's default sanitizer strips non-standard schemes.
 */
function wikiUrlTransform(url: string): string {
  if (url.startsWith('wiki:') || url.startsWith('pmid:') || url.startsWith('anim:')) return url;
  // Fall back to default sanitization for all other URLs
  const decoded = decodeURIComponent(url);
  if (decoded.startsWith('javascript:') || decoded.startsWith('vbscript:') || decoded.startsWith('data:')) return '';
  return url;
}

/**
 * Renders wiki markdown content with interactive wikilinks, PMID citations,
 * and Obsidian-style callouts.
 *
 * Wikilinks are preprocessed (string replacement) before parsing because
 * CommonMark consumes `[[…]]` as nested bracket syntax, making them
 * unreachable as text nodes in the AST.
 */
const EMPTY_LINKED_ENTITIES: Record<string, { entity_type: string; concept_id: string }> = {};

function WikiMarkdownRendererInner({
  contentMd,
  resolvedLinks,
  paperGraphRefs,
  linkedEntities,
  onNavigate,
  onPaperClick,
}: WikiMarkdownRendererProps) {
  const data: WikiPipelineData = useMemo(
    () => ({ resolvedLinks, paperGraphRefs, linkedEntities: linkedEntities ?? EMPTY_LINKED_ENTITIES }),
    [resolvedLinks, paperGraphRefs, linkedEntities],
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
        urlTransform={wikiUrlTransform}
      >
        {processedMd}
      </ReactMarkdown>
    </div>
  );
}

export const WikiMarkdownRenderer = memo(WikiMarkdownRendererInner);
