"use client";
import { useCallback } from "react";
import { useCosmographInternal } from "@cosmograph/react";

export function useGraphCamera() {
  // Null-tolerant: the throwing useCosmograph would crash renderer-clean
  // surfaces (e.g. the 3D OrbSurface) that mount panels which transitively
  // pull camera controls in. All callbacks below already guard via `?.`.
  const cosmograph = useCosmographInternal()?.cosmograph;

  const fitView = useCallback((duration?: number, padding?: number) => {
    cosmograph?.fitView(duration, padding);
  }, [cosmograph]);

  const fitViewByIndices = useCallback((indices: number[], duration?: number, padding?: number) => {
    cosmograph?.fitViewByIndices(indices, duration, padding);
  }, [cosmograph]);

  const fitViewByCoordinates = useCallback((coordinates: number[], duration?: number, padding?: number) => {
    cosmograph?.fitViewByCoordinates(coordinates, duration, padding);
  }, [cosmograph]);

  const zoomToPoint = useCallback((index: number, duration?: number) => {
    cosmograph?.zoomToPoint(index, duration);
  }, [cosmograph]);

  const zoomIn = useCallback((factor = 1.4, duration = 200) => {
    const current = cosmograph?.getZoomLevel() ?? 1;
    cosmograph?.setZoomLevel(current * factor, duration);
  }, [cosmograph]);

  const zoomOut = useCallback((factor = 1.4, duration = 200) => {
    const current = cosmograph?.getZoomLevel() ?? 1;
    cosmograph?.setZoomLevel(current / factor, duration);
  }, [cosmograph]);

  const getZoomLevel = useCallback(() => {
    return cosmograph?.getZoomLevel() ?? 1;
  }, [cosmograph]);

  const setZoomLevel = useCallback((level: number, duration?: number) => {
    cosmograph?.setZoomLevel(level, duration);
  }, [cosmograph]);

  return {
    fitView,
    fitViewByIndices,
    fitViewByCoordinates,
    zoomToPoint,
    zoomIn,
    zoomOut,
    getZoomLevel,
    setZoomLevel,
  };
}
