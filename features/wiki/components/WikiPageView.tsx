"use client";

import { useMemo, useRef } from "react";
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
import { WikiPageHeader } from "@/features/wiki/components/WikiPageHeader";
import { WikiToc } from "@/features/wiki/components/WikiToc";
import { useWikiBacklinks } from "@/features/wiki/hooks/use-wiki-backlinks";
import { useWikiGraphSync } from "@/features/wiki/hooks/use-wiki-graph-sync";
import { useWikiPage } from "@/features/wiki/hooks/use-wiki-page";
import { useWikiPageContext } from "@/features/wiki/hooks/use-wiki-page-context";
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

export function WikiPageView({
  slug,
  graphReleaseId,
  queries,
  onNavigate,
}: WikiPageViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const localGraphPopped = useWikiStore((state) => state.localGraphPopped);
  const setGlobalGraphOpen = useWikiStore((state) => state.setGlobalGraphOpen);
  const { page, loading, error } = useWikiPage(slug, graphReleaseId);
  const { backlinks } = useWikiBacklinks(slug);
  const {
    context: pageContext,
    loading: pageContextLoading,
    error: pageContextError,
  } = useWikiPageContext(
    page?.slug ?? null,
    page?.page_kind ?? null,
    graphReleaseId,
  );

  const pageGraphRefs = useMemo(() => resolveWikiPageGraphRefs(page), [page]);
  const { onPaperClick, showPageOnGraph, canShowPageOnGraph } =
    useWikiGraphSync({
      queries,
      pageGraphRefs,
      currentSlug: slug,
    });

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
            onNavigate={onNavigate}
            onPaperClick={onPaperClick}
          />
        </div>

        {backlinksBlock}
      </div>
    </div>
  );
}
