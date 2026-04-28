"use client";

import type { GraphBundle } from "@solemd/graph";

import { DashboardShell, GraphErrorBoundary } from "@/features/graph";
import { useDashboardStore } from "@/features/graph/stores";
import { OrbSurface } from "@/features/orb/surface/OrbSurface";

/**
 * Renderer-mode router for /graph. Bundle is guaranteed non-null by the
 * page-level guard; both branches assume a live bundle.
 *
 * - '3d' (default) → OrbSurface — the paper-identity workspace mounted on
 *   the raw WebGPU orb canvas.
 * - '2d'           → native Cosmograph via DashboardShell — the same mount
 *   path /map uses, so we don't fork the 2D runtime.
 *
 * Conditional mount (not visibility flip) because the two surfaces own
 * incompatible side effects: OrbSurface owns WebGPU device/canvas
 * lifecycle and mounts OrbInteractionSurface; DashboardShell brings up
 * Cosmograph via DashboardShellClient + crossfilter init. Sharing the
 * dashboard stores keeps selection / scope / panels / RAG state coherent
 * across the toggle.
 */
export function GraphSurfaceSwitch({
  bundle,
}: {
  bundle: GraphBundle;
}) {
  const rendererMode = useDashboardStore((s) => s.rendererMode);

  if (rendererMode === "2d") {
    return (
      <GraphErrorBoundary>
        <DashboardShell bundle={bundle} />
      </GraphErrorBoundary>
    );
  }

  return <OrbSurface bundle={bundle} />;
}
