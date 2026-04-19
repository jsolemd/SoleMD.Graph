import type * as THREE from "three";
import {
  FieldGeometry,
  type ImageLikeData,
  type TextureGeometryOptions,
} from "./field-geometry";

// Async wrapper over `FieldGeometry.fromTexture`. Accepts a URL string, an
// already-decoded HTMLImageElement / ImageBitmap, or a raw `ImageLikeData`
// (useful for jsdom tests). Defaults to Maze's red-channel threshold so
// pcb.png-style inputs round-trip without option tuning. Source: Maze's
// `fromTexture` routine at scripts.pretty.js:42676-42722.

export interface ImagePointSourceOptions extends TextureGeometryOptions {
  // Matches Maze's explicit image-loading defaults. Callers override for
  // diagram-style inputs (textureScale: 0.5, thickness: 0, layers: 1,
  // gridRandomness: 0) or photo-style inputs (channel: "luma").
}

export type ImagePointSourceInput =
  | string
  | HTMLImageElement
  | ImageBitmap
  | ImageLikeData;

function isImageLikeData(value: unknown): value is ImageLikeData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ImageLikeData>;
  return (
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    candidate.data instanceof Uint8ClampedArray
  );
}

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("createImagePointGeometry requires a DOM Image"));
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`createImagePointGeometry failed to load ${url}`));
    image.src = url;
  });
}

function rasterizeToImageData(
  source: HTMLImageElement | ImageBitmap,
): ImageLikeData {
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!width || !height) {
    throw new Error("createImagePointGeometry: image has zero dimensions");
  }

  // Prefer OffscreenCanvas when available (workers, modern browsers), fall
  // back to DOM canvas. jsdom tests use the ImageLikeData shortcut and never
  // hit this path.
  const OffscreenCanvasCtor =
    typeof OffscreenCanvas !== "undefined" ? OffscreenCanvas : null;
  const canvas = OffscreenCanvasCtor
    ? new OffscreenCanvasCtor(width, height)
    : document.createElement("canvas");
  if (!(canvas instanceof OffscreenCanvas)) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!context) {
    throw new Error("createImagePointGeometry: 2D context unavailable");
  }
  context.drawImage(source, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return {
    width: imageData.width,
    height: imageData.height,
    data: imageData.data,
  };
}

export async function createImagePointGeometry(
  source: ImagePointSourceInput,
  options?: ImagePointSourceOptions,
): Promise<THREE.BufferGeometry> {
  let imageLike: ImageLikeData;
  if (isImageLikeData(source)) {
    imageLike = source;
  } else if (typeof source === "string") {
    const element = await loadImageElement(source);
    imageLike = rasterizeToImageData(element);
  } else {
    imageLike = rasterizeToImageData(source);
  }

  return FieldGeometry.fromTexture(imageLike, options);
}
