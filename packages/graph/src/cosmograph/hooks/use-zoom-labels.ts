"use client";

import { type RefObject, useCallback, useRef, useState } from "react";
import type { CosmographRef } from "@cosmograph/react";

const ZOOM_LABEL_THRESHOLD = 1.08;

export function useZoomLabels(
  cosmographRef: RefObject<CosmographRef | undefined>,
) {
  const [zoomedIn, setZoomedIn] = useState(false);
  const zoomedInRef = useRef(false);

  const updateZoomState = useCallback(() => {
    const zoom = cosmographRef.current?.getZoomLevel();
    if (zoom == null) {
      return;
    }

    const isZoomed = zoom > ZOOM_LABEL_THRESHOLD;
    if (isZoomed !== zoomedInRef.current) {
      zoomedInRef.current = isZoomed;
      setZoomedIn(isZoomed);
    }
  }, [cosmographRef]);

  const handleZoom = useCallback(() => {
    updateZoomState();
  }, [updateZoomState]);

  return {
    zoomedIn,
    syncZoomState: updateZoomState,
    handleZoom,
  };
}
