"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  Map,
  Source,
  Layer,
  NavigationControl,
  type MapRef,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import { useComputedColorScheme } from "@mantine/core";
import { useGraphStore, useDashboardStore } from "@/lib/graph/stores";
import type { GraphData, GeoNode } from "@/lib/graph/types";
import "maplibre-gl/dist/maplibre-gl.css";

const LIGHT_STYLE =
  "https://tiles.stadiamaps.com/styles/alidade_smooth.json";
const DARK_STYLE =
  "https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json";

const INITIAL_VIEW = {
  longitude: 0,
  latitude: 30,
  zoom: 1.8,
} as const;

/** Scale paper_count to a circle radius (px). */
function markerRadius(paperCount: number): number {
  return Math.max(4, Math.min(24, 4 + Math.sqrt(paperCount) * 2.5));
}

export default function MapCanvas({ data }: { data: GraphData }) {
  const mapRef = useRef<MapRef>(null);
  const scheme = useComputedColorScheme("light");
  const isDark = scheme === "dark";
  const selectNode = useGraphStore((s) => s.selectNode);
  const highlightedPointIndices = useDashboardStore(
    (s) => s.highlightedPointIndices
  );
  const selectedPointIndices = useDashboardStore(
    (s) => s.selectedPointIndices
  );
  const setSelectedPointIndices = useDashboardStore(
    (s) => s.setSelectedPointIndices
  );

  const geoNodes = data.geoNodes;

  // Build GeoJSON from geo nodes
  const geojson = useMemo(() => {
    const features = geoNodes.map((node) => ({
      type: "Feature" as const,
      id: node.index,
      geometry: {
        type: "Point" as const,
        coordinates: [node.x, node.y] as [number, number],
      },
      properties: {
        index: node.index,
        institution: node.institution ?? "Unknown",
        city: node.city ?? "",
        country: node.country ?? "",
        countryCode: node.countryCode ?? "",
        paperCount: node.paperCount,
        authorCount: node.authorCount,
        color: isDark ? node.color : node.colorLight,
        radius: markerRadius(node.paperCount),
      },
    }));
    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [geoNodes, isDark]);

  // Build index lookup for click handling
  const indexToNode = useMemo(() => {
    const lookup = new globalThis.Map<number, GeoNode>();
    for (const node of geoNodes) {
      lookup.set(node.index, node);
    }
    return lookup;
  }, [geoNodes]);

  // Highlighted set for opacity dimming
  const highlightedSet = useMemo(
    () =>
      highlightedPointIndices.length > 0
        ? new Set(highlightedPointIndices)
        : null,
    [highlightedPointIndices]
  );

  const selectedSet = useMemo(
    () =>
      selectedPointIndices.length > 0
        ? new Set(selectedPointIndices)
        : null,
    [selectedPointIndices]
  );

  // Click handler
  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const idx = feature.properties?.index;
      if (idx == null) return;
      const node = indexToNode.get(Number(idx));
      if (node) {
        selectNode(node);
        setSelectedPointIndices([node.index]);
      }
    },
    [indexToNode, selectNode, setSelectedPointIndices]
  );

  // Cursor change on hover
  const handleMouseEnter = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = "pointer";
  }, []);

  const handleMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = "";
  }, []);

  return (
    <div className="fixed inset-0">
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        mapStyle={isDark ? DARK_STYLE : LIGHT_STYLE}
        interactiveLayerIds={["geo-markers"]}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="bottom-left" />

        <Source id="geo-institutions" type="geojson" data={geojson}>
          {/* Marker circles */}
          <Layer
            id="geo-markers"
            type="circle"
            paint={{
              "circle-radius": ["get", "radius"],
              "circle-color": ["get", "color"],
              "circle-opacity": highlightedSet
                ? [
                    "case",
                    ["in", ["get", "index"], ["literal", [...highlightedSet]]],
                    0.9,
                    0.15,
                  ]
                : selectedSet
                  ? [
                      "case",
                      ["in", ["get", "index"], ["literal", [...selectedSet]]],
                      0.9,
                      0.25,
                    ]
                  : 0.8,
              "circle-stroke-width": selectedSet
                ? [
                    "case",
                    ["in", ["get", "index"], ["literal", [...selectedSet]]],
                    2,
                    0.5,
                  ]
                : 0.5,
              "circle-stroke-color": isDark
                ? "rgba(255,255,255,0.3)"
                : "rgba(0,0,0,0.15)",
            }}
          />

          {/* Labels — show at zoom 4+ */}
          <Layer
            id="geo-labels"
            type="symbol"
            minzoom={4}
            layout={{
              "text-field": ["get", "institution"],
              "text-size": 11,
              "text-offset": [0, 1.4],
              "text-anchor": "top",
              "text-max-width": 12,
              "text-optional": true,
            }}
            paint={{
              "text-color": isDark ? "#e4e4e9" : "#1a1b1e",
              "text-halo-color": isDark
                ? "rgba(17,17,19,0.85)"
                : "rgba(255,255,255,0.9)",
              "text-halo-width": 1.5,
            }}
          />
        </Source>
      </Map>
    </div>
  );
}
