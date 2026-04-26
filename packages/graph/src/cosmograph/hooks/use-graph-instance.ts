"use client";
import { useCosmographInternal } from "@cosmograph/react";
import type { Cosmograph } from "@cosmograph/cosmograph";

/**
 * Returns the Cosmograph instance from the nearest CosmographProvider, or
 * null when no provider is mounted. Use this instead of importing
 * useCosmograph directly from @cosmograph/react — the upstream hook throws
 * outside a provider, which would crash renderer-clean surfaces (e.g. the
 * 3D OrbSurface) that mount Cosmograph-aware widgets without a Cosmograph
 * instance. Consumers must null-check the return value.
 */
export function useGraphInstance(): Cosmograph | null {
  return useCosmographInternal()?.cosmograph ?? null;
}
