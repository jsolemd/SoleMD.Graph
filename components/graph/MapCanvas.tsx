"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useViewportSize } from "@mantine/hooks";
import {
  Map,
  Source,
  Layer,
  useControl,
  type MapRef,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import { useComputedColorScheme } from "@mantine/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ArcLayer } from "@deck.gl/layers";
import { useGraphStore, useDashboardStore } from "@/lib/graph/stores";
import { selectLeftClearance } from "@/lib/graph/stores/dashboard-store";
import {
  useMapColorExpression,
  useMapSizeExpression,
  useFilteredGeoIndices,
} from "@/lib/graph/hooks/use-map-expressions";
import { useAdmin1Boundaries } from "@/lib/graph/hooks/use-admin1-boundaries";
import { useGraphColorTheme } from "@/lib/graph/hooks/use-graph-color-theme";
import { getPaletteColors, hexToRgba } from "@/lib/graph/colors";
import { NOISE_COLOR, NOISE_COLOR_LIGHT } from "@/lib/graph/brand-colors";
import whichPolygon from "which-polygon";
import type maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import type { GraphData, GeoNode, GeoLink } from "@/lib/graph/types";
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

/** deck.gl overlay bridge — manages adding/removing the MapboxOverlay control. */
function DeckGLOverlay({ layers }: { layers: ArcLayer[] }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlay = useControl(() => new MapboxOverlay({ layers: layers as any }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overlay.setProps({ layers: layers as any });
  return null;
}

export default function MapCanvas({ data }: { data: GraphData }) {
  const mapRef = useRef<MapRef>(null);
  const { width: viewportWidth } = useViewportSize();
  const scheme = useComputedColorScheme("light");
  const isDark = scheme === "dark";
  const colorTheme = useGraphColorTheme();
  const mode = useGraphStore((s) => s.mode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const promptMinimized = useDashboardStore((s) => s.promptMinimized);
  const leftClearance = useDashboardStore(selectLeftClearance);
  const highlightedPointIndices = useDashboardStore(
    (s) => s.highlightedPointIndices
  );
  const selectedPointIndices = useDashboardStore(
    (s) => s.selectedPointIndices
  );
  const setSelectedPointIndices = useDashboardStore(
    (s) => s.setSelectedPointIndices
  );
  const setCurrentPointIndices = useDashboardStore(
    (s) => s.setCurrentPointIndices
  );
  const setMapControls = useDashboardStore((s) => s.setMapControls);

  // Store values for dynamic coloring/sizing/filtering
  const pointColorColumn = useDashboardStore((s) => s.pointColorColumn);
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);
  const colorScheme = useDashboardStore((s) => s.colorScheme);
  const pointSizeColumn = useDashboardStore((s) => s.pointSizeColumn);
  const pointSizeStrategy = useDashboardStore((s) => s.pointSizeStrategy);
  const pointSizeRange = useDashboardStore((s) => s.pointSizeRange);
  const timelineSelection = useDashboardStore((s) => s.timelineSelection);
  const geoFilters = useDashboardStore((s) => s.geoFilters);
  const renderLinks = useDashboardStore((s) => s.renderLinks);

  const isCreate = mode === "create";
  const geoNodes = data.geoNodes;
  const geoLinks = data.geoLinks;

  const promptWidth = viewportWidth > 0 ? Math.min(560, viewportWidth * 0.45) : 560;
  const overlayPaddingLeft = isCreate && !promptMinimized
    ? Math.round(leftClearance + 48 + promptWidth)
    : 0;
  const mapPadding = useMemo(
    () => ({
      top: 0,
      right: 0,
      bottom: 0,
      left: overlayPaddingLeft,
    }),
    [overlayPaddingLeft]
  );

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.easeTo({ padding: mapPadding, duration: 500 });
  }, [mapPadding]);

  // Register map controls for the Wordmark toolbar
  useEffect(() => {
    setMapControls({
      zoomIn: () => {
        const map = mapRef.current?.getMap();
        if (map) map.zoomIn({ duration: 200 });
      },
      zoomOut: () => {
        const map = mapRef.current?.getMap();
        if (map) map.zoomOut({ duration: 200 });
      },
      fitView: () => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        const validNodes = geoNodes.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
        if (validNodes.length === 0) return;
        const lngs = validNodes.map((n) => n.x);
        const lats = validNodes.map((n) => n.y);
        const sw: [number, number] = [
          lngs.reduce((a, b) => Math.min(a, b), Infinity),
          lats.reduce((a, b) => Math.min(a, b), Infinity),
        ];
        const ne: [number, number] = [
          lngs.reduce((a, b) => Math.max(a, b), -Infinity),
          lats.reduce((a, b) => Math.max(a, b), -Infinity),
        ];
        map.fitBounds([sw, ne], {
          padding: {
            top: 60,
            right: 60,
            bottom: 60,
            left: Math.max(60, overlayPaddingLeft + 60),
          },
          duration: 400,
        });
      },
    });
    return () => setMapControls(null);
  }, [overlayPaddingLeft, setMapControls, geoNodes]);

  // Dynamic paint expressions from store
  const colorExpression = useMapColorExpression(
    geoNodes,
    pointColorColumn,
    pointColorStrategy,
    colorScheme,
    colorTheme,
  );
  const sizeExpression = useMapSizeExpression(
    geoNodes,
    pointSizeColumn,
    pointSizeStrategy,
    pointSizeRange,
  );
  // Sync filtered indices to store for DataTable, InfoPanel, StatsBar
  const filteredIndices = useFilteredGeoIndices(geoNodes, timelineSelection, geoFilters);
  useEffect(() => {
    setCurrentPointIndices(filteredIndices);
  }, [filteredIndices, setCurrentPointIndices]);

  // Admin-1 (state/province) boundary data for choropleth
  const rawAdmin1GeoJSON = useAdmin1Boundaries();

  // Build spatial index from admin-1 polygons (memoized on the geometry).
  // which-polygon creates an R-tree so point lookups are O(log n).
  const admin1Index = useMemo(() => {
    if (!rawAdmin1GeoJSON) return null;
    // Tag each feature with its array index so we can aggregate by it
    const tagged = {
      ...rawAdmin1GeoJSON,
      features: rawAdmin1GeoJSON.features.map((f, i) => ({
        ...f,
        properties: { ...f.properties, _idx: i },
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return whichPolygon(tagged as any);
  }, [rawAdmin1GeoJSON]);

  // Spatial join: for each geoNode, find which admin-1 polygon contains its
  // coordinates, then aggregate paper counts by polygon index. This works for
  // every country regardless of naming conventions — pure geometry, no string
  // matching.
  const { choroplethGeoJSON, maxPapers } = useMemo(() => {
    if (!rawAdmin1GeoJSON || !admin1Index || geoNodes.length === 0)
      return { choroplethGeoJSON: null, maxPapers: 0 };

    // Aggregate papers by feature index
    const papersByIdx = new globalThis.Map<number, number>();
    const authorsByIdx = new globalThis.Map<number, number>();
    for (const n of geoNodes) {
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
      const hit = admin1Index([n.x, n.y]);
      if (!hit) continue;
      const idx = hit._idx as number;
      papersByIdx.set(idx, (papersByIdx.get(idx) ?? 0) + n.paperCount);
      authorsByIdx.set(idx, (authorsByIdx.get(idx) ?? 0) + n.authorCount);
    }

    if (papersByIdx.size === 0)
      return { choroplethGeoJSON: null, maxPapers: 0 };

    let max = 0;
    const features = rawAdmin1GeoJSON.features.map((f, i) => {
      const papers = papersByIdx.get(i) ?? 0;
      if (papers > max) max = papers;
      return {
        ...f,
        properties: { ...f.properties, papers, authors: authorsByIdx.get(i) ?? 0 },
      };
    });

    return {
      choroplethGeoJSON: { ...rawAdmin1GeoJSON, features },
      maxPapers: Math.max(max, 1),
    };
  }, [rawAdmin1GeoJSON, admin1Index, geoNodes]);

  // Build GeoJSON with ALL node properties so expressions can reference them
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
        id: node.id,
        institution: node.institution ?? "Unknown",
        city: node.city ?? "",
        region: node.region ?? "",
        country: node.country ?? "",
        countryCode: node.countryCode ?? "",
        paperCount: node.paperCount,
        authorCount: node.authorCount,
        firstYear: node.firstYear,
        lastYear: node.lastYear,
        clusterId: node.clusterId,
        clusterLabel: node.clusterLabel ?? "",
        color: node.color,
        colorLight: node.colorLight,
        rorId: node.rorId ?? "",
      },
    }));
    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [geoNodes]);

  // Filter GeoJSON at data level BEFORE clustering — ensures clusters only
  // contain visible features (correct counts, correct colors).
  const filteredGeojson = useMemo(() => {
    const hasTimeline = Boolean(timelineSelection);
    const hasGeoFilters = Object.keys(geoFilters).length > 0;
    if (!hasTimeline && !hasGeoFilters) return geojson;

    return {
      ...geojson,
      features: geojson.features.filter((f) => {
        const p = f.properties;
        if (timelineSelection) {
          const [minY, maxY] = timelineSelection;
          if (p.firstYear != null && p.firstYear > maxY) return false;
          const lastY = p.lastYear ?? p.firstYear;
          if (lastY != null && lastY < minY) return false;
        }
        for (const [col, val] of Object.entries(geoFilters)) {
          const nodeVal = (p as Record<string, unknown>)[col];
          if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string") {
            if (!(val as string[]).includes(String(nodeVal ?? ""))) return false;
          }
          if (Array.isArray(val) && val.length === 2 && typeof val[0] === "number") {
            const num = Number(nodeVal);
            if (!Number.isFinite(num) || num < (val[0] as number) || num > (val[1] as number)) return false;
          }
        }
        return true;
      }),
    };
  }, [geojson, timelineSelection, geoFilters]);

  // Cluster color expression — maps aggregated _maxCid to palette colors so
  // cluster circles reflect their contents instead of hardcoded blue.
  const clusterColorExpr = useMemo(() => {
    const palette = getPaletteColors(colorScheme, colorTheme);
    const noiseColor = colorTheme === "light" ? NOISE_COLOR_LIGHT : NOISE_COLOR;
    const uniqueCids = [...new Set(geoNodes.map((n) => n.clusterId))].sort((a, b) => a - b);

    if (uniqueCids.length === 0) return noiseColor;

    const matchExpr: unknown[] = ["match", ["get", "_maxCid"]];
    for (const cid of uniqueCids) {
      matchExpr.push(cid, cid <= 0 ? noiseColor : palette[cid % palette.length]);
    }
    matchExpr.push(noiseColor);
    return matchExpr;
  }, [geoNodes, colorScheme, colorTheme]);

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

  // Arc hover tooltip state
  const [hoveredArc, setHoveredArc] = useState<{
    x: number; y: number;
    source: string; target: string;
    paperCount: number;
  } | null>(null);

  // deck.gl ArcLayer for collaboration arcs
  const fallbackColor: [number, number, number, number] = isDark
    ? [168, 197, 233, 100]
    : [108, 123, 180, 120];

  const arcLayers = useMemo(() => {
    if (!renderLinks || !geoLinks.length) return [];

    // When nodes are selected, show all arcs (incl. single-paper);
    // otherwise require at least 2 papers to reduce clutter.
    const minPapers = selectedSet ? 1 : 2;
    const filteredLinks = (selectedSet
      ? geoLinks.filter(
          (l) => selectedSet.has(l.sourceIndex) || selectedSet.has(l.targetIndex)
        )
      : geoLinks
    ).filter((l) => l.paperCount >= minPapers);

    if (filteredLinks.length === 0) return [];

    return [
      new ArcLayer<GeoLink>({
        id: "geo-arcs",
        data: filteredLinks,
        getSourcePosition: (d) => [d.sourceLng, d.sourceLat],
        getTargetPosition: (d) => [d.targetLng, d.targetLat],
        getSourceColor: (d) => {
          const node = indexToNode.get(d.sourceIndex);
          return node ? hexToRgba(isDark ? node.color : node.colorLight) : fallbackColor;
        },
        getTargetColor: (d) => {
          const node = indexToNode.get(d.targetIndex);
          return node ? hexToRgba(isDark ? node.color : node.colorLight) : fallbackColor;
        },
        getWidth: (d) => Math.max(1, Math.sqrt(d.paperCount)),
        greatCircle: true,
        widthMinPixels: 1,
        widthMaxPixels: 8,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 80],
        onHover: (info) => {
          if (info.object) {
            const src = indexToNode.get(info.object.sourceIndex);
            const tgt = indexToNode.get(info.object.targetIndex);
            setHoveredArc({
              x: info.x, y: info.y,
              source: src?.institution ?? "Unknown",
              target: tgt?.institution ?? "Unknown",
              paperCount: info.object.paperCount,
            });
          } else {
            setHoveredArc(null);
          }
        },
      }),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoLinks, renderLinks, isDark, selectedSet, indexToNode, fallbackColor]);

  // Spiderfy state — when co-located points can't expand further,
  // offset them in a circle so they're individually clickable.
  const [spiderfiedFeatures, setSpiderfiedFeatures] = useState<GeoJSON.Feature[] | null>(null);
  const [spiderCenter, setSpiderCenter] = useState<[number, number] | null>(null);

  const spiderfy = useCallback((center: [number, number], leaves: GeoJSON.Feature[], map: maplibregl.Map) => {
    const zoom = map.getZoom();
    // Target ~60px radius on screen, converted to degrees.
    // At zoom z, 1 degree longitude ≈ 256 * 2^z / 360 pixels.
    // Adjust for latitude (longitude degrees shrink by cos(lat)).
    const pxPerDeg = (256 * Math.pow(2, zoom)) / 360 * Math.cos(center[1] * Math.PI / 180);
    const targetPx = 50 + leaves.length * 4; // scale slightly with count
    const radiusDeg = targetPx / Math.max(pxPerDeg, 1);
    const count = leaves.length;

    const spidered = leaves.map((leaf, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      const lng = center[0] + radiusDeg * Math.cos(angle);
      const lat = center[1] + radiusDeg * Math.sin(angle);
      return {
        ...leaf,
        geometry: { type: "Point" as const, coordinates: [lng, lat] },
        properties: { ...leaf.properties, _spiderfied: true },
      };
    });

    setSpiderfiedFeatures(spidered);
    setSpiderCenter(center);
  }, []);

  // Clear spiderfy on zoom change (offset radius would be wrong)
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const onZoom = () => { setSpiderfiedFeatures(null); setSpiderCenter(null); };
    map.on("zoomstart", onZoom);
    return () => { map.off("zoomstart", onZoom); };
  }, []);

  // Remove spiderfied features from the clustered source — they render in a
  // separate unclustered source so maplibre can't re-absorb them into clusters.
  const sourceData = useMemo(() => {
    if (!spiderfiedFeatures) return filteredGeojson;
    const spiderIndices = new Set(spiderfiedFeatures.map((f) => f.properties?.index));
    return {
      ...filteredGeojson,
      features: filteredGeojson.features.filter((f) => !spiderIndices.has(f.properties.index)),
    };
  }, [filteredGeojson, spiderfiedFeatures]);

  // Separate GeoJSON for spiderfied points — unclustered so they render individually
  const spiderPointsData = useMemo(() => {
    if (!spiderfiedFeatures) return null;
    return { type: "FeatureCollection" as const, features: spiderfiedFeatures };
  }, [spiderfiedFeatures]);

  // Click handler — clusters zoom to expand (or spiderfy if co-located),
  // individual points select normally, empty clicks deselect.
  // NOTE: spiderfy is NOT cleared before cluster async ops — clearing it
  // triggers sourceData recompute → re-clustering → new cluster IDs,
  // which would invalidate the cluster_id from the click event.
  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];

      // Empty click — deselect everything
      if (!feature) {
        if (spiderfiedFeatures) {
          setSpiderfiedFeatures(null);
          setSpiderCenter(null);
        }
        selectNode(null);
        setSelectedPointIndices([]);
        return;
      }

      if (feature.properties?.cluster) {
        const map = mapRef.current?.getMap();
        if (!map) return;
        const src = map.getSource("geo-institutions") as GeoJSONSource | undefined;
        if (!src) return;
        const clusterId = feature.properties.cluster_id as number;
        const pointCount = feature.properties.point_count as number;

        // DON'T clear spiderfy here — cluster IDs would go stale
        src.getClusterExpansionZoom(clusterId).then((expansionZoom) => {
          const currentZoom = map.getZoom();
          const canExpand = expansionZoom > currentZoom + 1 && expansionZoom <= 18;

          if (canExpand) {
            // Clear spiderfy AFTER cluster lookup succeeds
            if (spiderfiedFeatures) {
              setSpiderfiedFeatures(null);
              setSpiderCenter(null);
            }
            const geom = feature.geometry as GeoJSON.Point;
            map.easeTo({
              center: geom.coordinates as [number, number],
              zoom: expansionZoom,
              duration: 400,
            });
          } else {
            src.getClusterLeaves(clusterId, pointCount, 0).then((leaves) => {
              const indices = leaves
                .map((l) => l.properties?.index as number | undefined)
                .filter((i): i is number => i != null);
              if (indices.length > 0) {
                const firstNode = indexToNode.get(indices[0]);
                if (firstNode) selectNode(firstNode);
                setSelectedPointIndices(indices);

                const geom = feature.geometry as GeoJSON.Point;
                spiderfy(geom.coordinates as [number, number], leaves, map);
              }
            }).catch(() => {
              // Stale cluster ID — just clear spiderfy
              setSpiderfiedFeatures(null);
              setSpiderCenter(null);
            });
          }
        }).catch(() => {
          setSpiderfiedFeatures(null);
          setSpiderCenter(null);
        });
        return;
      }

      // Individual point — clear spiderfy (safe, no cluster lookup needed)
      if (spiderfiedFeatures) {
        setSpiderfiedFeatures(null);
        setSpiderCenter(null);
      }
      const idx = feature.properties?.index;
      if (idx == null) return;
      const node = indexToNode.get(Number(idx));
      if (node) {
        selectNode(node);
        setSelectedPointIndices([node.index]);
      }
    },
    [indexToNode, selectNode, setSelectedPointIndices, spiderfiedFeatures, spiderfy]
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

  // Override water color to match brand grey palette.
  // Runs on initial load AND on every style reload (theme switch triggers
  // a full style swap, which fires "styledata" once the new style is ready).
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const applyWaterColor = () => {
      try {
        if (map.getLayer("water")) {
          map.setPaintProperty("water", "fill-color", isDark ? "#1a1c20" : "#eef0f2");
        }
      } catch { /* layer may not exist in all styles */ }
    };

    // Apply now if style is already loaded
    if (map.isStyleLoaded()) applyWaterColor();
    // Also listen for style reloads (theme switches)
    map.on("styledata", applyWaterColor);
    return () => { map.off("styledata", applyWaterColor); };
  }, [isDark]);

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        mapStyle={isDark ? DARK_STYLE : LIGHT_STYLE}
        padding={mapPadding}
        interactiveLayerIds={["geo-clusters", "geo-markers", "spider-markers"]}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        {/* deck.gl arc overlay for collaboration edges */}
        {arcLayers.length > 0 && <DeckGLOverlay layers={arcLayers} />}

        {/* Admin-1 choropleth — inserted BEFORE the base style's boundary_state
            layer so that Stadia's own state/province and country boundary lines
            render ON TOP of our fill, giving visual separation between regions. */}
        {choroplethGeoJSON && (
          <Source key={`choropleth-${scheme}`} id="admin1-boundaries" type="geojson" data={choroplethGeoJSON}>
            <Layer
              id="admin1-choropleth"
              type="fill"
              beforeId="boundary_state"
              filter={[">", ["get", "papers"], 0] as never}
              paint={{
                // sqrt-interpolated color ramp — adapts to any maxPapers value.
                // Breakpoints at 0%, 10%, 30%, 60%, 100% of sqrt(max) give a
                // perceptually even spread that works whether max is 50 or 50,000.
                "fill-color": [
                  "interpolate",
                  ["linear"],
                  ["sqrt", ["get", "papers"]],
                  0,
                  isDark ? "#1a2332" : "#d0dcea",       // lightest tint
                  Math.sqrt(maxPapers * 0.1),
                  isDark ? "#223040" : "#b8cede",       // faint
                  Math.sqrt(maxPapers * 0.3),
                  isDark ? "#2e4a68" : "#8eacc8",       // medium
                  Math.sqrt(maxPapers * 0.6),
                  isDark ? "#3a6088" : "#6e94b8",       // rich
                  Math.sqrt(maxPapers),
                  isDark ? "#4878a8" : "#5080a8",       // deepest
                ] as never,
                "fill-opacity": [
                  "interpolate", ["linear"], ["zoom"],
                  0, isDark ? 0.55 : 0.65,
                  3, isDark ? 0.45 : 0.55,
                  6, isDark ? 0.2 : 0.3,
                ] as never,
              }}
            />
          </Source>
        )}

        <Source
          key={`institutions-${scheme}`}
          id="geo-institutions"
          type="geojson"
          data={sourceData}
          cluster
          clusterMaxZoom={17}
          clusterRadius={40}
          clusterProperties={{
            _maxCid: ["max", ["get", "clusterId"]],
          }}
        >
          {/* Cluster circles — matte, sized by point count */}
          <Layer
            id="geo-clusters"
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-radius": [
                "interpolate", ["linear"],
                ["get", "point_count"],
                2, 14,
                10, 22,
                50, 34,
                200, 48,
              ] as never,
              "circle-color": clusterColorExpr as never,
              "circle-opacity": highlightedSet ? 0.12 : selectedSet ? 0.15 : 0.6,
              "circle-stroke-width": 0,
              "circle-blur": 0.1,
            }}
          />

          {/* Cluster count labels */}
          <Layer
            id="geo-cluster-count"
            type="symbol"
            filter={["has", "point_count"]}
            layout={{
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 12,
              "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            }}
            paint={{
              "text-color": isDark ? "#e4e4e9" : "#ffffff",
              "text-opacity": highlightedSet ? 0.12 : selectedSet ? 0.15 : 1,
            }}
          />

          {/* Individual markers — unclustered only (filtering done at data level) */}
          <Layer
            id="geo-markers"
            type="circle"
            filter={["!", ["has", "point_count"]] as never}
            paint={{
              "circle-radius": typeof sizeExpression === "number"
                ? ([
                    "interpolate", ["linear"], ["zoom"],
                    0, Math.max(sizeExpression * 0.45, 2),
                    3, Math.max(sizeExpression * 0.75, 3),
                    5, sizeExpression,
                    8, sizeExpression * 1.5,
                  ] as never)
                : sizeExpression as never,
              "circle-color": colorExpression as never,
              "circle-opacity": highlightedSet
                ? [
                    "case",
                    ["in", ["get", "index"], ["literal", [...highlightedSet]]],
                    0.85,
                    0.12,
                  ]
                : selectedSet
                  ? [
                      "case",
                      ["in", ["get", "index"], ["literal", [...selectedSet]]],
                      0.85,
                      0.2,
                    ]
                  : 0.75,
              "circle-stroke-width": 0,
              "circle-blur": 0.15,
            }}
          />

          {/* Labels — show at zoom 4+, unclustered only */}
          <Layer
            id="geo-labels"
            type="symbol"
            minzoom={4}
            filter={["!", ["has", "point_count"]] as never}
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
              "text-opacity": (highlightedSet
                ? [
                    "case",
                    ["in", ["get", "index"], ["literal", [...highlightedSet]]],
                    1, 0.12,
                  ]
                : selectedSet
                  ? [
                      "case",
                      ["in", ["get", "index"], ["literal", [...selectedSet]]],
                      1, 0.15,
                    ]
                  : 1) as never,
            }}
          />
        </Source>

        {/* Spider leg lines — thin connectors from original center to spiderfied points */}
        {spiderCenter && spiderfiedFeatures && (
          <Source
            id="spider-legs"
            type="geojson"
            data={{
              type: "FeatureCollection",
              features: spiderfiedFeatures.map((f) => ({
                type: "Feature" as const,
                geometry: {
                  type: "LineString" as const,
                  coordinates: [spiderCenter, (f.geometry as GeoJSON.Point).coordinates],
                },
                properties: {},
              })),
            }}
          >
            <Layer
              id="spider-leg-lines"
              type="line"
              paint={{
                "line-color": isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)",
                "line-width": 1,
              }}
            />
          </Source>
        )}

        {/* Spiderfied points — separate unclustered source so maplibre can't
            re-absorb them into clusters. Same styling as geo-markers/geo-labels. */}
        {spiderPointsData && (
          <Source id="spider-points" type="geojson" data={spiderPointsData}>
            <Layer
              id="spider-markers"
              type="circle"
              paint={{
                "circle-radius": typeof sizeExpression === "number"
                  ? ([
                      "interpolate", ["linear"], ["zoom"],
                      0, Math.max(sizeExpression * 0.45, 2),
                      3, Math.max(sizeExpression * 0.75, 3),
                      5, sizeExpression,
                      8, sizeExpression * 1.5,
                    ] as never)
                  : sizeExpression as never,
                "circle-color": colorExpression as never,
                "circle-opacity": selectedSet
                  ? ([
                      "case",
                      ["in", ["get", "index"], ["literal", [...selectedSet]]],
                      0.9,
                      0.2,
                    ] as never)
                  : 0.85,
                "circle-stroke-width": selectedSet
                  ? ([
                      "case",
                      ["in", ["get", "index"], ["literal", [...selectedSet]]],
                      2,
                      0,
                    ] as never)
                  : 0,
                "circle-stroke-color": isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.3)",
                "circle-blur": 0.05,
              }}
            />
            <Layer
              id="spider-labels"
              type="symbol"
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
                "text-opacity": selectedSet
                  ? ([
                      "case",
                      ["in", ["get", "index"], ["literal", [...selectedSet]]],
                      1,
                      0.15,
                    ] as never)
                  : 1,
              }}
            />
          </Source>
        )}
      </Map>

      {/* Arc hover tooltip */}
      {hoveredArc && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{
            left: hoveredArc.x + 12,
            top: hoveredArc.y - 12,
            background: isDark ? "rgba(30,30,35,0.92)" : "rgba(255,255,255,0.95)",
            color: isDark ? "#e4e4e9" : "#1a1b1e",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
          }}
        >
          <div className="font-medium">{hoveredArc.source}</div>
          <div className="text-[10px] opacity-60">↔</div>
          <div className="font-medium">{hoveredArc.target}</div>
          <div className="mt-1 opacity-70">{hoveredArc.paperCount} paper{hoveredArc.paperCount !== 1 ? "s" : ""}</div>
        </div>
      )}
    </div>
  );
}
