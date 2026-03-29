import type { MapLayer } from '@/features/graph/types'

interface PointIncludeColumnArgs {
  layer: MapLayer
  activePanel: string | null
  showTimeline: boolean
  filterColumns: Array<{ column: string; type: 'categorical' | 'numeric' }>
  timelineColumn: string | null
  pointColorColumn: string
  pointSizeColumn: string
  pointLabelColumn: string
  positionXColumn: string
  positionYColumn: string
}

const EMPTY_POINT_INCLUDE_COLUMNS: string[] = []

export function getPointIncludeColumns(_args: PointIncludeColumnArgs): string[] {
  // Keep Cosmograph on the dense render path only. Rich metadata stays DuckDB-native
  // on the query views and heavy detail comes from the backend/API.
  return EMPTY_POINT_INCLUDE_COLUMNS
}
