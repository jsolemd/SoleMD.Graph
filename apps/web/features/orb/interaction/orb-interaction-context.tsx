"use client";

import { createContext, useContext } from "react";

/**
 * Bridge between the layout-mounted orb interaction surface and the slices
 * that bind active behavior to it (WebGPU twist, hover, click, rect-drag,
 * and keyboard chords).
 *
 * Topology contract — read before changing:
 * - The provider lives in `DashboardClientShell`, **above** both
 *   the layout field shell and `{children}`. Both subtrees are downward
 *   consumers.
 * - `OrbInteractionSurface` (rendered inside `OrbSurface`) calls
 *   `registerSurface(node)` from a callback ref so the live element flows
 *   back up into provider state. When 3D unmounts (renderer toggle, route
 *   swap), the callback fires with `null` and consumers suspend bindings.
 * - `surfaceElement` is reactive state, not a `MutableRefObject`, because
 *   pointer/touch bindings key effects on it. `ref.current` mutations would
 *   not trigger the re-bind.
 */

export interface OrbInteractionBridge {
  surfaceElement: HTMLDivElement | null;
  registerSurface: (node: HTMLDivElement | null) => void;
}

export const OrbInteractionContext =
  createContext<OrbInteractionBridge | null>(null);

export function useOrbInteraction(): OrbInteractionBridge {
  const ctx = useContext(OrbInteractionContext);
  if (!ctx) {
    throw new Error(
      "useOrbInteraction must be used within DashboardClientShell",
    );
  }
  return ctx;
}
