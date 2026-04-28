/// <reference types="@webgpu/types" />

import type { OrbWebGpuDeviceContext } from "./orb-webgpu-gate";
import {
  COMPUTE_ATTRIBUTE_INDEX,
  COMPUTE_FRAME_INDEX,
  COMPUTE_POSITION_INDEX,
  COMPUTE_VELOCITY_INDEX,
  FRAME_UNIFORM_BYTES,
  PICK_FRAME_INDEX,
  PICK_PARAM_BYTES,
  PICK_PARAM_INDEX,
  PICK_POSITION_INDEX,
  PICK_RESULT_INDEX,
  RECT_PARAM_BYTES,
  RECT_PARAM_INDEX,
  RECT_RESULT_INDEX,
  RENDER_ATTRIBUTE_INDEX,
  RENDER_FLAG_INDEX,
  RENDER_FRAME_INDEX,
  RENDER_POSITION_INDEX,
  U32_BYTES,
  VEC4_BYTES,
  createBuffer,
  storageEntry,
} from "./orb-webgpu-layout";
import { ORB_WEBGPU_SHADER_SOURCE } from "./orb-webgpu-shader";

export interface OrbWebGpuRuntimeResources {
  attributesBuffer: GPUBuffer;
  canvas: HTMLCanvasElement;
  computeBindGroup: GPUBindGroup;
  computePipeline: GPUComputePipeline;
  context: GPUCanvasContext;
  device: GPUDevice;
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
  velocitiesBuffer: GPUBuffer;
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
    code: ORB_WEBGPU_SHADER_SOURCE,
    label: "orb.webgpu.wgsl",
  });
  const computeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      storageEntry(COMPUTE_POSITION_INDEX, GPUShaderStage.COMPUTE, "storage"),
      storageEntry(
        COMPUTE_VELOCITY_INDEX,
        GPUShaderStage.COMPUTE,
        "read-only-storage",
      ),
      storageEntry(
        COMPUTE_ATTRIBUTE_INDEX,
        GPUShaderStage.COMPUTE,
        "read-only-storage",
      ),
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

  return {
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
  };
}
