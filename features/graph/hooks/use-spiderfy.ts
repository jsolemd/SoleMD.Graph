import { useCallback, useEffect, useMemo, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import type maplibregl from "maplibre-gl";

export interface SpiderState {
  features: GeoJSON.Feature[];
  center: [number, number];
  color: string | null;
}

interface FilteredGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: number;
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { index: number; [key: string]: unknown };
  }>;
}

/**
 * Manages spiderfy state — when co-located map points can't expand further,
 * offset them in a circle so they're individually clickable.
 *
 * Extracts: spider state, spiderfy callback, zoom-clear effect,
 * sourceData (minus spiderfied features), and spiderPointsData.
 */
export function useSpiderfy(
  mapRef: React.RefObject<MapRef | null>,
  filteredGeojson: FilteredGeoJSON,
) {
  const [spider, setSpider] = useState<SpiderState | null>(null);
  const spiderfiedFeatures = spider?.features ?? null;
  const spiderCenter = spider?.center ?? null;
  const spiderColor = spider?.color ?? null;

  const spiderfy = useCallback(
    (center: [number, number], leaves: GeoJSON.Feature[], map: maplibregl.Map) => {
      const zoom = map.getZoom();
      // Target a compact ring on screen, converted to degrees.
      // At zoom z, 1 degree longitude ≈ 256 * 2^z / 360 pixels.
      // Adjust for latitude (longitude degrees shrink by cos(lat)).
      const pxPerDeg =
        ((256 * Math.pow(2, zoom)) / 360) *
        Math.cos((center[1] * Math.PI) / 180);
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

      setSpider((prev) => ({
        features: spidered,
        center,
        color: prev?.color ?? null,
      }));
    },
    [],
  );

  // Clear spiderfy on zoom change (offset radius would be wrong)
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const onZoom = () => {
      setSpider(null);
    };
    map.on("zoomstart", onZoom);
    return () => {
      map.off("zoomstart", onZoom);
    };
  }, [mapRef]);

  // Remove spiderfied features from the clustered source — they render in a
  // separate unclustered source so maplibre can't re-absorb them into clusters.
  const sourceData = useMemo(() => {
    if (!spiderfiedFeatures) return filteredGeojson;
    const spiderIndices = new Set(
      spiderfiedFeatures.map((f) => f.properties?.index),
    );
    return {
      ...filteredGeojson,
      features: filteredGeojson.features.filter(
        (f) => !spiderIndices.has(f.properties.index),
      ),
    };
  }, [filteredGeojson, spiderfiedFeatures]);

  // Separate GeoJSON for spiderfied points — unclustered so they render individually
  const spiderPointsData = useMemo(() => {
    if (!spiderfiedFeatures) return null;
    return {
      type: "FeatureCollection" as const,
      features: spiderfiedFeatures,
    };
  }, [spiderfiedFeatures]);

  // Spider leg line GeoJSON — thin connectors from original center to offset points
  const spiderLegsData = useMemo(() => {
    if (!spiderCenter || !spiderfiedFeatures) return null;
    return {
      type: "FeatureCollection" as const,
      features: spiderfiedFeatures.map((f) => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            spiderCenter,
            (f.geometry as GeoJSON.Point).coordinates,
          ],
        },
        properties: {},
      })),
    };
  }, [spiderCenter, spiderfiedFeatures]);

  return {
    spider,
    setSpider,
    spiderfiedFeatures,
    spiderCenter,
    spiderColor,
    spiderfy,
    sourceData,
    spiderPointsData,
    spiderLegsData,
  } as const;
}
