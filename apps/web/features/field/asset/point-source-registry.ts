import { BufferAttribute, BufferGeometry, Color } from "three";
import type * as THREE from "three";
import {
  bakeFieldAttributes,
  buildBucketIndex,
  SOLEMD_DEFAULT_BUCKETS,
  type FieldSemanticBucket,
} from "./field-attribute-baker";
import { FieldGeometry } from "./field-geometry";
import { SOLEMD_BURST_COLORS } from "../scene/accent-palette";
import {
  FIELD_STAGE_ITEM_IDS,
  type FieldStageItemId,
} from "../scene/visual-presets";
import type {
  FieldPointSource,
  FieldPointSourceBuffers,
  PrewarmFieldPointSourcesOptions,
  ResolveFieldPointSourcesOptions,
} from "./point-source-types";

const FIELD_SEED = 20260418;
const BLOB_POINT_COUNT = 16384;
const STREAM_POINT_COUNT_DESKTOP = 15000;
const STREAM_POINT_COUNT_MOBILE = 10000;
const OBJECT_FORMATION_BITMAP_WIDTH = 72;
const OBJECT_FORMATION_BITMAP_HEIGHT = 46;

// SoleMD bucket -> hotspot-sampling color mapping. The shader itself no
// longer reads the `color` attribute (Maze never did); we bake it so
// legacy consumers like `getPointColorCss` can still tag hotspots with a
// sensible semantic hue. Resolves through the shared `SOLEMD_BURST_COLORS`
// map so every bucket id (Maze ambient or SoleMD semantic) has one
// canonical hex.
const BUCKET_COLORS: Record<string, Color> = Object.fromEntries(
  SOLEMD_DEFAULT_BUCKETS.map((bucket) => [
    bucket.id,
    new Color(SOLEMD_BURST_COLORS[bucket.id] ?? "#EFF0F0"),
  ]),
);

const BUCKET_INDEX = buildBucketIndex(SOLEMD_DEFAULT_BUCKETS);
const BUCKET_INDEX_TO_COLOR = SOLEMD_DEFAULT_BUCKETS.map(
  (bucket) => BUCKET_COLORS[bucket.id]!,
);

interface RandomSource {
  (): number;
}

// Per-(environment, id) lazy cache so surfaces that only need a subset of
// layers (e.g. the landing's blob-only field) don't pay the parse/bake
// cost for stream + objectFormation.
class FieldPointSourceRegistry {
  private readonly cache = new Map<string, FieldPointSource>();

  clear() {
    this.cache.clear();
  }

  prewarm(options: PrewarmFieldPointSourcesOptions) {
    this.resolve(options);
  }

  resolve({
    densityScale,
    isMobile,
    ids = FIELD_STAGE_ITEM_IDS,
  }: ResolveFieldPointSourcesOptions & {
    ids?: readonly FieldStageItemId[];
  }): Record<FieldStageItemId, FieldPointSource> {
    const density = roundDensityScale(densityScale);
    const envKey = `${isMobile ? "mobile" : "desktop"}:${density.toFixed(2)}`;
    const resolved = {} as Record<
      FieldStageItemId,
      FieldPointSource
    >;
    for (const id of ids) {
      const cacheKey = `${envKey}:${id}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        resolved[id] = cached;
        continue;
      }
      const random = createRandomSource(
        FIELD_SEED +
          (isMobile ? 1000 : 0) +
          Math.round(density * 100) +
          idOffset(id),
      );
      const source = buildSource(id, random, { density, isMobile });
      this.cache.set(cacheKey, source);
      resolved[id] = source;
    }
    return resolved;
  }
}

const ID_OFFSETS: Record<FieldStageItemId, number> = {
  blob: 0,
  stream: 1,
  objectFormation: 2,
};

function idOffset(id: FieldStageItemId): number {
  return ID_OFFSETS[id];
}

function buildSource(
  id: FieldStageItemId,
  random: RandomSource,
  { density, isMobile }: { density: number; isMobile: boolean },
): FieldPointSource {
  if (id === "blob") return createBlobSource(BLOB_POINT_COUNT, random);
  if (id === "stream") {
    const target = Math.max(
      3600,
      Math.round(
        (isMobile ? STREAM_POINT_COUNT_MOBILE : STREAM_POINT_COUNT_DESKTOP) *
          density,
      ),
    );
    return createStreamSource(target, random);
  }
  return createObjectFormationSource(random);
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

function extractAttribute(
  geometry: THREE.BufferGeometry,
  name: string,
): Float32Array {
  const attribute = geometry.getAttribute(name) as
    | THREE.BufferAttribute
    | undefined;
  if (!attribute) {
    throw new Error(`field geometry is missing attribute "${name}"`);
  }
  return attribute.array as Float32Array;
}

function deriveColorBuffer(aBucket: Float32Array): Float32Array {
  const count = aBucket.length;
  const color = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const bucketColor =
      BUCKET_INDEX_TO_COLOR[aBucket[i]!] ?? BUCKET_INDEX_TO_COLOR[0]!;
    color[i * 3] = bucketColor.r;
    color[i * 3 + 1] = bucketColor.g;
    color[i * 3 + 2] = bucketColor.b;
  }
  return color;
}

function bakeGeometryAttributes(
  geometry: THREE.BufferGeometry,
  random: RandomSource,
  buckets: readonly FieldSemanticBucket[] = SOLEMD_DEFAULT_BUCKETS,
): FieldPointSourceBuffers {
  bakeFieldAttributes(geometry, { random, buckets });
  const aBucket = extractAttribute(geometry, "aBucket");
  return {
    position: extractAttribute(geometry, "position"),
    aMove: extractAttribute(geometry, "aMove"),
    aSpeed: extractAttribute(geometry, "aSpeed"),
    aRandomness: extractAttribute(geometry, "aRandomness"),
    aAlpha: extractAttribute(geometry, "aAlpha"),
    aSelection: extractAttribute(geometry, "aSelection"),
    aIndex: extractAttribute(geometry, "aIndex"),
    aStreamFreq: extractAttribute(geometry, "aStreamFreq"),
    aFunnelThickness: extractAttribute(geometry, "aFunnelThickness"),
    aFunnelNarrow: extractAttribute(geometry, "aFunnelNarrow"),
    aFunnelStartShift: extractAttribute(geometry, "aFunnelStartShift"),
    aFunnelEndShift: extractAttribute(geometry, "aFunnelEndShift"),
    aBucket,
    aClickPack: extractAttribute(geometry, "aClickPack"),
    color: deriveColorBuffer(aBucket),
  };
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

function createBlobSource(
  pointCount: number,
  random: RandomSource,
): FieldPointSource {
  const geometry = FieldGeometry.sphere({ count: pointCount, random });
  const buffers = bakeGeometryAttributes(geometry, random);
  return {
    id: "blob",
    pointCount,
    buffers,
    bounds: computeBounds(buffers.position),
  };
}

function createStreamSource(
  pointCount: number,
  random: RandomSource,
): FieldPointSource {
  const geometry = FieldGeometry.stream({ count: pointCount, random });
  const buffers = bakeGeometryAttributes(geometry, random);
  return {
    id: "stream",
    pointCount,
    buffers,
    bounds: computeBounds(buffers.position),
  };
}

function createBitmap(width: number, height: number) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => false),
  );
}

function paintHorizontal(
  bitmap: boolean[][],
  y: number,
  fromX: number,
  toX: number,
  thickness = 1,
) {
  for (
    let row = Math.max(0, y - thickness);
    row <= Math.min(bitmap.length - 1, y + thickness);
    row += 1
  ) {
    for (
      let column = Math.max(0, fromX);
      column <= Math.min(bitmap[row]!.length - 1, toX);
      column += 1
    ) {
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
  for (
    let row = Math.max(0, fromY);
    row <= Math.min(bitmap.length - 1, toY);
    row += 1
  ) {
    for (
      let column = Math.max(0, x - thickness);
      column <= Math.min(bitmap[row]!.length - 1, x + thickness);
      column += 1
    ) {
      bitmap[row]![column] = true;
    }
  }
}

function paintPad(
  bitmap: boolean[][],
  centerX: number,
  centerY: number,
  radius = 2,
) {
  for (
    let row = Math.max(0, centerY - radius);
    row <= Math.min(bitmap.length - 1, centerY + radius);
    row += 1
  ) {
    for (
      let column = Math.max(0, centerX - radius);
      column <= Math.min(bitmap[row]!.length - 1, centerX + radius);
      column += 1
    ) {
      const dx = column - centerX;
      const dy = row - centerY;
      if (Math.hypot(dx, dy) <= radius + 0.35) {
        bitmap[row]![column] = true;
      }
    }
  }
}

function buildObjectFormationBitmap() {
  const bitmap = createBitmap(
    OBJECT_FORMATION_BITMAP_WIDTH,
    OBJECT_FORMATION_BITMAP_HEIGHT,
  );

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

function createObjectFormationSource(
  random: RandomSource,
): FieldPointSource {
  const bitmap = buildObjectFormationBitmap();
  const width = bitmap[0]!.length;
  const height = bitmap.length;
  const points: number[] = [];

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (!bitmap[row]![column]) continue;

      const x = (column / (width - 1) - 0.5) * 2.2;
      const y = (0.5 - row / (height - 1)) * 1.45;
      const depth = 0.06 + random() * 0.14;

      points.push(x + (random() - 0.5) * 0.018, y + (random() - 0.5) * 0.018, depth);
      points.push(x + (random() - 0.5) * 0.018, y + (random() - 0.5) * 0.018, -depth);
    }
  }

  const pointCount = points.length / 3;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(points), 3),
  );

  const buffers = bakeGeometryAttributes(geometry, random);
  return {
    id: "objectFormation",
    pointCount,
    buffers,
    bounds: computeBounds(buffers.position),
  };
}

function roundDensityScale(value: number) {
  return Math.max(0.55, Math.min(1, Math.round(value * 100) / 100));
}

export function resolveFieldPointSources(
  options: ResolveFieldPointSourcesOptions & {
    ids?: readonly FieldStageItemId[];
  },
) {
  return fieldPointSourceRegistry.resolve(options);
}

export function prewarmFieldPointSources(
  options: PrewarmFieldPointSourcesOptions,
) {
  fieldPointSourceRegistry.prewarm(options);
}

export const fieldPointSourceRegistry = new FieldPointSourceRegistry();

export const FIELD_BUCKET_INDEX = BUCKET_INDEX;
export { SOLEMD_DEFAULT_BUCKETS } from "./field-attribute-baker";
