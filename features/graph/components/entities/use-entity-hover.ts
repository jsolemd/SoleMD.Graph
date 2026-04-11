"use client";

import { createContext, useContext } from "react";
import type { GraphEntityRef } from "@/features/graph/types/entity-service";

export interface EntityHoverShowArgs {
  entity: GraphEntityRef;
  paperCount?: number;
  x: number;
  y: number;
}

export interface EntityHoverContext {
  show: (args: EntityHoverShowArgs) => void;
  hide: () => void;
  pointerEnterCard: () => void;
  pointerLeaveCard: () => void;
}

const NOOP_CONTEXT: EntityHoverContext = {
  show: () => {},
  hide: () => {},
  pointerEnterCard: () => {},
  pointerLeaveCard: () => {},
};

export const EntityHoverCtx = createContext<EntityHoverContext>(NOOP_CONTEXT);

/**
 * Shared entity hover card controller.
 *
 * Any component can call `show(entityRef, position)` to display the
 * hover card. The provider handles detail fetching, caching, and
 * dismiss delay. See docs/map/wiki-taxonomy.md.
 */
export function useEntityHover(): EntityHoverContext {
  return useContext(EntityHoverCtx);
}
