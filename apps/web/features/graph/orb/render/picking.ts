"use client";

/**
 * GPU-ID picking for the orb-dev surface.
 *
 * Encoding contract (mirrors shaders.ts PICKING_FRAGMENT_SHADER):
 *   R = idx & 0xff
 *   G = (idx >> 8) & 0xff
 *   B = (idx >> 16) & 0xff
 *   A = 255 (distinguishes hit from clear pixel)
 *
 * The picking render target is capped at `min(devicePixelRatio, 1.5)` per
 * the round-2 synthesis (Agent 1 finding): DPR-3 readbacks are wasteful at
 * 24-bit index precision — 1.5 covers mid-tier retina without scaling cost.
 *
 * Hover: throttled to one readback per rAF via readRenderTargetPixelsAsync.
 * Click: sync readback (`readRenderTargetPixels`) so the user sees an
 * immediate selection result.
 */

import * as THREE from "three";

export const PICK_NO_HIT = -1;

const PICK_DPR_CEILING = 1.5;
const PICK_BUFFER = new Uint8Array(4);

export interface OrbPicker {
  /** Re-sizes the pick target to match the display canvas. */
  setSize: (width: number, height: number, dpr: number) => void;
  /** Sync readback — used for click. Blocks the render thread. */
  pickSync: (args: {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
    pickingMaterial: THREE.Material;
    points: THREE.Points;
    clientX: number;
    clientY: number;
    canvasRect: DOMRect;
  }) => number;
  /** Async readback — used for hover; resolves on the next rAF. */
  pickAsync: (args: {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
    pickingMaterial: THREE.Material;
    points: THREE.Points;
    clientX: number;
    clientY: number;
    canvasRect: DOMRect;
  }) => Promise<number>;
  /** Tear down the GPU render target + any cached buffers. */
  dispose: () => void;
}

export function createOrbPicker(): OrbPicker {
  // Dimensions get set on first resize; 1x1 is a safe placeholder that
  // survives the first frame if picking is called before layout settles.
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

  const renderAndReadbackSetup = (args: {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
    pickingMaterial: THREE.Material;
    points: THREE.Points;
    clientX: number;
    clientY: number;
    canvasRect: DOMRect;
  }) => {
    if (!renderTarget) {
      return null;
    }

    // Swap the points' material for the picking pass; restore after.
    const originalMaterial = args.points.material;
    args.points.material = args.pickingMaterial;

    const prevTarget = args.renderer.getRenderTarget();
    args.renderer.setRenderTarget(renderTarget);
    args.renderer.clear();
    args.renderer.render(args.scene, args.camera);
    args.renderer.setRenderTarget(prevTarget);

    args.points.material = originalMaterial;

    // Map CSS (clientX/Y) to render-target coords. WebGL origin is
    // bottom-left; DOM is top-left, so flip Y.
    const localX = args.clientX - args.canvasRect.left;
    const localY = args.clientY - args.canvasRect.top;

    const texWidth = Math.max(1, Math.floor(width * pickDpr));
    const texHeight = Math.max(1, Math.floor(height * pickDpr));

    const rtX = Math.max(0, Math.min(texWidth - 1, Math.floor(localX * pickDpr)));
    const rtYFlipped = Math.max(
      0,
      Math.min(texHeight - 1, Math.floor((height - localY) * pickDpr)),
    );

    return { rtX, rtYFlipped };
  };

  const decodeBuffer = (buffer: Uint8Array): number => {
    // Clear / no-hit pixels have alpha=0. Any hit writes alpha=1.
    if (buffer[3]! < 255) {
      return PICK_NO_HIT;
    }
    const r = buffer[0]!;
    const g = buffer[1]!;
    const b = buffer[2]!;
    return r | (g << 8) | (b << 16);
  };

  const pickSync: OrbPicker["pickSync"] = (args) => {
    if (!renderTarget) return PICK_NO_HIT;
    const coords = renderAndReadbackSetup(args);
    if (!coords) return PICK_NO_HIT;

    args.renderer.readRenderTargetPixels(
      renderTarget,
      coords.rtX,
      coords.rtYFlipped,
      1,
      1,
      PICK_BUFFER,
    );
    return decodeBuffer(PICK_BUFFER);
  };

  const pickAsync: OrbPicker["pickAsync"] = async (args) => {
    if (!renderTarget) return PICK_NO_HIT;
    // Throttle: collapse back-to-back pointermove picks to one per frame.
    // The caller already throttles to rAF, so this is a cheap safety net.
    if (asyncInFlight) {
      return PICK_NO_HIT;
    }
    asyncInFlight = true;
    try {
      const coords = renderAndReadbackSetup(args);
      if (!coords) return PICK_NO_HIT;

      // readRenderTargetPixelsAsync was introduced in r169; older runtimes
      // fall back to the sync path (still safe — this is a PoC). Three.js
      // is pinned >= 0.169 in package.json.
      type RendererWithAsyncRead = THREE.WebGLRenderer & {
        readRenderTargetPixelsAsync?: (
          target: THREE.WebGLRenderTarget,
          x: number,
          y: number,
          w: number,
          h: number,
          buffer: Uint8Array,
        ) => Promise<void>;
      };
      const rendererAny = args.renderer as RendererWithAsyncRead;

      if (typeof rendererAny.readRenderTargetPixelsAsync === "function") {
        await rendererAny.readRenderTargetPixelsAsync(
          renderTarget,
          coords.rtX,
          coords.rtYFlipped,
          1,
          1,
          PICK_BUFFER,
        );
      } else {
        args.renderer.readRenderTargetPixels(
          renderTarget,
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

  const dispose = () => {
    if (renderTarget) {
      renderTarget.dispose();
      renderTarget = null;
    }
  };

  return { setSize, pickSync, pickAsync, dispose };
}
