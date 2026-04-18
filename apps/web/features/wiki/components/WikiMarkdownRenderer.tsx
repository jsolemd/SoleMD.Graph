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
import type { WikiBodyEntityMatch } from "@solemd/api-client/shared/wiki-types";
import { WikiLink } from "./elements/WikiLink";
import { PaperCitation } from "./elements/PaperCitation";
import { Callout } from "./elements/Callout";
import { AnimationEmbed } from "./elements/AnimationEmbed";
import { EntityMention } from "./elements/EntityMention";

interface WikiMarkdownRendererProps {
  contentMd: string
  resolvedLinks: Record<string, string>
  paperGraphRefs: Record<number, string>
  linkedEntities: Record<string, { entity_type: string; concept_id: string | null }>
  bodyEntityMatches: readonly WikiBodyEntityMatch[]
  onNavigate: (slug: string) => void
  onPaperClick?: (graphPaperRef: string) => void
}

const ELEMENTS = { WikiLink, PaperCitation, Callout, AnimationEmbed, EntityMention } as const;
const rehypePlugins = createWikiRehypePlugins();

/**
 * Custom URL transform that preserves wiki: and pmid: scheme URLs.
 * React-markdown's default sanitizer strips non-standard schemes.
 */
function wikiUrlTransform(url: string): string {
  if (url.startsWith('wiki:') || url.startsWith('pmid:') || url.startsWith('anim:') || url.startsWith('entity:')) return url;
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
const EMPTY_LINKED_ENTITIES: Record<
  string,
  { entity_type: string; concept_id: string | null }
> = {};
const EMPTY_BODY_ENTITY_MATCHES: readonly WikiBodyEntityMatch[] = [];

function WikiMarkdownRendererInner({
  contentMd,
  resolvedLinks,
  paperGraphRefs,
  linkedEntities,
  bodyEntityMatches,
  onNavigate,
  onPaperClick,
}: WikiMarkdownRendererProps) {
  const data: WikiPipelineData = useMemo(
    () => ({
      resolvedLinks,
      paperGraphRefs,
      linkedEntities: linkedEntities ?? EMPTY_LINKED_ENTITIES,
      bodyEntityMatches: bodyEntityMatches ?? EMPTY_BODY_ENTITY_MATCHES,
    }),
    [resolvedLinks, paperGraphRefs, linkedEntities, bodyEntityMatches],
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
