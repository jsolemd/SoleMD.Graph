"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Field-mode is the layout authority for whether the landing FieldCanvas
 * is mounted or whether /graph is using its separate WebGPU orb canvas:
 *
 *   - 'landing' → scroll-driven chapters and the existing R3F/WebGL
 *     storytelling path.
 *   - 'orb'     → /graph 3D is active; the layout FieldCanvas stays
 *     unmounted and OrbSurface owns the raw WebGPU particle canvas.
 *
 * Consumers read mode via `useFieldMode()` instead of prop-drilling
 * route/renderer state through the layout.
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
