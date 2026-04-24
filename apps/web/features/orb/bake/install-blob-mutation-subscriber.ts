import type { BlobGeometrySubscriber } from "@/features/field/renderer/FieldScene";
import { useOrbGeometryMutationStore } from "../stores/geometry-mutation-store";
import { applyPaperAttributeOverrides } from "./apply-paper-overrides";

/**
 * Installs the orb → FieldScene attribute-write bridge.
 *
 * Passed to `<FieldCanvas blobGeometrySubscriber={installBlobMutationSubscriber}>`
 * at layout level when field-mode='orb'. FieldScene invokes it with the
 * live blob BufferGeometry + R3F invalidate() once the blob layer is
 * attached. Every chunk the paper baker appends to the orb mutation
 * store is applied in order; the applier calls `invalidate()` exactly
 * once per flush so `frameloop="demand"` observes the mutation.
 *
 * A per-invocation cursor (not a store field) tracks how many chunks
 * have been applied. If FieldScene reinstalls (e.g. blob geometry
 * rebuilds), the cursor resets and the whole accumulated history
 * re-applies onto the new geometry — correct for the remount case.
 */
export const installBlobMutationSubscriber: BlobGeometrySubscriber = ({
  geometry,
  invalidate,
}) => {
  let lastApplied = 0;

  const applyPending = () => {
    const { chunks } = useOrbGeometryMutationStore.getState();
    if (chunks.length <= lastApplied) return;
    for (let i = lastApplied; i < chunks.length; i += 1) {
      const chunk = chunks[i]!;
      applyPaperAttributeOverrides(geometry, chunk.attributes, {
        maxima: chunk.maxima,
      });
    }
    lastApplied = chunks.length;
    invalidate();
  };

  // Apply any chunks already published before we subscribed (the baker
  // may start streaming before FieldScene's subscribe effect runs).
  applyPending();

  const unsubscribe = useOrbGeometryMutationStore.subscribe(applyPending);

  return () => {
    unsubscribe();
  };
};
