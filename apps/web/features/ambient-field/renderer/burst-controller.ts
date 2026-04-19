import { Color, type ShaderMaterial } from "three";
import {
  createUniformScrubber,
  type UniformScrubber,
} from "../scroll/ambient-field-uniform-scrubber";

export type BurstUniformKey = "strength";

export interface BurstControllerOptions {
  bucketIndex: Record<string, number>;
  semanticColorMap: Record<string, string>;
  regionScale?: number;
  softness?: number;
  scrubber?: UniformScrubber<BurstUniformKey>;
  halfLifeMs?: number;
}

export interface BurstController {
  setActive(bucketId: string | null, strength: number): void;
  step(dtMs: number): void;
  apply(material: ShaderMaterial): void;
  readonly snapshot: {
    type: number;
    strength: number;
    color: Color;
    regionScale: number;
    softness: number;
  };
}

const DEFAULT_REGION_SCALE = 1.2;
const DEFAULT_SOFTNESS = 0.2;

// CPU-side driver for the burst shader block. Holds the current active
// bucket + target strength, scrubs strength toward target with a 1 s
// half-life low-pass, and pushes the result into a ShaderMaterial's
// burst uniforms each `apply()`.
export function createBurstController(
  options: BurstControllerOptions,
): BurstController {
  const regionScale = options.regionScale ?? DEFAULT_REGION_SCALE;
  const softness = options.softness ?? DEFAULT_SOFTNESS;
  const scrubber =
    options.scrubber ??
    createUniformScrubber<BurstUniformKey>({
      halfLifeMs: options.halfLifeMs ?? 1000,
      initial: { strength: 0 },
    });

  const colorCache = new Map<string, Color>();
  const resolveColor = (bucketId: string): Color => {
    const cached = colorCache.get(bucketId);
    if (cached) return cached;
    const hex = options.semanticColorMap[bucketId] ?? "#ffffff";
    const color = new Color(hex);
    colorCache.set(bucketId, color);
    return color;
  };

  let activeBucketId: string | null = null;
  let targetStrength = 0;
  const snapshot = {
    type: -1,
    strength: 0,
    color: new Color("#000000"),
    regionScale,
    softness,
  };

  function setActive(bucketId: string | null, strength: number) {
    activeBucketId = bucketId;
    targetStrength = bucketId == null ? 0 : Math.max(0, Math.min(1, strength));
  }

  function step(dtMs: number) {
    const { strength } = scrubber.step(dtMs, { strength: targetStrength });
    snapshot.strength = strength;
    if (activeBucketId == null) {
      snapshot.type = -1;
      // Keep last color so the tail-off lerp renders the correct hue.
    } else {
      const index = options.bucketIndex[activeBucketId];
      snapshot.type = typeof index === "number" ? index : -1;
      snapshot.color.copy(resolveColor(activeBucketId));
    }
  }

  function apply(material: ShaderMaterial) {
    const uniforms = material.uniforms;
    if (!uniforms) return;
    if (uniforms.uBurstType) uniforms.uBurstType.value = snapshot.type;
    if (uniforms.uBurstStrength) uniforms.uBurstStrength.value = snapshot.strength;
    if (uniforms.uBurstColor) uniforms.uBurstColor.value.copy(snapshot.color);
    if (uniforms.uBurstRegionScale)
      uniforms.uBurstRegionScale.value = snapshot.regionScale;
    if (uniforms.uBurstSoftness)
      uniforms.uBurstSoftness.value = snapshot.softness;
  }

  return { setActive, step, apply, snapshot };
}
