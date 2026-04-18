"use client";

import { useViewportSize } from "@mantine/hooks";
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
  const { width } = useViewportSize();
  const [pointerState, setPointerState] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? {
          hasCoarsePointer: window.matchMedia("(pointer: coarse)").matches,
          hasHover: window.matchMedia("(hover: hover)").matches,
        }
      : {
          hasCoarsePointer: false,
          hasHover: true,
        }
  ));
  const viewportWidth =
    width || (typeof window === "undefined" ? MOBILE_SHELL_MAX_WIDTH + 1 : window.innerWidth);

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
