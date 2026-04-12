"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { ActionIcon } from "@mantine/core";
import { List, X } from "lucide-react";
import { useViewportSize } from "@mantine/hooks";
import { useDashboardStore } from "@/features/graph/stores";
import { resolveWikiPanelWidth, PANEL_EDGE_MARGIN, selectPanelLeftOffset } from "@/features/graph/stores/dashboard-store";
import { PANEL_TOP, PanelBody, PanelShell, iconBtnStyles } from "@/features/graph/components/panels/PanelShell";
import { WikiGraphView } from "@/features/wiki/components/WikiGraphView";
import { WikiModuleContent, resolveModule } from "@/features/wiki/components/WikiModuleContent";
import { DotToc, entriesFromModuleSections } from "@/features/wiki/components/DotToc";
import { WikiModuleSearch } from "@/features/wiki/components/WikiModuleSearch";
import { WikiPageView } from "@/features/wiki/components/WikiPageView";
import { WikiLocalGraph } from "@/features/wiki/components/WikiLocalGraph";
import { WikiSearch } from "@/features/wiki/components/WikiSearch";
import { WikiNavigation } from "@/features/wiki/components/WikiNavigation";
import { AnimationEmbed } from "@/features/wiki/components/elements/AnimationEmbed";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import { resolveGraphReleaseId } from "@/features/graph/lib/graph-release";
import type { GraphBundle, GraphBundleQueries } from "@/features/graph/types";

interface WikiPanelProps {
  bundle: GraphBundle;
  queries: GraphBundleQueries;
}

export function WikiPanel({ bundle, queries }: WikiPanelProps) {
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
    ? 720
    : wikiExpanded
      ? Math.max(400, (viewportHeight || 900) - 48) // 24px top + 24px bottom
      : Math.max(400, (viewportHeight || 900) - PANEL_TOP * 2);
  const panelWidth = isGraphRoute
    ? Math.min(820, Math.floor((viewportWidth || 1920) * 0.58))
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
    return -(PANEL_TOP - 24); // shift up from 116px to 24px
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
  const currentPageKind = useWikiStore((s) => s.currentPageKind);
  const tocOpen = useWikiStore((s) => s.tocOpen);
  const setTocOpen = useWikiStore((s) => s.setTocOpen);
  const fullscreenAnim = useWikiStore((s) => s.fullscreenAnim);
  const setFullscreenAnim = useWikiStore((s) => s.setFullscreenAnim);
  const modulePanelScrollRef = useRef<HTMLDivElement>(null);
  const moduleTocEntries = useMemo(() => {
    if (!modulePopped || !modulePoppedSlug) return undefined;
    const sections = resolveModule(modulePoppedSlug)?.manifest.sections;
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
        maxWidth={1200}
        defaultHeight={panelHeight}
        minHeight={isGraphRoute ? 520 : 400}
        maxHeight={isGraphRoute ? 960 : undefined}
        anchorXOffset={anchorXOffset}
        anchorYOffset={anchorYOffset}
        headerActions={
          <div className="flex items-center gap-1">
            <WikiNavigation />
            <WikiSearch onNavigate={handleOpenPage} />
          </div>
        }
        onClose={handleClose}
      >
        <PanelBody
          panelId="wiki"
          viewportClassName="overflow-hidden"
          innerClassName={currentRoute.kind === "graph" ? undefined : "px-0 pb-0"}
        >
          {currentRoute.kind === "graph" ? (
            <WikiGraphView
              graphReleaseId={graphReleaseId}
              onOpenPage={handleOpenPage}
            />
          ) : (
            <WikiPageView
              slug={currentRoute.slug}
              graphReleaseId={graphReleaseId}
              queries={queries}
              onNavigate={handleOpenPage}
            />
          )}
        </PanelBody>
      </PanelShell>

      {/* Popped-out local graph — its own floating panel */}
      {localGraphPopped && currentRoute.kind === "page" && (
        <PanelShell
          id="wiki-graph"
          title="Wiki Graph"
          defaultWidth={320}
          onClose={() => setLocalGraphPopped(false)}
        >
          <PanelBody
            panelId="wiki-graph"
            viewportClassName="overflow-hidden"
            innerClassName="p-2"
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
          defaultWidth={900}
          onClose={() => setModulePopped(false)}
          headerActions={
            <div className="flex items-center gap-1">
              <WikiModuleSearch scrollRef={modulePanelScrollRef} />
              <ActionIcon
                variant="transparent"
                size={24}
                radius="xl"
                className="graph-icon-btn"
                styles={iconBtnStyles}
                onClick={() => setTocOpen(!tocOpen)}
                aria-label="Table of Contents"
                aria-pressed={tocOpen}
              >
                <List size={12} />
              </ActionIcon>
            </div>
          }
        >
          <PanelBody
            panelId="wiki-module"
            viewportRef={modulePanelScrollRef}
            innerClassName="p-3"
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
              backgroundColor: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
            }}
            onClick={handleCloseOverlay}
          >
            <div
              className="relative overflow-hidden rounded-[1rem] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
              style={{
                width: "calc(100vw - 80px)",
                height: "calc(100vh - 80px)",
                border: "1px solid var(--border-default)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute right-3 top-3 z-10">
                <ActionIcon
                  variant="subtle"
                  size={28}
                  radius="xl"
                  onClick={handleCloseOverlay}
                  aria-label="Close graph"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <X size={14} />
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

      {/* Fullscreen animation overlay — portaled to body to escape panel transforms */}
      {fullscreenAnim &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
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
                  size={28}
                  radius="xl"
                  onClick={() => setFullscreenAnim(null)}
                  aria-label="Close animation"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <X size={14} />
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
