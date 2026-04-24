import type { FieldStageItemId } from "../scene/visual-presets";

export interface FieldBounds {
  maxX: number;
  maxY: number;
  maxZ: number;
  minX: number;
  minY: number;
  minZ: number;
}

export interface FieldPointSourceBuffers {
  aAlpha: Float32Array;
  aBucket: Float32Array;
  aClickPack: Float32Array;
  aFunnelEndShift: Float32Array;
  aFunnelNarrow: Float32Array;
  aFunnelStartShift: Float32Array;
  aFunnelThickness: Float32Array;
  aIndex: Float32Array;
  aMove: Float32Array;
  aRandomness: Float32Array;
  aSelection: Float32Array;
  aSpeed: Float32Array;
  aStreamFreq: Float32Array;
  color: Float32Array;
  position: Float32Array;
}

export interface FieldPointSource {
  bounds: FieldBounds;
  buffers: FieldPointSourceBuffers;
  id: FieldStageItemId;
  pointCount: number;
}

export interface ResolveFieldPointSourcesOptions {
  densityScale: number;
  isMobile: boolean;
}

export interface PrewarmFieldPointSourcesOptions
  extends ResolveFieldPointSourcesOptions {
  // Optional subset to prewarm (e.g. just the blob on landing surfaces).
  // When omitted, warms all registered sources.
  ids?: readonly FieldStageItemId[];
}
