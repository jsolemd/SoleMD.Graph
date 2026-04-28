/// <reference types="@webgpu/types" />

export type OrbWebGpuUnavailableReason =
  | "insecure-context"
  | "navigator-gpu-missing"
  | "adapter-missing"
  | "device-request-failed"
  | "canvas-context-missing"
  | "runtime-init-failed";

export interface OrbWebGpuProfile {
  name: "minimal" | "standard" | "high-density";
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

export function selectOrbWebGpuProfile(adapter: GPUAdapter): OrbWebGpuProfile {
  const maxStorageBufferBindingSize =
    adapter.limits.maxStorageBufferBindingSize ?? 0;

  if (maxStorageBufferBindingSize >= 64 * 1024 * 1024) {
    return {
      name: "high-density",
      maxParticles: 16_384,
      radiusScale: 1,
      workgroupSize: 64,
    };
  }

  if (maxStorageBufferBindingSize >= 16 * 1024 * 1024) {
    return {
      name: "standard",
      maxParticles: 8_192,
      radiusScale: 1.08,
      workgroupSize: 64,
    };
  }

  return {
    name: "minimal",
    maxParticles: 4_096,
    radiusScale: 1.15,
    workgroupSize: 64,
  };
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
