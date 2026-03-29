import type { ColumnType } from './columns'

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
