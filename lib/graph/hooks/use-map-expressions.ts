"use client"

import { useMemo } from "react"
import { getPaletteColors } from "../colors"
import type { ColorSchemeName, ColorTheme, GeoNode, PointColorStrategy, PointSizeStrategy, SizeColumnKey } from "../types"
import type { ExpressionSpecification } from "maplibre-gl"

/** Type-safe dynamic property access on a GeoNode. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNodeProp(node: GeoNode, key: string): any {
  return (node as never as Record<string, unknown>)[key]
}

/**
 * Build a MapLibre circle-color paint expression from store state.
 *
 * Mirrors what Cosmograph does via `pointColorBy` + `pointColorStrategy` + palette,
 * but expressed as MapLibre's expression DSL so the GPU evaluates it per-feature.
 */
export function useMapColorExpression(
  geoNodes: GeoNode[],
  colorColumn: string,
  colorStrategy: PointColorStrategy,
  colorScheme: ColorSchemeName,
  colorTheme: ColorTheme,
): ExpressionSpecification | string {
  return useMemo(() => {
    const palette = getPaletteColors(colorScheme, colorTheme)

    if (colorStrategy === "direct" || colorColumn === "hexColor") {
      return ["get", colorTheme === "light" ? "colorLight" : "color"] as ExpressionSpecification
    }

    if (colorStrategy === "single") {
      return palette[0]
    }

    if (colorStrategy === "categorical") {
      const uniqueValues = [...new Set(
        geoNodes.map((n) => getNodeProp(n, colorColumn)).filter(Boolean)
      )]
      if (uniqueValues.length === 0) return palette[0]

      const matchExpr: unknown[] = ["match", ["get", colorColumn]]
      for (let i = 0; i < uniqueValues.length; i++) {
        matchExpr.push(String(uniqueValues[i]), palette[i % palette.length])
      }
      matchExpr.push(palette[palette.length - 1]) // fallback
      return matchExpr as ExpressionSpecification
    }

    if (colorStrategy === "continuous") {
      const values = geoNodes
        .map((n) => getNodeProp(n, colorColumn))
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      if (values.length === 0) return palette[0]

      const min = Math.min(...values)
      const max = Math.max(...values)
      if (min === max) return palette[0]

      const stops = palette.slice(0, 5)
      const interpExpr: unknown[] = ["interpolate", ["linear"], ["get", colorColumn]]
      for (let i = 0; i < stops.length; i++) {
        interpExpr.push(min + (max - min) * (i / (stops.length - 1)), stops[i])
      }
      return interpExpr as ExpressionSpecification
    }

    // Fallback: use pre-computed hex color
    return ["get", "color"] as ExpressionSpecification
  }, [geoNodes, colorColumn, colorStrategy, colorScheme, colorTheme])
}

/**
 * Build a MapLibre circle-radius paint expression from store state.
 *
 * Mirrors Cosmograph's point sizing: "auto" uses the size column with sqrt scale,
 * "single" uses a fixed radius, "direct" reads the value as-is.
 */
export function useMapSizeExpression(
  geoNodes: GeoNode[],
  sizeColumn: SizeColumnKey,
  sizeStrategy: PointSizeStrategy,
  sizeRange: [number, number],
): ExpressionSpecification | number {
  return useMemo(() => {
    if (sizeStrategy === "single" || sizeColumn === "none") {
      return sizeRange[0]
    }

    const values = geoNodes
      .map((n) => getNodeProp(n, sizeColumn))
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    if (values.length === 0) return sizeRange[0]

    const min = Math.min(...values)
    const max = Math.max(...values)
    if (min === max) return sizeRange[0]

    // "auto" and "direct" both interpolate linearly across the range
    return [
      "interpolate",
      ["linear"],
      ["sqrt", ["max", ["get", sizeColumn], 0]],
      Math.sqrt(Math.max(min, 0)),
      sizeRange[0],
      Math.sqrt(Math.max(max, 0)),
      sizeRange[1],
    ] as ExpressionSpecification
  }, [geoNodes, sizeColumn, sizeStrategy, sizeRange])
}

/**
 * Build a MapLibre filter expression combining timeline + geo filters.
 *
 * Always returns a valid expression — `["all"]` (match everything) when
 * no filters are active, because MapLibre rejects `undefined` for the
 * filter prop.
 */
export function useMapFilterExpression(
  timelineSelection: [number, number] | undefined,
  geoFilters: Record<string, string[] | [number, number]>,
): ExpressionSpecification {
  return useMemo(() => {
    const clauses: ExpressionSpecification[] = []

    // Timeline: show institutions active during selected year range
    if (timelineSelection) {
      const [minY, maxY] = timelineSelection
      clauses.push(["<=", ["get", "firstYear"], maxY] as ExpressionSpecification)
      clauses.push([
        ">=",
        ["coalesce", ["get", "lastYear"], ["get", "firstYear"]],
        minY,
      ] as ExpressionSpecification)
    }

    // Categorical filters (string arrays)
    for (const [col, val] of Object.entries(geoFilters)) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string") {
        clauses.push(["in", ["get", col], ["literal", val]] as ExpressionSpecification)
      }
      // Numeric range filters
      if (Array.isArray(val) && val.length === 2 && typeof val[0] === "number") {
        clauses.push([">=", ["get", col], val[0]] as ExpressionSpecification)
        clauses.push(["<=", ["get", col], val[1]] as ExpressionSpecification)
      }
    }

    // ["all"] with no clauses matches everything — safe default
    return ["all", ...clauses] as ExpressionSpecification
  }, [timelineSelection, geoFilters])
}

/**
 * Compute filtered node indices from the combined filter state.
 *
 * Evaluates the same logic as the MapLibre filter expression, but on the
 * GeoNode array so we can sync visible indices to the store for DataTable/InfoPanel.
 */
export function useFilteredGeoIndices(
  geoNodes: GeoNode[],
  timelineSelection: [number, number] | undefined,
  geoFilters: Record<string, string[] | [number, number]>,
): number[] | null {
  return useMemo(() => {
    const hasTimeline = Boolean(timelineSelection)
    const hasFilters = Object.keys(geoFilters).length > 0
    if (!hasTimeline && !hasFilters) return null // all visible

    const result: number[] = []
    for (const n of geoNodes) {
      if (!matchesNodeFilter(n, timelineSelection, geoFilters)) continue
      result.push(n.index)
    }
    return result
  }, [geoNodes, timelineSelection, geoFilters])
}

function matchesNodeFilter(
  n: GeoNode,
  timelineSelection: [number, number] | undefined,
  geoFilters: Record<string, string[] | [number, number]>,
): boolean {
  if (timelineSelection) {
    const [minY, maxY] = timelineSelection
    if (n.firstYear != null && n.firstYear > maxY) return false
    const lastY = n.lastYear ?? n.firstYear
    if (lastY != null && lastY < minY) return false
  }

  for (const [col, val] of Object.entries(geoFilters)) {
    const nodeVal = getNodeProp(n, col)
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string") {
      if (!(val as string[]).includes(String(nodeVal ?? ""))) return false
    }
    if (Array.isArray(val) && val.length === 2 && typeof val[0] === "number") {
      const num = Number(nodeVal)
      if (!Number.isFinite(num) || num < (val[0] as number) || num > (val[1] as number)) return false
    }
  }

  return true
}

