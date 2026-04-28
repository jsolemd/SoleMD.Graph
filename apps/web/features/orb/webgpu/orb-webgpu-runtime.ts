/// <reference types="@webgpu/types" />

import type { OrbSelectionRect } from "../interaction/OrbInteractionSurface";
import { ORB_PICK_NO_HIT, type OrbPickRectMode } from "../interaction/orb-picker-store";
import type { OrbWebGpuParticleArrays } from "./orb-webgpu-particles";
import type { OrbWebGpuDeviceContext } from "./orb-webgpu-gate";

const COMPUTE_POSITION_INDEX = 0;
const COMPUTE_VELOCITY_INDEX = 1;
const COMPUTE_ATTRIBUTE_INDEX = 2;
const COMPUTE_FRAME_INDEX = 3;
const RENDER_POSITION_INDEX = 4;
const RENDER_ATTRIBUTE_INDEX = 5;
const RENDER_FLAG_INDEX = 6;
const RENDER_FRAME_INDEX = 7;
const PICK_POSITION_INDEX = 8;
const PICK_FRAME_INDEX = 9;
const PICK_PARAM_INDEX = 10;
const PICK_RESULT_INDEX = 11;
const RECT_PARAM_INDEX = 12;
const RECT_RESULT_INDEX = 13;

const U32_BYTES = 4;
const VEC4_BYTES = 16;
const FRAME_UNIFORM_BYTES = 32;
const PICK_PARAM_BYTES = 16;
const RECT_PARAM_BYTES = 32;

const shaderSource = /* wgsl */ `
struct FrameUniforms {
  time: f32,
  dt: f32,
  count: u32,
  _pad0: u32,
  aspect: f32,
  radiusScale: f32,
  rotation: f32,
  _pad1: f32,
};

struct PickParams {
  x: f32,
  y: f32,
  aspect: f32,
  count: u32,
};

struct RectParams {
  left: f32,
  top: f32,
  right: f32,
  bottom: f32,
  aspect: f32,
  count: u32,
  mode: u32,
  _pad0: u32,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec4f,
};

@group(0) @binding(${COMPUTE_POSITION_INDEX}) var<storage, read_write> computePositions: array<vec4f>;
@group(0) @binding(${COMPUTE_VELOCITY_INDEX}) var<storage, read> computeVelocities: array<vec4f>;
@group(0) @binding(${COMPUTE_ATTRIBUTE_INDEX}) var<storage, read> computeAttributes: array<vec4f>;
@group(0) @binding(${COMPUTE_FRAME_INDEX}) var<uniform> computeFrame: FrameUniforms;
@group(0) @binding(${RENDER_POSITION_INDEX}) var<storage, read> renderPositions: array<vec4f>;
@group(0) @binding(${RENDER_ATTRIBUTE_INDEX}) var<storage, read> renderAttributes: array<vec4f>;
@group(0) @binding(${RENDER_FLAG_INDEX}) var<storage, read> renderFlags: array<u32>;
@group(0) @binding(${RENDER_FRAME_INDEX}) var<uniform> renderFrame: FrameUniforms;
@group(0) @binding(${PICK_POSITION_INDEX}) var<storage, read> pickPositions: array<vec4f>;
@group(0) @binding(${PICK_FRAME_INDEX}) var<uniform> pickFrame: FrameUniforms;
@group(0) @binding(${PICK_PARAM_INDEX}) var<uniform> pickParams: PickParams;
@group(0) @binding(${PICK_RESULT_INDEX}) var<storage, read_write> pickResult: array<u32>;
@group(0) @binding(${RECT_PARAM_INDEX}) var<uniform> rectParams: RectParams;
@group(0) @binding(${RECT_RESULT_INDEX}) var<storage, read_write> rectResult: array<u32>;

fn rotateY(p: vec4f, angle: f32) -> vec4f {
  let c = cos(angle);
  let s = sin(angle);
  return vec4f(p.x * c - p.z * s, p.y, p.x * s + p.z * c, p.w);
}

fn clipCenter(p: vec4f) -> vec2f {
  let rotated = rotateY(p, renderFrame.rotation);
  return vec2f(rotated.x / max(renderFrame.aspect, 0.1), rotated.y);
}

fn vertexCorner(vertexIndex: u32) -> vec2f {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );
  return corners[vertexIndex];
}

@compute @workgroup_size(64)
fn integrateParticles(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= computeFrame.count) {
    return;
  }

  var p = computePositions[i];
  let v = computeVelocities[i];
  let attr = computeAttributes[i];
  let spin = computeFrame.dt * (0.10 + attr.w * 0.025);
  let c = cos(spin);
  let s = sin(spin);
  let x = p.x * c - p.z * s;
  let z = p.x * s + p.z * c;
  p.x = x + v.x * computeFrame.dt * 0.012;
  p.y = p.y + sin(computeFrame.time * 0.7 + f32(i) * 0.037) * computeFrame.dt * 0.00045;
  p.z = z + v.z * computeFrame.dt * 0.012;
  computePositions[i] = p;
}

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOut {
  let p = renderPositions[instanceIndex];
  let attr = renderAttributes[instanceIndex];
  let flag = renderFlags[instanceIndex];
  let corner = vertexCorner(vertexIndex);
  var radius = p.w * renderFrame.radiusScale;
  var color = vec3f(attr.x, attr.y, attr.z);
  var alpha = 0.56;

  if ((flag & 8u) != 0u) {
    color = mix(color, vec3f(0.66, 0.86, 0.98), 0.34);
    alpha = 0.76;
  }
  if ((flag & 16u) != 0u) {
    color = mix(color, vec3f(0.96, 0.78, 0.52), 0.34);
    alpha = 0.78;
  }
  if ((flag & 32u) != 0u) {
    radius = radius * 1.42;
    color = mix(color, vec3f(0.92, 0.70, 1.0), 0.44);
    alpha = 0.86;
  }
  if ((flag & 4u) != 0u) {
    radius = radius * 1.72;
    color = mix(color, vec3f(1.0, 0.78, 0.42), 0.52);
    alpha = 0.92;
  }
  if ((flag & 1u) != 0u) {
    radius = radius * 2.05;
    color = mix(color, vec3f(0.78, 0.95, 1.0), 0.62);
    alpha = 0.98;
  }
  if ((flag & 2u) != 0u) {
    radius = radius * 2.55;
    color = vec3f(1.0, 0.92, 0.66);
    alpha = 1.0;
  }

  let center = clipCenter(p);
  let scale = vec2f(radius / max(renderFrame.aspect, 0.1), radius);
  var out: VertexOut;
  out.position = vec4f(center + corner * scale, 0.0, 1.0);
  out.local = corner;
  out.color = vec4f(color, alpha);
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  let d = length(in.local);
  if (d > 1.0) {
    discard;
  }
  let edge = smoothstep(1.0, 0.72, d);
  let core = smoothstep(0.9, 0.12, d);
  let alpha = in.color.a * max(edge, core * 0.84);
  return vec4f(in.color.rgb * alpha, alpha);
}

@compute @workgroup_size(1)
fn pickParticle() {
  var best = 4294967295u;
  var bestScore = 1000000.0;
  var i = 0u;

  loop {
    if (i >= pickParams.count) {
      break;
    }
    let p = rotateY(pickPositions[i], pickFrame.rotation);
    let center = vec2f(p.x / max(pickParams.aspect, 0.1), p.y);
    let radius = p.w * pickFrame.radiusScale * 2.65;
    let d = distance(center, vec2f(pickParams.x, pickParams.y));
    if (d <= radius && d < bestScore) {
      best = i;
      bestScore = d;
    }
    i = i + 1u;
  }

  pickResult[0] = best;
}

@compute @workgroup_size(1)
fn pickRect() {
  rectResult[0] = 0u;
  var i = 0u;
  var written = 0u;

  loop {
    if (i >= rectParams.count) {
      break;
    }
    let p = rotateY(pickPositions[i], pickFrame.rotation);
    let center = vec2f(p.x / max(rectParams.aspect, 0.1), p.y);
    if (
      center.x >= rectParams.left &&
      center.x <= rectParams.right &&
      center.y >= rectParams.bottom &&
      center.y <= rectParams.top
    ) {
      written = written + 1u;
      rectResult[written] = i;
    }
    i = i + 1u;
  }

  rectResult[0] = written;
}
`;

export interface OrbWebGpuRuntime {
  uploadParticles(arrays: OrbWebGpuParticleArrays): void;
  uploadFlags(flags: Uint32Array): void;
  setMotionSettings(settings: OrbWebGpuMotionSettings): void;
  pickAsync(clientX: number, clientY: number): Promise<number>;
  pickRectAsync(
    rect: OrbSelectionRect,
    options?: { mode?: OrbPickRectMode },
  ): Promise<number[]>;
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
  private readonly positionsBuffer!: GPUBuffer;
  private readonly velocitiesBuffer!: GPUBuffer;
  private readonly attributesBuffer!: GPUBuffer;
  private readonly flagsBuffer!: GPUBuffer;
  private readonly device!: GPUDevice;
  private readonly context!: GPUCanvasContext;
  private readonly format!: GPUTextureFormat;
  private readonly canvas!: HTMLCanvasElement;
  private readonly maxParticles!: number;
  private readonly radiusScale!: number;
  private readonly resizeObserver!: ResizeObserver | null;
  private animationFrame: number | null = null;
  private disposed = false;
  private particleCount = 0;
  private lastFrameMs = 0;
  private pickQueue: Promise<number> = Promise.resolve(ORB_PICK_NO_HIT);
  private rectQueue: Promise<number[]> = Promise.resolve([]);
  private rotationOffset = 0;
  private motionSettings: OrbWebGpuMotionSettings = {
    ambientEntropy: 1,
    motionSpeedMultiplier: 1,
    pauseMotion: false,
    rotationSpeedMultiplier: 1,
  };

  private constructor(args: {
    computeBindGroup: GPUBindGroup;
    pickBindGroup: GPUBindGroup;
    renderBindGroup: GPUBindGroup;
    computePipeline: GPUComputePipeline;
    pickPipeline: GPUComputePipeline;
    rectPipeline: GPUComputePipeline;
    renderPipeline: GPURenderPipeline;
    frameUniformBuffer: GPUBuffer;
    pickParamBuffer: GPUBuffer;
    pickResultBuffer: GPUBuffer;
    pickStagingBuffer: GPUBuffer;
    rectParamBuffer: GPUBuffer;
    rectResultBuffer: GPUBuffer;
    rectStagingBuffer: GPUBuffer;
    positionsBuffer: GPUBuffer;
    velocitiesBuffer: GPUBuffer;
    attributesBuffer: GPUBuffer;
    flagsBuffer: GPUBuffer;
    device: GPUDevice;
    context: GPUCanvasContext;
    format: GPUTextureFormat;
    canvas: HTMLCanvasElement;
    maxParticles: number;
    radiusScale: number;
  }) {
    Object.assign(this, args);
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
    const { device, context, format, profile } = gpu;
    const maxParticles = profile.maxParticles;
    const storageUsage =
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const positionsBuffer = createBuffer(
      device,
      maxParticles * VEC4_BYTES,
      storageUsage,
      "orb.positions",
    );
    const velocitiesBuffer = createBuffer(
      device,
      maxParticles * VEC4_BYTES,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      "orb.velocities",
    );
    const attributesBuffer = createBuffer(
      device,
      maxParticles * VEC4_BYTES,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      "orb.attributes",
    );
    const flagsBuffer = createBuffer(
      device,
      maxParticles * U32_BYTES,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      "orb.flags",
    );
    const frameUniformBuffer = createBuffer(
      device,
      FRAME_UNIFORM_BYTES,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      "orb.frame-uniforms",
    );
    const pickParamBuffer = createBuffer(
      device,
      PICK_PARAM_BYTES,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      "orb.pick-params",
    );
    const pickResultBuffer = createBuffer(
      device,
      U32_BYTES,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      "orb.pick-result",
    );
    const pickStagingBuffer = createBuffer(
      device,
      U32_BYTES,
      GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      "orb.pick-staging",
    );
    const rectParamBuffer = createBuffer(
      device,
      RECT_PARAM_BYTES,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      "orb.rect-params",
    );
    const rectResultBytes = (maxParticles + 1) * U32_BYTES;
    const rectResultBuffer = createBuffer(
      device,
      rectResultBytes,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      "orb.rect-result",
    );
    const rectStagingBuffer = createBuffer(
      device,
      rectResultBytes,
      GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      "orb.rect-staging",
    );

    device.pushErrorScope("validation");
    const shaderModule = device.createShaderModule({
      code: shaderSource,
      label: "orb.webgpu.wgsl",
    });
    const computeBindGroupLayout = device.createBindGroupLayout({
      entries: [
        storageEntry(COMPUTE_POSITION_INDEX, GPUShaderStage.COMPUTE, "storage"),
        storageEntry(COMPUTE_VELOCITY_INDEX, GPUShaderStage.COMPUTE, "read-only-storage"),
        storageEntry(COMPUTE_ATTRIBUTE_INDEX, GPUShaderStage.COMPUTE, "read-only-storage"),
        {
          binding: COMPUTE_FRAME_INDEX,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
      ],
      label: "orb.compute-bind-group-layout",
    });
    const renderBindGroupLayout = device.createBindGroupLayout({
      entries: [
        storageEntry(RENDER_POSITION_INDEX, GPUShaderStage.VERTEX, "read-only-storage"),
        storageEntry(RENDER_ATTRIBUTE_INDEX, GPUShaderStage.VERTEX, "read-only-storage"),
        storageEntry(RENDER_FLAG_INDEX, GPUShaderStage.VERTEX, "read-only-storage"),
        {
          binding: RENDER_FRAME_INDEX,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
      label: "orb.render-bind-group-layout",
    });
    const pickBindGroupLayout = device.createBindGroupLayout({
      entries: [
        storageEntry(PICK_POSITION_INDEX, GPUShaderStage.COMPUTE, "read-only-storage"),
        {
          binding: PICK_FRAME_INDEX,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        {
          binding: PICK_PARAM_INDEX,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        storageEntry(PICK_RESULT_INDEX, GPUShaderStage.COMPUTE, "storage"),
        {
          binding: RECT_PARAM_INDEX,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        storageEntry(RECT_RESULT_INDEX, GPUShaderStage.COMPUTE, "storage"),
      ],
      label: "orb.pick-bind-group-layout",
    });
    const computePipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [computeBindGroupLayout],
      label: "orb.compute-pipeline-layout",
    });
    const renderPipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [renderBindGroupLayout],
      label: "orb.render-pipeline-layout",
    });
    const pickPipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [pickBindGroupLayout],
      label: "orb.pick-pipeline-layout",
    });
    const computePipeline = device.createComputePipeline({
      compute: { entryPoint: "integrateParticles", module: shaderModule },
      layout: computePipelineLayout,
      label: "orb.compute.integrate",
    });
    const pickPipeline = device.createComputePipeline({
      compute: { entryPoint: "pickParticle", module: shaderModule },
      layout: pickPipelineLayout,
      label: "orb.compute.pick",
    });
    const rectPipeline = device.createComputePipeline({
      compute: { entryPoint: "pickRect", module: shaderModule },
      layout: pickPipelineLayout,
      label: "orb.compute.rect",
    });
    const renderPipeline = device.createRenderPipeline({
      fragment: {
        entryPoint: "fragmentMain",
        module: shaderModule,
        targets: [
          {
            blend: {
              alpha: {
                dstFactor: "one-minus-src-alpha",
                operation: "add",
                srcFactor: "one",
              },
              color: {
                dstFactor: "one-minus-src-alpha",
                operation: "add",
                srcFactor: "one",
              },
            },
            format,
          },
        ],
      },
      layout: renderPipelineLayout,
      primitive: { topology: "triangle-list" },
      vertex: { entryPoint: "vertexMain", module: shaderModule },
      label: "orb.render.billboards",
    });
    const validationError = await device.popErrorScope();
    if (validationError) {
      throw new Error(validationError.message);
    }

    const computeBindGroup = device.createBindGroup({
      entries: [
        { binding: COMPUTE_POSITION_INDEX, resource: { buffer: positionsBuffer } },
        { binding: COMPUTE_VELOCITY_INDEX, resource: { buffer: velocitiesBuffer } },
        { binding: COMPUTE_ATTRIBUTE_INDEX, resource: { buffer: attributesBuffer } },
        { binding: COMPUTE_FRAME_INDEX, resource: { buffer: frameUniformBuffer } },
      ],
      layout: computeBindGroupLayout,
      label: "orb.compute-bind-group",
    });
    const renderBindGroup = device.createBindGroup({
      entries: [
        { binding: RENDER_POSITION_INDEX, resource: { buffer: positionsBuffer } },
        { binding: RENDER_ATTRIBUTE_INDEX, resource: { buffer: attributesBuffer } },
        { binding: RENDER_FLAG_INDEX, resource: { buffer: flagsBuffer } },
        { binding: RENDER_FRAME_INDEX, resource: { buffer: frameUniformBuffer } },
      ],
      layout: renderBindGroupLayout,
      label: "orb.render-bind-group",
    });
    const pickBindGroup = device.createBindGroup({
      entries: [
        { binding: PICK_POSITION_INDEX, resource: { buffer: positionsBuffer } },
        { binding: PICK_FRAME_INDEX, resource: { buffer: frameUniformBuffer } },
        { binding: PICK_PARAM_INDEX, resource: { buffer: pickParamBuffer } },
        { binding: PICK_RESULT_INDEX, resource: { buffer: pickResultBuffer } },
        { binding: RECT_PARAM_INDEX, resource: { buffer: rectParamBuffer } },
        { binding: RECT_RESULT_INDEX, resource: { buffer: rectResultBuffer } },
      ],
      layout: pickBindGroupLayout,
      label: "orb.pick-bind-group",
    });

    return new OrbWebGpuRuntimeImpl({
      attributesBuffer,
      canvas,
      computeBindGroup,
      computePipeline,
      context,
      device,
      flagsBuffer,
      format,
      frameUniformBuffer,
      maxParticles,
      pickBindGroup,
      pickParamBuffer,
      pickPipeline,
      pickResultBuffer,
      pickStagingBuffer,
      positionsBuffer,
      radiusScale: profile.radiusScale,
      rectParamBuffer,
      rectPipeline,
      rectResultBuffer,
      rectStagingBuffer,
      renderBindGroup,
      renderPipeline,
      velocitiesBuffer,
    });
  }

  uploadParticles(arrays: OrbWebGpuParticleArrays): void {
    if (this.disposed) return;
    const count = Math.min(arrays.count, this.maxParticles);
    this.particleCount = count;
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
    this.rotationOffset = normalizeRadians(this.rotationOffset + deltaRadians);
    this.writeFrameUniforms(performance.now() / 1000, 0);
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
    const encoder = this.device.createCommandEncoder({ label: "orb.pick" });
    const pass = encoder.beginComputePass({ label: "orb.pick-pass" });
    pass.setPipeline(this.pickPipeline);
    pass.setBindGroup(0, this.pickBindGroup);
    pass.dispatchWorkgroups(1);
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
    return raw === 0xffffffff ? ORB_PICK_NO_HIT : raw;
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
    const encoder = this.device.createCommandEncoder({ label: "orb.rect-pick" });
    const pass = encoder.beginComputePass({ label: "orb.rect-pick-pass" });
    pass.setPipeline(this.rectPipeline);
    pass.setBindGroup(0, this.pickBindGroup);
    pass.dispatchWorkgroups(1);
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
    if (!this.motionSettings.pauseMotion) {
      this.rotationOffset = normalizeRadians(
        this.rotationOffset +
          rawDt * 0.09 * this.motionSettings.rotationSpeedMultiplier,
      );
    }
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
    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.renderBindGroup);
    renderPass.draw(6, this.particleCount);
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
    const buffer = new ArrayBuffer(FRAME_UNIFORM_BYTES);
    const view = new DataView(buffer);
    view.setFloat32(0, time, true);
    view.setFloat32(4, dt, true);
    view.setUint32(8, this.particleCount, true);
    view.setUint32(12, 0, true);
    view.setFloat32(16, this.aspect, true);
    view.setFloat32(20, this.radiusScale, true);
    view.setFloat32(24, this.rotationOffset, true);
    view.setFloat32(28, 0, true);
    this.device.queue.writeBuffer(this.frameUniformBuffer, 0, buffer);
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

function createBuffer(
  device: GPUDevice,
  size: number,
  usage: GPUBufferUsageFlags,
  label: string,
) {
  return device.createBuffer({
    label,
    size: Math.max(4, alignTo(size, 4)),
    usage,
  });
}

function storageEntry(
  binding: number,
  visibility: GPUShaderStageFlags,
  type: GPUBufferBindingType,
): GPUBindGroupLayoutEntry {
  return {
    binding,
    buffer: { type },
    visibility,
  };
}

function writePickParams(
  device: GPUDevice,
  buffer: GPUBuffer,
  args: { x: number; y: number; aspect: number; count: number },
): void {
  const bytes = new ArrayBuffer(PICK_PARAM_BYTES);
  const view = new DataView(bytes);
  view.setFloat32(0, args.x, true);
  view.setFloat32(4, args.y, true);
  view.setFloat32(8, args.aspect, true);
  view.setUint32(12, args.count, true);
  device.queue.writeBuffer(buffer, 0, bytes);
}

function writeRectParams(
  device: GPUDevice,
  buffer: GPUBuffer,
  args: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    aspect: number;
    count: number;
    mode: number;
  },
): void {
  const bytes = new ArrayBuffer(RECT_PARAM_BYTES);
  const view = new DataView(bytes);
  view.setFloat32(0, args.left, true);
  view.setFloat32(4, args.top, true);
  view.setFloat32(8, args.right, true);
  view.setFloat32(12, args.bottom, true);
  view.setFloat32(16, args.aspect, true);
  view.setUint32(20, args.count, true);
  view.setUint32(24, args.mode, true);
  view.setUint32(28, 0, true);
  device.queue.writeBuffer(buffer, 0, bytes);
}

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function normalizeRadians(value: number): number {
  const tau = Math.PI * 2;
  return ((value % tau) + tau) % tau;
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
