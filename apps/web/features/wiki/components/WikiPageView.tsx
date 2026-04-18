"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Text } from "@mantine/core";
import {
  PanelInlineLoader,
  panelTextMutedStyle,
  panelTextStyle,
} from "@/features/graph/components/panels/PanelShell";
import type { GraphBundleQueries } from "@/features/graph/types";
import { WikiBacklinks } from "@/features/wiki/components/WikiBacklinks";
import { WikiLocalGraph } from "@/features/wiki/components/WikiLocalGraph";
import { WikiMarkdownRenderer } from "@/features/wiki/components/WikiMarkdownRenderer";
import { WikiModuleContent, getWikiModule } from "@/features/wiki/components/WikiModuleContent";
import { PanelEdgeToc, entriesFromModuleSections, entriesFromHeadings } from "@/features/wiki/components/PanelEdgeToc";
import type { PanelEdgeTocEntry } from "@/features/wiki/components/PanelEdgeToc";
import { WikiPageHeader, WikiTopGraphPapers } from "@/features/wiki/components/WikiPageHeader";
import { EntityVisualCard } from "@/features/wiki/components/entity-profiles";
import { EntityRAGCard } from "@/features/wiki/components/EntityRAGCard";
import { useWikiGraphSync } from "@/features/wiki/hooks/use-wiki-graph-sync";
import { useWikiPageBundle } from "@/features/wiki/hooks/use-wiki-page-bundle";
import { resolveWikiPageGraphRefs } from "@/features/wiki/lib/wiki-page-graph";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";

interface WikiPageViewProps {
  slug: string;
  graphReleaseId: string;
  queries: GraphBundleQueries;
  onNavigate: (slug: string) => void;
  tocAnchorRef?: React.RefObject<HTMLElement | null>;
}

const EMPTY_PAPER_REFS: Record<number, string> = {};
const EMPTY_RESOLVED_LINKS: Record<string, string> = {};
const EMPTY_LINKED_ENTITIES: Record<
  string,
  { entity_type: string; concept_id: string }
> = {};
const EMPTY_BODY_ENTITY_MATCHES: [] = [];

export function WikiPageView({
  slug,
  graphReleaseId,
  queries,
  onNavigate,
  tocAnchorRef,
}: WikiPageViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingSourceRef = useRef<HTMLDivElement>(null);
  const localGraphPopped = useWikiStore((state) => state.localGraphPopped);
  const modulePopped = useWikiStore((state) => state.modulePopped);
  const setCurrentPageKind = useWikiStore((state) => state.setCurrentPageKind);

  const {
    page,
    backlinks,
    context: pageContext,
    loading,
    contextLoading: pageContextLoading,
    error,
    contextError: pageContextError,
  } = useWikiPageBundle(slug, graphReleaseId);

  const pageGraphRefs = useMemo(() => resolveWikiPageGraphRefs(page), [page]);
  const { onPaperClick, showPageOnGraph, canShowPageOnGraph } =
    useWikiGraphSync({
      queries,
      pageGraphRefs,
      currentSlug: slug,
    });

  const isModulePage = page?.page_kind === "module";

  // Dot TOC entries: module sections (manifest-driven) or wiki headings (DOM-scanned)
  const moduleTocEntries = useMemo(() => {
    if (!isModulePage) return undefined;
    const sections = getWikiModule(slug)?.manifest.sections;
    return sections ? entriesFromModuleSections(sections) : undefined;
  }, [isModulePage, slug]);

  const [headingEntries, setHeadingEntries] = useState<PanelEdgeTocEntry[]>([]);

  // Scan headings from the markdown body only. The TOC should not depend on
  // unrelated widgets that mount later inside the scroll container.
  useEffect(() => {
    const el = headingSourceRef.current;
    if (!el || isModulePage) { setHeadingEntries([]); return; }

    function scan() {
      setHeadingEntries(entriesFromHeadings(el!));
    }

    const raf = requestAnimationFrame(scan);
    const mo = new MutationObserver(scan);
    mo.observe(el, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, [isModulePage, page?.content_md]);

  const dotEntries = moduleTocEntries ?? (headingEntries.length > 1 ? headingEntries : undefined);

  useEffect(() => {
    setCurrentPageKind(page?.page_kind ?? null);
    return () => setCurrentPageKind(null);
  }, [page?.page_kind, setCurrentPageKind]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <PanelInlineLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <Text style={{ ...panelTextStyle, color: "var(--feedback-danger-text)" }}>
          {error}
        </Text>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center">
        <Text style={panelTextMutedStyle}>
          No wiki page found for &ldquo;{slug}&rdquo;
        </Text>
      </div>
    );
  }

  const backlinksBlock =
    backlinks.length > 0 ? (
      <WikiBacklinks backlinks={backlinks} onNavigate={onNavigate} />
    ) : null;
  const topGraphPapers = pageContext?.top_graph_papers ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Pinned header — title left, local graph pinned top-right */}
      <div className="flex flex-shrink-0 gap-3 px-3 pb-2 pt-1">
        <div className="min-w-0 flex-1">
          <WikiPageHeader
            page={page}
            pageContext={pageContext}
            pageContextLoading={pageContextLoading}
            pageContextError={pageContextError}
            canShowPageOnGraph={canShowPageOnGraph}
            onShowPageOnGraph={() => {
              void showPageOnGraph();
            }}
            onPaperClick={onPaperClick}
            showTopGraphPapers={false}
          />
        </div>

        {!localGraphPopped && (
          <div className="shrink-0">
            <WikiLocalGraph
              slug={slug}
              onNavigate={onNavigate}
              height={200}
              className="w-[200px]"
            />
          </div>
        )}
      </div>

      {/* Entity profile card — type-specific visual identity */}
      {page.entity_type && (
        <div className="flex-shrink-0 px-3 pb-2">
          <EntityVisualCard
            page={page}
            pageContext={pageContext}
            bodyMatches={page.body_entity_matches ?? EMPTY_BODY_ENTITY_MATCHES}
            onNavigate={onNavigate}
          />
        </div>
      )}

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
      >
        <div ref={headingSourceRef}>
          <WikiMarkdownRenderer
            contentMd={page.content_md}
            resolvedLinks={page.resolved_links ?? EMPTY_RESOLVED_LINKS}
            paperGraphRefs={page.paper_graph_refs ?? EMPTY_PAPER_REFS}
            linkedEntities={page.linked_entities ?? EMPTY_LINKED_ENTITIES}
            bodyEntityMatches={page.body_entity_matches ?? EMPTY_BODY_ENTITY_MATCHES}
            onNavigate={onNavigate}
            onPaperClick={onPaperClick}
          />
        </div>

        {isModulePage && !modulePopped && (
          <div
            id="wiki-module-inline"
            className="wiki-module-inline mt-5"
          >
            <WikiModuleContent slug={slug} />
          </div>
        )}

        {topGraphPapers.length > 0 && (
          <div className="mt-4">
            <WikiTopGraphPapers
              papers={topGraphPapers}
              onPaperClick={onPaperClick}
            />
          </div>
        )}

        {backlinksBlock}

        {page.entity_type && (
          <div className="mt-4">
            <EntityRAGCard page={page} />
          </div>
        )}
      </div>

      {dotEntries && (
        <PanelEdgeToc entries={dotEntries} scrollRef={scrollRef} anchorRef={tocAnchorRef} />
      )}
    </div>
  );
}
