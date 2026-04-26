import * as THREE from "three";

import type { BlobGeometrySubscriber } from "@/features/field/renderer/FieldScene";
import { ORB_PAPER_OVERRIDE_ATTRIBUTES } from "@/features/field/asset/field-attribute-baker";
import { useOrbGeometryMutationStore } from "../stores/geometry-mutation-store";
import { useOrbScopeMutationStore } from "../stores/scope-mutation-store";
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
 *
 * ### Usage hints
 *
 * On install, the subscriber flips every orb-override attribute to
 * `DynamicDrawUsage`. The runtime BufferAttributes are constructed by
 * R3F's `<bufferAttribute args=[…]>` in FieldScene and default to
 * StaticDraw — which forces a full `gl.bufferData()` realloc per
 * `needsUpdate`. DynamicDraw lets `addUpdateRange` hit
 * `gl.bufferSubData` and upload only the touched slice.
 *
 * Flipping lives here (not in the baker) because the baker can't reach
 * the R3F-owned BufferAttribute instances — it only produces the raw
 * Float32Array buffers that R3F re-wraps. Doing it on orb activation
 * is the earliest point where the runtime attributes exist.
 */
export const installBlobMutationSubscriber: BlobGeometrySubscriber = ({
  geometry,
  invalidate,
}) => {
  for (const name of ORB_PAPER_OVERRIDE_ATTRIBUTES) {
    const attr = geometry.getAttribute(name) as
      | THREE.BufferAttribute
      | undefined;
    attr?.setUsage(THREE.DynamicDrawUsage);
  }

  let lastApplied = 0;

  const applyPending = () => {
    const { chunks } = useOrbGeometryMutationStore.getState();
    if (chunks.length <= lastApplied) return;
    for (let i = lastApplied; i < chunks.length; i += 1) {
      const chunk = chunks[i]!;
      applyPaperAttributeOverrides(geometry, chunk.attributes, {
        stats: chunk.stats,
      });
    }
    lastApplied = chunks.length;
    invalidate();
  };

  // Apply any chunks already published before we subscribed (the baker
  // may start streaming before FieldScene's subscribe effect runs).
  applyPending();

  const unsubscribePapers = useOrbGeometryMutationStore.subscribe(applyPending);

  // Slice 8: scope revision bridge. The resolver writes the
  // particle-state texture data directly (module-level singleton);
  // this hook only triggers an R3F invalidate() so frameloop="demand"
  // picks up the texture upload. No vertex-attribute write here —
  // scope membership lives in the sidecar texture sampled by aIndex.
  let lastScopeRevision = useOrbScopeMutationStore.getState().scopeRevision;
  const applyScope = () => {
    const { scopeRevision } = useOrbScopeMutationStore.getState();
    if (scopeRevision === lastScopeRevision) return;
    lastScopeRevision = scopeRevision;
    invalidate();
  };

  // Pick up any revision already published before subscription.
  invalidate();
  const unsubscribeScope = useOrbScopeMutationStore.subscribe(applyScope);

  return () => {
    unsubscribePapers();
    unsubscribeScope();
  };
};
