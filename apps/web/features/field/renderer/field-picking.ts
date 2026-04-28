"use client";

/**
 * GPU-ID picking for the field R3F surface (orb-mode).
 *
 * The picking material is passed per-call so this module has no hard
 * dependency on any specific shader. Field-mode supplies its own picking
 * material that encodes `aIndex` the same way.
 *
 * Encoding contract (must match the picking fragment shader that populates
 * the render target):
 *   R = idx & 0xff
 *   G = (idx >> 8) & 0xff
 *   B = (idx >> 16) & 0xff
 *   A = orb-relative view-depth bucket, 1..255 (0 distinguishes clear pixels)
 *
 * The picking render target is capped at `min(devicePixelRatio, 1.5)`.
 * DPR-3 readbacks are wasteful at 24-bit index precision; 1.5 covers
 * mid-tier retina without scaling cost.
 *
 * Click: sync 1px readback so the user sees an immediate selection result.
 * Rectangle selection: one async readback over the selected ID-buffer
 * bounds. Default policy keeps only the front visible depth slab;
 * Alt/Option-drag asks for the explicit through-volume mode.
 */

import * as THREE from "three";

export const PICK_NO_HIT = -1;
export type FieldPickRectMode = "front-slab" | "through-volume";

const PICK_DPR_CEILING = 1.5;
export const FIELD_RECT_FRONT_SLAB_DEPTH_BYTES = 24;
const PICK_BUFFER = new Uint8Array(4);

export interface FieldPickClientRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface FieldPickContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  pickingMaterial: THREE.Material;
  points: THREE.Points;
  canvasRect: DOMRect;
}

type FieldPickPointArgs = FieldPickContext & {
  clientX: number;
  clientY: number;
};

type FieldPickRectArgs = FieldPickContext & {
  clientRect: FieldPickClientRect;
  mode?: FieldPickRectMode;
};

export interface FieldPicker {
  /** Re-sizes the pick target to match the display canvas. */
  setSize: (width: number, height: number, dpr: number) => void;
  /** Sync readback — used for click. Blocks the render thread. */
  pickSync: (args: FieldPickPointArgs) => number;
  /** Async readback — used for hover; resolves on the next rAF. */
  pickAsync: (args: FieldPickPointArgs) => Promise<number>;
  /** Async bulk readback — used for rectangle selection. */
  pickRectAsync: (args: FieldPickRectArgs) => Promise<number[]>;
  /** Tear down the GPU render target + any cached buffers. */
  dispose: () => void;
}

export function createFieldPicker(): FieldPicker {
  let width = 1;
  let height = 1;
  let pickDpr = 1;
  let renderTarget: THREE.WebGLRenderTarget | null = new THREE.WebGLRenderTarget(
    1,
    1,
    {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    },
  );

  let asyncInFlight = false;

  const setSize = (nextWidth: number, nextHeight: number, dpr: number) => {
    width = Math.max(1, Math.floor(nextWidth));
    height = Math.max(1, Math.floor(nextHeight));
    pickDpr = Math.min(dpr, PICK_DPR_CEILING);
    if (renderTarget) {
      renderTarget.setSize(
        Math.max(1, Math.floor(width * pickDpr)),
        Math.max(1, Math.floor(height * pickDpr)),
      );
    }
  };

  const renderPickingPass = (args: FieldPickContext) => {
    if (!renderTarget) return null;
    const originalMaterial = args.points.material;
    args.points.material = args.pickingMaterial;

    const prevTarget = args.renderer.getRenderTarget();
    const prevClearColor = new THREE.Color();
    args.renderer.getClearColor(prevClearColor);
    const prevClearAlpha = args.renderer.getClearAlpha();
    try {
      args.renderer.setRenderTarget(renderTarget);
      args.renderer.setClearColor(0x000000, 0);
      args.renderer.clear();
      args.renderer.render(args.scene, args.camera);
    } finally {
      args.renderer.setRenderTarget(prevTarget);
      args.renderer.setClearColor(prevClearColor, prevClearAlpha);
      args.points.material = originalMaterial;
    }

    return renderTarget;
  };

  const getTextureSize = () => ({
    texWidth: Math.max(1, Math.floor(width * pickDpr)),
    texHeight: Math.max(1, Math.floor(height * pickDpr)),
  });

  const getPointCoords = (args: FieldPickPointArgs) => {
    // Map CSS (clientX/Y) to render-target coords. WebGL origin is
    // bottom-left; DOM is top-left, so flip Y.
    const localX = args.clientX - args.canvasRect.left;
    const localY = args.clientY - args.canvasRect.top;

    const { texWidth, texHeight } = getTextureSize();

    const rtX = Math.max(0, Math.min(texWidth - 1, Math.floor(localX * pickDpr)));
    const rtYFlipped = Math.max(
      0,
      Math.min(texHeight - 1, Math.floor((height - localY) * pickDpr)),
    );

    return { rtX, rtYFlipped };
  };

  const getRectBounds = (args: FieldPickRectArgs) => {
    const left = Math.max(
      0,
      Math.min(args.clientRect.left, args.clientRect.right) - args.canvasRect.left,
    );
    const right = Math.min(
      width,
      Math.max(args.clientRect.left, args.clientRect.right) - args.canvasRect.left,
    );
    const top = Math.max(
      0,
      Math.min(args.clientRect.top, args.clientRect.bottom) - args.canvasRect.top,
    );
    const bottom = Math.min(
      height,
      Math.max(args.clientRect.top, args.clientRect.bottom) - args.canvasRect.top,
    );

    if (right <= left || bottom <= top) return null;

    const { texWidth, texHeight } = getTextureSize();
    const rtX = Math.max(0, Math.min(texWidth - 1, Math.floor(left * pickDpr)));
    const rtRight = Math.max(
      rtX + 1,
      Math.min(texWidth, Math.ceil(right * pickDpr)),
    );
    const rtY = Math.max(
      0,
      Math.min(texHeight - 1, Math.floor((height - bottom) * pickDpr)),
    );
    const rtTop = Math.max(
      rtY + 1,
      Math.min(texHeight, Math.ceil((height - top) * pickDpr)),
    );

    return {
      rtX,
      rtY,
      rtWidth: rtRight - rtX,
      rtHeight: rtTop - rtY,
    };
  };

  const decodeSample = (
    buffer: Uint8Array,
    offset = 0,
  ): { index: number; depthByte: number } | null => {
    const depthByte = buffer[offset + 3]!;
    if (depthByte === 0) {
      return null;
    }
    const r = buffer[offset]!;
    const g = buffer[offset + 1]!;
    const b = buffer[offset + 2]!;
    return { index: r | (g << 8) | (b << 16), depthByte };
  };

  const decodeBuffer = (buffer: Uint8Array, offset = 0): number => {
    return decodeSample(buffer, offset)?.index ?? PICK_NO_HIT;
  };

  const decodeUniqueIndices = (buffer: Uint8Array): number[] => {
    const indices = new Set<number>();
    for (let offset = 0; offset < buffer.length; offset += 4) {
      const sample = decodeSample(buffer, offset);
      if (sample) indices.add(sample.index);
    }
    return Array.from(indices).sort((a, b) => a - b);
  };

  const decodeFrontSlabIndices = (buffer: Uint8Array): number[] => {
    let nearestDepth = 256;
    for (let offset = 0; offset < buffer.length; offset += 4) {
      const sample = decodeSample(buffer, offset);
      if (sample && sample.depthByte < nearestDepth) {
        nearestDepth = sample.depthByte;
      }
    }
    if (nearestDepth === 256) return [];

    const cutoff = Math.min(
      255,
      nearestDepth + FIELD_RECT_FRONT_SLAB_DEPTH_BYTES,
    );
    const indices = new Set<number>();
    for (let offset = 0; offset < buffer.length; offset += 4) {
      const sample = decodeSample(buffer, offset);
      if (sample && sample.depthByte <= cutoff) {
        indices.add(sample.index);
      }
    }
    return Array.from(indices).sort((a, b) => a - b);
  };

  const pickSync: FieldPicker["pickSync"] = (args) => {
    if (!renderTarget) return PICK_NO_HIT;
    const target = renderPickingPass(args);
    if (!target) return PICK_NO_HIT;
    const coords = getPointCoords(args);

    args.renderer.readRenderTargetPixels(
      target,
      coords.rtX,
      coords.rtYFlipped,
      1,
      1,
      PICK_BUFFER,
    );
    return decodeBuffer(PICK_BUFFER);
  };

  const pickAsync: FieldPicker["pickAsync"] = async (args) => {
    if (!renderTarget) return PICK_NO_HIT;
    if (asyncInFlight) {
      return PICK_NO_HIT;
    }
    asyncInFlight = true;
    try {
      const target = renderPickingPass(args);
      if (!target) return PICK_NO_HIT;
      const coords = getPointCoords(args);

      if (typeof args.renderer.readRenderTargetPixelsAsync === "function") {
        await args.renderer.readRenderTargetPixelsAsync(
          target,
          coords.rtX,
          coords.rtYFlipped,
          1,
          1,
          PICK_BUFFER,
        );
      } else {
        args.renderer.readRenderTargetPixels(
          target,
          coords.rtX,
          coords.rtYFlipped,
          1,
          1,
          PICK_BUFFER,
        );
      }

      return decodeBuffer(PICK_BUFFER);
    } finally {
      asyncInFlight = false;
    }
  };

  const pickRectAsync: FieldPicker["pickRectAsync"] = async (args) => {
    if (!renderTarget) return [];
    if (asyncInFlight) return [];
    asyncInFlight = true;
    try {
      const bounds = getRectBounds(args);
      if (!bounds) return [];
      const target = renderPickingPass(args);
      if (!target) return [];

      const buffer = new Uint8Array(bounds.rtWidth * bounds.rtHeight * 4);
      if (typeof args.renderer.readRenderTargetPixelsAsync === "function") {
        await args.renderer.readRenderTargetPixelsAsync(
          target,
          bounds.rtX,
          bounds.rtY,
          bounds.rtWidth,
          bounds.rtHeight,
          buffer,
        );
      } else {
        args.renderer.readRenderTargetPixels(
          target,
          bounds.rtX,
          bounds.rtY,
          bounds.rtWidth,
          bounds.rtHeight,
          buffer,
        );
      }

      return args.mode === "through-volume"
        ? decodeUniqueIndices(buffer)
        : decodeFrontSlabIndices(buffer);
    } finally {
      asyncInFlight = false;
    }
  };

  const dispose = () => {
    if (renderTarget) {
      renderTarget.dispose();
      renderTarget = null;
    }
  };

  return { setSize, pickSync, pickAsync, pickRectAsync, dispose };
}
