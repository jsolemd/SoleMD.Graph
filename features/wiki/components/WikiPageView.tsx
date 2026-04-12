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
import { WikiModuleContent, resolveModule } from "@/features/wiki/components/WikiModuleContent";
import { DotToc, entriesFromModuleSections, entriesFromHeadings } from "@/features/wiki/components/DotToc";
import type { DotTocEntry } from "@/features/wiki/components/DotToc";
import { WikiPageHeader } from "@/features/wiki/components/WikiPageHeader";
import { WikiToc } from "@/features/wiki/components/WikiToc";
import { useWikiGraphSync } from "@/features/wiki/hooks/use-wiki-graph-sync";
import { useWikiPageBundle } from "@/features/wiki/hooks/use-wiki-page-bundle";
import { resolveWikiPageGraphRefs } from "@/features/wiki/lib/wiki-page-graph";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";

interface WikiPageViewProps {
  slug: string;
  graphReleaseId: string;
  queries: GraphBundleQueries;
  onNavigate: (slug: string) => void;
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
}: WikiPageViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const localGraphPopped = useWikiStore((state) => state.localGraphPopped);
  const modulePopped = useWikiStore((state) => state.modulePopped);
  const setCurrentPageKind = useWikiStore((state) => state.setCurrentPageKind);
  const setGlobalGraphOpen = useWikiStore((state) => state.setGlobalGraphOpen);
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
    const sections = resolveModule(slug)?.manifest.sections;
    return sections ? entriesFromModuleSections(sections) : undefined;
  }, [isModulePage, slug]);

  const [headingEntries, setHeadingEntries] = useState<DotTocEntry[]>([]);

  // Scan headings after content renders and re-scan on DOM mutations
  useEffect(() => {
    const el = scrollRef.current;
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
        <Text style={{ ...panelTextStyle, color: "var(--error-text)" }}>
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!localGraphPopped && (
        <div className="flex-shrink-0 px-2.5 pb-1">
          <WikiLocalGraph slug={slug} onNavigate={onNavigate} />
        </div>
      )}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5"
      >
        <WikiToc scrollRef={scrollRef} />

        <div className="flex flex-col gap-2">
          <WikiPageHeader
            page={page}
            pageContext={pageContext}
            pageContextLoading={pageContextLoading}
            pageContextError={pageContextError}
            canShowPageOnGraph={canShowPageOnGraph}
            onShowPageOnGraph={() => {
              void showPageOnGraph();
            }}
            onOpenGlobalGraph={() => setGlobalGraphOpen(true)}
            onPaperClick={onPaperClick}
          />

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

        {/* Inline module content — renders below wiki header when not popped */}
        {isModulePage && !modulePopped && (
          <div
            id="wiki-module-inline"
            className="wiki-module-inline mt-4"
          >
            <WikiModuleContent slug={slug} />
          </div>
        )}

        {backlinksBlock}
      </div>

      {dotEntries && (
        <DotToc entries={dotEntries} scrollRef={scrollRef} />
      )}
    </div>
  );
}
