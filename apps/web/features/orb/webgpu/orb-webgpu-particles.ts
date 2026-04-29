import type { PaperChunk } from "../stores/geometry-mutation-store";
import type { OrbFocusVisualState } from "../stores/focus-visual-store";
import {
  deriveLocalPaperCorpusStats,
  mapOrbPaperVisualAttributes,
} from "../bake/orb-paper-visual-mapping";
import { ORB_PARTICLE_CAPACITY } from "../bake/orb-particle-constants";

export const ORB_WEBGPU_HOVER_FLAG = 1 << 0;
export const ORB_WEBGPU_FOCUS_FLAG = 1 << 1;
export const ORB_WEBGPU_SELECTION_FLAG = 1 << 2;
export const ORB_WEBGPU_SCOPE_FLAG = 1 << 3;
export const ORB_WEBGPU_NEIGHBOR_FLAG = 1 << 4;
export const ORB_WEBGPU_EVIDENCE_FLAG = 1 << 5;
/**
 * Dim-everyone-else bit. Set on every particle when *any* of scope,
 * selection, or pending-selection is non-empty; cleared on the bright
 * set (scope ∪ selection ∪ pending and any neighbor / evidence /
 * hover / focus targets the user is actively engaging). Numeric bit
 * value preserved across the previous SCOPE_DIM rename so existing
 * GPU buffer layouts don't reshuffle.
 */
export const ORB_WEBGPU_DIM_FLAG = 1 << 6;

const DEFAULT_RADIUS = 0.0018;

export interface OrbWebGpuParticleArrays {
  count: number;
  /**
   * Per-particle radius. Default-filled with `DEFAULT_RADIUS`; chunk
   * application multiplies by the paper's mapped sizeFactor. Replaces
   * the legacy `positions[i].w` packing — the GPU now seeds positions
   * itself, and only the radius is CPU-driven.
   */
  sizes: Float32Array;
  flags: Uint32Array;
}

export interface OrbWebGpuChunkRange {
  /** First particle index touched by the chunk (inclusive). */
  fromIndex: number;
  /** Last particle index touched by the chunk (inclusive). */
  toIndex: number;
}

/**
 * Allocate the orb's CPU-side typed arrays.
 *
 * After the full-GPU init refactor, positions / velocities / per-axis
 * speed attributes are all synthesized inside a one-shot WGSL seed
 * pass. The CPU only owns:
 *   - `sizes`: per-particle radius, default-filled and updated per-paper
 *     by chunk application.
 *   - `flags`: focus/hover/selection/scope/etc. bitfield, rebuilt by
 *     `buildOrbWebGpuFlagArray` whenever focus state changes.
 */
export function seedOrbWebGpuParticleArrays(
  requestedCount: number | null | undefined,
): OrbWebGpuParticleArrays {
  const count = resolveOrbWebGpuParticleCount(requestedCount);
  const sizes = new Float32Array(count);
  sizes.fill(DEFAULT_RADIUS);
  const flags = new Uint32Array(count);
  return { count, sizes, flags };
}

/**
 * Apply one streamed chunk in place. Idempotent: re-applying the same
 * chunk yields the same arrays because the radius is recomputed from
 * the chunk's own attribute mapping rather than read out of the live
 * arrays.
 *
 * Returns the contiguous index range the chunk actually wrote to so
 * the caller can do a partial GPU upload covering just that slice.
 * Returns null if the chunk wrote nothing.
 */
export function applyOrbWebGpuChunkInPlace(
  arrays: OrbWebGpuParticleArrays,
  chunk: PaperChunk,
): OrbWebGpuChunkRange | null {
  const stats =
    chunk.stats ?? deriveLocalPaperCorpusStats(chunk.attributes.values());
  let minIndex = Number.POSITIVE_INFINITY;
  let maxIndex = Number.NEGATIVE_INFINITY;

  for (const [index, attrs] of chunk.attributes) {
    if (!isResidentIndex(index, arrays.count)) continue;
    const mapping = mapOrbPaperVisualAttributes(attrs, stats);
    arrays.sizes[index] = DEFAULT_RADIUS * mapping.sizeFactor;
    if (index < minIndex) minIndex = index;
    if (index > maxIndex) maxIndex = index;
  }

  if (minIndex === Number.POSITIVE_INFINITY) return null;
  return { fromIndex: minIndex, toIndex: maxIndex };
}

export type OrbWebGpuFocusInput = Pick<
  OrbFocusVisualState,
  | "focusIndex"
  | "hoverIndex"
  | "selectionIndices"
  | "scopeIndices"
  | "neighborIndices"
  | "evidenceIndices"
  | "pendingParticleIndices"
>;

export function buildOrbWebGpuParticleArrays(args: {
  requestedCount: number | null | undefined;
  chunks: readonly PaperChunk[];
  focus: OrbWebGpuFocusInput;
}): OrbWebGpuParticleArrays {
  const arrays = seedOrbWebGpuParticleArrays(args.requestedCount);
  for (const chunk of args.chunks) {
    applyOrbWebGpuChunkInPlace(arrays, chunk);
  }
  arrays.flags.set(buildOrbWebGpuFlagArray(arrays.count, args.focus));
  return arrays;
}

/**
 * Build the per-particle flag bitfield for one frame.
 *
 * Dim-on-any-select contract:
 *   - If *any* of scope / selection / pending is non-empty, every
 *     particle starts dim (`ORB_WEBGPU_DIM_FLAG`).
 *   - Each bright-set member then gets its lane bit set AND DIM cleared.
 *   - Bright set = scope ∪ selection ∪ pending ∪ neighbor ∪ evidence
 *     ∪ {hover} ∪ {focus}. Pending-particles also receive
 *     `ORB_WEBGPU_SELECTION_FLAG` so the shader's existing selectW
 *     enlargement / orange tint fires while the resolver round-trips
 *     through DuckDB. Neighbor / evidence indices clear DIM as well —
 *     they used to ride only on scope-driven DIM, but with selection
 *     also triggering DIM they need to opt out explicitly.
 */
export function buildOrbWebGpuFlagArray(
  count: number,
  focus: OrbWebGpuFocusInput,
): Uint32Array {
  const flags = new Uint32Array(count);
  const hasScope = focus.scopeIndices.length > 0;
  const hasSelection =
    focus.selectionIndices.length > 0 ||
    focus.pendingParticleIndices.length > 0;
  if (hasScope || hasSelection) {
    flags.fill(ORB_WEBGPU_DIM_FLAG);
  }
  for (const index of focus.evidenceIndices) {
    if (isResidentIndex(index, count)) {
      flags[index] |= ORB_WEBGPU_EVIDENCE_FLAG;
      flags[index] &= ~ORB_WEBGPU_DIM_FLAG;
    }
  }
  for (const index of focus.neighborIndices) {
    if (isResidentIndex(index, count)) {
      flags[index] |= ORB_WEBGPU_NEIGHBOR_FLAG;
      flags[index] &= ~ORB_WEBGPU_DIM_FLAG;
    }
  }
  for (const index of focus.scopeIndices) {
    if (isResidentIndex(index, count)) {
      flags[index] |= ORB_WEBGPU_SCOPE_FLAG;
      flags[index] &= ~ORB_WEBGPU_DIM_FLAG;
    }
  }
  for (const index of focus.selectionIndices) {
    if (isResidentIndex(index, count)) {
      flags[index] |= ORB_WEBGPU_SELECTION_FLAG;
      flags[index] &= ~ORB_WEBGPU_DIM_FLAG;
    }
  }
  // Pending: optimistic indices written by interaction hooks before the
  // resolver round-trips. Reuse SELECTION_FLAG so the shader's
  // selectW-driven enlargement and orange/halo treatment fire on the
  // same code path — keeps the visual contract identical between
  // optimistic and confirmed selection.
  for (const index of focus.pendingParticleIndices) {
    if (isResidentIndex(index, count)) {
      flags[index] |= ORB_WEBGPU_SELECTION_FLAG;
      flags[index] &= ~ORB_WEBGPU_DIM_FLAG;
    }
  }
  if (isResidentIndex(focus.hoverIndex, count)) {
    flags[focus.hoverIndex] |= ORB_WEBGPU_HOVER_FLAG;
    flags[focus.hoverIndex] &= ~ORB_WEBGPU_DIM_FLAG;
  }
  if (isResidentIndex(focus.focusIndex, count)) {
    flags[focus.focusIndex] |= ORB_WEBGPU_FOCUS_FLAG;
    flags[focus.focusIndex] &= ~ORB_WEBGPU_DIM_FLAG;
  }
  return flags;
}

/**
 * Pure decision contract for the dim-on-any-select visual:
 *   - `dimAll` = whether any selection/scope/pending input is non-empty,
 *     which is exactly the condition under which the shader applies the
 *     dim path to every non-bright particle.
 *   - `brightSet` = the union of scope ∪ selection ∪ pending — the
 *     particles that explicitly clear the DIM bit. (Neighbor / evidence
 *     / hover / focus are *also* bright in the actual flag array but
 *     they're derived state, not part of the user-driven selection
 *     intent this helper expresses.)
 *
 * Used by interaction code that needs to reason about "is the orb in
 * dim mode right now?" without rebuilding the full flag array. Unit-
 * tested in orb-webgpu-dim-uniform.test.ts against the visual contract.
 */
export function computeDimUniform(input: {
  selectionIndices: readonly number[];
  scopeIndices: readonly number[];
  pendingIndices: readonly number[];
}): { dimAll: boolean; brightSet: Set<number> } {
  const hasScope = input.scopeIndices.length > 0;
  const hasSelection =
    input.selectionIndices.length > 0 || input.pendingIndices.length > 0;
  const dimAll = hasScope || hasSelection;
  const brightSet = new Set<number>();
  if (!dimAll) return { dimAll, brightSet };
  for (const index of input.scopeIndices) {
    if (Number.isInteger(index) && index >= 0) brightSet.add(index);
  }
  for (const index of input.selectionIndices) {
    if (Number.isInteger(index) && index >= 0) brightSet.add(index);
  }
  for (const index of input.pendingIndices) {
    if (Number.isInteger(index) && index >= 0) brightSet.add(index);
  }
  return { dimAll, brightSet };
}

export function resolveOrbWebGpuParticleCount(
  requestedCount: number | null | undefined,
): number {
  if (!Number.isFinite(requestedCount) || requestedCount == null) {
    return ORB_PARTICLE_CAPACITY;
  }
  return Math.max(0, Math.min(ORB_PARTICLE_CAPACITY, Math.trunc(requestedCount)));
}

function isResidentIndex(index: number | null | undefined, count: number): index is number {
  return (
    index != null &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < count &&
    index < ORB_PARTICLE_CAPACITY
  );
}
