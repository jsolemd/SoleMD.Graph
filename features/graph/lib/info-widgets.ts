import type { ColumnType } from './columns'

/** Default number of visible rows for info-panel sections (clusters, facets, bars). */
export const DEFAULT_INFO_ROWS = 6

export type InfoWidgetKind = 'histogram' | 'bars' | 'facet-summary'

export interface InfoWidgetSlot {
  column: string
  kind: InfoWidgetKind
  label: string
}

export function autoDetectWidgetKind(type: ColumnType): InfoWidgetKind | null {
  if (type === 'numeric') return 'histogram'
  if (type === 'categorical') return 'bars'
  return null
}
