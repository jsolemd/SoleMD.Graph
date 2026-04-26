# M5b — 3D primary workspace flip

> **AMENDED 2026-04-25.** With the GraphOrb R3F prototype retired,
> the 3D path is `OrbSurface`. `rendererMode` already defaults to
> `'3d'` in M5a; M5b now describes the marketing/UX hardening rather
> than a technical default-flip.

## Scope

Product-target flip: `/graph` defaults to the 3D orb workspace with
prompt/search, ranked results, info panel, wiki, filters, and RAG
evidence all present there. 2D remains toggleable as an analytic lens.

## Acceptance

Per
[18-verification-and-rollout.md](../18-verification-and-rollout.md)
§ M5b default-flip gate:

- M5a in production for ≥ 2 weeks.
- 3D meets or exceeds core-flow readiness: prompt/search → result →
  focus → info/wiki → filter/timeline remains fast and coherent.
- No regressions in core flows.
- Mobile usage data acceptable.
- Accessibility review passes.

The flip itself is a one-line default change in `view-slice`
(`rendererMode: '3d'`). Risk = workspace readiness and rollback
confidence, not implementation.

## Files

- `apps/web/features/graph/stores/slices/view-slice.ts` (default
  changes).
- (Possibly) marketing / docs updates.
- Banner / education tooltip on first 3D-mode load
  ("This is the new default. 2D toggle in the chrome.").

## Verify

- Default `/graph` paint = 3D orb.
- Toggle to 2D persists across sessions (per-user preference).
- First-run hint appears once per user and points to the 2D lens toggle
  without framing 2D as the preferred path.
- Telemetry continues; if engagement drops post-flip, fast
  rollback path exists (toggle default back to 2D).

## Blocking-on / blocks

- Blocking on: M5a + 2 weeks of telemetry + signoff.
- Blocks: no orb milestone. M8 is a non-critical 2D lens checkpoint.
