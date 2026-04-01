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

/**
 * Columns that Cosmograph's internal DuckDB coordinator must include for
 * integrated widgets (CosmographTimeline, CosmographHistogram, CosmographBars).
 *
 * The docs require each widget's `accessor` column to be present in
 * `pointIncludeColumns`. Without it the widget can't read data from the
 * coordinator and crossfilter animation won't highlight points.
 *
 * Render-path columns (x, y, color, size, label, index) are handled
 * separately by Cosmograph's core config — only widget accessor columns
 * need to be listed here.
 */
export function getPointIncludeColumns(args: PointIncludeColumnArgs): string[] {
  const cols = new Set<string>()

  // Timeline widget accessor
  if (args.showTimeline && args.timelineColumn) {
    cols.add(args.timelineColumn)
  }

  // Filter widget accessors (categorical + numeric)
  for (const filter of args.filterColumns) {
    cols.add(filter.column)
  }

  return [...cols]
}
