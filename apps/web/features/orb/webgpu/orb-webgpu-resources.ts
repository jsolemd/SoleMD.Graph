/// <reference types="@webgpu/types" />

import type { OrbWebGpuDeviceContext } from "./orb-webgpu-gate";
import {
  COMPUTE_ATTRIBUTE_INDEX,
  COMPUTE_DISPLAY_INDEX,
  COMPUTE_FRAME_INDEX,
  COMPUTE_FLAG_INDEX,
  COMPUTE_PALETTE_SAMPLER_INDEX,
  COMPUTE_PALETTE_TEXTURE_INDEX,
  COMPUTE_POSITION_INDEX,
  COMPUTE_SIZES_INDEX,
  COMPUTE_VELOCITY_INDEX,
  COMPUTE_WEIGHT_INDEX,
  DISPLAY_PARTICLE_BYTES,
  FRAME_UNIFORM_BYTES,
  PICK_DISPLAY_INDEX,
  PICK_PARAM_BYTES,
  PICK_PARAM_INDEX,
  PICK_RESULT_INDEX,
  RECT_PARAM_BYTES,
  RECT_PARAM_INDEX,
  RECT_RESULT_INDEX,
  RENDER_DISPLAY_INDEX,
  RENDER_FRAME_INDEX,
  RENDER_SPRITE_SAMPLER_INDEX,
  RENDER_SPRITE_TEXTURE_INDEX,
  SIZE_BYTES_PER_PARTICLE,
  U32_BYTES,
  VEC4_BYTES,
  createBuffer,
  storageEntry,
} from "./orb-webgpu-layout";
import { ORB_WEBGPU_SHADER_SOURCE } from "./orb-webgpu-shader";
import { LANDING_RAINBOW_RGB } from "../../field/shared/landing-feel-constants";

export interface OrbWebGpuRuntimeResources {
  attributesBuffer: GPUBuffer;
  canvas: HTMLCanvasElement;
  computeBindGroup: GPUBindGroup;
  computePipeline: GPUComputePipeline;
  context: GPUCanvasContext;
  device: GPUDevice;
  displayBuffer: GPUBuffer;
  flagsBuffer: GPUBuffer;
  format: GPUTextureFormat;
  frameUniformBuffer: GPUBuffer;
  maxParticles: number;
  pickBindGroup: GPUBindGroup;
  pickParamBuffer: GPUBuffer;
  pickPipeline: GPUComputePipeline;
  pickResultBuffer: GPUBuffer;
  pickStagingBuffer: GPUBuffer;
  positionsBuffer: GPUBuffer;
  radiusScale: number;
  rectParamBuffer: GPUBuffer;
  rectPipeline: GPUComputePipeline;
  rectResultBuffer: GPUBuffer;
  rectStagingBuffer: GPUBuffer;
  renderBindGroup: GPUBindGroup;
  renderPipeline: GPURenderPipeline;
  seedAmbientGeometryPipeline: GPUComputePipeline;
  seedBindGroup: GPUBindGroup;
  sizesBuffer: GPUBuffer;
  spriteTexture: GPUTexture;
  velocitiesBuffer: GPUBuffer;
  weightsBuffer: GPUBuffer;
}

export async function createOrbWebGpuResources(
  canvas: HTMLCanvasElement,
  gpu: OrbWebGpuDeviceContext,
): Promise<OrbWebGpuRuntimeResources> {
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
  const sizesBuffer = createBuffer(
    device,
    maxParticles * SIZE_BYTES_PER_PARTICLE,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    "orb.sizes",
  );
  const flagsBuffer = createBuffer(
    device,
    maxParticles * U32_BYTES,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    "orb.flags",
  );
  const weightsBuffer = createBuffer(
    device,
    maxParticles * VEC4_BYTES,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    "orb.interaction-weights",
  );
  const displayBuffer = createBuffer(
    device,
    maxParticles * DISPLAY_PARTICLE_BYTES,
    GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    "orb.display-state",
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
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
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
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    "orb.rect-result",
  );
  const rectStagingBuffer = createBuffer(
    device,
    rectResultBytes,
    GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    "orb.rect-staging",
  );
  const spriteTexture = await createOrbSpriteTexture(device);
  const spriteSampler = device.createSampler({
    label: "orb.sprite-sampler",
    magFilter: "linear",
    minFilter: "linear",
  });
  const paletteTexture = createOrbPaletteTexture(device);
  // Linear filter + repeat-U on a 1×8 palette texture is what gives us
  // the prior orb's smooth GSAP-tweened "uColorNoise" rolling through
  // the rainbow stops. The hardware filter blends across adjacent
  // texels (and across the seam from texel 7 → texel 0) for free —
  // no shader-side lerp, no per-frame CPU tween. Sampling with
  // u = colorTime / period gives one full sweep per period.
  const paletteSampler = device.createSampler({
    addressModeU: "repeat",
    addressModeV: "clamp-to-edge",
    label: "orb.palette-sampler",
    magFilter: "linear",
    minFilter: "linear",
  });

  device.pushErrorScope("validation");
  const shaderModule = device.createShaderModule({
    code: ORB_WEBGPU_SHADER_SOURCE,
    label: "orb.webgpu.wgsl",
  });
  // positions/velocities/attributes are bound as read_write storage so
  // the seedAmbientGeometry compute pass can populate them once at first
  // upload. integrateParticles only reads them, but read_write is a
  // superset of read so a single layout works for both pipelines.
  const computeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      storageEntry(COMPUTE_POSITION_INDEX, GPUShaderStage.COMPUTE, "storage"),
      storageEntry(COMPUTE_VELOCITY_INDEX, GPUShaderStage.COMPUTE, "storage"),
      storageEntry(
        COMPUTE_ATTRIBUTE_INDEX,
        GPUShaderStage.COMPUTE,
        "storage",
      ),
      {
        binding: COMPUTE_FRAME_INDEX,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
      storageEntry(
        COMPUTE_FLAG_INDEX,
        GPUShaderStage.COMPUTE,
        "read-only-storage",
      ),
      storageEntry(COMPUTE_DISPLAY_INDEX, GPUShaderStage.COMPUTE, "storage"),
      storageEntry(
        COMPUTE_WEIGHT_INDEX,
        GPUShaderStage.COMPUTE,
        "read-only-storage",
      ),
      {
        binding: COMPUTE_PALETTE_TEXTURE_INDEX,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: "float", viewDimension: "2d" },
      },
      {
        binding: COMPUTE_PALETTE_SAMPLER_INDEX,
        visibility: GPUShaderStage.COMPUTE,
        sampler: { type: "filtering" },
      },
      storageEntry(
        COMPUTE_SIZES_INDEX,
        GPUShaderStage.COMPUTE,
        "read-only-storage",
      ),
    ],
    label: "orb.compute-bind-group-layout",
  });
  // Dedicated layout for the seed pass — only the four bindings the seed
  // entrypoint actually touches. Keeping this minimal lets the seed
  // dispatch skip binding the palette/flags/weights/display/sizes
  // resources entirely.
  const seedBindGroupLayout = device.createBindGroupLayout({
    entries: [
      storageEntry(COMPUTE_POSITION_INDEX, GPUShaderStage.COMPUTE, "storage"),
      storageEntry(COMPUTE_VELOCITY_INDEX, GPUShaderStage.COMPUTE, "storage"),
      storageEntry(COMPUTE_ATTRIBUTE_INDEX, GPUShaderStage.COMPUTE, "storage"),
      {
        binding: COMPUTE_FRAME_INDEX,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
    ],
    label: "orb.seed-bind-group-layout",
  });
  const renderBindGroupLayout = device.createBindGroupLayout({
    entries: [
      storageEntry(RENDER_DISPLAY_INDEX, GPUShaderStage.VERTEX, "read-only-storage"),
      {
        binding: RENDER_FRAME_INDEX,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform" },
      },
      {
        binding: RENDER_SPRITE_TEXTURE_INDEX,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "2d" },
      },
      {
        binding: RENDER_SPRITE_SAMPLER_INDEX,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "filtering" },
      },
    ],
    label: "orb.render-bind-group-layout",
  });
  const pickBindGroupLayout = device.createBindGroupLayout({
    entries: [
      storageEntry(PICK_DISPLAY_INDEX, GPUShaderStage.COMPUTE, "read-only-storage"),
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
  const seedPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [seedBindGroupLayout],
    label: "orb.seed-pipeline-layout",
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
  const seedAmbientGeometryPipeline = device.createComputePipeline({
    compute: { entryPoint: "seedAmbientGeometry", module: shaderModule },
    layout: seedPipelineLayout,
    label: "orb.compute.seed-ambient",
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
    // Native hardware depth: vertex writes per-particle ndcZ from
    // display.center.z (post-rotation depth), fragment alpha-test 0.4
    // gates which fragments write Z. Without this, render order =
    // instance index, uncorrelated with depth, producing the
    // see-through twinkle on overlapping particles. depth24plus is the
    // baseline-required depth format; sample count 1 matches the
    // non-MSAA color attachment.
    depthStencil: {
      depthCompare: "less",
      depthWriteEnabled: true,
      format: "depth24plus",
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
      { binding: COMPUTE_FLAG_INDEX, resource: { buffer: flagsBuffer } },
      { binding: COMPUTE_DISPLAY_INDEX, resource: { buffer: displayBuffer } },
      { binding: COMPUTE_WEIGHT_INDEX, resource: { buffer: weightsBuffer } },
      {
        binding: COMPUTE_PALETTE_TEXTURE_INDEX,
        resource: paletteTexture.createView(),
      },
      { binding: COMPUTE_PALETTE_SAMPLER_INDEX, resource: paletteSampler },
      { binding: COMPUTE_SIZES_INDEX, resource: { buffer: sizesBuffer } },
    ],
    layout: computeBindGroupLayout,
    label: "orb.compute-bind-group",
  });
  const seedBindGroup = device.createBindGroup({
    entries: [
      { binding: COMPUTE_POSITION_INDEX, resource: { buffer: positionsBuffer } },
      { binding: COMPUTE_VELOCITY_INDEX, resource: { buffer: velocitiesBuffer } },
      { binding: COMPUTE_ATTRIBUTE_INDEX, resource: { buffer: attributesBuffer } },
      { binding: COMPUTE_FRAME_INDEX, resource: { buffer: frameUniformBuffer } },
    ],
    layout: seedBindGroupLayout,
    label: "orb.seed-bind-group",
  });
  const renderBindGroup = device.createBindGroup({
    entries: [
      { binding: RENDER_DISPLAY_INDEX, resource: { buffer: displayBuffer } },
      { binding: RENDER_FRAME_INDEX, resource: { buffer: frameUniformBuffer } },
      { binding: RENDER_SPRITE_TEXTURE_INDEX, resource: spriteTexture.createView() },
      { binding: RENDER_SPRITE_SAMPLER_INDEX, resource: spriteSampler },
    ],
    layout: renderBindGroupLayout,
    label: "orb.render-bind-group",
  });
  const pickBindGroup = device.createBindGroup({
    entries: [
      { binding: PICK_DISPLAY_INDEX, resource: { buffer: displayBuffer } },
      { binding: PICK_PARAM_INDEX, resource: { buffer: pickParamBuffer } },
      { binding: PICK_RESULT_INDEX, resource: { buffer: pickResultBuffer } },
      { binding: RECT_PARAM_INDEX, resource: { buffer: rectParamBuffer } },
      { binding: RECT_RESULT_INDEX, resource: { buffer: rectResultBuffer } },
    ],
    layout: pickBindGroupLayout,
    label: "orb.pick-bind-group",
  });

  return {
    attributesBuffer,
    canvas,
    computeBindGroup,
    computePipeline,
    context,
    device,
    displayBuffer,
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
    seedAmbientGeometryPipeline,
    seedBindGroup,
    sizesBuffer,
    spriteTexture,
    velocitiesBuffer,
    weightsBuffer,
  };
}

// Bake the LANDING_RAINBOW_RGB palette into a 1-row 8-column RGBA8Unorm
// texture. Using `rgba8unorm` (not `rgba8unorm-srgb`) keeps the linear
// filter blending in the same color space as the prior shader's GSAP
// linear RGB tween, so the visual character of the palette ramp matches
// what we had in Three.js.
function createOrbPaletteTexture(device: GPUDevice): GPUTexture {
  const stops = LANDING_RAINBOW_RGB.length;
  const data = new Uint8Array(stops * 4);
  for (let i = 0; i < stops; i += 1) {
    const [r, g, b] = LANDING_RAINBOW_RGB[i] ?? [0, 0, 0];
    data[i * 4 + 0] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  const texture = device.createTexture({
    format: "rgba8unorm",
    label: "orb.palette-texture",
    size: { depthOrArrayLayers: 1, height: 1, width: stops },
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    data,
    { bytesPerRow: stops * 4, rowsPerImage: 1 },
    { depthOrArrayLayers: 1, height: 1, width: stops },
  );
  return texture;
}

async function createOrbSpriteTexture(device: GPUDevice): Promise<GPUTexture> {
  const response = await fetch("/research/maze-particle.png");
  if (!response.ok) {
    throw new Error(`Failed to load orb sprite: ${response.status}`);
  }
  const bitmap = await createImageBitmap(await response.blob());
  const texture = device.createTexture({
    format: "rgba8unorm",
    label: "orb.sprite-texture",
    size: { depthOrArrayLayers: 1, height: bitmap.height, width: bitmap.width },
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: bitmap },
    { texture },
    { height: bitmap.height, width: bitmap.width },
  );
  bitmap.close();
  return texture;
}
