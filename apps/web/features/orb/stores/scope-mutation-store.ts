import { create } from "zustand";

/**
 * Orb → FieldScene bridge for particle-state texture writes.
 *
 * Dynamic per-particle state lives in the module-level particle-state
 * `THREE.DataTexture` (see
 * `apps/web/features/field/renderer/field-particle-state-texture.ts`).
 * This store holds only the `revision` counter that signals a fresh
 * lane write — the install-blob-mutation subscriber listens for it
 * and calls R3F `invalidate()` so `frameloop="demand"` picks up the
 * texture upload.
 *
 * Sibling to `geometry-mutation-store` (paper-attribute chunks). They
 * stay separate because their lifecycles diverge: paper chunks are
 * append-only and stream once on bundle warmup; particle-state writes
 * can be full-buffer overwrites (scope) or touched-index writes
 * (hover/focus).
 *
 * Contract:
 *   - Orb resolvers write into the particle-state texture
 *     data array directly, sets `texture.needsUpdate = true`, then
 *     calls `bumpScopeRevision()` to wake the subscriber.
 *   - `reset()` zeros the revision and clears the underlying
 *     particle-state texture. Called on orb unmount; mirrors the
 *     geometry-mutation-store reset() in `DashboardClientShell`.
 */

import { resetParticleStateTexture } from "@/features/field/renderer/field-particle-state-texture";

export interface OrbScopeMutationState {
  scopeRevision: number;
  bumpScopeRevision: () => void;
  reset: () => void;
}

export const useOrbScopeMutationStore = create<OrbScopeMutationState>((set) => ({
  scopeRevision: 0,
  bumpScopeRevision: () =>
    set((state) => ({ scopeRevision: state.scopeRevision + 1 })),
  reset: () => {
    resetParticleStateTexture();
    set({ scopeRevision: 0 });
  },
}));
