"use client";

import { createContext, useContext } from "react";
import type { GraphEntityRef } from "@solemd/api-client/shared/graph-entity";

export interface EntityHoverShowArgs {
  entity: GraphEntityRef;
  paperCount?: number;
  x: number;
  y: number;
  /**
   * Sticky mode used for touch input: the card stays open until an
   * outside-click dismissal. `hide()` is ignored while pinned so leaving
   * the source element (finger lifts, pointer moves away) doesn't close
   * the card. Omit (undefined/false) for the fluent desktop hover path.
   */
  pinned?: boolean;
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
