import type { GraphEntityRef, GraphEntityAlias } from "@/features/graph/types/entity-service";

export interface EntityHoverCardModel {
  x: number
  y: number
  entity: GraphEntityRef
  label: string
  entityType: string | null
  conceptId: string | null
  conceptNamespace: string | null
  paperCount: number | null
  aliases: readonly GraphEntityAlias[]
  detailReady: boolean
}
