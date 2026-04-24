"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Field-mode is the substrate authority for which surface semantics the
 * shared 16384-particle pipeline is currently presenting:
 *
 *   - 'landing' → scroll-driven chapters, wrapper rotation, pointer-events
 *     off, no paper bake. The existing landing storytelling path.
 *   - 'orb'     → paper-per-particle bake, click-to-focus, camera controls,
 *     scroll chapters gated off. The /graph evidence renderer.
 *
 * Consumers (BlobController, scroll driver, FixedStageManager, FieldScene)
 * read mode via `useFieldMode()` instead of prop-drilling through 8+ files.
 * Default outside a provider is 'landing' so existing surfaces render
 * unchanged before the provider is mounted.
 */
export type FieldMode = "landing" | "orb";

const FieldModeContext = createContext<FieldMode>("landing");

export interface FieldModeProviderProps {
  mode: FieldMode;
  children: ReactNode;
}

export function FieldModeProvider({
  mode,
  children,
}: FieldModeProviderProps) {
  return (
    <FieldModeContext.Provider value={mode}>
      {children}
    </FieldModeContext.Provider>
  );
}

export function useFieldMode(): FieldMode {
  return useContext(FieldModeContext);
}
