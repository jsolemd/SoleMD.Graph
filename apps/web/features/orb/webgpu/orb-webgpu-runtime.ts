/// <reference types="@webgpu/types" />

import type { OrbSelectionRect } from "../interaction/OrbInteractionSurface";
import { ORB_PICK_NO_HIT, type OrbPickRectMode } from "../interaction/orb-picker-store";
import type {
  OrbWebGpuChunkRange,
  OrbWebGpuParticleArrays,
} from "./orb-webgpu-particles";
import type { OrbWebGpuDeviceContext } from "./orb-webgpu-gate";
import { SIZE_BYTES_PER_PARTICLE, clampFinite } from "./orb-webgpu-layout";
import {
  createOrbWebGpuResources,
  type OrbWebGpuRuntimeResources,
} from "./orb-webgpu-resources";
import {
  createOrbInteractionWeights,
  resetOrbInteractionWeights,
  tickOrbInteractionWeights,
  type OrbInteractionWeights,
} from "./orb-webgpu-interaction-weights";
import { OrbWebGpuPanController } from "./orb-webgpu-pan";
import { OrbWebGpuRotationController } from "./orb-webgpu-rotation";
import { OrbWebGpuZoomController } from "./orb-webgpu-zoom";
import {
  OrbInteractionBurstEnvelope,
  OrbIntroDepthEnvelope,
  OrbYawOmegaSmoother,
  createOrbFrameUniformBytes,
  packOrbFrameUniforms,
} from "./orb-webgpu-frame-uniforms";
import {
  clientPointToClip,
  clientRectToClip,
  runOrbWebGpuPick,
  runOrbWebGpuPickRect,
} from "./orb-webgpu-picking";
import {
  attachOrbDebugPerfMarks,
  isOrbPerfOn,
  markPerf,
  measurePerf,
} from "./orb-webgpu-perf";

// Resident-canvas DPR cap. WebGPU pixel cost scales quadratically with
// the canvas size — at 1M particles the fragment shader runs millions
// of times per frame, so DPR is the highest-leverage perf knob. 1.25×
// CSS pixels gives ~49% fragment-budget headroom vs the prior 1.75
// cap on retina (2.0 DPR) displays. The orb's soft alpha-blended
// sprites + halo/ring effects mask the modest downsampling — the orb
// itself reads identically; only crisp UI text below would differ,
// and that's not part of the canvas surface.
const ORB_CANVAS_DPR_CAP = 1.25;

// 21-bit pick-index ceiling. The WGSL pick kernel packs (depthQ << 21)
// | index into a single u32 for atomicMin reduction (see
// orb-webgpu-picking.ts); above this count the low 21 bits start
// aliasing and pick results return wrong particles. 2_097_151 is the
// max addressable index — comfortable headroom over the 1M target. We
// log loudly rather than throw so the orb keeps rendering; the picker
// is the only degraded surface.
const ORB_PICK_INDEX_CEILING = 0x1fffff;

// Interaction-weight decay window. After the last interaction signal
// (focus / hover / selection / scope flag), the weights tick keeps
// running for this long so hover/select/focus visibly fade out, then
// stops. ≈5 × FOCUS_TAU_SECONDS (0.45) = 99.3% decay — residual is
// invisible. Skipping the tick + 16 MB upload at 60 Hz is the single
// biggest CPU-side win at 1M particles, since the loop is O(N).
const INTERACTION_DECAY_WINDOW_MS = 2_250;

export interface OrbWebGpuRuntime {
  uploadParticles(arrays: OrbWebGpuParticleArrays): void;
  uploadParticleRange(
    arrays: OrbWebGpuParticleArrays,
    range: OrbWebGpuChunkRange,
  ): void;
  uploadFlags(flags: Uint32Array): void;
  setFocusIndex(index: number | null): void;
  setMotionSettings(settings: OrbWebGpuMotionSettings): void;
  pickAsync(
    clientX: number,
    clientY: number,
  ): Promise<{ index: number; generation: number }>;
  pickRectAsync(
    rect: OrbSelectionRect,
    options?: { mode?: OrbPickRectMode },
  ): Promise<{ indices: number[]; generation: number }>;
  bumpPickGeneration(): void;
  captureSnapshot(): Promise<Blob | null>;
  applyTwist(deltaRadians: number): void;
  nudgeRotation(deltaRadians: number): void;
  applyPitch(deltaRadians: number): void;
  nudgePitch(deltaRadians: number): void;
  applyZoom(factor: number): void;
  applyPan(deltaX: number, deltaY: number): void;
  resetView(): void;
  start(): void;
  stop(): void;
  destroy(): void;
}

export interface OrbWebGpuMotionSettings {
  ambientEntropy: number;
  motionSpeedMultiplier: number;
  pauseMotion: boolean;
  prefersReducedMotion: boolean;
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
  private readonly seedBindGroup!: GPUBindGroup;
  private readonly computePipeline!: GPUComputePipeline;
  private readonly pickPipeline!: GPUComputePipeline;
  private readonly rectPipeline!: GPUComputePipeline;
  private readonly renderPipeline!: GPURenderPipeline;
  private readonly seedAmbientGeometryPipeline!: GPUComputePipeline;
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
  private readonly weightsBuffer!: GPUBuffer;
  private readonly sizesBuffer!: GPUBuffer;
  private readonly device!: GPUDevice;
  private readonly context!: GPUCanvasContext;
  private readonly format!: GPUTextureFormat;
  private readonly canvas!: HTMLCanvasElement;
  private readonly maxParticles!: number;
  private readonly radiusScale!: number;
  private readonly frameUniformBytes: ArrayBuffer;
  private readonly frameUniformView: DataView;
  private readonly rotationController = new OrbWebGpuRotationController();
  private readonly zoomController = new OrbWebGpuZoomController();
  private readonly panController = new OrbWebGpuPanController();
  private readonly burstEnvelope = new OrbInteractionBurstEnvelope();
  private readonly yawOmega = new OrbYawOmegaSmoother();
  private readonly introDepth = new OrbIntroDepthEnvelope();
  private readonly resizeObserver!: ResizeObserver | null;
  // Depth attachment for the render pass. Recreated whenever the canvas
  // resizes (canvas.width/height change). Pairs with the renderPipeline's
  // depthStencil and the vertex shader's per-particle ndcZ — without all
  // three matched, depth-test is a no-op and overlapping particles
  // composite by instance-index order (the see-through twinkle bug).
  private depthTexture: GPUTexture | null = null;
  private animationFrame: number | null = null;
  private disposed = false;
  private particleCount = 0;
  private lastFrameMs = 0;
  // Smoothed simulation dt. Raw rAF dt jumps with frame variance —
  // when the user rotates / zooms / resizes, GPU and CPU spike,
  // dropping a frame or two; rawDt for that frame is 2-3× nominal,
  // and feeding it into colorTime causes a visible motion jump (the
  // user-reported "jaggidy/laggy when rotating" feel). The smoothed
  // value caps at ~17ms (slightly above 60Hz) and exponentially
  // averages — under brief load spikes, simulation appears to slow
  // smoothly rather than jump. This is the canonical fix for
  // frame-rate-coupled motion stutter on WebGPU and matches how
  // production particle systems decouple sim from frame variance.
  private smoothedSimDtSeconds = 1 / 60;
  // Host-side generation token. Pick consumers (Wave 2B hooks) snapshot
  // this at dispatch time and pass it back when readback resolves; if
  // it no longer matches, the result is stale (state changed between
  // dispatch and resolution) and the consumer drops it. Pure integer —
  // never crosses the GPU boundary.
  private pickGeneration = 0;
  private pickQueue: Promise<{ index: number; generation: number }> =
    Promise.resolve({ generation: 0, index: ORB_PICK_NO_HIT });
  private rectQueue: Promise<{ indices: number[]; generation: number }> =
    Promise.resolve({ generation: 0, indices: [] });
  private detachOrbDebug: (() => void) | null = null;
  private renderBundle: GPURenderBundle | null = null;
  private renderBundleList: GPURenderBundle[] | null = null;
  private renderBundleParticleCount = -1;
  private colorTime = 0;
  private focusIndex = -1;
  // Tracking for the weights-tick early-exit. While `hasActiveFlag` is
  // true (any flag bit set on any particle) or `focusIndex >= 0`, the
  // weights tick runs every frame so saturated weights stay saturated.
  // When BOTH go inactive, the decay window opens and the tick keeps
  // running until `interactionWindowEndMs` to let weights fade out
  // smoothly. Outside the decay window with no active signal, the tick
  // and its 16 MB writeBuffer skip entirely — biggest CPU win at 1M.
  private hasActiveFlag = false;
  private interactionWindowEndMs = 0;
  // Forces the next frame's integrate compute to run even when the
  // orb would otherwise be skipped (paused, no interaction). Set after
  // any upload that changes particle state (seed, sizes, flags) so the
  // GPU's DisplayParticle buffer gets repopulated before the render
  // pass reads it. Cleared once the integrate dispatch fires.
  private displayDirty = false;
  private motionSettings: OrbWebGpuMotionSettings = {
    ambientEntropy: 1,
    motionSpeedMultiplier: 1,
    pauseMotion: false,
    prefersReducedMotion: false,
    rotationSpeedMultiplier: 1,
    selectionActive: false,
  };
  private flagShadow!: Uint32Array;
  private weights!: OrbInteractionWeights;

  private constructor(args: OrbWebGpuRuntimeResources) {
    Object.assign(this, args);
    const { bytes, view } = createOrbFrameUniformBytes();
    this.frameUniformBytes = bytes;
    this.frameUniformView = view;
    this.flagShadow = new Uint32Array(this.maxParticles);
    this.weights = createOrbInteractionWeights(this.maxParticles);
    this.resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(this.canvas);
    this.resize();
    this.detachOrbDebug = attachOrbDebugPerfMarks();
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
    if (arrays.count > ORB_PICK_INDEX_CEILING) {
      // The WGSL pick kernel packs (depthQ << 21) | index into a u32
      // for atomicMin reduction; once the index needs more than 21
      // bits, picks alias to the wrong particle. Degrade loudly so
      // dev/QA notices, but never throw — the particle field itself
      // still renders, just hover/click/rect resolution is unsafe.
      console.error(
        `[orb-webgpu-runtime] particle count ${arrays.count} exceeds 21-bit pick index ceiling (${ORB_PICK_INDEX_CEILING}); pick results will alias`,
      );
    }
    const count = Math.min(arrays.count, this.maxParticles);
    const wasEmpty = this.particleCount <= 0;
    this.particleCount = count;
    this.renderBundleParticleCount = -1;
    this.renderBundle = null;
    this.renderBundleList = null;
    if (wasEmpty && count > 0) {
      this.colorTime = 0;
      this.introDepth.start(performance.now());
      resetOrbInteractionWeights(this.weights);
      this.device.queue.writeBuffer(this.weightsBuffer, 0, this.weights.data);
    }
    // FrameUniforms must be written BEFORE the seed dispatch — the
    // seedAmbientGeometry kernel reads computeFrame.count to bound its
    // Fibonacci-spiral mapping. Subsequent rAF ticks overwrite the
    // uniform with live time/zoom/pan, but the count there is what the
    // seed pass keys off this single dispatch.
    this.writeFrameUniforms(performance.now() / 1000, 0);
    if (wasEmpty && count > 0) {
      // One-shot GPU init: positions / velocities / attributes are
      // synthesized inside the WGSL seedAmbientGeometry kernel, so the
      // CPU never uploads those arrays. Replaces the prior 16k
      // FieldPointSource modulo-wrap (which produced the radial
      // "sea-urchin" spokes at 1M particles).
      this.runSeedAmbientGeometry(count);
    }
    this.device.queue.writeBuffer(
      this.sizesBuffer,
      0,
      arrays.sizes.subarray(0, count),
    );
    this.uploadFlags(arrays.flags.subarray(0, count));
    // Force one integrate dispatch on the next frame so the
    // DisplayParticle buffer gets populated from the freshly-seeded
    // ambient state before render reads it. Without this, an orb
    // mounted with reduced-motion or pause active would render an
    // empty/garbage display buffer.
    this.displayDirty = true;
  }

  // Dispatch the GPU seed pass. Single submission, separate from the
  // per-frame command encoder, because this only fires once per non-empty
  // upload transition and we want it to be visible as a distinct label
  // in GPU traces.
  private runSeedAmbientGeometry(count: number): void {
    const encoder = this.device.createCommandEncoder({
      label: "orb.seed-ambient",
    });
    const pass = encoder.beginComputePass({ label: "orb.seed-ambient.pass" });
    pass.setPipeline(this.seedAmbientGeometryPipeline);
    pass.setBindGroup(0, this.seedBindGroup);
    pass.dispatchWorkgroups(Math.ceil(count / 64));
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  uploadParticleRange(
    arrays: OrbWebGpuParticleArrays,
    range: OrbWebGpuChunkRange,
  ): void {
    if (this.disposed || this.particleCount <= 0) return;
    const lo = Math.max(0, range.fromIndex);
    const hi = Math.min(this.particleCount - 1, range.toIndex);
    if (hi < lo) return;
    // After the full-GPU init refactor, chunks only update one field per
    // particle (the per-paper radius), so this is a single contiguous
    // f32 slice copy. dataOffset/size args are in typed-array elements
    // (1 f32 = 1 element here), and byteOffset is element * 4.
    const startElement = lo;
    const elementCount = hi - lo + 1;
    const byteOffset = startElement * SIZE_BYTES_PER_PARTICLE;
    this.device.queue.writeBuffer(
      this.sizesBuffer,
      byteOffset,
      arrays.sizes,
      startElement,
      elementCount,
    );
    // Chunks change per-paper radius — force one integrate dispatch
    // so the DisplayParticle buffer reflects the new sizes even on
    // paused / idle states.
    this.displayDirty = true;
  }

  uploadFlags(flags: Uint32Array): void {
    if (this.disposed) return;
    const count = Math.min(flags.length, this.maxParticles);
    this.flagShadow.set(flags.subarray(0, count));
    if (count < this.maxParticles) {
      this.flagShadow.fill(0, count);
    }
    this.device.queue.writeBuffer(this.flagsBuffer, 0, flags.subarray(0, count));
    // One-shot O(N) scan only runs on flag upload (rare). Result drives
    // the per-frame weights-tick early-exit. Transition from active to
    // inactive opens the decay window so saturated weights fade out.
    let anyFlag = false;
    for (let i = 0; i < count; i += 1) {
      if (flags[i] !== 0) {
        anyFlag = true;
        break;
      }
    }
    const wasActive = this.hasActiveFlag;
    this.hasActiveFlag = anyFlag;
    if (wasActive && !anyFlag && this.focusIndex < 0) {
      this.openDecayWindow();
    }
    // Flags drive shader color tinting / halo / ring per-particle, so
    // any flag change requires a fresh integrate dispatch even when
    // motion is paused.
    this.displayDirty = true;
  }

  setFocusIndex(index: number | null): void {
    if (this.disposed) return;
    const wasFocused = this.focusIndex >= 0;
    if (index == null || !Number.isFinite(index) || index < 0) {
      this.focusIndex = -1;
    } else {
      const intIndex = Math.floor(index);
      this.focusIndex =
        intIndex >= 0 && intIndex < this.maxParticles ? intIndex : -1;
    }
    if (wasFocused && this.focusIndex < 0 && !this.hasActiveFlag) {
      this.openDecayWindow();
    }
  }

  private openDecayWindow(): void {
    this.interactionWindowEndMs =
      performance.now() + INTERACTION_DECAY_WINDOW_MS;
  }

  setMotionSettings(settings: OrbWebGpuMotionSettings): void {
    this.motionSettings = {
      ambientEntropy: clampFinite(settings.ambientEntropy, 0, 2),
      motionSpeedMultiplier: clampFinite(settings.motionSpeedMultiplier, 0, 3),
      pauseMotion: settings.pauseMotion,
      prefersReducedMotion: settings.prefersReducedMotion,
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

  pickAsync(
    clientX: number,
    clientY: number,
  ): Promise<{ index: number; generation: number }> {
    // Generation is captured AT DISPATCH TIME — when the queued
    // promise actually fires — not at call time. Consumers compare
    // the returned generation to the live runtime generation to
    // detect stale results from picks that crossed a state-change
    // boundary while waiting on GPU readback.
    this.pickQueue = this.pickQueue
      .catch(() => ({ generation: 0, index: ORB_PICK_NO_HIT }))
      .then(async () => {
        const generation = this.pickGeneration;
        const index = await this.runPickAsync(clientX, clientY);
        return { generation, index };
      });
    return this.pickQueue;
  }

  pickRectAsync(
    rect: OrbSelectionRect,
    options?: { mode?: OrbPickRectMode },
  ): Promise<{ indices: number[]; generation: number }> {
    this.rectQueue = this.rectQueue
      .catch(() => ({ generation: 0, indices: [] }))
      .then(async () => {
        const generation = this.pickGeneration;
        const indices = await this.runPickRectAsync(rect, options);
        return { generation, indices };
      });
    return this.rectQueue;
  }

  // Increment the host-side pick generation. Called by Wave 2B
  // consumers when state that invalidates in-flight picks changes
  // (selection set replaced, hover scope changed, focus pinned). The
  // bump is a single integer add; no GPU work, no allocation.
  bumpPickGeneration(): void {
    this.pickGeneration += 1;
  }

  // Every rotation lane reports its |Δrad| to the burst envelope. The
  // envelope sums contributions per frame and divides by frame dt to
  // get gesture angular velocity, which drives the burst — slow drag
  // tracks at low burst, fast spin saturates, release rings out. No
  // per-input gain is needed: each input's magnitude already scales
  // its contribution to gesture velocity. The synchronous
  // writeFrameUniforms calls used to live here too; removed because
  // the rAF tick is the sole writer and an extra mid-frame write
  // sampled the envelope at sub-frame moments (visible jitter).
  applyTwist(deltaRadians: number): void {
    if (this.disposed || !Number.isFinite(deltaRadians)) return;
    this.rotationController.applyTwist(deltaRadians, performance.now());
    this.burstEnvelope.kick(Math.abs(deltaRadians));
  }

  nudgeRotation(deltaRadians: number): void {
    if (this.disposed || !Number.isFinite(deltaRadians)) return;
    this.rotationController.nudgeRotation(deltaRadians, performance.now());
    this.burstEnvelope.kick(Math.abs(deltaRadians));
  }

  applyPitch(deltaRadians: number): void {
    if (this.disposed || !Number.isFinite(deltaRadians)) return;
    this.rotationController.applyPitch(deltaRadians, performance.now());
    this.burstEnvelope.kick(Math.abs(deltaRadians));
  }

  nudgePitch(deltaRadians: number): void {
    if (this.disposed || !Number.isFinite(deltaRadians)) return;
    this.rotationController.nudgePitch(deltaRadians, performance.now());
    this.burstEnvelope.kick(Math.abs(deltaRadians));
  }

  applyZoom(factor: number): void {
    if (this.disposed) return;
    this.zoomController.applyZoom(factor);
  }

  applyPan(deltaX: number, deltaY: number): void {
    if (this.disposed) return;
    this.panController.applyPan({ x: deltaX, y: deltaY });
  }

  resetView(): void {
    if (this.disposed) return;
    this.zoomController.reset();
    this.panController.reset();
    this.rotationController.resetPitch();
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
    const point = clientPointToClip(this.canvas, clientX, clientY);
    if (!point) return ORB_PICK_NO_HIT;
    return runOrbWebGpuPick(
      this.pickResources(),
      {
        aspect: this.aspect,
        maxParticles: this.maxParticles,
        particleCount: this.particleCount,
      },
      point,
    );
  }

  private async runPickRectAsync(
    rect: OrbSelectionRect,
    options?: { mode?: OrbPickRectMode },
  ): Promise<number[]> {
    if (this.disposed || this.particleCount <= 0) return [];
    const bounds = clientRectToClip(this.canvas, rect);
    if (!bounds) return [];
    return runOrbWebGpuPickRect(
      this.pickResources(),
      {
        aspect: this.aspect,
        maxParticles: this.maxParticles,
        particleCount: this.particleCount,
      },
      bounds,
      options,
    );
  }

  private pickResources() {
    return {
      device: this.device,
      pickBindGroup: this.pickBindGroup,
      pickParamBuffer: this.pickParamBuffer,
      pickPipeline: this.pickPipeline,
      pickResultBuffer: this.pickResultBuffer,
      pickStagingBuffer: this.pickStagingBuffer,
      rectParamBuffer: this.rectParamBuffer,
      rectPipeline: this.rectPipeline,
      rectResultBuffer: this.rectResultBuffer,
      rectStagingBuffer: this.rectStagingBuffer,
    };
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.resizeObserver?.disconnect();
    this.detachOrbDebug?.();
    this.detachOrbDebug = null;
    for (const buffer of [
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.attributesBuffer,
      this.sizesBuffer,
      this.displayBuffer,
      this.flagsBuffer,
      this.weightsBuffer,
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
    this.depthTexture?.destroy();
    this.depthTexture = null;
  }

  private readonly frame = (timestampMs: number) => {
    if (this.disposed) return;
    // Read perf flag once per frame — never inside any loop. When off,
    // markPerf is a single property access on globalThis.
    const perfOn = isOrbPerfOn();
    if (perfOn) markPerf("orb:frame:cpu:start");
    const rawDt = Math.min(
      0.05,
      Math.max(0.001, (timestampMs - this.lastFrameMs) / 1000),
    );
    this.lastFrameMs = timestampMs;
    this.resize();
    // Smooth the simulation dt with a one-pole IIR filter and clamp to
    // a tight ceiling around 1/60. This is the canonical fix for
    // frame-rate-coupled motion stutter: even when a frame hitches
    // (rotate / zoom / first compile / GC), the value fed into
    // colorTime advances by a near-uniform amount, so particles don't
    // visibly jump. Camera-driven controllers (rotation / zoom / pan)
    // continue to use rawDt — they should stay responsive to actual
    // wall-clock time, only the FBM-driven ambient noise is what reads
    // as jaggidy when desynced.
    const NOMINAL_DT = 1 / 60;
    const SIM_DT_CEILING = NOMINAL_DT * 1.05;
    const clampedDt = Math.min(rawDt, SIM_DT_CEILING);
    this.smoothedSimDtSeconds =
      this.smoothedSimDtSeconds * 0.85 + clampedDt * 0.15;
    const simDt = this.smoothedSimDtSeconds;
    // Ambient motion (drift FBM time, color cycle) halts on either the
    // user-facing pause or the OS reduced-motion preference. This keeps
    // the prior collapsed-flag behavior even though motionSettings now
    // tracks the two signals separately for camera-ease purposes.
    const ambientFrozen =
      this.motionSettings.pauseMotion ||
      this.motionSettings.prefersReducedMotion;
    const motionDt = ambientFrozen
      ? 0
      : simDt *
        this.motionSettings.motionSpeedMultiplier *
        this.motionSettings.ambientEntropy;
    const colorDt = ambientFrozen
      ? 0
      : simDt * this.motionSettings.motionSpeedMultiplier;
    if (this.particleCount > 0) {
      this.colorTime += colorDt;
    }
    this.rotationController.tick({
      dtSeconds: rawDt,
      // Either the user-facing pause OR OS reduced-motion freezes the
      // ambient auto-rotation. Camera ease (zoom / pan controllers
      // below) reads only prefersReducedMotion so that explicit user
      // input still applies instantly during pauseMotion.
      pauseMotion:
        this.motionSettings.pauseMotion ||
        this.motionSettings.prefersReducedMotion,
      rotationSpeedMultiplier: this.motionSettings.rotationSpeedMultiplier,
      selectionActive: this.motionSettings.selectionActive,
      timestampMs,
    });
    this.zoomController.tick({
      dtSeconds: rawDt,
      prefersReducedMotion: this.motionSettings.prefersReducedMotion,
    });
    this.panController.tick({
      dtSeconds: rawDt,
      prefersReducedMotion: this.motionSettings.prefersReducedMotion,
    });
    this.tickInteractionState(rawDt);
    // Burst envelope advances even while ambient motion is paused —
    // visual rings out smoothly after a release regardless of the
    // pause toggle so the gesture itself stays expressive.
    this.burstEnvelope.tick(rawDt);
    this.writeFrameUniforms(timestampMs / 1000, motionDt);

    const encoder = this.device.createCommandEncoder({ label: "orb.frame" });
    // Skip the integrate compute when nothing visible would change:
    // ambient motion is paused (motionDt = 0) AND no interaction is
    // pulling weights AND no decay tail is playing AND no upload has
    // dirtied the display buffer. The render pass keeps drawing the
    // last computed display buffer state, so the orb stays visible —
    // it just stops animating. At 1M particles this skips ~3.2B FBM
    // ALU ops per frame on truly-paused states.
    const isAnimating =
      motionDt > 0 ||
      this.hasActiveFlag ||
      this.focusIndex >= 0 ||
      performance.now() <= this.interactionWindowEndMs;
    if (this.particleCount > 0 && (isAnimating || this.displayDirty)) {
      const computePass = encoder.beginComputePass({ label: "orb.integrate" });
      computePass.setPipeline(this.computePipeline);
      computePass.setBindGroup(0, this.computeBindGroup);
      computePass.dispatchWorkgroups(Math.ceil(this.particleCount / 64));
      computePass.end();
      this.displayDirty = false;
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
      // Clear to far (1.0) every frame so per-particle ndcZ writes
      // determine visibility from a fresh slate. storeOp:"discard" —
      // depth is consumed within the pass; no later pass needs it, so
      // we don't pay the bandwidth to write it back to memory.
      depthStencilAttachment: this.depthTexture
        ? {
            depthClearValue: 1,
            depthLoadOp: "clear",
            depthStoreOp: "discard",
            view: this.depthTexture.createView(),
          }
        : undefined,
      label: "orb.render",
    });
    const renderBundle = this.getRenderBundle();
    if (renderBundle) {
      renderPass.executeBundles(this.renderBundleList!);
    }
    renderPass.end();
    this.device.queue.submit([encoder.finish()]);

    if (perfOn) {
      markPerf("orb:frame:cpu:end");
      measurePerf("orb:frame:cpu", "orb:frame:cpu:start", "orb:frame:cpu:end");
    }
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private get aspect(): number {
    const height = Math.max(1, this.canvas.height);
    return Math.max(0.1, this.canvas.width / height);
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, ORB_CANVAS_DPR_CAP);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.recreateDepthTexture(width, height);
  }

  // (Re)create the depth texture to match the current canvas size.
  // Called from resize() when dimensions actually change. ~10-13 MB at
  // 1080p×1.25 DPR (depth24plus). Single-sample to match the
  // non-MSAA color attachment — the WebGPU spec requires sample count
  // parity across attachments in a render pass.
  private recreateDepthTexture(width: number, height: number): void {
    this.depthTexture?.destroy();
    this.depthTexture = this.device.createTexture({
      format: "depth24plus",
      label: "orb.depth-texture",
      size: { depthOrArrayLayers: 1, height, width },
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  private writeFrameUniforms(time: number, motionDt: number): void {
    packOrbFrameUniforms(this.frameUniformView, {
      aspect: this.aspect,
      burst: this.burstEnvelope.value,
      colorTime: this.colorTime,
      depth: this.introDepth.resolve(performance.now()),
      focusIndex: this.focusIndex,
      motionDt,
      panX: this.panController.x,
      panY: this.panController.y,
      particleCount: this.particleCount,
      pitch: this.rotationController.pitch,
      radiusScale: this.radiusScale,
      time,
      yaw: this.rotationController.rotation,
      yawOmega: this.yawOmega.sample(
        this.rotationController.rotation,
        performance.now(),
      ),
      zoom: this.zoomController.zoom,
    });
    this.device.queue.writeBuffer(
      this.frameUniformBuffer,
      0,
      this.frameUniformBytes,
    );
  }

  private tickInteractionState(dtSeconds: number): void {
    if (dtSeconds <= 0 || this.particleCount <= 0) return;
    // Skip the O(N) weight loop and the 16 MB queue.writeBuffer when no
    // interaction is active and the post-interaction decay window has
    // closed. Initial GPU weights are zero (uploadParticles writes a
    // cleared buffer on first non-empty upload), so the GPU stays at
    // rest while we skip — no residual weights to flush.
    const isActive = this.hasActiveFlag || this.focusIndex >= 0;
    if (!isActive && performance.now() > this.interactionWindowEndMs) return;
    tickOrbInteractionWeights(
      this.weights,
      this.flagShadow,
      this.particleCount,
      dtSeconds,
    );
    this.device.queue.writeBuffer(
      this.weightsBuffer,
      0,
      this.weights.data,
      0,
      this.particleCount * 4,
    );
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
      // Must match the render pass's depth attachment + the pipeline's
      // depthStencil format, or the bundle is layout-incompatible and
      // executeBundles validation-errors at submit time.
      depthStencilFormat: "depth24plus",
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
}
