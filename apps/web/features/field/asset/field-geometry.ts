import * as THREE from "three";

// Point-cloud geometry factories that match Maze's `jo.generate`,
// `jo.fromTexture`, and `jo.fromVertices` behavior. Each returns a
// THREE.BufferGeometry with only `position` populated; run
// `bakeFieldAttributes` afterwards to fill motion/funnel/bucket attributes.
// Source: scripts.pretty.js:42666-42917.

export interface SphereGeometryOptions {
  count?: number;
  radius?: number;
  random?: () => number;
}

export interface StreamGeometryOptions {
  count?: number;
  spread?: number;
  random?: () => number;
}

export interface TextureChannelFn {
  (r: number, g: number, b: number, a: number): number;
}

// Duck-typed ImageData for jsdom test environments where the DOM
// ImageData constructor isn't always available.
export interface ImageLikeData {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface TextureGeometryOptions {
  appendExtents?: boolean;
  textureScale?: number;
  gridRandomness?: number;
  thickness?: number;
  layers?: number;
  spreadFirstLayer?: boolean;
  colorThreshold?: number;
  channel?: "r" | "g" | "b" | "a" | "luma";
  random?: () => number;
}

export interface VerticesGeometryOptions {
  countFactor?: number;
  positionRandomness?: number;
  random?: () => number;
}

const DEFAULT_SPHERE_COUNT = 16384;
const DEFAULT_STREAM_COUNT = 15000;
const DEFAULT_STREAM_SPREAD = 4;
const DEFAULT_TEXTURE_SCALE = 1.5;
const DEFAULT_GRID_RANDOMNESS = 0.5;
const DEFAULT_THICKNESS = 10;
const DEFAULT_LAYERS = 1;
const DEFAULT_APPEND_EXTENTS = true;
const DEFAULT_COLOR_THRESHOLD = 200;
const DEFAULT_COUNT_FACTOR = 1;
const DEFAULT_POSITION_RANDOMNESS = 0.01;
const DEFAULT_SPREAD_FIRST_LAYER = false;

function rejectionSampleSpherePoint(random: () => number) {
  // Maze's `getPoint` rejection-samples inside a unit cube, discards the
  // origin, and normalizes. Reproducing that gives uniform surface coverage
  // without pole bias.
  while (true) {
    const x = random() * 2 - 1;
    const y = random() * 2 - 1;
    const z = random() * 2 - 1;
    const length = Math.hypot(x, y, z);
    if (length > 1 || length === 0) continue;
    return [x / length, y / length, z / length] as const;
  }
}

function sphere({
  count = DEFAULT_SPHERE_COUNT,
  radius = 1,
  random = Math.random,
}: SphereGeometryOptions = {}): THREE.BufferGeometry {
  const position = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const [x, y, z] = rejectionSampleSpherePoint(random);
    position[i * 3] = x * radius;
    position[i * 3 + 1] = y * radius;
    position[i * 3 + 2] = z * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  return geometry;
}

function stream({
  count = DEFAULT_STREAM_COUNT,
  spread = DEFAULT_STREAM_SPREAD,
  random = Math.random,
}: StreamGeometryOptions = {}): THREE.BufferGeometry {
  const position = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    // Maze seeds stream points along x in [-2, 2] with y = z = 0. Funnel
    // shaping happens in the shader, not at bake time.
    position[i * 3] = (random() - 0.5) * spread;
    position[i * 3 + 1] = 0;
    position[i * 3 + 2] = 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  return geometry;
}

function sampleChannel(
  data: Uint8ClampedArray | Uint8Array,
  offset: number,
  channel: TextureGeometryOptions["channel"],
): number {
  const r = data[offset] ?? 0;
  const g = data[offset + 1] ?? 0;
  const b = data[offset + 2] ?? 0;
  const a = data[offset + 3] ?? 0;
  switch (channel) {
    case "g":
      return g;
    case "b":
      return b;
    case "a":
      return a;
    case "luma":
      // BT.601 luma. SoleMD extension: `channel: 'luma'` reads arbitrary
      // medical/diagram inputs where the red channel is not diagnostic.
      return 0.299 * r + 0.587 * g + 0.114 * b;
    case "r":
    default:
      return r;
  }
}

function fromTexture(
  image: ImageLikeData,
  {
    appendExtents = DEFAULT_APPEND_EXTENTS,
    textureScale = DEFAULT_TEXTURE_SCALE,
    gridRandomness = DEFAULT_GRID_RANDOMNESS,
    thickness = DEFAULT_THICKNESS,
    layers = DEFAULT_LAYERS,
    spreadFirstLayer = DEFAULT_SPREAD_FIRST_LAYER,
    colorThreshold = DEFAULT_COLOR_THRESHOLD,
    channel = "r",
    random = Math.random,
  }: TextureGeometryOptions = {},
): THREE.BufferGeometry {
  const width = image.width;
  const height = image.height;
  const scaledWidth = Math.max(1, Math.round(width * textureScale));
  const scaledHeight = Math.max(1, Math.round(height * textureScale));
  const invScale = 1 / textureScale;
  const points: number[] = [];

  // Maze flips the canvas on load (`ctx.scale(1, -1)`) so y=0 is top. We
  // operate directly in image-space and flip y during emission.
  for (let sy = 0; sy < scaledHeight; sy += 1) {
    for (let sx = 0; sx < scaledWidth; sx += 1) {
      const sourceX = Math.min(width - 1, Math.floor(sx * invScale));
      const sourceY = Math.min(height - 1, Math.floor(sy * invScale));
      const offset = (sourceY * width + sourceX) * 4;
      const sample = sampleChannel(image.data, offset, channel);
      if (sample <= colorThreshold) continue;

      for (let layer = 0; layer < layers; layer += 1) {
        const jitterX = (random() - 0.5) * gridRandomness;
        const jitterY = (random() - 0.5) * gridRandomness;
        const depth = spreadFirstLayer
          ? random() * thickness * (layer + 1)
          : layer === 0
            ? 0
            : (1 + random()) * thickness * layer;
        const x = sx + jitterX;
        // flip y: `-sy` so y=0 is top-of-image.
        const y = -sy + jitterY;
        points.push(x, y, depth);
        points.push(x, y, -depth);
      }
    }
  }

  if (appendExtents) {
    points.push(0, 0, 0);
    points.push(width, height, 0);
  }

  const position = new Float32Array(points);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  return geometry;
}

function fromVertices(
  sourcePositions: Float32Array,
  {
    countFactor = DEFAULT_COUNT_FACTOR,
    positionRandomness = DEFAULT_POSITION_RANDOMNESS,
    random = Math.random,
  }: VerticesGeometryOptions = {},
): THREE.BufferGeometry {
  const vertexCount = sourcePositions.length / 3;
  const wholeLoops = Math.ceil(countFactor);
  const remainder = countFactor - Math.floor(countFactor);
  const estimated = Math.ceil(vertexCount * countFactor) + 8;
  const buffer: number[] = new Array(estimated * 3);
  let writeIndex = 0;

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const vx = sourcePositions[vertexIndex * 3]!;
    const vy = sourcePositions[vertexIndex * 3 + 1]!;
    const vz = sourcePositions[vertexIndex * 3 + 2]!;

    for (let loop = 0; loop < wholeLoops; loop += 1) {
      // Maze: on the trailing partial loop skip when the fractional threshold
      // is not met. For whole countFactor values (1, 2, 5, …) remainder is 0
      // and the condition `remainder > 0 && random() >= remainder` is false,
      // so every loop emits.
      const isTrailingPartial = loop === wholeLoops - 1 && remainder > 0;
      if (isTrailingPartial && random() >= remainder) continue;

      buffer[writeIndex++] = vx + (random() - 0.5) * positionRandomness;
      buffer[writeIndex++] = vy + (random() - 0.5) * positionRandomness;
      buffer[writeIndex++] = vz + (random() - 0.5) * positionRandomness;
    }
  }

  const position = new Float32Array(buffer.slice(0, writeIndex));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  return geometry;
}

export const FieldGeometry = {
  sphere,
  stream,
  fromTexture,
  fromVertices,
} as const;
