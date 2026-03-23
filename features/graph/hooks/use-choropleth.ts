import { useMemo } from "react";
import whichPolygon from "which-polygon";
import { useAdmin1Boundaries } from "@/features/graph/hooks/use-admin1-boundaries";
import type { GeoNode } from "@/features/graph/types";

/**
 * Builds the choropleth GeoJSON by spatially joining geoNodes to admin-1
 * (state/province) boundary polygons. Returns the enriched GeoJSON with
 * per-polygon paper/author counts, the max papers value for the color ramp,
 * and the spatial index for region lookups.
 */
export function useChoropleth(geoNodes: GeoNode[]) {
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
  // coordinates, then aggregate paper counts by polygon index.
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
        properties: {
          ...f.properties,
          papers,
          authors: authorsByIdx.get(i) ?? 0,
        },
      };
    });

    return {
      choroplethGeoJSON: { ...rawAdmin1GeoJSON, features },
      maxPapers: Math.max(max, 1),
    };
  }, [rawAdmin1GeoJSON, admin1Index, geoNodes]);

  return { choroplethGeoJSON, maxPapers, admin1Index } as const;
}
