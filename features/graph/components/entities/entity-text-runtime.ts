import type { GraphEntityRef } from "@/features/graph/types/entity-service";

export interface EntityTextScope {
  text: string;
  textFrom: number;
  cursorOffset: number;
}

export interface EntityHoverTarget {
  entity: GraphEntityRef;
  paperCount: number;
  x: number;
  y: number;
}
