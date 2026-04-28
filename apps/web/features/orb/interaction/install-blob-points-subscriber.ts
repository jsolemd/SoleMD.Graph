import type { BlobPointsSubscriber } from "@/features/field/renderer/FieldScene";
import {
  createFieldPicker,
  PICK_NO_HIT,
} from "@/features/field/renderer/field-picking";
import { createFieldPickingMaterial } from "@/features/field/renderer/field-picking-material";
import type { LayerUniforms } from "@/features/field/controller/FieldController";
import {
  useOrbPickerStore,
  type OrbPickerHandle,
} from "./orb-picker-store";

/**
 * Orb-mode blob-points subscriber. FieldScene invokes this once the blob
 * `<points>` and its display ShaderMaterial are attached to the scene
 * graph; it:
 *
 * 1. Creates a picking ShaderMaterial that shares the display uniforms'
 *    object references, so the picking pass sees the exact same uTime /
 *    uStream / uClickStrength / etc. as the display pass — no drift.
 * 2. Creates a `FieldPicker` (with its own WebGLRenderTarget).
 * 3. Enables layer bit 1 on blob's THREE.Points. `pickSync` saves the
 *    camera's current layer mask, calls `camera.layers.set(1)` so the
 *    pass renders ONLY blob (stream + objectFormation stay on layer 0),
 *    then restores the mask. This prevents non-blob layers from
 *    contaminating the ID buffer with their color/alpha writes.
 * 4. Publishes an `OrbPickerHandle` onto the orb picker store.
 *
 * Cleanup:
 * - Retracts the handle from the store via `clearHandleIfMatches` so
 *   an out-of-order StrictMode cleanup (mount A → mount B → cleanup A)
 *   doesn't nuke the freshly-published handle B.
 * - Disables blob's layer bit 1.
 * - Disposes the picker's render target and the picking material.
 */
export const installBlobPointsSubscriber: BlobPointsSubscriber = ({
  points,
  material,
  renderer,
  scene,
  camera,
  invalidate,
}) => {
  // The display material's uniforms are LayerUniforms-shaped at runtime
  // (see BlobController.createLayerUniforms). Cast is required because
  // THREE.ShaderMaterial.uniforms is typed loosely as `{ [uniform: string]: IUniform }`.
  const pickingMaterial = createFieldPickingMaterial(
    material.uniforms as unknown as LayerUniforms,
  );

  const picker = createFieldPicker();

  const syncSize = () => {
    const domEl = renderer.domElement;
    const dpr = renderer.getPixelRatio();
    picker.setSize(domEl.clientWidth, domEl.clientHeight, dpr);
  };
  syncSize();

  // Re-size the pick target whenever the canvas resizes. R3F doesn't
  // expose a direct resize callback here, so listen on the domElement
  // via ResizeObserver. The listener fires on DPR change too (e.g. when
  // the window moves to a different monitor).
  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(syncSize);
    resizeObserver.observe(renderer.domElement);
  }

  // Opt blob into layer 1 in addition to its default layer 0. The
  // picking pass sets camera.layers to only-layer-1 so non-blob layers
  // are excluded from the ID buffer; the display pass keeps the
  // default layer 0 mask and renders all layers normally.
  points.layers.enable(1);

  const handle: OrbPickerHandle = {
    pickSync: (clientX, clientY) => {
      const canvasRect = renderer.domElement.getBoundingClientRect();
      const prevMask = camera.layers.mask;
      camera.layers.set(1);
      try {
        return picker.pickSync({
          renderer,
          scene,
          camera,
          pickingMaterial,
          points,
          clientX,
          clientY,
          canvasRect,
        });
      } finally {
        camera.layers.mask = prevMask;
        // Display pass is invalidated implicitly next rAF; call
        // invalidate so demand-mode schedules one immediately in case
        // the click happened during an idle frame.
        invalidate();
      }
    },
    pickRectAsync: async (rect, options) => {
      const canvasRect = renderer.domElement.getBoundingClientRect();
      const prevMask = camera.layers.mask;
      camera.layers.set(1);
      try {
        return await picker.pickRectAsync({
          renderer,
          scene,
          camera,
          pickingMaterial,
          points,
          clientRect: rect,
          mode: options?.mode,
          canvasRect,
        });
      } finally {
        camera.layers.mask = prevMask;
        invalidate();
      }
    },
  };

  useOrbPickerStore.getState().setHandle(handle);

  return () => {
    useOrbPickerStore.getState().clearHandleIfMatches(handle);
    resizeObserver?.disconnect();
    points.layers.disable(1);
    picker.dispose();
    pickingMaterial.dispose();
  };
};

export { PICK_NO_HIT };
