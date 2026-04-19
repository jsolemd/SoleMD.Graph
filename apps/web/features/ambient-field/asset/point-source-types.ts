import type { AmbientFieldStageItemId } from "../scene/visual-presets";

export interface AmbientFieldBounds {
  maxX: number;
  maxY: number;
  maxZ: number;
  minX: number;
  minY: number;
  minZ: number;
}

export interface AmbientFieldPointSourceBuffers {
  aAlpha: Float32Array;
  aBucket: Float32Array;
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

export interface AmbientFieldPointSource {
  bounds: AmbientFieldBounds;
  buffers: AmbientFieldPointSourceBuffers;
  id: AmbientFieldStageItemId;
  pointCount: number;
}

export interface ResolveAmbientFieldPointSourcesOptions {
  densityScale: number;
  isMobile: boolean;
}
