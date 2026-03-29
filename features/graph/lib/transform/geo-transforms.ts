import type { GeoNode, GraphStats } from '@/features/graph/types'
import { getPaletteColors } from '../colors'
import type { GeoPointRow } from './row-types'
import { buildBaseNode, resolveClusterColors } from './graph-nodes'

/* ─── Geo node builder ──────────────────────────────────────── */

export function buildGeoNodes(rows: GeoPointRow[]): GeoNode[] {
  const darkPalette = getPaletteColors('default', 'dark')
  const lightPalette = getPaletteColors('default', 'light')
  const nodes: GeoNode[] = []

  for (const [index, row] of rows.entries()) {
    const clusterId = row.cluster_id ?? 0
    const base = resolveClusterColors(clusterId, darkPalette, lightPalette)
    const color = row.color_hex ?? base.color
    const colorLight = base.colorLight

    nodes.push({
      ...buildBaseNode({
        index: row.point_index ?? index,
        id: row.node_id ?? row.id,
        x: row.x,
        y: row.y,
        color,
        colorLight,
        clusterId,
        clusterLabel: row.cluster_label,
        clusterProbability: 1,
        year: row.first_year ?? null,
        displayLabel: row.institution ?? row.node_id,
        chunkPreview: row.institution ?? null,
        paperAuthorCount: row.author_count ?? null,
      }),
      nodeKind: 'institution',
      institution: row.institution ?? null,
      rorId: row.ror_id ?? null,
      city: row.city ?? null,
      region: row.region ?? null,
      country: row.country ?? null,
      countryCode: row.country_code ?? null,
      paperCount: row.paper_count ?? 0,
      authorCount: row.author_count ?? 0,
      firstYear: row.first_year ?? null,
      lastYear: row.last_year ?? null,
    })
  }

  return nodes
}

export function buildGeoStats(geoNodes: GeoNode[]): GraphStats {
  const countries = new Set(geoNodes.map((n) => n.countryCode).filter(Boolean))
  return {
    points: geoNodes.length,
    pointLabel: 'institutions',
    papers: geoNodes.reduce((sum, n) => sum + n.paperCount, 0),
    clusters: countries.size,
    noise: 0,
  }
}
