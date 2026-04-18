/**
 * GSAP singleton with StrictMode-safe plugin registration.
 *
 * Plugins are imported lazily by the consumer — see component
 * templates in content/graph/components/_templates/icon-hand-crafted.tsx
 * for the pattern:
 *
 *     const gsap = (await import("@/lib/gsap")).getGsap()
 *     const { DrawSVGPlugin } = await import("gsap/DrawSVGPlugin")
 *     gsap.registerPlugin(DrawSVGPlugin)
 *
 * StrictMode double-renders in dev would otherwise register plugins
 * twice; GSAP warns about that. This module caches the `gsap` default
 * export after first access so every caller sees the same instance.
 */
import gsapDefault from "gsap";

let cached: typeof gsapDefault | null = null;

export function getGsap(): typeof gsapDefault {
  if (cached) return cached;
  cached = gsapDefault;
  return cached;
}
