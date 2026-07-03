"use client";

import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type FieldMode,
} from "@/features/field/renderer/field-mode-context";
import { FieldRuntimeShell } from "@/features/field/renderer/FieldRuntimeShell";
import {
  OrbInteractionContext,
  type OrbInteractionBridge,
} from "@/features/orb/interaction/orb-interaction-context";
import { useOrbGeometryMutationStore } from "@/features/orb/stores/geometry-mutation-store";
import { ShellVariantProvider } from "@/features/graph/components/shell/ShellVariantContext";
import { useShellVariant } from "@/features/graph/components/shell/use-shell-variant";
import {
  useDashboardStore,
  useShellStore,
  type RendererMode,
} from "@/features/graph/stores";

export function resolveFieldMode(
  pathname: string | null,
  rendererMode: RendererMode,
): FieldMode {
  // /graph in '3d' mode is owned by the raw WebGPU orb runtime mounted
  // inside OrbSurface. Toggling to '2d' (native Cosmograph) keeps the
  // dashboard layout mounted while the layout-level landing FieldCanvas
  // remains unmounted for /graph.
  return pathname === "/graph" && rendererMode === "3d" ? "orb" : "landing";
}

/**
 * Layout-owned client shell for the graph/dashboard route group.
 *
 * The /graph 3D path owns its raw WebGPU canvas in OrbSurface; this shell
 * adds graph/orb providers around the shared FieldRuntimeShell without
 * making the public landing route import orb code.
 *
 * Scope contract:
 * - Canvas + scene store + field mode live HERE.
 * - FixedStageManager + scroll bindings + DOM overlays stay in the
 *   landing surface (the manifest is landing-specific).
 * - Orb picking + detail panel + paper bake live in features/orb/.
 */
export function DashboardClientShell({
  children,
}: {
  children: ReactNode;
}) {
  const shellVariant = useShellVariant();
  const pathname = usePathname();
  const rendererMode = useDashboardStore((s) => s.rendererMode);
  const fieldMode = resolveFieldMode(pathname, rendererMode);
  // The OrbInteractionSurface lives inside `{children}`; the bridge is
  // hoisted here so touch/hover/selection bindings can follow the live
  // DOM element across the 3D ↔ 2D toggle.
  const [orbSurfaceElement, setOrbSurfaceElement] =
    useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (fieldMode === "orb") return;
    useOrbGeometryMutationStore.getState().reset();
  }, [fieldMode]);

  // Slice 9: OS reduced-motion bridge. Mirrors the media-query into
  // useShellStore.prefersReducedMotion so consumers can collapse the
  // three orthogonal motion
  // inputs (user-controlled pauseMotion, user/auto lowPowerProfile,
  // system-controlled OS preference) into a single derived flag
  // without each call site re-running window.matchMedia. Critical
  // contract: we do NOT write into setPauseMotion here — the OS
  // preference is a separate input so a future pause-motion UI
  // toggle doesn't fight a system event.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const setPrefersReducedMotion =
      useShellStore.getState().setPrefersReducedMotion;
    setPrefersReducedMotion(media.matches);
    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    media.addEventListener("change", handler);
    return () => {
      media.removeEventListener("change", handler);
    };
  }, []);

  const orbInteractionBridge = useMemo<OrbInteractionBridge>(
    () => ({
      surfaceElement: orbSurfaceElement,
      registerSurface: setOrbSurfaceElement,
    }),
    [orbSurfaceElement],
  );

  return (
    <ShellVariantProvider value={shellVariant}>
      <OrbInteractionContext.Provider value={orbInteractionBridge}>
        <FieldRuntimeShell mode={fieldMode}>{children}</FieldRuntimeShell>
      </OrbInteractionContext.Provider>
    </ShellVariantProvider>
  );
}
