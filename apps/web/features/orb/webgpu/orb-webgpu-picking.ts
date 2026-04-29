/// <reference types="@webgpu/types" />

import type { OrbSelectionRect } from "../interaction/OrbInteractionSurface";
import {
  ORB_PICK_NO_HIT,
  type OrbPickRectMode,
} from "../interaction/orb-picker-store";
import {
  U32_BYTES,
  writePickParams,
  writeRectParams,
} from "./orb-webgpu-layout";
import { markPerf, measurePerf } from "./orb-webgpu-perf";

// Picking is async per WebGPU spec (mapAsync on staging buffers). The
// runtime owns the GPU resources and the canvas; this module owns the
// command-encoding + readback choreography so the runtime file can stay
// under the 600-line modularization limit.

export interface OrbPickResources {
  device: GPUDevice;
  pickPipeline: GPUComputePipeline;
  rectPipeline: GPUComputePipeline;
  pickBindGroup: GPUBindGroup;
  pickParamBuffer: GPUBuffer;
  pickResultBuffer: GPUBuffer;
  pickStagingBuffer: GPUBuffer;
  rectParamBuffer: GPUBuffer;
  rectResultBuffer: GPUBuffer;
  rectStagingBuffer: GPUBuffer;
}

export interface OrbPickViewport {
  aspect: number;
  particleCount: number;
  maxParticles: number;
}

// Module-level clear values — never allocate per pick. The pick result
// reduces with atomicMin from 0xffffffff (no hit). The rect result is a
// (count, indices...) prefix where index 0 holds the count, so a single
// u32 zero is enough to clear the count slot.
const PICK_CLEAR_VALUE = new Uint32Array([0xffffffff]);
const RECT_CLEAR_VALUE = new Uint32Array([0]);

export async function runOrbWebGpuPick(
  resources: OrbPickResources,
  viewport: OrbPickViewport,
  clipPoint: { x: number; y: number },
): Promise<number> {
  const { device } = resources;
  writePickParams(device, resources.pickParamBuffer, {
    aspect: viewport.aspect,
    count: viewport.particleCount,
    x: clipPoint.x,
    y: clipPoint.y,
  });
  device.queue.writeBuffer(resources.pickResultBuffer, 0, PICK_CLEAR_VALUE);
  const encoder = device.createCommandEncoder({ label: "orb.pick" });
  const pass = encoder.beginComputePass({ label: "orb.pick-pass" });
  pass.setPipeline(resources.pickPipeline);
  pass.setBindGroup(0, resources.pickBindGroup);
  pass.dispatchWorkgroups(Math.ceil(viewport.particleCount / 64));
  pass.end();
  encoder.copyBufferToBuffer(
    resources.pickResultBuffer,
    0,
    resources.pickStagingBuffer,
    0,
    U32_BYTES,
  );
  markPerf("orb:pick:dispatch:start");
  device.queue.submit([encoder.finish()]);
  markPerf("orb:pick:dispatch:end");

  markPerf("orb:pick:readback:start");
  await resources.pickStagingBuffer.mapAsync(GPUMapMode.READ, 0, U32_BYTES);
  const raw = new Uint32Array(
    resources.pickStagingBuffer.getMappedRange(0, U32_BYTES),
  )[0]!;
  resources.pickStagingBuffer.unmap();
  markPerf("orb:pick:readback:end");
  measurePerf("orb:pick:total", "orb:pick:dispatch:start", "orb:pick:readback:end");
  // Score-pack: WGSL atomicMin combines (depthQ << 21) | index into one
  // u32. Low 21 bits carry the winning particle index (up to 2_097_151);
  // high 11 bits hold the depth-quantum tiebreaker. depthQ is clamped to
  // 2046 in the shader so a real hit can never produce 0xFFFFFFFF — that
  // value is reserved for the "no hit" sentinel.
  return raw === 0xffffffff ? ORB_PICK_NO_HIT : raw & 0x1fffff;
}

export async function runOrbWebGpuPickRect(
  resources: OrbPickResources,
  viewport: OrbPickViewport,
  clipBounds: { left: number; right: number; top: number; bottom: number },
  options?: { mode?: OrbPickRectMode },
): Promise<number[]> {
  const { device } = resources;
  writeRectParams(device, resources.rectParamBuffer, {
    ...clipBounds,
    aspect: viewport.aspect,
    count: viewport.particleCount,
    mode: options?.mode === "through-volume" ? 1 : 0,
  });
  const bytes = (viewport.maxParticles + 1) * U32_BYTES;
  device.queue.writeBuffer(resources.rectResultBuffer, 0, RECT_CLEAR_VALUE);
  const encoder = device.createCommandEncoder({ label: "orb.rect-pick" });
  const pass = encoder.beginComputePass({ label: "orb.rect-pick-pass" });
  pass.setPipeline(resources.rectPipeline);
  pass.setBindGroup(0, resources.pickBindGroup);
  pass.dispatchWorkgroups(Math.ceil(viewport.particleCount / 64));
  pass.end();
  encoder.copyBufferToBuffer(
    resources.rectResultBuffer,
    0,
    resources.rectStagingBuffer,
    0,
    bytes,
  );
  markPerf("orb:pick:dispatch:start");
  device.queue.submit([encoder.finish()]);
  markPerf("orb:pick:dispatch:end");

  markPerf("orb:pick:readback:start");
  await resources.rectStagingBuffer.mapAsync(GPUMapMode.READ, 0, bytes);
  const raw = new Uint32Array(
    resources.rectStagingBuffer.getMappedRange(0, bytes),
  );
  const count = Math.min(raw[0] ?? 0, viewport.maxParticles);
  const result = Array.from(raw.slice(1, count + 1));
  resources.rectStagingBuffer.unmap();
  markPerf("orb:pick:readback:end");
  measurePerf("orb:pick:total", "orb:pick:dispatch:start", "orb:pick:readback:end");
  return result;
}

// Convert client-space coordinates from a pointer event into clip-space
// coordinates relative to the orb canvas. Returns null when the canvas
// has no layout (pre-mount or hidden).
export function clientPointToClip(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: 1 - ((clientY - rect.top) / rect.height) * 2,
  };
}

export function clientRectToClip(
  canvas: HTMLCanvasElement,
  rect: OrbSelectionRect,
): { left: number; right: number; top: number; bottom: number } | null {
  const canvasRect = canvas.getBoundingClientRect();
  if (canvasRect.width <= 0 || canvasRect.height <= 0) return null;
  const left = ((rect.left - canvasRect.left) / canvasRect.width) * 2 - 1;
  const right = ((rect.right - canvasRect.left) / canvasRect.width) * 2 - 1;
  const top = 1 - ((rect.top - canvasRect.top) / canvasRect.height) * 2;
  const bottom = 1 - ((rect.bottom - canvasRect.top) / canvasRect.height) * 2;
  return {
    bottom: Math.min(top, bottom),
    left: Math.min(left, right),
    right: Math.max(left, right),
    top: Math.max(top, bottom),
  };
}

// JS mirror of the WGSL atomicMin reduction in orb-webgpu-shader.ts pick
// kernel. Each candidate is a particle that already passed the
// screen-distance gate. The WGSL packs (depthQ << 21) | index into one
// u32 and atomicMin's it into a single slot, so the winner is the
// smallest depthQ — and on tie, the smallest index. This pure JS form
// is unit-tested in orb-webgpu-pick-depth-order.test.ts so refactors of
// the WGSL kernel can verify their reduction stays in sync.
export interface OrbPickCandidate {
  index: number;
  depthQ: number;
}

export function resolvePickFromCandidates(
  candidates: ReadonlyArray<OrbPickCandidate>,
): number {
  if (candidates.length === 0) return ORB_PICK_NO_HIT;
  let bestIndex = candidates[0]!.index;
  let bestDepth = candidates[0]!.depthQ;
  for (let i = 1; i < candidates.length; i += 1) {
    const cand = candidates[i]!;
    if (
      cand.depthQ < bestDepth ||
      (cand.depthQ === bestDepth && cand.index < bestIndex)
    ) {
      bestIndex = cand.index;
      bestDepth = cand.depthQ;
    }
  }
  return bestIndex;
}

// JS mirror of the WGSL rect kernel: a particle is included when its
// projected center is inside the inclusive AABB. Edges count as inside;
// strictly outside is excluded. A zero-area rect (left === right or
// top === bottom) returns the empty set — a degenerate drag should
// never select anything, matching the WGSL early-out.
export interface OrbRectClipBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function rectPickReduce(
  rect: OrbRectClipBounds,
  centers: ReadonlyArray<{ x: number; y: number }>,
): number[] {
  if (rect.left === rect.right || rect.top === rect.bottom) return [];
  const minX = Math.min(rect.left, rect.right);
  const maxX = Math.max(rect.left, rect.right);
  const minY = Math.min(rect.top, rect.bottom);
  const maxY = Math.max(rect.top, rect.bottom);
  const out: number[] = [];
  for (let i = 0; i < centers.length; i += 1) {
    const c = centers[i]!;
    if (c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY) {
      out.push(i);
    }
  }
  return out;
}

// Generation-token freshness check. Pick consumers (Wave 2B hooks)
// capture the runtime's pickGeneration at dispatch time and pass it
// back here when the readback resolves. If `received !== current`, the
// caller must drop the stale result — a state-changing event happened
// between dispatch and resolution that invalidates the pick. Pure
// host-side integer comparison; zero GPU buffer involvement.
export function validatePickGeneration(
  received: number,
  current: number,
): boolean {
  return received === current;
}
