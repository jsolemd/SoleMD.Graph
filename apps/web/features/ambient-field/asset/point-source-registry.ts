import { Color } from "three";
import { semanticColorFallbackHexByKey } from "@/lib/pastel-tokens";
import type {
  AmbientFieldPointSource,
  AmbientFieldPointSourceBuffers,
  ResolveAmbientFieldPointSourcesOptions,
} from "./point-source-types";

const FIELD_SEED = 20260418;
const BLOB_POINT_COUNT = 16384;
const STREAM_POINT_COUNT_DESKTOP = 15000;
const STREAM_POINT_COUNT_MOBILE = 10000;
const PCB_WIDTH = 72;
const PCB_HEIGHT = 46;

const paletteWeights = [
  { color: new Color(semanticColorFallbackHexByKey.paper), weight: 0.05 },
  { color: new Color(semanticColorFallbackHexByKey.phys), weight: 0.3 },
  { color: new Color(semanticColorFallbackHexByKey.chem), weight: 0.3 },
  { color: new Color(semanticColorFallbackHexByKey.gene), weight: 0.18 },
  { color: new Color(semanticColorFallbackHexByKey.diso), weight: 0.17 },
] as const;

interface RandomSource {
  (): number;
}

interface StreamProfile {
  funnelEndShift: number;
  funnelNarrow: number;
  funnelStartShift: number;
  funnelThickness: number;
  streamFreq: number;
}

const streamProfiles: readonly StreamProfile[] = [
  {
    funnelEndShift: 0.29,
    funnelNarrow: 0.03,
    funnelStartShift: 0.42,
    funnelThickness: 0.1,
    streamFreq: 0.1,
  },
  {
    funnelEndShift: -0.06,
    funnelNarrow: 0.04,
    funnelStartShift: 0.28,
    funnelThickness: 0.14,
    streamFreq: -0.2,
  },
  {
    funnelEndShift: -0.29,
    funnelNarrow: 0.05,
    funnelStartShift: 0.1,
    funnelThickness: 0.18,
    streamFreq: -1.4,
  },
  {
    funnelEndShift: -0.4,
    funnelNarrow: 0.18,
    funnelStartShift: -0.25,
    funnelThickness: 0.55,
    streamFreq: 0.5,
  },
] as const;

class AmbientFieldPointSourceRegistry {
  private readonly cache = new Map<string, Record<string, AmbientFieldPointSource>>();

  clear() {
    this.cache.clear();
  }

  prewarm(options: ResolveAmbientFieldPointSourcesOptions) {
    this.resolve(options);
  }

  resolve({ densityScale, isMobile }: ResolveAmbientFieldPointSourcesOptions) {
    const density = roundDensityScale(densityScale);
    const cacheKey = `${isMobile ? "mobile" : "desktop"}:${density.toFixed(2)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const random = createRandomSource(
      FIELD_SEED + (isMobile ? 1000 : 0) + Math.round(density * 100),
    );
    const sources = {
      // Maze keeps the blob shell at a fixed point count and thins via
      // selection during scroll-driven choreography, not via geometry swaps.
      blob: createBlobSource(BLOB_POINT_COUNT, random),
      stream: createStreamSource(
        Math.max(
          3600,
          Math.round(
            (isMobile ? STREAM_POINT_COUNT_MOBILE : STREAM_POINT_COUNT_DESKTOP) *
              density,
          ),
        ),
        random,
      ),
      pcb: createPcbSource(random),
    } satisfies Record<string, AmbientFieldPointSource>;

    this.cache.set(cacheKey, sources);
    return sources;
  }
}

function createRandomSource(seed: number): RandomSource {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createBuffers(pointCount: number): AmbientFieldPointSourceBuffers {
  return {
    position: new Float32Array(pointCount * 3),
    color: new Float32Array(pointCount * 3),
    aMove: new Float32Array(pointCount * 3),
    aSpeed: new Float32Array(pointCount * 3),
    aRandomness: new Float32Array(pointCount * 3),
    aIndex: new Float32Array(pointCount),
    aAlpha: new Float32Array(pointCount),
    aSelection: new Float32Array(pointCount),
    aStreamFreq: new Float32Array(pointCount),
    aFunnelNarrow: new Float32Array(pointCount),
    aFunnelThickness: new Float32Array(pointCount),
    aFunnelStartShift: new Float32Array(pointCount),
    aFunnelEndShift: new Float32Array(pointCount),
  };
}

function writeColor(
  buffers: AmbientFieldPointSourceBuffers,
  index: number,
  color: Color,
) {
  buffers.color[index * 3] = color.r;
  buffers.color[index * 3 + 1] = color.g;
  buffers.color[index * 3 + 2] = color.b;
}

function pickWeightedColor(random: RandomSource): Color {
  const total = paletteWeights.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random() * total;

  for (const entry of paletteWeights) {
    cursor -= entry.weight;
    if (cursor <= 0) {
      const color = entry.color.clone();
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      const lightness = hsl.l - 0.01 + random() * 0.02;
      color.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, lightness)));
      return color;
    }
  }

  return paletteWeights[0].color.clone();
}

function applySharedAttributes(
  buffers: AmbientFieldPointSourceBuffers,
  index: number,
  random: RandomSource,
  alphaRange: [number, number],
  streamProfile?: StreamProfile,
) {
  buffers.aIndex[index] = index;
  buffers.aAlpha[index] = alphaRange[0] + random() * (alphaRange[1] - alphaRange[0]);
  buffers.aSelection[index] = random();

  buffers.aMove[index * 3] = (random() * 2 - 1) * 30;
  buffers.aMove[index * 3 + 1] = (random() * 2 - 1) * 30;
  buffers.aMove[index * 3 + 2] = (random() * 2 - 1) * 30;

  buffers.aSpeed[index * 3] = random();
  buffers.aSpeed[index * 3 + 1] = random();
  buffers.aSpeed[index * 3 + 2] = random();

  buffers.aRandomness[index * 3] = 0;
  buffers.aRandomness[index * 3 + 1] = (random() * 2 - 1);
  buffers.aRandomness[index * 3 + 2] = (random() * 2 - 1) * 0.5;

  if (!streamProfile) return;

  buffers.aStreamFreq[index] = streamProfile.streamFreq;
  buffers.aFunnelNarrow[index] = streamProfile.funnelNarrow;
  buffers.aFunnelThickness[index] = streamProfile.funnelThickness;
  buffers.aFunnelStartShift[index] = streamProfile.funnelStartShift;
  buffers.aFunnelEndShift[index] = streamProfile.funnelEndShift;
}

function computeBounds(position: Float32Array) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < position.length; index += 3) {
    const x = position[index]!;
    const y = position[index + 1]!;
    const z = position[index + 2]!;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function sampleSpherePoint(random: RandomSource) {
  while (true) {
    const x = random() * 2 - 1;
    const y = random() * 2 - 1;
    const z = random() * 2 - 1;
    const length = Math.hypot(x, y, z);
    if (length > 1 || length === 0) continue;

    return {
      x: x / length,
      y: y / length,
      z: z / length,
    };
  }
}

function createBlobSource(pointCount: number, random: RandomSource): AmbientFieldPointSource {
  const buffers = createBuffers(pointCount);

  for (let index = 0; index < pointCount; index += 1) {
    const point = sampleSpherePoint(random);
    const radiusBias = 1;

    buffers.position[index * 3] = point.x * radiusBias;
    buffers.position[index * 3 + 1] = point.y * radiusBias;
    buffers.position[index * 3 + 2] = point.z * radiusBias;

    writeColor(buffers, index, pickWeightedColor(random));
    applySharedAttributes(
      buffers,
      index,
      random,
      [0.2, 1],
    );
  }

  return {
    id: "blob",
    pointCount,
    buffers,
    bounds: computeBounds(buffers.position),
  };
}

function selectStreamProfile(random: RandomSource): StreamProfile {
  const sample = random();
  if (sample > 0.3) return streamProfiles[3]!;
  const branch = random();
  if (branch <= 0.15) return streamProfiles[0]!;
  if (branch <= 0.4) return streamProfiles[1]!;
  return streamProfiles[2]!;
}

function createStreamSource(
  pointCount: number,
  random: RandomSource,
): AmbientFieldPointSource {
  const buffers = createBuffers(pointCount);

  for (let index = 0; index < pointCount; index += 1) {
    const x = (random() - 0.5) * 4;
    buffers.position[index * 3] = x;
    buffers.position[index * 3 + 1] = 0;
    buffers.position[index * 3 + 2] = 0;

    writeColor(buffers, index, pickWeightedColor(random));
    applySharedAttributes(
      buffers,
      index,
      random,
      [0.2, 1],
      selectStreamProfile(random),
    );
  }

  return {
    id: "stream",
    pointCount,
    buffers,
    bounds: computeBounds(buffers.position),
  };
}

function createBitmap(width: number, height: number) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => false));
}

function paintHorizontal(
  bitmap: boolean[][],
  y: number,
  fromX: number,
  toX: number,
  thickness = 1,
) {
  for (let row = Math.max(0, y - thickness); row <= Math.min(bitmap.length - 1, y + thickness); row += 1) {
    for (let column = Math.max(0, fromX); column <= Math.min(bitmap[row]!.length - 1, toX); column += 1) {
      bitmap[row]![column] = true;
    }
  }
}

function paintVertical(
  bitmap: boolean[][],
  x: number,
  fromY: number,
  toY: number,
  thickness = 1,
) {
  for (let row = Math.max(0, fromY); row <= Math.min(bitmap.length - 1, toY); row += 1) {
    for (let column = Math.max(0, x - thickness); column <= Math.min(bitmap[row]!.length - 1, x + thickness); column += 1) {
      bitmap[row]![column] = true;
    }
  }
}

function paintPad(bitmap: boolean[][], centerX: number, centerY: number, radius = 2) {
  for (let row = Math.max(0, centerY - radius); row <= Math.min(bitmap.length - 1, centerY + radius); row += 1) {
    for (let column = Math.max(0, centerX - radius); column <= Math.min(bitmap[row]!.length - 1, centerX + radius); column += 1) {
      const dx = column - centerX;
      const dy = row - centerY;
      if (Math.hypot(dx, dy) <= radius + 0.35) {
        bitmap[row]![column] = true;
      }
    }
  }
}

function buildPcbBitmap() {
  const bitmap = createBitmap(PCB_WIDTH, PCB_HEIGHT);

  paintHorizontal(bitmap, 8, 6, 65, 1);
  paintHorizontal(bitmap, 16, 10, 55, 0);
  paintHorizontal(bitmap, 24, 6, 62, 1);
  paintHorizontal(bitmap, 34, 12, 66, 0);

  paintVertical(bitmap, 8, 6, 36, 1);
  paintVertical(bitmap, 20, 6, 28, 0);
  paintVertical(bitmap, 36, 4, 38, 1);
  paintVertical(bitmap, 54, 10, 38, 0);
  paintVertical(bitmap, 64, 8, 32, 1);

  paintHorizontal(bitmap, 12, 20, 36, 0);
  paintHorizontal(bitmap, 20, 36, 54, 0);
  paintHorizontal(bitmap, 30, 20, 54, 0);

  paintPad(bitmap, 8, 8, 2);
  paintPad(bitmap, 20, 8, 2);
  paintPad(bitmap, 36, 8, 3);
  paintPad(bitmap, 54, 8, 2);
  paintPad(bitmap, 64, 8, 2);
  paintPad(bitmap, 20, 24, 2);
  paintPad(bitmap, 36, 24, 3);
  paintPad(bitmap, 54, 24, 2);
  paintPad(bitmap, 12, 34, 2);
  paintPad(bitmap, 36, 34, 2);
  paintPad(bitmap, 64, 34, 2);

  return bitmap;
}

function createPcbSource(random: RandomSource): AmbientFieldPointSource {
  const bitmap = buildPcbBitmap();
  const width = bitmap[0]!.length;
  const height = bitmap.length;
  const points: number[] = [];

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (!bitmap[row]![column]) continue;

      const x = ((column / (width - 1)) - 0.5) * 2.2;
      const y = (0.5 - row / (height - 1)) * 1.45;
      const depth = 0.06 + random() * 0.14;

      points.push(x + (random() - 0.5) * 0.018, y + (random() - 0.5) * 0.018, depth);
      points.push(x + (random() - 0.5) * 0.018, y + (random() - 0.5) * 0.018, -depth);
    }
  }

  const pointCount = points.length / 3;
  const buffers = createBuffers(pointCount);
  buffers.position.set(points);

  for (let index = 0; index < pointCount; index += 1) {
    writeColor(buffers, index, pickWeightedColor(random));
    applySharedAttributes(
      buffers,
      index,
      random,
      [0.2, 1],
    );
  }

  return {
    id: "pcb",
    pointCount,
    buffers,
    bounds: computeBounds(buffers.position),
  };
}

function roundDensityScale(value: number) {
  return Math.max(0.55, Math.min(1, Math.round(value * 100) / 100));
}

export function resolveAmbientFieldPointSources({
  densityScale,
  isMobile,
}: ResolveAmbientFieldPointSourcesOptions) {
  return ambientFieldPointSourceRegistry.resolve({ densityScale, isMobile });
}

export function prewarmAmbientFieldPointSources(
  options: ResolveAmbientFieldPointSourcesOptions,
) {
  ambientFieldPointSourceRegistry.prewarm(options);
}

export const ambientFieldPointSourceRegistry = new AmbientFieldPointSourceRegistry();
