"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { ActionIcon } from "@mantine/core";
import { List, X } from "lucide-react";
import { useViewportSize } from "@mantine/hooks";
import {
  APP_CHROME_BASE_PX,
  APP_CHROME_PX,
  densityCssPx,
  densityCssViewportInset,
  densityPx,
  densityViewportHeight,
  densityViewportWidth,
  WIKI_PANEL_BASE_PX,
  WIKI_PANEL_PX,
} from "@/lib/density";
import { useDashboardStore } from "@/features/graph/stores";
import { resolveWikiPanelWidth, PANEL_EDGE_MARGIN, selectPanelLeftOffset } from "@/features/graph/stores/dashboard-store";
import {
  PANEL_TOP,
  PanelBody,
  PanelHeaderActions,
  PanelHeaderDivider,
  PanelIconAction,
  PanelShell,
} from "@/features/graph/components/panels/PanelShell";
import { WikiGraphView } from "@/features/wiki/components/WikiGraphView";
import { WikiModuleContent, getWikiModule } from "@/features/wiki/components/WikiModuleContent";
import { DotToc, entriesFromModuleSections } from "@/features/wiki/components/DotToc";
import { WikiModuleSearch } from "@/features/wiki/components/WikiModuleSearch";
import { WikiPageView } from "@/features/wiki/components/WikiPageView";
import { WikiLocalGraph } from "@/features/wiki/components/WikiLocalGraph";
import { WikiSearch } from "@/features/wiki/components/WikiSearch";
import { WikiBrowseSheet } from "@/features/wiki/components/WikiBrowseSheet";
import { WikiContextActions, WikiNavigation } from "@/features/wiki/components/WikiNavigation";
import { AnimationEmbed } from "@/features/wiki/components/elements/AnimationEmbed";
import { useShellVariantContext } from "@/features/graph/components/shell/ShellVariantContext";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import { resolveGraphReleaseId } from "@/features/graph/lib/graph-release";
import type { GraphBundle, GraphBundleQueries } from "@/features/graph/types";

interface WikiPanelProps {
  bundle: GraphBundle;
  queries: GraphBundleQueries;
}

export function WikiPanel({ bundle, queries }: WikiPanelProps) {
  const shellVariant = useShellVariantContext();
  const isMobile = shellVariant === "mobile";
  const closePanel = useDashboardStore((s) => s.closePanel);
  const wikiExpanded = useDashboardStore((s) => s.wikiExpanded);
  const setWikiExpandedWidth = useDashboardStore((s) => s.setWikiExpandedWidth);

  const currentRoute = useWikiStore((s) => s.currentRoute);
  const navigateToPage = useWikiStore((s) => s.navigateToPage);
  const fetchGraphData = useWikiStore((s) => s.fetchGraphData);

  const graphReleaseId = resolveGraphReleaseId(bundle);
  const isGraphRoute = currentRoute.kind === "graph";

  // Track viewport for expanded width + height calculation
  const { width: viewportWidth, height: viewportHeight } = useViewportSize();
  const panelHeight = isGraphRoute
    ? WIKI_PANEL_PX.routeGraphHeight
    : wikiExpanded
      ? densityViewportHeight(viewportHeight || 900, {
          subtractBase: APP_CHROME_BASE_PX.wikiExpandedViewportInset,
          minBase: WIKI_PANEL_BASE_PX.contentMinHeight,
        })
      : densityViewportHeight(viewportHeight || 900, {
          subtractBase: APP_CHROME_BASE_PX.panelTop * 2,
          minBase: WIKI_PANEL_BASE_PX.contentMinHeight,
        });
  const panelWidth = isGraphRoute
    ? densityViewportWidth(viewportWidth || 1920, 0.58, { maxBase: WIKI_PANEL_BASE_PX.routeGraphWidthMax })
    : resolveWikiPanelWidth(viewportWidth || 1920, wikiExpanded);

  // Center expanded wiki panel above prompt box
  const leftOffset = useDashboardStore((s) => selectPanelLeftOffset(s, "wiki"));
  const anchorXOffset = useMemo(() => {
    if (!wikiExpanded || !viewportWidth) return undefined;
    const dockLeft = PANEL_EDGE_MARGIN + leftOffset;
    const centerLeft = Math.round((viewportWidth - panelWidth) / 2);
    return Math.max(0, centerLeft - dockLeft);
  }, [wikiExpanded, viewportWidth, panelWidth, leftOffset]);

  // When expanded, shift panel up so it abuts 24px from top of viewport
  const anchorYOffset = useMemo(() => {
    if (!wikiExpanded) return undefined;
    return -(PANEL_TOP - APP_CHROME_PX.wikiExpandedTopInset);
  }, [wikiExpanded]);

  useEffect(() => {
    if (wikiExpanded) {
      setWikiExpandedWidth(panelWidth);
    }
  }, [wikiExpanded, panelWidth, setWikiExpandedWidth]);

  // Fetch graph data on mount
  useEffect(() => {
    void fetchGraphData(graphReleaseId);
  }, [fetchGraphData, graphReleaseId]);

  const globalGraphOpen = useWikiStore((s) => s.globalGraphOpen);
  const setGlobalGraphOpen = useWikiStore((s) => s.setGlobalGraphOpen);
  const localGraphPopped = useWikiStore((s) => s.localGraphPopped);
  const setLocalGraphPopped = useWikiStore((s) => s.setLocalGraphPopped);
  const modulePopped = useWikiStore((s) => s.modulePopped);
  const modulePoppedSlug = useWikiStore((s) => s.modulePoppedSlug);
  const setModulePopped = useWikiStore((s) => s.setModulePopped);
  const tocOpen = useWikiStore((s) => s.tocOpen);
  const setTocOpen = useWikiStore((s) => s.setTocOpen);
  const fullscreenAnim = useWikiStore((s) => s.fullscreenAnim);
  const setFullscreenAnim = useWikiStore((s) => s.setFullscreenAnim);
  const wikiPageViewportRef = useRef<HTMLDivElement>(null);
  const modulePanelScrollRef = useRef<HTMLDivElement>(null);
  const moduleTocEntries = useMemo(() => {
    if (!modulePopped || !modulePoppedSlug) return undefined;
    const sections = getWikiModule(modulePoppedSlug)?.manifest.sections;
    return sections ? entriesFromModuleSections(sections) : undefined;
  }, [modulePopped, modulePoppedSlug]);

  const handleOpenPage = useCallback(
    (slug: string) => navigateToPage(slug),
    [navigateToPage],
  );

  // Global graph: navigate to page AND close the overlay.
  // Closing first avoids the dual-instance Pixi texture issue where
  // the main panel's WikiGraph unmount destroys shared textures.
  const handleGlobalGraphOpenPage = useCallback(
    (slug: string) => {
      setGlobalGraphOpen(false);
      navigateToPage(slug);
    },
    [setGlobalGraphOpen, navigateToPage],
  );

  const handleClose = useCallback(() => {
    useWikiStore.getState().reset();
    closePanel("wiki");
  }, [closePanel]);

  const handleCloseOverlay = useCallback(() => {
    setGlobalGraphOpen(false);
  }, [setGlobalGraphOpen]);

  // Escape to close global graph overlay
  useEffect(() => {
    if (!globalGraphOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setGlobalGraphOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [globalGraphOpen, setGlobalGraphOpen]);

  // Escape to close fullscreen animation overlay
  useEffect(() => {
    if (!fullscreenAnim) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setFullscreenAnim(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [fullscreenAnim, setFullscreenAnim]);

  return (
    <>
      <PanelShell
        id="wiki"
        title="Wiki"
        defaultWidth={panelWidth}
        maxWidth={WIKI_PANEL_PX.maxWidth}
        defaultHeight={panelHeight}
        minHeight={isGraphRoute ? WIKI_PANEL_PX.routeGraphMinHeight : WIKI_PANEL_PX.contentMinHeight}
        maxHeight={isGraphRoute ? WIKI_PANEL_PX.routeGraphMaxHeight : undefined}
        anchorXOffset={anchorXOffset}
        anchorYOffset={anchorYOffset}
        headerNavigation={<WikiNavigation />}
        headerActions={
          <PanelHeaderActions>
            <WikiSearch onNavigate={handleOpenPage} />
            <PanelHeaderDivider />
            <WikiContextActions />
          </PanelHeaderActions>
        }
        contentScaleMode={currentRoute.kind === "graph" ? "none" : "reading"}
        onClose={handleClose}
      >
        <PanelBody
          viewportRef={currentRoute.kind === "graph" ? undefined : wikiPageViewportRef}
          innerScroll={currentRoute.kind !== "graph"}
          paddingX={currentRoute.kind === "graph" ? 10 : 0}
          paddingBottom={currentRoute.kind === "graph" ? 10 : 0}
        >
          {currentRoute.kind === "graph" ? (
            globalGraphOpen ? null : (
              <WikiGraphView
                graphReleaseId={graphReleaseId}
                onOpenPage={handleOpenPage}
              />
            )
          ) : (
            <WikiPageView
              slug={currentRoute.slug}
              graphReleaseId={graphReleaseId}
              queries={queries}
              onNavigate={handleOpenPage}
              tocAnchorRef={wikiPageViewportRef}
            />
          )}
        </PanelBody>
      </PanelShell>

      {/* Popped-out local graph — its own floating panel */}
      {localGraphPopped && currentRoute.kind === "page" && (
        <PanelShell
          id="wiki-graph"
          title="Wiki Graph"
          defaultWidth={WIKI_PANEL_PX.localGraphWidth}
          contentScaleMode="none"
          onClose={() => setLocalGraphPopped(false)}
        >
          <PanelBody
            innerScroll
            paddingX={8}
            paddingTop={8}
            paddingBottom={8}
          >
            <WikiLocalGraph
              slug={currentRoute.slug}
              onNavigate={handleOpenPage}
            />
          </PanelBody>
        </PanelShell>
      )}

      {/* Popped-out module — its own floating panel, persists across navigation */}
      {modulePopped && modulePoppedSlug && (
        <PanelShell
          id="wiki-module"
          title="Module"
          defaultWidth={WIKI_PANEL_PX.moduleWidth}
          contentScaleMode="reading"
          onClose={() => setModulePopped(false)}
          headerActions={
            <PanelHeaderActions>
              <WikiModuleSearch scrollRef={modulePanelScrollRef} />
              <PanelIconAction
                label="Table of Contents"
                icon={<List size={12} />}
                onClick={() => setTocOpen(!tocOpen)}
                aria-label="Table of Contents"
                aria-pressed={tocOpen}
              />
            </PanelHeaderActions>
          }
        >
          <PanelBody
            viewportRef={modulePanelScrollRef}
            paddingX={12}
            paddingTop={12}
            paddingBottom={12}
          >
            <WikiModuleContent slug={modulePoppedSlug} withShell />
          </PanelBody>
          {moduleTocEntries && (
            <DotToc entries={moduleTocEntries} scrollRef={modulePanelScrollRef} />
          )}
        </PanelShell>
      )}

      {globalGraphOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9998] flex items-center justify-center"
            style={{
              backgroundColor: "var(--graph-overlay-scrim)",
              backdropFilter: `blur(${densityCssPx(APP_CHROME_BASE_PX.overlayBlur)})`,
              WebkitBackdropFilter: `blur(${densityCssPx(APP_CHROME_BASE_PX.overlayBlur)})`,
            }}
            onClick={handleCloseOverlay}
          >
            <div
              className="relative overflow-hidden rounded-[1rem] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
              style={{
                width: isMobile
                  ? "100vw"
                  : densityCssViewportInset("vw", APP_CHROME_BASE_PX.wikiOverlayInset),
                height: isMobile
                  ? "100svh"
                  : densityCssViewportInset("vh", APP_CHROME_BASE_PX.wikiOverlayInset),
                borderRadius: isMobile ? 0 : "1rem",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute right-3 top-3 z-10">
                <ActionIcon
                  variant="subtle"
                  size={APP_CHROME_PX.toolbarIcon}
                  radius="xl"
                  onClick={handleCloseOverlay}
                  aria-label="Close graph"
                  style={{ color: "var(--graph-panel-text-muted)" }}
                >
                  <X size={densityPx(14)} />
                </ActionIcon>
              </div>
              <div className="flex h-full w-full flex-col overflow-hidden p-3">
                <WikiGraphView
                  graphReleaseId={graphReleaseId}
                  onOpenPage={handleGlobalGraphOpenPage}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}

      <WikiBrowseSheet />

      {/* Fullscreen animation overlay — portaled to body to escape panel transforms */}
      {fullscreenAnim &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ backgroundColor: "var(--graph-overlay-scrim-strong)" }}
            onClick={() => setFullscreenAnim(null)}
          >
            <div
              className="relative overflow-hidden rounded-[1rem] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
              style={{
                width: "80vw",
                height: "80vh",
                border: "1px solid var(--border-default)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute right-3 top-3 z-10">
                <ActionIcon
                  variant="subtle"
                  size={APP_CHROME_PX.toolbarIcon}
                  radius="xl"
                  onClick={() => setFullscreenAnim(null)}
                  aria-label="Close animation"
                  style={{ color: "var(--graph-panel-text-muted)" }}
                >
                  <X size={densityPx(14)} />
                </ActionIcon>
              </div>
              <AnimationEmbed name={fullscreenAnim} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
