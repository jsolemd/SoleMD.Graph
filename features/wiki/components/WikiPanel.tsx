"use client";

import { useCallback, useEffect } from "react";
import { Text } from "@mantine/core";
import { useViewportSize } from "@mantine/hooks";
import { useDashboardStore } from "@/features/graph/stores";
import { resolveWikiPanelWidth } from "@/features/graph/stores/dashboard-store";
import {
  PANEL_BODY_CLASS,
  panelTextStyle,
  panelTextMutedStyle,
  panelAccentCardClassName,
  panelAccentCardStyle,
} from "@/features/graph/components/panels/PanelShell";
import { FloatingPanelShell } from "@/features/graph/components/panels/FloatingPanelShell";
import { WikiMarkdownRenderer } from "@/features/wiki/components/WikiMarkdownRenderer";
import { WikiNavigation } from "@/features/wiki/components/WikiNavigation";
import { WikiSearch } from "@/features/wiki/components/WikiSearch";
import { WikiBacklinks } from "@/features/wiki/components/WikiBacklinks";
import { useWikiPage } from "@/features/wiki/hooks/use-wiki-page";
import { useWikiBacklinks } from "@/features/wiki/hooks/use-wiki-backlinks";
import { useWikiGraphSync } from "@/features/wiki/hooks/use-wiki-graph-sync";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import { resolveGraphReleaseId } from "@/features/graph/lib/graph-release";
import type { GraphBundle, GraphBundleQueries } from "@/features/graph/types";

interface WikiPanelProps {
  bundle: GraphBundle;
  queries: GraphBundleQueries;
}

const DEFAULT_SLUG = "index";
const EMPTY_RESOLVED_LINKS: Record<string, string> = {};
const EMPTY_PAPER_REFS: Record<number, string> = {};

export function WikiPanel({ bundle, queries }: WikiPanelProps) {
  const togglePanel = useDashboardStore((s) => s.togglePanel);
  const wikiExpanded = useDashboardStore((s) => s.wikiExpanded);
  const setWikiExpandedWidth = useDashboardStore((s) => s.setWikiExpandedWidth);
  const currentSlug = useWikiStore((s) => s.currentSlug);
  const navigateTo = useWikiStore((s) => s.navigateTo);
  const slug = currentSlug ?? DEFAULT_SLUG;

  const graphReleaseId = resolveGraphReleaseId(bundle);
  const { page, loading, error } = useWikiPage(slug, graphReleaseId);

  // Track viewport for expanded width calculation
  const { width: viewportWidth } = useViewportSize();
  const panelWidth = resolveWikiPanelWidth(viewportWidth || 1920, wikiExpanded);

  // Sync expanded width to store so selectLeftClearance stays pure
  useEffect(() => {
    if (wikiExpanded) {
      setWikiExpandedWidth(panelWidth);
    }
  }, [wikiExpanded, panelWidth, setWikiExpandedWidth]);

  // Navigate to default page on first open — must be in an effect, not during render
  useEffect(() => {
    if (!currentSlug) {
      navigateTo(DEFAULT_SLUG);
    }
  }, [currentSlug, navigateTo]);

  const handleNavigate = useCallback(
    (targetSlug: string) => navigateTo(targetSlug),
    [navigateTo],
  );

  // Graph overlay sync — highlight referenced papers on the canvas
  const paperGraphRefs = page?.paper_graph_refs ?? EMPTY_PAPER_REFS;
  const { onPaperClick } = useWikiGraphSync({
    queries,
    paperGraphRefs,
    currentSlug,
  });

  // Backlinks for current page
  const { backlinks } = useWikiBacklinks(currentSlug);

  const contentBlock = (
    <>
      {loading && (
        <Text style={panelTextMutedStyle}>Loading...</Text>
      )}
      {error && (
        <Text style={{ ...panelTextStyle, color: "var(--error-text)" }}>
          {error}
        </Text>
      )}
      {page && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <WikiNavigation />
            <h2
              className="m-0 text-base font-semibold"
              style={{ color: "var(--graph-panel-text)" }}
            >
              {page.title}
            </h2>
          </div>

          {page.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {page.tags.map((tag) => (
                <span
                  key={tag}
                  className={panelAccentCardClassName}
                  style={{
                    ...panelAccentCardStyle,
                    padding: "1px 6px",
                    fontSize: 9,
                    borderRadius: 4,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <WikiMarkdownRenderer
            contentMd={page.content_md}
            resolvedLinks={page.resolved_links ?? EMPTY_RESOLVED_LINKS}
            paperGraphRefs={page.paper_graph_refs ?? EMPTY_PAPER_REFS}
            onNavigate={handleNavigate}
            onPaperClick={onPaperClick}
          />
        </div>
      )}
      {!loading && !error && !page && (
        <Text style={panelTextMutedStyle}>
          No wiki page found for &ldquo;{slug}&rdquo;
        </Text>
      )}
    </>
  );

  const backlinksBlock = backlinks.length > 0 ? (
    <WikiBacklinks backlinks={backlinks} onNavigate={handleNavigate} />
  ) : null;

  return (
    <FloatingPanelShell
      id="wiki"
      title="Wiki"
      side="left"
      defaultWidth={panelWidth}
      headerActions={<WikiSearch onNavigate={handleNavigate} />}
      onClose={() => togglePanel("wiki")}
    >
      <div className={PANEL_BODY_CLASS}>
        {wikiExpanded ? (
          <div className="flex gap-4">
            <div className="min-w-0 flex-[7]">{contentBlock}</div>
            {backlinksBlock && (
              <div className="flex-[3]">{backlinksBlock}</div>
            )}
          </div>
        ) : (
          <>
            {contentBlock}
            {backlinksBlock}
          </>
        )}
      </div>
    </FloatingPanelShell>
  );
}
