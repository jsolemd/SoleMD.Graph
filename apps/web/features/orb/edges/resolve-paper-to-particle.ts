import { useOrbGeometryMutationStore } from "../stores/geometry-mutation-store";
import type { PaperChunk } from "../stores/geometry-mutation-store";

export const MISSING_PARTICLE_INDEX = -1;

/**
 * Resolves paper ids through the orb's resident paper mirror.
 *
 * The paper baker already streams the sampled paper->particle assignment into
 * `useOrbGeometryMutationStore`. Edge upload code should use this helper once
 * per buffer rebuild, then keep particle endpoints in GPU-owned arrays. Hover
 * and select tiers must never do this lookup per frame.
 */
export function resolvePaperIdsToParticleIndices(
  paperIds: readonly string[],
  chunks: readonly PaperChunk[] = useOrbGeometryMutationStore.getState().chunks,
): Int32Array {
  const particleIndices = new Int32Array(paperIds.length);
  particleIndices.fill(MISSING_PARTICLE_INDEX);
  if (paperIds.length === 0 || chunks.length === 0) return particleIndices;

  const unresolved = new Map<string, number[]>();
  for (let index = 0; index < paperIds.length; index += 1) {
    const paperId = paperIds[index];
    if (!paperId) continue;
    const slots = unresolved.get(paperId);
    if (slots) {
      slots.push(index);
    } else {
      unresolved.set(paperId, [index]);
    }
  }

  if (unresolved.size === 0) return particleIndices;

  for (const chunk of chunks) {
    for (const [particleIdx, attrs] of chunk.attributes) {
      const slots = unresolved.get(attrs.paperId);
      if (!slots) continue;

      for (const slot of slots) {
        particleIndices[slot] = particleIdx;
      }
      unresolved.delete(attrs.paperId);

      if (unresolved.size === 0) return particleIndices;
    }
  }

  return particleIndices;
}
