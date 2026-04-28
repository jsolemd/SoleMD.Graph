/// <reference types="@webgpu/types" />

import type { OrbSelectionRect } from "../interaction/OrbInteractionSurface";
import { ORB_PICK_NO_HIT, type OrbPickRectMode } from "../interaction/orb-picker-store";
import {
  BLOB_AMPLITUDE,
  BLOB_DEPTH,
  BLOB_FREQUENCY,
  BLOB_WAVE_SPEED,
  INTRO_DEPTH_BOOST,
  INTRO_DURATION_SECONDS,
  LANDING_BASE_BLUE_RGB,
  rgb255ToUnit,
} from "../../field/shared/landing-feel-constants";
import type { OrbWebGpuParticleArrays } from "./orb-webgpu-particles";
import type { OrbWebGpuDeviceContext } from "./orb-webgpu-gate";
import {
  FRAME_UNIFORM_BYTES,
  U32_BYTES,
  clampFinite,
  writePickParams,
  writeRectParams,
} from "./orb-webgpu-layout";
import {
  createOrbWebGpuResources,
  type OrbWebGpuRuntimeResources,
} from "./orb-webgpu-resources";
import { OrbWebGpuRotationController } from "./orb-webgpu-rotation";

const ORB_BASE_COLOR = rgb255ToUnit(LANDING_BASE_BLUE_RGB);

export interface OrbWebGpuRuntime {
  uploadParticles(arrays: OrbWebGpuParticleArrays): void;
  uploadFlags(flags: Uint32Array): void;
  setMotionSettings(settings: OrbWebGpuMotionSettings): void;
  pickAsync(clientX: number, clientY: number): Promise<number>;
  pickRectAsync(
    rect: OrbSelectionRect,
    options?: { mode?: OrbPickRectMode },
  ): Promise<number[]>;
  captureSnapshot(): Promise<Blob | null>;
  applyTwist(deltaRadians: number): void;
  start(): void;
  stop(): void;
  destroy(): void;
}

export interface OrbWebGpuMotionSettings {
  ambientEntropy: number;
  motionSpeedMultiplier: number;
  pauseMotion: boolean;
  rotationSpeedMultiplier: number;
  selectionActive: boolean;
}

export async function createOrbWebGpuRuntime(
  canvas: HTMLCanvasElement,
  gpu: OrbWebGpuDeviceContext,
): Promise<OrbWebGpuRuntime> {
  const runtime = await OrbWebGpuRuntimeImpl.create(canvas, gpu);
  return runtime;
}

class OrbWebGpuRuntimeImpl implements OrbWebGpuRuntime {
  private readonly computeBindGroup!: GPUBindGroup;
  private readonly pickBindGroup!: GPUBindGroup;
  private readonly renderBindGroup!: GPUBindGroup;
  private readonly computePipeline!: GPUComputePipeline;
  private readonly pickPipeline!: GPUComputePipeline;
  private readonly rectPipeline!: GPUComputePipeline;
  private readonly renderPipeline!: GPURenderPipeline;
  private readonly frameUniformBuffer!: GPUBuffer;
  private readonly pickParamBuffer!: GPUBuffer;
  private readonly pickResultBuffer!: GPUBuffer;
  private readonly pickStagingBuffer!: GPUBuffer;
  private readonly rectParamBuffer!: GPUBuffer;
  private readonly rectResultBuffer!: GPUBuffer;
  private readonly rectStagingBuffer!: GPUBuffer;
  private readonly spriteTexture!: GPUTexture;
  private readonly positionsBuffer!: GPUBuffer;
  private readonly velocitiesBuffer!: GPUBuffer;
  private readonly attributesBuffer!: GPUBuffer;
  private readonly displayBuffer!: GPUBuffer;
  private readonly flagsBuffer!: GPUBuffer;
  private readonly device!: GPUDevice;
  private readonly context!: GPUCanvasContext;
  private readonly format!: GPUTextureFormat;
  private readonly canvas!: HTMLCanvasElement;
  private readonly maxParticles!: number;
  private readonly radiusScale!: number;
  private readonly frameUniformBytes: ArrayBuffer;
  private readonly frameUniformView: DataView;
  private readonly pickClearValue = new Uint32Array([0xffffffff]);
  private readonly rectClearValue = new Uint32Array([0]);
  private readonly rotationController = new OrbWebGpuRotationController();
  private readonly resizeObserver!: ResizeObserver | null;
  private animationFrame: number | null = null;
  private disposed = false;
  private particleCount = 0;
  private lastFrameMs = 0;
  private introStartMs: number | null = null;
  private introCompleted = false;
  private pickQueue: Promise<number> = Promise.resolve(ORB_PICK_NO_HIT);
  private rectQueue: Promise<number[]> = Promise.resolve([]);
  private renderBundle: GPURenderBundle | null = null;
  private renderBundleList: GPURenderBundle[] | null = null;
  private renderBundleParticleCount = -1;
  private colorTime = 0;
  private motionSettings: OrbWebGpuMotionSettings = {
    ambientEntropy: 1,
    motionSpeedMultiplier: 1,
    pauseMotion: false,
    rotationSpeedMultiplier: 1,
    selectionActive: false,
  };

  private constructor(args: OrbWebGpuRuntimeResources) {
    Object.assign(this, args);
    this.frameUniformBytes = new ArrayBuffer(FRAME_UNIFORM_BYTES);
    this.frameUniformView = new DataView(this.frameUniformBytes);
    this.resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(this.canvas);
    this.resize();
  }

  static async create(
    canvas: HTMLCanvasElement,
    gpu: OrbWebGpuDeviceContext,
  ): Promise<OrbWebGpuRuntimeImpl> {
    return new OrbWebGpuRuntimeImpl(
      await createOrbWebGpuResources(canvas, gpu),
    );
  }

  uploadParticles(arrays: OrbWebGpuParticleArrays): void {
    if (this.disposed) return;
    const count = Math.min(arrays.count, this.maxParticles);
    const wasEmpty = this.particleCount <= 0;
    this.particleCount = count;
    this.renderBundleParticleCount = -1;
    this.renderBundle = null;
    this.renderBundleList = null;
    if (wasEmpty && count > 0) {
      this.colorTime = 0;
      this.introStartMs = performance.now();
      this.introCompleted = false;
    }
    this.writeFrameUniforms(performance.now() / 1000, 0);
    this.device.queue.writeBuffer(
      this.positionsBuffer,
      0,
      arrays.positions.subarray(0, count * 4),
    );
    this.device.queue.writeBuffer(
      this.velocitiesBuffer,
      0,
      arrays.velocities.subarray(0, count * 4),
    );
    this.device.queue.writeBuffer(
      this.attributesBuffer,
      0,
      arrays.attributes.subarray(0, count * 4),
    );
    this.uploadFlags(arrays.flags.subarray(0, count));
  }

  uploadFlags(flags: Uint32Array): void {
    if (this.disposed) return;
    const count = Math.min(flags.length, this.maxParticles);
    this.device.queue.writeBuffer(this.flagsBuffer, 0, flags.subarray(0, count));
  }

  setMotionSettings(settings: OrbWebGpuMotionSettings): void {
    this.motionSettings = {
      ambientEntropy: clampFinite(settings.ambientEntropy, 0, 2),
      motionSpeedMultiplier: clampFinite(settings.motionSpeedMultiplier, 0, 3),
      pauseMotion: settings.pauseMotion,
      rotationSpeedMultiplier: clampFinite(settings.rotationSpeedMultiplier, 0, 3),
      selectionActive: settings.selectionActive,
    };
  }

  start(): void {
    if (this.disposed || this.animationFrame != null) return;
    this.lastFrameMs = performance.now();
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.animationFrame == null) return;
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
  }

  pickAsync(clientX: number, clientY: number): Promise<number> {
    this.pickQueue = this.pickQueue
      .catch(() => ORB_PICK_NO_HIT)
      .then(() => this.runPickAsync(clientX, clientY));
    return this.pickQueue;
  }

  pickRectAsync(
    rect: OrbSelectionRect,
    options?: { mode?: OrbPickRectMode },
  ): Promise<number[]> {
    this.rectQueue = this.rectQueue
      .catch(() => [])
      .then(() => this.runPickRectAsync(rect, options));
    return this.rectQueue;
  }

  applyTwist(deltaRadians: number): void {
    if (this.disposed || !Number.isFinite(deltaRadians)) return;
    this.rotationController.applyTwist(deltaRadians, performance.now());
    this.writeFrameUniforms(performance.now() / 1000, 0);
  }

  async captureSnapshot(): Promise<Blob | null> {
    if (this.disposed) return null;
    await this.device.queue.onSubmittedWorkDone();
    if (this.disposed) return null;
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  private async runPickAsync(clientX: number, clientY: number): Promise<number> {
    if (this.disposed || this.particleCount <= 0) return ORB_PICK_NO_HIT;
    const point = this.clientPointToClip(clientX, clientY);
    if (!point) return ORB_PICK_NO_HIT;
    writePickParams(this.device, this.pickParamBuffer, {
      aspect: this.aspect,
      count: this.particleCount,
      x: point.x,
      y: point.y,
    });
    this.device.queue.writeBuffer(this.pickResultBuffer, 0, this.pickClearValue);
    const encoder = this.device.createCommandEncoder({ label: "orb.pick" });
    const pass = encoder.beginComputePass({ label: "orb.pick-pass" });
    pass.setPipeline(this.pickPipeline);
    pass.setBindGroup(0, this.pickBindGroup);
    pass.dispatchWorkgroups(Math.ceil(this.particleCount / 64));
    pass.end();
    encoder.copyBufferToBuffer(
      this.pickResultBuffer,
      0,
      this.pickStagingBuffer,
      0,
      U32_BYTES,
    );
    this.device.queue.submit([encoder.finish()]);

    await this.pickStagingBuffer.mapAsync(GPUMapMode.READ, 0, U32_BYTES);
    const raw = new Uint32Array(this.pickStagingBuffer.getMappedRange(0, U32_BYTES))[0]!;
    this.pickStagingBuffer.unmap();
    return raw === 0xffffffff ? ORB_PICK_NO_HIT : raw & 0xffff;
  }

  private async runPickRectAsync(
    rect: OrbSelectionRect,
    options?: { mode?: OrbPickRectMode },
  ): Promise<number[]> {
    if (this.disposed || this.particleCount <= 0) return [];
    const bounds = this.clientRectToClip(rect);
    if (!bounds) return [];
    writeRectParams(this.device, this.rectParamBuffer, {
      ...bounds,
      aspect: this.aspect,
      count: this.particleCount,
      mode: options?.mode === "through-volume" ? 1 : 0,
    });
    const bytes = (this.maxParticles + 1) * U32_BYTES;
    this.device.queue.writeBuffer(this.rectResultBuffer, 0, this.rectClearValue);
    const encoder = this.device.createCommandEncoder({ label: "orb.rect-pick" });
    const pass = encoder.beginComputePass({ label: "orb.rect-pick-pass" });
    pass.setPipeline(this.rectPipeline);
    pass.setBindGroup(0, this.pickBindGroup);
    pass.dispatchWorkgroups(Math.ceil(this.particleCount / 64));
    pass.end();
    encoder.copyBufferToBuffer(
      this.rectResultBuffer,
      0,
      this.rectStagingBuffer,
      0,
      bytes,
    );
    this.device.queue.submit([encoder.finish()]);

    await this.rectStagingBuffer.mapAsync(GPUMapMode.READ, 0, bytes);
    const raw = new Uint32Array(this.rectStagingBuffer.getMappedRange(0, bytes));
    const count = Math.min(raw[0] ?? 0, this.maxParticles);
    const result = Array.from(raw.slice(1, count + 1));
    this.rectStagingBuffer.unmap();
    return result;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.resizeObserver?.disconnect();
    for (const buffer of [
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.attributesBuffer,
      this.displayBuffer,
      this.flagsBuffer,
      this.frameUniformBuffer,
      this.pickParamBuffer,
      this.pickResultBuffer,
      this.pickStagingBuffer,
      this.rectParamBuffer,
      this.rectResultBuffer,
      this.rectStagingBuffer,
    ]) {
      buffer.destroy();
    }
    this.spriteTexture.destroy();
  }

  private readonly frame = (timestampMs: number) => {
    if (this.disposed) return;
    const rawDt = Math.min(
      0.05,
      Math.max(0.001, (timestampMs - this.lastFrameMs) / 1000),
    );
    this.lastFrameMs = timestampMs;
    this.resize();
    const motionDt = this.motionSettings.pauseMotion
      ? 0
      : rawDt *
        this.motionSettings.motionSpeedMultiplier *
        this.motionSettings.ambientEntropy;
    const colorDt = this.motionSettings.pauseMotion
      ? 0
      : rawDt * this.motionSettings.motionSpeedMultiplier;
    if (this.particleCount > 0) {
      this.colorTime += colorDt;
    }
    this.rotationController.tick({
      dtSeconds: rawDt,
      pauseMotion: this.motionSettings.pauseMotion,
      rotationSpeedMultiplier: this.motionSettings.rotationSpeedMultiplier,
      selectionActive: this.motionSettings.selectionActive,
      timestampMs,
    });
    this.writeFrameUniforms(timestampMs / 1000, motionDt);

    const encoder = this.device.createCommandEncoder({ label: "orb.frame" });
    if (this.particleCount > 0) {
      const computePass = encoder.beginComputePass({ label: "orb.integrate" });
      computePass.setPipeline(this.computePipeline);
      computePass.setBindGroup(0, this.computeBindGroup);
      computePass.dispatchWorkgroups(Math.ceil(this.particleCount / 64));
      computePass.end();
    }

    const currentTexture = this.context.getCurrentTexture();
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          clearValue: { a: 0, b: 0, g: 0, r: 0 },
          loadOp: "clear",
          storeOp: "store",
          view: currentTexture.createView(),
        },
      ],
      label: "orb.render",
    });
    const renderBundle = this.getRenderBundle();
    if (renderBundle) {
      renderPass.executeBundles(this.renderBundleList!);
    }
    renderPass.end();
    this.device.queue.submit([encoder.finish()]);

    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private get aspect(): number {
    const height = Math.max(1, this.canvas.height);
    return Math.max(0.1, this.canvas.width / height);
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  private writeFrameUniforms(time: number, dt: number): void {
    const view = this.frameUniformView;
    view.setFloat32(0, time, true);
    view.setFloat32(4, dt, true);
    view.setUint32(8, this.particleCount, true);
    view.setUint32(12, 0, true);
    view.setFloat32(16, this.aspect, true);
    view.setFloat32(20, this.radiusScale, true);
    view.setFloat32(24, this.rotationController.rotation, true);
    view.setFloat32(28, this.colorTime, true);
    view.setFloat32(32, ORB_BASE_COLOR[0], true);
    view.setFloat32(36, ORB_BASE_COLOR[1], true);
    view.setFloat32(40, ORB_BASE_COLOR[2], true);
    view.setFloat32(44, 0, true);
    view.setFloat32(48, BLOB_AMPLITUDE, true);
    view.setFloat32(52, this.resolveEffectiveDepth(), true);
    view.setFloat32(56, BLOB_FREQUENCY, true);
    view.setFloat32(60, BLOB_WAVE_SPEED, true);
    this.device.queue.writeBuffer(this.frameUniformBuffer, 0, this.frameUniformBytes);
  }

  private getRenderBundle(): GPURenderBundle | null {
    if (this.particleCount <= 0) return null;
    if (
      this.renderBundle &&
      this.renderBundleParticleCount === this.particleCount
    ) {
      return this.renderBundle;
    }
    const bundleEncoder = this.device.createRenderBundleEncoder({
      colorFormats: [this.format],
      label: "orb.render-bundle-encoder",
    });
    bundleEncoder.setPipeline(this.renderPipeline);
    bundleEncoder.setBindGroup(0, this.renderBindGroup);
    bundleEncoder.draw(6, this.particleCount);
    this.renderBundle = bundleEncoder.finish({ label: "orb.render-bundle" });
    this.renderBundleList = [this.renderBundle];
    this.renderBundleParticleCount = this.particleCount;
    return this.renderBundle;
  }

  private resolveEffectiveDepth(): number {
    if (this.introCompleted || this.introStartMs == null) {
      return BLOB_DEPTH;
    }
    const elapsedSeconds = Math.max(0, (performance.now() - this.introStartMs) / 1000);
    const introProgress = clampFinite(elapsedSeconds / INTRO_DURATION_SECONDS, 0, 1);
    const introEase = 1 - (1 - introProgress) * (1 - introProgress);
    const depthBoost = 1 + (INTRO_DEPTH_BOOST - 1) * (1 - introEase);
    if (introProgress >= 1) {
      this.introCompleted = true;
    }
    return BLOB_DEPTH * depthBoost;
  }

  private clientPointToClip(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 2 - 1,
      y: 1 - ((clientY - rect.top) / rect.height) * 2,
    };
  }

  private clientRectToClip(rect: OrbSelectionRect) {
    const canvasRect = this.canvas.getBoundingClientRect();
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
}
