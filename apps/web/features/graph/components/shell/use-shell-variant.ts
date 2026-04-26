"use client";

import { useMounted, useViewportSize } from "@mantine/hooks";
import { useEffect, useState } from "react";

export type ShellVariant = "mobile" | "desktop";

export const MOBILE_SHELL_MAX_WIDTH = 960;

export function resolveShellVariant({
  hasCoarsePointer,
  hasHover,
  viewportWidth,
}: {
  hasCoarsePointer: boolean;
  hasHover: boolean;
  viewportWidth: number;
}): ShellVariant {
  return viewportWidth > 0
    && viewportWidth <= MOBILE_SHELL_MAX_WIDTH
    && (hasCoarsePointer || !hasHover)
    ? "mobile"
    : "desktop";
}

export function useShellVariant(): ShellVariant {
  // First client paint must mirror the SSR fallback (desktop) — reading
  // window.matchMedia / innerWidth synchronously here would diverge from
  // the server tree on phones and trip every consumer that branches on
  // the variant (Mantine ActionIcon size, etc.). useMounted defers the
  // real measurement to the post-hydration render.
  const mounted = useMounted();
  const { width } = useViewportSize();
  const [pointerState, setPointerState] = useState({
    hasCoarsePointer: false,
    hasHover: true,
  });
  const viewportWidth = mounted
    ? width || window.innerWidth
    : MOBILE_SHELL_MAX_WIDTH + 1;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const hoverQuery = window.matchMedia("(hover: hover)");
    const syncPointerState = () => {
      setPointerState({
        hasCoarsePointer: coarsePointerQuery.matches,
        hasHover: hoverQuery.matches,
      });
    };

    syncPointerState();
    coarsePointerQuery.addEventListener("change", syncPointerState);
    hoverQuery.addEventListener("change", syncPointerState);

    return () => {
      coarsePointerQuery.removeEventListener("change", syncPointerState);
      hoverQuery.removeEventListener("change", syncPointerState);
    };
  }, []);

  return resolveShellVariant({ ...pointerState, viewportWidth });
}
