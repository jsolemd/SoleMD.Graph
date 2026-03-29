"use client";

import { useControl } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { ArcLayer } from "@deck.gl/layers";

/** deck.gl overlay bridge */
export function DeckGLOverlay({ layers }: { layers: ArcLayer[] }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlay = useControl(() => new MapboxOverlay({ layers: layers as any }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overlay.setProps({ layers: layers as any });
  return null;
}
