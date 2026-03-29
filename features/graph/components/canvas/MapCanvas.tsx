"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useViewportSize } from "@mantine/hooks";
import {
  Map, Source, Layer,
  type MapRef, type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import { useComputedColorScheme } from "@mantine/core";
import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import { selectLeftClearance } from "@/features/graph/stores/dashboard-store";
import {
  useMapColorExpression, useMapSizeExpression, useFilteredGeoIndices,
} from "@/features/graph/hooks/use-map-expressions";
import { useGraphColorTheme } from "@/features/graph/hooks/use-graph-color-theme";
import { useSpiderfy } from "@/features/graph/hooks/use-spiderfy";
import { useDeckArcs } from "@/features/graph/hooks/use-deck-arcs";
import { useChoropleth } from "@/features/graph/hooks/use-choropleth";
import { getPaletteColors } from "@/features/graph/lib/colors";
import { NOISE_COLOR, NOISE_COLOR_LIGHT } from "@/features/graph/lib/brand-colors";
import type { GeoJSONSource } from "maplibre-gl";
import type { GraphData, GeoNode } from "@/features/graph/types";
import { DeckGLOverlay } from "./map/DeckGLOverlay";
import { ArcTooltip } from "./map/ArcTooltip";
import { LIGHT_STYLE, DARK_STYLE, INITIAL_VIEW, CLUSTER_MAX_ZOOM, selectionOpacity } from "./map/map-utils";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MapCanvas({ data }: { data: GraphData }) {
  const mapRef = useRef<MapRef>(null);
  const pendingClusterId = useRef<number | null>(null);
  const { width: viewportWidth } = useViewportSize();
  const scheme = useComputedColorScheme("light");
  const isDark = scheme === "dark";
  const colorTheme = useGraphColorTheme();
  const mode = useGraphStore((s) => s.mode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const promptMinimized = useDashboardStore((s) => s.promptMinimized);
  const leftClearance = useDashboardStore(selectLeftClearance);
  const highlightedPointIndices = useDashboardStore((s) => s.highlightedPointIndices);
  const selectedPointIndices = useDashboardStore((s) => s.selectedPointIndices);
  const setSelectedPointIndices = useDashboardStore((s) => s.setSelectedPointIndices);
  const setCurrentPointIndices = useDashboardStore((s) => s.setCurrentPointIndices);
  const setMapControls = useDashboardStore((s) => s.setMapControls);
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
  const { geoNodes, geoLinks, geoCitationLinks } = data;

  const promptWidth = viewportWidth > 0 ? Math.min(560, viewportWidth * 0.45) : 560;
  const overlayPaddingLeft = isCreate && !promptMinimized
    ? Math.round(leftClearance + 48 + promptWidth) : 0;
  const mapPadding = useMemo(
    () => ({ top: 0, right: 0, bottom: 0, left: overlayPaddingLeft }),
    [overlayPaddingLeft],
  );

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map) map.easeTo({ padding: mapPadding, duration: 500 });
  }, [mapPadding]);

  useEffect(() => {
    setMapControls({
      zoomIn: () => { mapRef.current?.getMap()?.zoomIn({ duration: 200 }); },
      zoomOut: () => { mapRef.current?.getMap()?.zoomOut({ duration: 200 }); },
      fitView: () => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        const valid = geoNodes.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
        if (!valid.length) return;
        const lngs = valid.map((n) => n.x);
        const lats = valid.map((n) => n.y);
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: { top: 60, right: 60, bottom: 60, left: Math.max(60, overlayPaddingLeft + 60) }, duration: 400 },
        );
      },
    });
    return () => setMapControls(null);
  }, [overlayPaddingLeft, setMapControls, geoNodes]);

  const colorExpression = useMapColorExpression(geoNodes, pointColorColumn, pointColorStrategy, colorScheme, colorTheme);
  const sizeExpression = useMapSizeExpression(geoNodes, pointSizeColumn, pointSizeStrategy, pointSizeRange);
  const filteredIndices = useFilteredGeoIndices(geoNodes, timelineSelection, geoFilters);
  useEffect(() => { setCurrentPointIndices(filteredIndices); }, [filteredIndices, setCurrentPointIndices]);

  const { choroplethGeoJSON, maxPapers, admin1Index } = useChoropleth(geoNodes);

  // Build GeoJSON with all node properties for MapLibre expressions
  const geojson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: geoNodes.map((n) => ({
      type: "Feature" as const,
      id: n.index,
      geometry: { type: "Point" as const, coordinates: [n.x, n.y] as [number, number] },
      properties: {
        index: n.index, id: n.id,
        institution: n.institution ?? "Unknown", city: n.city ?? "",
        region: n.region ?? "", country: n.country ?? "",
        countryCode: n.countryCode ?? "", paperCount: n.paperCount,
        authorCount: n.authorCount, firstYear: n.firstYear, lastYear: n.lastYear,
        clusterId: n.clusterId, clusterLabel: n.clusterLabel ?? "",
        color: n.color, colorLight: n.colorLight, rorId: n.rorId ?? "",
      },
    })),
  }), [geoNodes]);

  const filteredGeojson = useMemo(() => {
    if (!filteredIndices) return geojson;
    const vis = new Set(filteredIndices);
    return { ...geojson, features: geojson.features.filter((f) => vis.has(f.properties.index)) };
  }, [geojson, filteredIndices]);

  const clusterColorExpr = useMemo(() => {
    const palette = getPaletteColors(colorScheme, colorTheme);
    const noise = colorTheme === "light" ? NOISE_COLOR_LIGHT : NOISE_COLOR;
    const cids = [...new Set(geoNodes.map((n) => n.clusterId))].sort((a, b) => a - b);
    if (!cids.length) return noise;
    const expr: unknown[] = ["match", ["get", "_maxCid"]];
    for (const c of cids) expr.push(c, c <= 0 ? noise : palette[c % palette.length]);
    expr.push(noise);
    return expr;
  }, [geoNodes, colorScheme, colorTheme]);

  const indexToNode = useMemo(() => {
    const m = new globalThis.Map<number, GeoNode>();
    for (const n of geoNodes) m.set(n.index, n);
    return m;
  }, [geoNodes]);

  const highlightedSet = useMemo(
    () => (highlightedPointIndices.length > 0 ? new Set(highlightedPointIndices) : null),
    [highlightedPointIndices],
  );
  const selectedSet = useMemo(
    () => (selectedPointIndices.length > 0 ? new Set(selectedPointIndices) : null),
    [selectedPointIndices],
  );

  const { arcLayers, hoveredArc } = useDeckArcs(
    geoLinks, geoCitationLinks, renderLinks, renderCitationLinks,
    isDark, selectedSet, indexToNode,
  );
  const {
    spider, setSpider, spiderfiedFeatures, spiderCenter, spiderColor,
    spiderfy, sourceData, spiderPointsData, spiderLegsData,
  } = useSpiderfy(mapRef, filteredGeojson);

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) {
        if (spiderfiedFeatures) setSpider(null);
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
        pendingClusterId.current = clusterId;

        src.getClusterExpansionZoom(clusterId).then((expZoom) => {
          if (pendingClusterId.current !== clusterId) return;
          if (expZoom <= CLUSTER_MAX_ZOOM) {
            if (spiderfiedFeatures) setSpider(null);
            const geom = feature.geometry as GeoJSON.Point;
            map.easeTo({
              center: geom.coordinates as [number, number],
              zoom: Math.max(expZoom, map.getZoom() + 2), duration: 400,
            });
          } else {
            const maxCid = feature.properties._maxCid as number | undefined;
            const palette = getPaletteColors(colorScheme, colorTheme);
            const noise = colorTheme === "light" ? NOISE_COLOR_LIGHT : NOISE_COLOR;
            const parentColor = maxCid != null && maxCid > 0 ? palette[maxCid % palette.length] : noise;

            src.getClusterLeaves(clusterId, pointCount, 0).then((leaves) => {
              if (pendingClusterId.current !== clusterId) return;
              const indices = leaves
                .map((l) => l.properties?.index as number | undefined)
                .filter((i): i is number => i != null);
              if (indices.length > 0) {
                const first = indexToNode.get(indices[0]);
                if (first) selectNode(first);
                setSelectedPointIndices(indices);
                setSpider((prev) => ({
                  features: prev?.features ?? [], center: prev?.center ?? [0, 0], color: parentColor,
                }));
                const geom = feature.geometry as GeoJSON.Point;
                spiderfy(geom.coordinates as [number, number], leaves, map);
              }
            }).catch(() => setSpider(null));
          }
        }).catch(() => setSpider(null));
        return;
      }

      if (feature.layer?.id === "spider-markers") {
        const idx = feature.properties?.index;
        if (idx == null) return;
        const node = indexToNode.get(Number(idx));
        if (node) { selectNode(node); setSelectedPointIndices([node.index]); }
        return;
      }

      if (feature.layer?.id === "admin1-choropleth") {
        const zoom = mapRef.current?.getMap()?.getZoom() ?? 0;
        const cc = (feature.properties?.iso_a2 as string) ?? "";
        const cn = (feature.properties?.admin as string) ?? "";
        const pn = (feature.properties?.name as string) ?? "";
        if (!cc) return;
        if (zoom < 4) {
          setGeoSelection({ level: "country", countryCode: cc, countryName: cn });
        } else {
          let regionName = pn;
          if (admin1Index) {
            for (const n of geoNodes) {
              if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
              const hit = admin1Index([n.x, n.y]);
              if (hit?.iso_a2 === cc && hit?.name === pn && n.region) { regionName = n.region; break; }
            }
          }
          setGeoSelection({ level: "region", countryCode: cc, countryName: cn, regionName, polygonName: pn });
        }
        selectNode(null);
        setSelectedPointIndices([]);
        return;
      }

      if (spiderfiedFeatures) setSpider(null);
      const idx = feature.properties?.index;
      if (idx == null) return;
      const node = indexToNode.get(Number(idx));
      if (node) { selectNode(node); setSelectedPointIndices([node.index]); }
    },
    [indexToNode, selectNode, setSelectedPointIndices, setGeoSelection, spiderfiedFeatures, spiderfy, setSpider, colorScheme, colorTheme, admin1Index, geoNodes],
  );

  const handleMouseEnter = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = "pointer";
  }, []);
  const handleMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = "";
  }, []);

  const [hasBoundaryState, setHasBoundaryState] = useState(false);
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const apply = () => {
      try { if (map.getLayer("water")) map.setPaintProperty("water", "fill-color", isDark ? "#1a1c20" : "#eef0f2"); }
      catch { /* layer may not exist */ }
      setHasBoundaryState(Boolean(map.getLayer("boundary_state")));
    };
    if (map.isStyleLoaded()) apply();
    map.on("styledata", apply);
    return () => { map.off("styledata", apply); };
  }, [isDark]);

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        mapStyle={isDark ? DARK_STYLE : LIGHT_STYLE}
        padding={mapPadding}
        interactiveLayerIds={[
          "geo-clusters", "geo-markers",
          ...(spiderPointsData ? ["spider-markers"] : []),
          ...(choroplethGeoJSON ? ["admin1-choropleth"] : []),
        ]}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        {arcLayers.length > 0 && <DeckGLOverlay layers={arcLayers} />}

        {choroplethGeoJSON && (
          <Source key={`choropleth-${scheme}`} id="admin1-boundaries" type="geojson" data={choroplethGeoJSON}>
            <Layer
              id="admin1-choropleth" type="fill"
              beforeId={hasBoundaryState ? "boundary_state" : undefined}
              filter={[">", ["get", "papers"], 0] as never}
              paint={{
                "fill-color": [
                  "interpolate", ["linear"], ["sqrt", ["get", "papers"]],
                  0, isDark ? "#1a2332" : "#d0dcea",
                  Math.sqrt(maxPapers * 0.1), isDark ? "#223040" : "#b8cede",
                  Math.sqrt(maxPapers * 0.3), isDark ? "#2e4a68" : "#8eacc8",
                  Math.sqrt(maxPapers * 0.6), isDark ? "#3a6088" : "#6e94b8",
                  Math.sqrt(maxPapers), isDark ? "#4878a8" : "#5080a8",
                ] as never,
                "fill-opacity": [
                  "interpolate", ["linear"], ["zoom"],
                  0, isDark ? 0.55 : 0.65, 3, isDark ? 0.45 : 0.55, 6, isDark ? 0.2 : 0.3,
                ] as never,
              }}
            />
            {geoSelection && (
              <Layer
                id="admin1-selection-outline" type="line"
                beforeId={hasBoundaryState ? "boundary_state" : undefined}
                filter={
                  geoSelection.level === "region" && geoSelection.polygonName
                    ? (["all", ["==", ["get", "iso_a2"], geoSelection.countryCode], ["==", ["get", "name"], geoSelection.polygonName]] as never)
                    : (["==", ["get", "iso_a2"], geoSelection.countryCode] as never)
                }
                paint={{ "line-color": isDark ? "#8eacc8" : "#5080a8", "line-width": 2, "line-opacity": 0.85 }}
              />
            )}
          </Source>
        )}

        <Source
          key={`institutions-${scheme}`} id="geo-institutions" type="geojson" data={sourceData}
          cluster clusterMaxZoom={CLUSTER_MAX_ZOOM} clusterRadius={40}
          clusterProperties={{ _maxCid: ["max", ["get", "clusterId"]] }}
        >
          <Layer
            id="geo-clusters" type="circle" filter={["has", "point_count"]}
            paint={{
              "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 14, 10, 22, 50, 34, 200, 48] as never,
              "circle-color": clusterColorExpr as never,
              "circle-opacity": highlightedSet ? 0.12 : selectedSet ? 0.15 : 0.6,
              "circle-stroke-width": 0, "circle-blur": 0.1,
            }}
          />
          <Layer
            id="geo-cluster-count" type="symbol" filter={["has", "point_count"]}
            layout={{ "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"] }}
            paint={{ "text-color": isDark ? "#e4e4e9" : "#ffffff", "text-opacity": highlightedSet ? 0.12 : selectedSet ? 0.15 : 1 }}
          />
          <Layer
            id="geo-markers" type="circle"
            filter={["!", ["has", "point_count"]] as never}
            paint={{
              "circle-radius": typeof sizeExpression === "number"
                ? (["interpolate", ["linear"], ["zoom"], 0, Math.max(sizeExpression * 0.45, 2), 3, Math.max(sizeExpression * 0.75, 3), 5, sizeExpression, 8, sizeExpression * 1.5] as never)
                : sizeExpression as never,
              "circle-color": colorExpression as never,
              "circle-opacity": selectionOpacity(highlightedSet, selectedSet, 0.85, 0.12, 0.75) as never,
              "circle-stroke-width": 0, "circle-blur": 0.15,
            }}
          />
          <Layer
            id="geo-labels" type="symbol" minzoom={4}
            filter={["!", ["has", "point_count"]] as never}
            layout={{ "text-field": ["get", "institution"], "text-size": 11, "text-offset": [0, 1.4], "text-anchor": "top", "text-max-width": 12, "text-optional": true }}
            paint={{
              "text-color": isDark ? "#e4e4e9" : "#1a1b1e",
              "text-halo-color": isDark ? "rgba(17,17,19,0.85)" : "rgba(255,255,255,0.9)",
              "text-halo-width": 1.5,
              "text-opacity": selectionOpacity(highlightedSet, selectedSet, 1, 0.12, 1) as never,
            }}
          />
        </Source>

        {spiderLegsData && (
          <Source id="spider-legs" type="geojson" data={spiderLegsData}>
            <Layer id="spider-leg-lines" type="line" paint={{ "line-color": isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)", "line-width": 1 }} />
          </Source>
        )}

        {spiderPointsData && (
          <Source id="spider-points" type="geojson" data={spiderPointsData}>
            <Layer
              id="spider-markers" type="circle"
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 10, 12, 14, 16, 18, 20, 22] as never,
                "circle-color": spiderColor ?? (isDark ? NOISE_COLOR : NOISE_COLOR_LIGHT),
                "circle-opacity": selectionOpacity(null, selectedSet, 0.9, 0.2, 0.85) as never,
                "circle-stroke-width": selectionOpacity(null, selectedSet, 2, 0, 0) as never,
                "circle-stroke-color": isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.3)",
                "circle-blur": 0.05,
              }}
            />
            <Layer
              id="spider-labels" type="symbol"
              layout={{ "text-field": ["get", "institution"], "text-size": 11, "text-offset": [0, 1.4], "text-anchor": "top", "text-max-width": 12, "text-optional": true }}
              paint={{
                "text-color": isDark ? "#e4e4e9" : "#1a1b1e",
                "text-halo-color": isDark ? "rgba(17,17,19,0.85)" : "rgba(255,255,255,0.9)",
                "text-halo-width": 1.5,
                "text-opacity": selectionOpacity(null, selectedSet, 1, 0.15, 1) as never,
              }}
            />
          </Source>
        )}
      </Map>

      {hoveredArc && <ArcTooltip arc={hoveredArc} isDark={isDark} />}
    </div>
  );
}
