import type { GraphEntityRef, GraphEntityAlias } from "@solemd/api-client/shared/graph-entity";

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
