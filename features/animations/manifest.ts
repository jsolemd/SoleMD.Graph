/**
 * Animation manifest — single source of truth for the animation registry.
 *
 * Entries are authored on the SoleMD.Make side in
 * `content/graph/manifest.json` and copied here by `make graph publish`.
 *
 * Consumers import `getAnimationRef(name)` / `getAnimationsForEntity(slug)`
 * and dispatch to the matching renderer:
 *
 *   - framer     → React component under `components/`
 *   - r3f        → React Three Fiber scene (dynamic-imported, ssr: false)
 *   - model-viewer → `<model-viewer>` wrapper pointing at a .glb asset
 *   - lottie     → `lottie-react` playback of a JSON blob
 *   - manim      → `<video>` playing a .mp4 from /public/animations/
 *   - interactive → everything else (canvas hook, gesture demo, etc.)
 */
import manifestData from "./manifest.json" with { type: "json" };

export type AnimationFormat =
  | "framer"
  | "r3f"
  | "model-viewer"
  | "lottie"
  | "manim"
  | "interactive";

export type AnimationMount = "wiki" | "panel" | "graph-attached";

export interface AnimationRef {
  name: string;
  format: AnimationFormat;
  /** Path relative to `features/animations/` or `public/animations/`. */
  path: string;
  /** Optional wiki entity slug linking this animation to an entity page. */
  entity?: string;
  /** Optional caption rendered beneath the embed. */
  caption?: string;
  /** Mount modes that accept this animation (default: ["wiki"]). */
  mounts?: AnimationMount[];
}

const entries = manifestData as unknown as AnimationRef[];
const byName = new Map<string, AnimationRef>(entries.map((a) => [a.name, a]));

export function getAnimationRef(name: string): AnimationRef | undefined {
  return byName.get(name);
}

export function getAnimationsForEntity(slug: string): AnimationRef[] {
  return entries.filter((a) => a.entity === slug);
}

export function listAnimations(): AnimationRef[] {
  return entries;
}
