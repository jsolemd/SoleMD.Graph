import { getLayerConfig } from './layers'
import type { MapLayer } from '@/features/graph/types'

interface PointIncludeColumnsArgs {
  layer: MapLayer
  activePanel: string | null
  showTimeline: boolean
  filterColumns: ReadonlyArray<{ column: string }>
  timelineColumn?: string | null
}

/**
 * Keep Cosmograph's materialized point rows limited to the fields that its
 * mounted widgets actually query. This avoids SELECT * over wide bundle views
 * and keeps heavy text fields out of the initial Arrow table.
 */
export function getPointIncludeColumns({
  layer,
  activePanel,
  showTimeline,
  filterColumns,
  timelineColumn,
}: PointIncludeColumnsArgs): string[] {
  const layerConfig = getLayerConfig(layer)
  if (layerConfig.rendererType !== 'cosmograph') {
    return []
  }

  const columns = new Set<string>()

  if (activePanel === 'filters') {
    for (const filter of filterColumns) {
      columns.add(filter.column)
    }
  }

  if (showTimeline && timelineColumn) {
    columns.add(timelineColumn)
  }

  return [...columns]
}
