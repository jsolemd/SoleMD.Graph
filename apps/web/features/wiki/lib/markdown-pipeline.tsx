/**
 * Wiki markdown pipeline adapter.
 *
 * Single assembly point for react-markdown configuration: plugins,
 * component overrides, and options.  Consumers import `createWikiPipelineProps`
 * and spread into `<ReactMarkdown>`.  If the rendering library changes
 * (react-markdown → raw unified, MDX, etc.), only this file changes.
 */
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import type { PluggableList } from 'unified'

import type { WikiBodyEntityMatch } from "@solemd/api-client/shared/wiki-types"
import { remarkPmidCitations, type RemarkPmidCitationsOptions } from './remark-pmid-citations'
import { remarkEntityMentions, type RemarkEntityMentionsOptions } from './remark-entity-mentions'
import { remarkCallouts } from './remark-callouts'
import { remarkAnimationRefs } from './remark-animation-refs'

// ---------------------------------------------------------------------------
// Pipeline data — passed from page response into the pipeline
// ---------------------------------------------------------------------------

export interface WikiPipelineData {
  /** Raw wikilink target → resolved full slug. */
  resolvedLinks: Record<string, string>
  /** PMID → bundle-compatible graph paper ref. */
  paperGraphRefs: Record<number, string>
  /** Slug → entity metadata for entity pages (hover cards). */
  linkedEntities: Record<string, { entity_type: string; concept_id: string | null }>
  /** Precomputed entity mentions in body text for inline highlighting. */
  bodyEntityMatches: readonly WikiBodyEntityMatch[]
}

// ---------------------------------------------------------------------------
// Component callbacks — how the wiki panel responds to interactions
// ---------------------------------------------------------------------------

export interface WikiPipelineCallbacks {
  /** Navigate to a wiki page within the panel. */
  onNavigate: (slug: string) => void
  /** Focus a paper on the graph canvas by its graph paper ref. */
  onPaperClick?: (graphPaperRef: string) => void
}

// ---------------------------------------------------------------------------
// Component map types — dispatched by the pipeline
// ---------------------------------------------------------------------------

export interface WikiLinkProps {
  slug: string
  children: ReactNode
  onNavigate: (slug: string) => void
  entityType: string | null
  conceptId: string | null
}

export interface PaperCitationProps {
  pmid: number
  graphPaperRef: string | null
  children: ReactNode
  onPaperClick?: (graphPaperRef: string) => void
}

export interface CalloutProps {
  type: string
  title: string | null
  children: ReactNode
}

export interface EntityMentionProps {
  entityMatch: WikiBodyEntityMatch
  children: ReactNode
}

export interface AnimationEmbedProps {
  name: string
}

// ---------------------------------------------------------------------------
// Pipeline factory — returns props for <ReactMarkdown>
// ---------------------------------------------------------------------------

export function createWikiRemarkPlugins(
  data: WikiPipelineData,
): PluggableList {
  // Wikilinks are preprocessed (string replacement) before parsing —
  // see preprocessWikilinks in remark-wikilinks.ts. Only PMID citations
  // and callouts need remark-level AST transforms.
  const pmidOpts: RemarkPmidCitationsOptions = { paperGraphRefs: data.paperGraphRefs }
  const entityOpts: RemarkEntityMentionsOptions = { bodyEntityMatches: data.bodyEntityMatches }

  return [
    remarkGfm,
    [remarkPmidCitations, pmidOpts],
    [remarkEntityMentions, entityOpts],
    remarkCallouts,
    remarkAnimationRefs,
  ]
}

export function createWikiRehypePlugins(): PluggableList {
  return [rehypeSlug]
}

/**
 * Build the react-markdown `components` override map.
 *
 * Dispatches `wiki:` and `pmid:` link schemes to WikiLink / PaperCitation,
 * and callout-annotated blockquotes to Callout.  All other elements render
 * with default HTML semantics.
 */
export function createWikiComponentMap(
  data: WikiPipelineData,
  callbacks: WikiPipelineCallbacks,
  elements: {
    WikiLink: React.ComponentType<WikiLinkProps>
    PaperCitation: React.ComponentType<PaperCitationProps>
    Callout: React.ComponentType<CalloutProps>
    AnimationEmbed: React.ComponentType<AnimationEmbedProps>
    EntityMention: React.ComponentType<EntityMentionProps>
  },
): Record<string, React.ComponentType<ComponentPropsWithoutRef<never>>> {
  const { paperGraphRefs, linkedEntities, bodyEntityMatches } = data
  const { onNavigate, onPaperClick } = callbacks
  const { WikiLink, PaperCitation, Callout, AnimationEmbed, EntityMention } = elements

  // Index body entity matches by identity key for O(1) dispatch
  const entityMatchIndex = new Map<string, WikiBodyEntityMatch>()
  for (const m of bodyEntityMatches) {
    entityMatchIndex.set(`${encodeURIComponent(m.entity_type)}:${encodeURIComponent(m.source_identifier)}`, m)
  }

  // Set of known resolved slugs (values of `resolvedLinks`) so that plain
  // markdown links whose href is a known wiki slug — with or without a
  // `/wiki/` public-path prefix — also route through in-panel navigation.
  // Authored `[[target]]` wikilinks are rewritten to `wiki:` by
  // preprocessWikilinks, but content can also ship raw `[foo](entities/foo)`
  // or `[foo](/wiki/entities/foo)` hrefs; both should stay inside the panel.
  const knownSlugs = new Set(Object.values(data.resolvedLinks))

  function resolveWikiSlug(href: string): string | null {
    if (href.startsWith('wiki:')) return href.slice(5)
    // Strip `/wiki/` public-path prefix, then check against known slugs.
    const trimmed = href.startsWith('/wiki/') ? href.slice('/wiki/'.length) : href
    // Only relative paths without a scheme (no `://`, no `scheme:`) qualify.
    if (/^[a-z][a-z0-9+\-.]*:/i.test(trimmed)) return null
    if (trimmed.startsWith('/')) return null
    return knownSlugs.has(trimmed) ? trimmed : null
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return {
    a: (props: any) => {
      const href: string | undefined = props.href
      const wikiSlug = href ? resolveWikiSlug(href) : null
      if (wikiSlug !== null) {
        const slug = wikiSlug
        const linked = linkedEntities[slug] ?? null
        return (
          <WikiLink
            slug={slug}
            onNavigate={onNavigate}
            entityType={linked?.entity_type ?? null}
            conceptId={linked?.concept_id ?? null}
          >
            {props.children}
          </WikiLink>
        )
      }
      if (href?.startsWith('entity:')) {
        const key = href.slice(7)
        const entityMatch = entityMatchIndex.get(key)
        if (entityMatch) {
          return (
            <EntityMention entityMatch={entityMatch}>
              {props.children}
            </EntityMention>
          )
        }
        return <>{props.children}</>
      }
      if (href?.startsWith('pmid:')) {
        const pmid = parseInt(href.slice(5), 10)
        const graphRef = paperGraphRefs[pmid] ?? null
        return (
          <PaperCitation pmid={pmid} graphPaperRef={graphRef} onPaperClick={onPaperClick}>
            {props.children}
          </PaperCitation>
        )
      }
      if (href?.startsWith('anim:')) {
        const name = href.slice(5)
        return <AnimationEmbed name={name} />
      }
      return <a href={href} target="_blank" rel="noopener noreferrer">{props.children}</a>
    },
    blockquote: (props: any) => {
      const calloutType: string | undefined = props['data-callout-type']
      if (calloutType) {
        const title: string | null = props['data-callout-title'] || null
        return <Callout type={calloutType} title={title}>{props.children}</Callout>
      }
      return <blockquote>{props.children}</blockquote>
    },
  } as Record<string, React.ComponentType<ComponentPropsWithoutRef<never>>>
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
