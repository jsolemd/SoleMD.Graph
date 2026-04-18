"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { resolveGraphReleaseId } from "@solemd/graph";
import { GraphShell, useGraphSelection } from "@/features/graph/cosmograph";
import { EntityHoverCardProvider } from "@/features/graph/components/entities/EntityHoverCardProvider";
import { syncEntityOverlay } from "@/features/graph/components/entities/entity-overlay-sync";
import { commitSelectionState } from "@/features/graph/lib/graph-selection-state";
import { ENTITY_OVERLAY_SELECTION_SOURCE_ID } from "@/features/graph/lib/overlay-producers";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphEntityRef } from "@solemd/api-client/shared/graph-entity";
import type { GraphBundle, GraphBundleQueries } from "@solemd/graph";
import { getEntityWikiSlug } from "@/features/wiki/lib/entity-wiki-route";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import { ModeColorSync } from "./ModeColorSync";
import { DesktopShell } from "./DesktopShell";
import { GraphBundleErrorState } from "./loading";
import { MobileShell } from "./MobileShell";
import { ShellVariantProvider, useShellVariantContext } from "./ShellVariantContext";
import { useShellVariant } from "./use-shell-variant";
import type { DashboardShellController } from "./use-dashboard-shell-controller";

function EntityHoverActionProvider({
  bundle,
  children,
  queries,
}: {
  bundle: GraphBundle;
  children: ReactNode;
  queries: GraphBundleQueries | null;
}) {
  const shellVariant = useShellVariantContext();
  const setPanelsVisible = useDashboardStore((state) => state.setPanelsVisible);
  const openOnlyPanel = useDashboardStore((state) => state.openOnlyPanel);
  const openPanel = useDashboardStore((state) => state.openPanel);
  const setSelectedPointCount = useDashboardStore((state) => state.setSelectedPointCount);
  const setActiveSelectionSourceId = useDashboardStore(
    (state) => state.setActiveSelectionSourceId,
  );
  const { selectPointsByIndices } = useGraphSelection();
  const graphReleaseId = resolveGraphReleaseId(bundle);
  const abortRef = useRef<AbortController | null>(null);

  const handleShowOnGraph = useCallback(
    (entity: GraphEntityRef) => {
      if (!queries) {
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      void syncEntityOverlay({
        queries,
        entityRefs: [
          { entityType: entity.entityType, sourceIdentifier: entity.sourceIdentifier },
        ],
        graphReleaseId,
        signal: controller.signal,
        useNativeSelectionOnly: true,
      })
        .then(async (result) => {
          if (controller.signal.aborted || result.selectedPointIndices.length === 0) {
            return;
          }

          await commitSelectionState({
            sourceId: ENTITY_OVERLAY_SELECTION_SOURCE_ID,
            queries,
            pointIndices: result.selectedPointIndices,
            setSelectedPointCount,
            setActiveSelectionSourceId,
          });

          if (controller.signal.aborted) {
            return;
          }

          selectPointsByIndices({
            sourceId: ENTITY_OVERLAY_SELECTION_SOURCE_ID,
            pointIndices: result.selectedPointIndices,
          });
        })
        .catch(() => {});
    },
    [
      graphReleaseId,
      queries,
      selectPointsByIndices,
      setActiveSelectionSourceId,
      setSelectedPointCount,
    ],
  );

  const handleOpenWiki = useCallback(
    (entity: GraphEntityRef) => {
      setPanelsVisible(true);
      if (shellVariant === "mobile") {
        openOnlyPanel("wiki");
      } else {
        openPanel("wiki");
      }
      useWikiStore.getState().navigateToPage(getEntityWikiSlug(entity));
    },
    [openOnlyPanel, openPanel, setPanelsVisible, shellVariant],
  );

  return (
    <EntityHoverCardProvider
      onShowOnGraph={handleShowOnGraph}
      onOpenWiki={handleOpenWiki}
    >
      {children}
    </EntityHoverCardProvider>
  );
}

export function DashboardShellViewport(state: DashboardShellController) {
  const shellVariant = useShellVariant();

  if (state.error) {
    return <GraphBundleErrorState error={state.error} />;
  }

  return (
    <GraphShell>
      <ShellVariantProvider value={shellVariant}>
        <EntityHoverActionProvider bundle={state.bundle} queries={state.queries}>
          <ModeColorSync />
          {shellVariant === "mobile" ? (
            <MobileShell {...state} />
          ) : (
            <DesktopShell {...state} />
          )}
        </EntityHoverActionProvider>
      </ShellVariantProvider>
    </GraphShell>
  );
}
