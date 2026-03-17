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
import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import { selectLeftClearance } from "@/features/graph/stores/dashboard-store";
import {
  useMapColorExpression,
  useMapSizeExpression,
  useFilteredGeoIndices,
} from "@/features/graph/hooks/use-map-expressions";
import { useAdmin1Boundaries } from "@/features/graph/hooks/use-admin1-boundaries";
import { useGraphColorTheme } from "@/features/graph/hooks/use-graph-color-theme";
import { getPaletteColors, hexToRgba } from "@/features/graph/lib/colors";
import { NOISE_COLOR, NOISE_COLOR_LIGHT } from "@/features/graph/lib/brand-colors";
import whichPolygon from "which-polygon";
import type maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import type { GraphData, GeoNode, GeoLink, GeoCitationLink } from "@/features/graph/types";
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

/** Must match the Source's clusterMaxZoom prop — used in canExpand check */
const CLUSTER_MAX_ZOOM = 17;

/** Stable arc color tuples — must be module-level to avoid useMemo churn. */
const ARC_COLLAB_DARK: [number, number, number, number] = [168, 197, 233, 100];
const ARC_COLLAB_LIGHT: [number, number, number, number] = [108, 123, 180, 120];
const ARC_CITATION_DARK: [number, number, number, number] = [233, 197, 118, 100];
const ARC_CITATION_LIGHT: [number, number, number, number] = [180, 140, 60, 120];

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
  const renderCitationLinks = useDashboardStore((s) => s.renderCitationLinks);
  const geoSelection = useDashboardStore((s) => s.geoSelection);
  const setGeoSelection = useDashboardStore((s) => s.setGeoSelection);

  const isCreate = mode === "create";
  const geoNodes = data.geoNodes;
  const geoLinks = data.geoLinks;
  const geoCitationLinks = data.geoCitationLinks;

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
  // Uses the same filteredIndices computed by useFilteredGeoIndices to stay in
  // sync with the store's currentPointIndices (DataTable, InfoPanel, StatsBar).
  const filteredGeojson = useMemo(() => {
    if (!filteredIndices) return geojson;

    const visibleSet = new Set(filteredIndices);
    return {
      ...geojson,
      features: geojson.features.filter((f) => visibleSet.has(f.properties.index)),
    };
  }, [geojson, filteredIndices]);

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

  // deck.gl ArcLayers for collaboration + citation arcs.
  // Color tuples are module-level constants to keep the dep array stable.
  const arcLayers = useMemo(() => {
    const layers: ArcLayer[] = [];
    const fallback = isDark ? ARC_COLLAB_DARK : ARC_COLLAB_LIGHT;

    // Collaboration arcs
    if (renderLinks && geoLinks.length) {
      const minPapers = selectedSet ? 1 : 2;
      const filteredLinks = (selectedSet
        ? geoLinks.filter(
            (l) => selectedSet.has(l.sourceIndex) || selectedSet.has(l.targetIndex)
          )
        : geoLinks
      ).filter((l) => l.paperCount >= minPapers);

      if (filteredLinks.length > 0) {
        layers.push(
          new ArcLayer<GeoLink>({
            id: "geo-arcs",
            data: filteredLinks,
            getSourcePosition: (d) => [d.sourceLng, d.sourceLat],
            getTargetPosition: (d) => [d.targetLng, d.targetLat],
            getSourceColor: (d) => {
              const node = indexToNode.get(d.sourceIndex);
              return node ? hexToRgba(isDark ? node.color : node.colorLight) : fallback;
            },
            getTargetColor: (d) => {
              const node = indexToNode.get(d.targetIndex);
              return node ? hexToRgba(isDark ? node.color : node.colorLight) : fallback;
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
        );
      }
    }

    // Citation arcs — warm amber, thinner to distinguish from collaboration
    if (renderCitationLinks && geoCitationLinks.length) {
      const citationColor = isDark ? ARC_CITATION_DARK : ARC_CITATION_LIGHT;
      const minCitations = selectedSet ? 1 : 2;
      const filteredCitations = (selectedSet
        ? geoCitationLinks.filter(
            (l) => selectedSet.has(l.sourceIndex) || selectedSet.has(l.targetIndex)
          )
        : geoCitationLinks
      ).filter((l) => l.citationCount >= minCitations);

      if (filteredCitations.length > 0) {
        layers.push(
          new ArcLayer<GeoCitationLink>({
            id: "geo-citation-arcs",
            data: filteredCitations,
            getSourcePosition: (d) => [d.sourceLng, d.sourceLat],
            getTargetPosition: (d) => [d.targetLng, d.targetLat],
            getSourceColor: citationColor,
            getTargetColor: citationColor,
            getWidth: (d) => Math.max(0.5, Math.sqrt(d.citationCount) * 0.8),
            greatCircle: true,
            widthMinPixels: 1,
            widthMaxPixels: 6,
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
                  paperCount: info.object.citationCount,
                });
              } else {
                setHoveredArc(null);
              }
            },
          }),
        );
      }
    }

    return layers;
  }, [geoLinks, geoCitationLinks, renderLinks, renderCitationLinks, isDark, selectedSet, indexToNode]);

  // Spiderfy state — when co-located points can't expand further,
  // offset them in a circle so they're individually clickable.
  const [spider, setSpider] = useState<{
    features: GeoJSON.Feature[];
    center: [number, number];
    color: string | null;
  } | null>(null);
  const spiderfiedFeatures = spider?.features ?? null;
  const spiderCenter = spider?.center ?? null;
  const spiderColor = spider?.color ?? null;

  const spiderfy = useCallback((center: [number, number], leaves: GeoJSON.Feature[], map: maplibregl.Map) => {
    const zoom = map.getZoom();
    // Target a compact ring on screen, converted to degrees.
    // At zoom z, 1 degree longitude ≈ 256 * 2^z / 360 pixels.
    // Adjust for latitude (longitude degrees shrink by cos(lat)).
    const pxPerDeg = (256 * Math.pow(2, zoom)) / 360 * Math.cos(center[1] * Math.PI / 180);
    const targetPx = 18 + leaves.length * 1; // ~27px for 9 points
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

    setSpider((prev) => ({ features: spidered, center, color: prev?.color ?? null }));
  }, []);

  // Clear spiderfy on zoom change (offset radius would be wrong)
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const onZoom = () => { setSpider(null); };
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
          setSpider(null);
        }
        selectNode(null);
        setSelectedPointIndices([]);
        setGeoSelection(null);
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
          // Only spiderfy when expansion zoom exceeds clusterMaxZoom —
          // that means points are truly co-located and can't separate further.
          const canExpand = expansionZoom <= CLUSTER_MAX_ZOOM;

          if (canExpand) {
            // Clear spiderfy AFTER cluster lookup succeeds
            if (spiderfiedFeatures) {
              setSpider(null);
            }
            const geom = feature.geometry as GeoJSON.Point;
            map.easeTo({
              center: geom.coordinates as [number, number],
              zoom: Math.max(expansionZoom, currentZoom + 2),
              duration: 400,
            });
          } else {
            // Capture the parent cluster's rendered color for spider points
            const maxCid = feature.properties._maxCid as number | undefined;
            const palette = getPaletteColors(colorScheme, colorTheme);
            const noiseColor = colorTheme === "light" ? NOISE_COLOR_LIGHT : NOISE_COLOR;
            const parentColor = (maxCid != null && maxCid > 0)
              ? palette[maxCid % palette.length]
              : noiseColor;

            src.getClusterLeaves(clusterId, pointCount, 0).then((leaves) => {
              const indices = leaves
                .map((l) => l.properties?.index as number | undefined)
                .filter((i): i is number => i != null);
              if (indices.length > 0) {
                const firstNode = indexToNode.get(indices[0]);
                if (firstNode) selectNode(firstNode);
                setSelectedPointIndices(indices);
                setSpider((prev) => ({
                  features: prev?.features ?? [],
                  center: prev?.center ?? [0, 0],
                  color: parentColor,
                }));

                const geom = feature.geometry as GeoJSON.Point;
                spiderfy(geom.coordinates as [number, number], leaves, map);
              }
            }).catch(() => {
              // Stale cluster ID — just clear spiderfy
              setSpider(null);
            });
          }
        }).catch(() => {
          setSpider(null);
        });
        return;
      }

      // Spider point — keep spider open, just update selection
      const isSpiderPoint = feature.layer?.id === "spider-markers";
      if (isSpiderPoint) {
        const idx = feature.properties?.index;
        if (idx == null) return;
        const node = indexToNode.get(Number(idx));
        if (node) {
          selectNode(node);
          setSelectedPointIndices([node.index]);
        }
        return;
      }

      // Choropleth polygon — country or region selection
      if (feature.layer?.id === "admin1-choropleth") {
        const zoom = mapRef.current?.getMap()?.getZoom() ?? 0;
        const countryCode = (feature.properties?.iso_a2 as string) ?? "";
        const countryName = (feature.properties?.admin as string) ?? "";
        const polygonName = (feature.properties?.name as string) ?? "";
        if (!countryCode) return;
        if (zoom < 4) {
          setGeoSelection({ level: "country", countryCode, countryName });
        } else {
          // Resolve actual geoNode region names via spatial containment —
          // Natural Earth names (e.g. "Midtjylland") often differ from
          // geocoder names (e.g. "Central Jutland").
          let regionName = polygonName;
          if (admin1Index) {
            for (const n of geoNodes) {
              if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
              const hit = admin1Index([n.x, n.y]);
              if (hit?.iso_a2 === countryCode && hit?.name === polygonName && n.region) {
                regionName = n.region;
                break;
              }
            }
          }
          setGeoSelection({ level: "region", countryCode, countryName, regionName, polygonName });
        }
        selectNode(null);
        setSelectedPointIndices([]);
        return;
      }

      // Individual point (from geo-markers) — clear spiderfy
      if (spiderfiedFeatures) {
        setSpider(null);
      }
      const idx = feature.properties?.index;
      if (idx == null) return;
      const node = indexToNode.get(Number(idx));
      if (node) {
        selectNode(node);
        setSelectedPointIndices([node.index]);
      }
    },
    [indexToNode, selectNode, setSelectedPointIndices, setGeoSelection, spiderfiedFeatures, spiderfy, colorScheme, colorTheme]
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

  // Track whether the base style has a "boundary_state" layer (used as beforeId
  // for choropleth). The layer may not exist in all tile providers.
  const [hasBoundaryState, setHasBoundaryState] = useState(false);

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
      setHasBoundaryState(Boolean(map.getLayer("boundary_state")));
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
        interactiveLayerIds={[
          "geo-clusters",
          "geo-markers",
          ...(spiderPointsData ? ["spider-markers"] : []),
          ...(choroplethGeoJSON ? ["admin1-choropleth"] : []),
        ]}
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
              beforeId={hasBoundaryState ? "boundary_state" : undefined}
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
            {/* Selection outline — highlights the currently selected country/region */}
            {geoSelection && (
              <Layer
                id="admin1-selection-outline"
                type="line"
                beforeId={hasBoundaryState ? "boundary_state" : undefined}
                filter={
                  geoSelection.level === "region" && geoSelection.polygonName
                    ? (["all",
                        ["==", ["get", "iso_a2"], geoSelection.countryCode],
                        ["==", ["get", "name"], geoSelection.polygonName],
                      ] as never)
                    : (["==", ["get", "iso_a2"], geoSelection.countryCode] as never)
                }
                paint={{
                  "line-color": isDark ? "#8eacc8" : "#5080a8",
                  "line-width": 2,
                  "line-opacity": 0.85,
                }}
              />
            )}
          </Source>
        )}

        <Source
          key={`institutions-${scheme}`}
          id="geo-institutions"
          type="geojson"
          data={sourceData}
          cluster
          clusterMaxZoom={CLUSTER_MAX_ZOOM}
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
                "circle-radius": [
                  "interpolate", ["linear"], ["zoom"],
                  8, 10,
                  12, 14,
                  16, 18,
                  20, 22,
                ] as never,
                "circle-color": spiderColor ?? (isDark ? NOISE_COLOR : NOISE_COLOR_LIGHT),
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
          role="tooltip"
          aria-live="polite"
          className="pointer-events-none fixed z-50 rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(hoveredArc.x + 12, (typeof window !== "undefined" ? window.innerWidth : 9999) - 200),
            top: Math.max(hoveredArc.y - 12, 40),
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
