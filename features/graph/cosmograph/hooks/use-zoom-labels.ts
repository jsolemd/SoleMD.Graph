"use client";

import { type RefObject, useCallback, useRef, useState } from "react";
import type { CosmographRef } from "@cosmograph/react";

const ZOOM_LABEL_THRESHOLD = 1.5;

export function useZoomLabels(
  cosmographRef: RefObject<CosmographRef | undefined>,
) {
  const [zoomedIn, setZoomedIn] = useState(false);
  const zoomedInRef = useRef(false);
  const [isActivelyZooming, setIsActivelyZooming] = useState(false);
  const isActivelyZoomingRef = useRef(false);

  const handleZoomStart = useCallback(() => {
    if (!isActivelyZoomingRef.current) {
      isActivelyZoomingRef.current = true;
      setIsActivelyZooming(true);
    }
  }, []);

  const handleZoomEnd = useCallback(() => {
    isActivelyZoomingRef.current = false;

    const zoom = cosmographRef.current?.getZoomLevel();
    if (zoom == null) {
      setIsActivelyZooming(false);
      return;
    }

    const isZoomed = zoom > ZOOM_LABEL_THRESHOLD;
    if (isZoomed !== zoomedInRef.current) {
      zoomedInRef.current = isZoomed;
      setZoomedIn(isZoomed);
    }

    setIsActivelyZooming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cosmographRef is a stable ref
  }, []);

  return {
    zoomedIn,
    isActivelyZooming,
    handleZoomStart,
    handleZoomEnd,
  };
}
