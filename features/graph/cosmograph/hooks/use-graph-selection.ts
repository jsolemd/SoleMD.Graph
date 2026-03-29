"use client";
import { useCallback } from "react";
import { useCosmograph } from "@cosmograph/react";

export function useGraphSelection() {
  const { cosmograph } = useCosmograph();

  const selectPoint = useCallback((index: number, addToSelection?: boolean, expandLinks?: boolean) => {
    cosmograph?.selectPoint(index, addToSelection, expandLinks);
  }, [cosmograph]);

  const setFocusedPoint = useCallback((index: number) => {
    cosmograph?.setFocusedPoint(index);
  }, [cosmograph]);

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

  return {
    selectPoint,
    setFocusedPoint,
    unselectAllPoints,
    clearSelections,
    getPointsSelection,
    getLinksSelection,
    getActiveSelectionSourceId,
    getSelectedPointIndices,
  };
}
