"use client";
import { useCosmograph } from "@cosmograph/react";

/**
 * Returns the Cosmograph instance from the nearest CosmographProvider.
 * Use this instead of importing useCosmograph directly from @cosmograph/react.
 */
export function useGraphInstance() {
  const { cosmograph } = useCosmograph();
  return cosmograph;
}
