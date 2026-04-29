/// <reference types="@webgpu/types" />

import {
  ORB_PARTICLE_CAPACITY,
  ORB_PARTICLE_DISPLAY_BYTES,
} from "../bake/orb-particle-constants";

export type OrbWebGpuUnavailableReason =
  | "insecure-context"
  | "navigator-gpu-missing"
  | "adapter-missing"
  | "device-request-failed"
  | "canvas-context-missing"
  | "runtime-init-failed";

export interface OrbWebGpuProfile {
  name: string;
  maxParticles: number;
  radiusScale: number;
  workgroupSize: number;
}

export interface OrbWebGpuDeviceContext {
  adapter: GPUAdapter;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  profile: OrbWebGpuProfile;
}

export class OrbWebGpuUnavailableError extends Error {
  readonly reason: OrbWebGpuUnavailableReason;

  constructor(reason: OrbWebGpuUnavailableReason, message?: string) {
    super(message ?? reason);
    this.name = "OrbWebGpuUnavailableError";
    this.reason = reason;
  }
}

// Profile derives every runtime knob from ORB_PARTICLE_CAPACITY. The
// only adapter-dependent step is clamping maxParticles down to what
// the storage-buffer binding limit can actually hold — at the WebGPU
// spec minimum (128 MB) that ceiling is ~2.79M particles, so any
// compliant adapter sails past 1M without truncation.
//
// radiusScale is a density-compensation knob: at full capacity it is
// 1.0; if a low-end adapter forces a smaller maxParticles, the visual
// radius grows so the orb still reads as full rather than sparse. The
// 4th-root curve gives a gentle ramp (half density → 1.19×, quarter →
// 1.41×) that matches the prior hand-tuned tier values.
export function selectOrbWebGpuProfile(adapter: GPUAdapter): OrbWebGpuProfile {
  const bindingLimit = adapter.limits.maxStorageBufferBindingSize ?? 0;
  const adapterCapacity = Math.floor(bindingLimit / ORB_PARTICLE_DISPLAY_BYTES);
  const maxParticles = Math.max(
    1,
    Math.min(ORB_PARTICLE_CAPACITY, adapterCapacity),
  );
  const radiusScale = Math.pow(ORB_PARTICLE_CAPACITY / maxParticles, 0.25);
  const name =
    maxParticles >= ORB_PARTICLE_CAPACITY
      ? "full-density"
      : "capacity-limited";
  return { maxParticles, name, radiusScale, workgroupSize: 64 };
}

export async function requireOrbWebGpu(
  canvas: HTMLCanvasElement,
): Promise<OrbWebGpuDeviceContext> {
  if (!globalThis.isSecureContext) {
    throw new OrbWebGpuUnavailableError("insecure-context");
  }

  if (!navigator.gpu) {
    throw new OrbWebGpuUnavailableError("navigator-gpu-missing");
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) {
    throw new OrbWebGpuUnavailableError("adapter-missing");
  }

  const profile = selectOrbWebGpuProfile(adapter);
  let device: GPUDevice;
  try {
    device = await adapter.requestDevice({
      requiredFeatures: [],
    });
  } catch (error) {
    throw new OrbWebGpuUnavailableError(
      "device-request-failed",
      error instanceof Error ? error.message : undefined,
    );
  }

  const context = canvas.getContext("webgpu");
  if (!context) {
    device.destroy();
    throw new OrbWebGpuUnavailableError("canvas-context-missing");
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    alphaMode: "premultiplied",
    device,
    format,
  });

  return { adapter, context, device, format, profile };
}
