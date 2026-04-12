"use client";

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { ActionIcon } from "@mantine/core";
import { X } from "lucide-react";
import { useViewportSize } from "@mantine/hooks";
import { useDashboardStore } from "@/features/graph/stores";
import { resolveWikiPanelWidth } from "@/features/graph/stores/dashboard-store";
import { PanelShell } from "@/features/graph/components/panels/PanelShell";
import { WikiGraphView } from "@/features/wiki/components/WikiGraphView";
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

  // Track viewport for expanded width calculation
  const { width: viewportWidth } = useViewportSize();
  const panelWidth = isGraphRoute
    ? Math.min(760, Math.floor((viewportWidth || 1920) * 0.58))
    : resolveWikiPanelWidth(viewportWidth || 1920, wikiExpanded);

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
  const fullscreenAnim = useWikiStore((s) => s.fullscreenAnim);
  const setFullscreenAnim = useWikiStore((s) => s.setFullscreenAnim);

  const handleOpenPage = useCallback(
    (slug: string) => navigateToPage(slug),
    [navigateToPage],
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

  const bodyClassName =
    currentRoute.kind === "graph"
      ? "flex min-h-0 flex-1 flex-col overflow-hidden px-2.5 pb-2.5"
      : "flex min-h-0 flex-1 flex-col"; // Page view handles its own scroll

  return (
    <>
      <PanelShell
        id="wiki"
        title="Wiki"
        defaultWidth={panelWidth}
        defaultHeight={isGraphRoute ? 640 : undefined}
        minHeight={isGraphRoute ? 520 : undefined}
        maxHeight={isGraphRoute ? 860 : undefined}
        headerActions={
          <div className="flex items-center gap-1">
            <WikiNavigation />
            <WikiSearch onNavigate={handleOpenPage} />
          </div>
        }
        onClose={handleClose}
      >
        <div className={bodyClassName}>
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
        </div>
      </PanelShell>

      {/* Popped-out local graph — its own floating panel */}
      {localGraphPopped && currentRoute.kind === "page" && (
        <PanelShell
          id="wiki-graph"
          title="Wiki Graph"
          defaultWidth={320}
          onClose={() => setLocalGraphPopped(false)}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
            <WikiLocalGraph
              slug={currentRoute.slug}
              onNavigate={handleOpenPage}
            />
          </div>
        </PanelShell>
      )}

      {globalGraphOpen && (
        <PanelShell
          id="wiki-global-graph"
          title="Wiki Graph"
          defaultWidth={1120}
          minWidth={760}
          maxWidth={1440}
          defaultHeight={800}
          minHeight={520}
          maxHeight={980}
          onClose={handleCloseOverlay}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
            <WikiGraphView
              graphReleaseId={graphReleaseId}
              onOpenPage={handleOpenPage}
            />
          </div>
        </PanelShell>
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
