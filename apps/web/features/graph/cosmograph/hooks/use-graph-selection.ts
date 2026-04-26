"use client";
import { useCallback } from "react";
import { useCosmographInternal } from "@cosmograph/react";
import { useGraphStore } from "@/features/graph/stores";
import {
  buildSelectedPointBaselineSelectionClause,
  clearSelectionClause,
  createSelectionSource,
} from "@/features/graph/lib/cosmograph-selection";

export function useGraphSelection() {
  // Null-tolerant: the throwing useCosmograph would crash renderer-clean
  // surfaces (e.g. the 3D OrbSurface) that transitively pull this hook in
  // via shared controllers. All call sites below already null-guard the
  // cosmograph reference.
  const cosmograph = useCosmographInternal()?.cosmograph;
  const setFocusedPointIndex = useGraphStore((s) => s.setFocusedPointIndex);

  const selectPoint = useCallback((index: number, addToSelection?: boolean, expandLinks?: boolean) => {
    cosmograph?.selectPoint(index, addToSelection, expandLinks);
  }, [cosmograph]);

  const setFocusedPoint = useCallback((index: number) => {
    setFocusedPointIndex(index);
    cosmograph?.setFocusedPoint(index);
  }, [cosmograph, setFocusedPointIndex]);

  const clearFocusedPoint = useCallback(() => {
    setFocusedPointIndex(null);
    cosmograph?.setFocusedPoint(undefined);
  }, [cosmograph, setFocusedPointIndex]);

  const unselectAllPoints = useCallback(() => {
    cosmograph?.unselectAllPoints();
  }, [cosmograph]);

  const clearSelections = useCallback(() => {
    cosmograph?.pointsSelection?.reset();
    cosmograph?.linksSelection?.reset();
  }, [cosmograph]);

  const getPointsSelection = useCallback(() => {
    return cosmograph?.pointsSelection;
  }, [cosmograph]);

  const getLinksSelection = useCallback(() => {
    return cosmograph?.linksSelection;
  }, [cosmograph]);

  const getActiveSelectionSourceId = useCallback(() => {
    return cosmograph?.getActiveSelectionSourceId() ?? null;
  }, [cosmograph]);

  const getSelectedPointIndices = useCallback(() => {
    return cosmograph?.getSelectedPointIndices() ?? [];
  }, [cosmograph]);

  const selectPointsByIndices = useCallback(
    (args: { sourceId: string; pointIndices: number[] }) => {
      if (!cosmograph || args.pointIndices.length === 0) return;

      // Layer 1: Native WebGL visual — highlight selected, greyout rest.
      // Uses Cosmograph's internal source ID, not our app-owned one.
      cosmograph.selectPoints(args.pointIndices);

      // Layer 2: App-owned baseline clause for source identity tracking.
      // Does not produce visual — sets getActiveSelectionSourceId() and
      // tells use-points-filtered to skip round-tripping this source.
      const selection = cosmograph.pointsSelection;
      if (selection) {
        selection.update(
          buildSelectedPointBaselineSelectionClause(
            createSelectionSource(args.sourceId),
            args.pointIndices.length,
          ),
        );
      }
    },
    [cosmograph],
  );

  const clearSelectionBySource = useCallback(
    (sourceId: string) => {
      if (!cosmograph) return;

      // Only clear native visual if our app-owned source still owns the
      // selection. If the user clicked/lassoed after our programmatic
      // selection, getActiveSelectionSourceId() will have changed.
      const activeSource = cosmograph.getActiveSelectionSourceId();
      if (
        activeSource === sourceId ||
        activeSource?.startsWith("pointsSelectionClient")
      ) {
        cosmograph.unselectAllPoints();
      }

      // Always clear the app-owned baseline clause
      const selection = cosmograph.pointsSelection;
      if (selection) {
        clearSelectionClause(selection, createSelectionSource(sourceId));
      }
    },
    [cosmograph],
  );

  return {
    selectPoint,
    selectPointsByIndices,
    setFocusedPoint,
    clearFocusedPoint,
    unselectAllPoints,
    clearSelections,
    clearSelectionBySource,
    getPointsSelection,
    getLinksSelection,
    getActiveSelectionSourceId,
    getSelectedPointIndices,
  };
}
