export interface EntityHoverCardModel {
  x: number
  y: number
  label: string
  entityType: string | null
  paperCount: number | null
  aliases: readonly string[]
  summary: string | null
  detailReady: boolean
}
