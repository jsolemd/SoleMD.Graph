# Orb organic motion + color — handoff

**Date:** 2026-04-28
**Branch:** `feat/orb-as-field-particles`
**Status:** Major fixes landed. The current end-to-end organic-motion/color implementation is now in code: wider radius at preserved apparent footprint, persistent GPU velocity integration, tangent-projected flow, linear hue-cycle progression, gentler color burst, centralized render/pick depth, and an orb-local palette seam. Visual verification remains the next gate.

---

## What this is

The SoleMD `/graph` route renders a 1,000,000-particle WebGPU sphere intended to recreate the visual character of Maze Engineering's homepage hero (mazehq.com) and SoleMD's own landing page (`/`), at 60× the density. Multiple iteration rounds have brought it close but not there. This doc is the durable handoff to a fresh agent.

## Current behavior / implementation state (updated 2026-04-29)

- **Frame timing:** mean 6.06 ms, stdev 0.07 ms during interactive drag (165 Hz monitor). Effectively zero variance.
- **Engine health:** visual recon on 2026-04-29 found 165 fps p50 with 12 ms max during drag; the "robotic" read is visible in still frames and is not a frame-pacing pathology.
- **Twinkle/depth bleed:** gone. Particles read as opaque-cored with smooth halo bleed.
- **Color regions:** spatially coherent yellow/blue patches visible. Hot patches drift as FBM evolves.
- **Pulsation:** dialed back via `ORB_BLOB_AMPLITUDE = 0.02` (Maze's 0.05 felt too strong at orb's tight framing).
- **Motion:** stateful WebGPU physics is in place — each particle stores persistent position and velocity on the GPU, accelerates through a low-frequency tangent-projected vector field, damps velocity frame-rate-independently, clamps speed, and projects back to the orb radius.
- **Framing baseline:** current WebGPU code now uses `ORB_BLOB_RADIUS = 2.0`, `ORB_ZOOM_DEFAULT = 0.385`, and `ORB_ZOOM_MIN = 0.35`, preserving the prior apparent footprint while giving the 1M particles more world-space room.
- **Particle density diagnosis:** `/graph` renders 1M particles in a roughly 600 px sphere, about 3 particles/pixel, so it reads as a continuous probability cloud; the landing reference renders about 16k particles in comparable framing, about 1 particle per 30 pixels, so individual particle identity and irregular edge gaps remain visible.

## 2026-04-29 research update

- **User clarification:** keep the SoleMD hue cycle. The target is not to remove the cycle because Maze is static; the target is for the cycle's behavior and feel to follow Maze's particle language: one global hot color at a time, coherent FBM-driven breathing regions, soft saturation, and no mottled per-particle palette phasing.
- **Maze color is static, not a hue cycle.** Captured Maze uniforms are fixed cyan base (`uRcolor/uGcolor/uBcolor = 40/197/234`) and magenta noise (`uRnoise/uGnoise/uBnoise = 202/50/223`) in `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:42564-42569`. The visible shader applies `base + clamp(vNoise) * 4.0 * (noise - base)` in `data/research/mazehq-homepage/2026-04-18/index.html:2341-2344`. Any "cycling" feel is the FBM/vNoise field evolving over time, not a captured hue tween.
- **SoleMD landing rainbow is an intentional local deviation.** `LANDING_RAINBOW_RGB` is 8 stops at 2 sec per stop (`apps/web/features/field/shared/landing-feel-constants.ts:6-19`), and the landing GSAP cycle uses `ease: "none"` in `apps/web/features/field/controller/blob-color-cycle.ts:63-70`.
- **The orb rainbow implementation is a second deviation.** The orb bakes the landing-derived palette into a WebGPU LUT and now samples it with linear cursor progression, matching the landing GSAP cycle's `ease: "none"` behavior. The palette is exposed through `ORB_PALETTE_RGB`, currently equal to the shared landing palette, so future orb-only palette experiments can fork locally.
- **Maze motion is bounded displacement.** The captured shader displaces around seed positions with radial FBM plus `aMove * aSpeed * snoise_1_2(...)`, not velocity integration. User visual review after the scalar pass found this still too robotic at 1M density, so the production orb now deliberately moves beyond Maze provenance toward WebGPU particle-physics practice.
- **Radius/zoom tuning is implemented.** The old apparent scale was `1.40 * 0.55 = 0.77`; the new `2.0 * 0.385 = 0.77` keeps screen footprint stable while roughly doubling world-space disc area.
- **Depth mapping is centralized.** Render and pick now use generated `ORB_DEPTH_RANGE_RADIUS` through a shared WGSL `depthFromZ()` helper instead of duplicated `(2.0 - z) * 0.25` literals.
- **Landing/orb palette seam is protected.** The orb now reads `ORB_PALETTE_RGB`, currently equal to `LANDING_RAINBOW_RGB`, so future orb-only palette experiments can fork without re-skinning landing.

## Open issues

### Issue 1 — per-particle motion needs visual verification after physics rewrite

User feedback: *"i still feel there is an issue with the movement of each particle being too 'jagged' and 'robotic' and not an organic 'meandering'"*.

Follow-up feedback after the radius/slow-scalar pass: *"the movement is still extremely robotic moving in jagged manner not organic and smooth at all - think we might need to rethink this using webgpu best physics practices"*.

Frame timing is clean. The perceived robotic-ness is **motion model**, not frame variance.

Hypotheses (ranked, most likely first):

0. **Scalar bounded displacement was the wrong final motion lane.** The old formula could only move particles back and forth around a seed point. The current code replaces it with symplectic-style velocity integration in `integrateParticles`.
1. **Flow constants may need visual tuning.** Current starting tuple: `ORB_PHYSICS_FLOW_FREQUENCY = 0.55`, `ORB_PHYSICS_TIME_SCALE = 0.035`, `ORB_PHYSICS_FLOW_ACCELERATION = 0.035`, `ORB_PHYSICS_HOME_PULL = 0.45`, `ORB_PHYSICS_VELOCITY_HALF_LIFE_SECONDS = 0.55`, `ORB_PHYSICS_MAX_SPEED = 0.06`, `dt <= 1/60`.
2. **Tangent-projected analytic flow is the cheapest first physics field.** True curl/bitangent noise is more physically principled, but costs more shader ALU. Use the current smooth vector field first; escalate only if the visual still lacks fluidity.
3. **The high-density silhouette may still be too smooth.** At 1M density, the edge contour becomes statistically uniform; Maze/landing keep visible "missing" edge particles that read organic. Particle count reduction is rejected, so radius/zoom spread and sprite/halo/radius tuning carry this burden.

### Issue 2 — hue-cycle behavior does not match mazehq feel

User feedback: *"the color cycle is not working as intended. it doesn't have the same feel as the original mazehq"*.

Current orb model:
- 8-stop rainbow palette `LANDING_RAINBOW_RGB`
- 16 sec total cycle (2 sec per stop)
- Hardware LUT sampler with linear filter and linear cursor progression
- All hot particles share same instantaneous color
- Burst formula: `baseColor + vNoise × burstAmp × (noiseColor - baseColor)`, burstAmp ∈ [3.5, 4.5]

Maze reference behavior:
- Static cyan base and static magenta noise uniforms
- No captured hue-cycle period
- Color regions breathe because `vNoise` evolves with the FBM/time field
- Fixed shader multiplier `* 4.0` before clamp

Hypotheses:

1. **Preserve the hue cycle, but make it behave like Maze's single global noise color.** The 8-stop cycle is intentional; Maze's static pair is source provenance for how color should be applied, not a mandate to remove the cycle. At any instant, all hot particles should converge toward one global cycle color, while FBM/vNoise determines where that color breathes through the cloud.
2. **Cycle timing/easing is a SoleMD tuning knob.** There is no Maze hue-cycle period to match. The orb now uses linear LUT progression to match landing's GSAP `ease: "none"` behavior and avoid cosine dwell/pop.
3. **`burstAmp` × global color clamp can still produce saturated cores.** The orb has been reduced from `[4.0, 6.0]` to `[3.5, 4.5]`, centered on Maze's fixed `*4.0`; verify whether this is enough before additional palette work.
4. **Palette ownership is now orb-local, but the default value intentionally matches landing.** If color still feels wrong, fork `ORB_PALETTE_RGB` or `ORB_PALETTE_PERIOD_SECONDS` inside `orb-webgpu-visual-config.ts`; do not edit `LANDING_RAINBOW_RGB` unless the landing page should change too.

---

## What's already been tried (don't repeat without reason)

| Round | Change | Outcome |
|---|---|---|
| 1 | Native depth attachment + alpha-test 0.4 + per-particle ndcZ in vertex | Twinkle gone, but produced hard-circle silhouettes that read as robotic |
| 2 | Smoothstep alpha falloff `[0.30, 0.55]` replacing hard discard at 0.4 (kept 0.05 floor for fully-transparent fragments) | Restored Maze-like soft particle bleed; depth-write semantics preserved |
| 3 | Per-axis Lissajous (3 independent simplex2 calls in `landingMotionNoise`) | Reverted — deviates from Maze, produced figure-8 visible paths |
| 4 | Per-particle palette phase offset (`landingNoiseColor(colorTime, fieldNoise × 0.3)`) | Reverted — produced mottled multi-stop hot regions; Maze has all hot particles at same color |
| 5 | Tangential surfaceFlow (`cross(normal, surfaceGrad)`) | Removed — was gyrating tangent jitter, not coherent flow |
| 6 | Dt smoothing (one-pole IIR α=0.15, ceiling 1/60 × 1.05) on simulation time only | Working perfectly — frame variance immune. NOT the source of remaining "jagged" perception. |
| 7 | `vNoise = pow(clamp(fieldNoise, 0, 1), 0.5)` | Kept — brightens mid-tone particles for visibility at 1M |
| 8 | Hot-particle radius growth `radius * (1 + vNoise * 0.30)` | Kept — hot regions read at 1M density |
| 9 | `ORB_BLOB_AMPLITUDE = 0.02` (vs Maze's 0.05) | Kept — orb fills more canvas; pulsation must be dialed down |
| 10 | `ORB_BLOB_FREQUENCY = 0.8` (vs Maze's 0.5) | Kept — more spatial frequency for 1M density. May want to revert to 0.5 since smoothstep alpha now restores bleed |
| 11 | `aMove × 0.30` direction magnitude, per-particle speed `[0.2, 1.0]` | Replaced — user still saw robotic bounded oscillation |
| 12 | `ORB_BLOB_RADIUS = 2.0`, `ORB_ZOOM_DEFAULT = 0.385`, `ORB_ZOOM_MIN = 0.35` | Implemented — preserves apparent footprint while increasing world-space room; visual QA pending |
| 13 | Shared WGSL `depthFromZ()` driven by `ORB_DEPTH_RANGE_RADIUS` | Implemented — render depth and pick tie-break now share one mapping |
| 14 | `ORB_MOTION_NOISE_TIME_SCALE = 0.10` | Superseded — scalar oscillator removed from the production motion lane |
| 15 | Linear LUT cursor for the hue cycle | Implemented — removes the cosine dwell/pop while preserving the hue cycle |
| 16 | `burstAmp = 3.5 + pHash * 1.0` | Implemented — centered on Maze's fixed `*4.0` multiplier with a narrow personality band |
| 17 | Persistent WebGPU velocity integration | Implemented — `computePositions.xyz` and `computeVelocities.xyz` now update every compute frame before display write |
| 18 | Three extra 4D simplex samples for physics flow | Rejected — browser accepted the shader, but rAF timing regressed; replaced with cheap analytic tangent flow |

---

## Files that matter

| File | Role |
|---|---|
| `apps/web/features/orb/webgpu/orb-webgpu-shader.ts` | All WGSL: integrate compute, render vertex/fragment, seedAmbientGeometry, picking |
| `apps/web/features/orb/webgpu/orb-webgpu-shader-noise.ts` | `landingFbm`, `landingFieldNoise`, 4D simplex noise used by field color and physics flow |
| `apps/web/features/orb/webgpu/orb-webgpu-runtime.ts` | rAF tick, `frame()` arrow, `recreateDepthTexture`, dt smoothing, `colorDt`, `motionDt` |
| `apps/web/features/orb/webgpu/orb-webgpu-resources.ts` | Render pipeline (depthStencil, blend), bind group layouts |
| `apps/web/features/orb/webgpu/orb-webgpu-frame-uniforms.ts` | `packOrbFrameUniforms`, `OrbInteractionBurstEnvelope`, intro depth envelope |
| `apps/web/features/orb/webgpu/orb-webgpu-visual-config.ts` | Central orb visual constants: radius, zoom, palette, depth range, time scales |
| `apps/web/features/orb/webgpu/orb-webgpu-zoom.ts` | Re-exports `ORB_ZOOM_DEFAULT = 0.385`, `ORB_ZOOM_MIN = 0.35`, zoom easing |
| `apps/web/features/orb/bake/orb-particle-constants.ts` | `ORB_PARTICLE_CAPACITY`, `ORB_BLOB_AMPLITUDE = 0.02`, `ORB_BLOB_FREQUENCY = 0.8` |
| `apps/web/features/field/renderer/field-vertex-motion.glsl.ts` | **REFERENCE** — original landing's port of Maze's blob shader |
| `apps/web/features/field/scene/visual-presets.ts:232-260` | **REFERENCE** — landing blob preset (uDepth=0.3, uAmplitude=0.05, uFrequency=0.5) |
| `apps/web/features/field/controller/BlobController.ts` | **REFERENCE** — landing tick calls `syncBlobColorCycle` |
| `apps/web/features/field/controller/blob-color-cycle.ts` | **REFERENCE** — landing GSAP rainbow cycle, `ease: "none"` |
| `apps/web/features/field/shared/landing-feel-constants.ts` | Shared landing palette, time constants, Maze-derived blob defaults |

## Verified literals and blast radius

| Surface | Verified fact | Planning implication |
|---|---|---|
| Sphere radius | `ORB_BLOB_RADIUS = 2.0` is generated into WGSL and used by `seedAmbientGeometry` | Future spread changes should edit the central config |
| Depth mapping | `depthFromZ()` uses generated `ORB_DEPTH_RANGE_RADIUS` for both render depth and pick depth | Render/pick depth now move together |
| Focus halo | `ORB_FOCUS_CLUSTER_RADIUS = 0.40` is generated into WGSL | Relative focus reach is preserved after widening the sphere |
| Projection | `projectedCenter` is orthographic/fake perspective, not camera FOV; footprint is governed by `radius * viewZoom` and `depthScale` | `2.0 * 0.385` preserves prior apparent footprint (`1.40 * 0.55`) |
| `ORB_ZOOM_DEFAULT` | Used in the zoom controller constructor/reset only; `orb-webgpu-runtime.ts` is the sole dependent | Default/min zoom retune is contained |
| `LANDING_RAINBOW_RGB` | Shared by landing GSAP and orb WebGPU palette texture | Orb palette experiments require an orb-local fork |

## Recon caveats

- Use CodeAtlas for ownership, dependents, and cross-cutting constants before edits.
- Direct file reads are still required for WGSL internals because CodeAtlas indexes the surrounding TS template-literal constants (`ORB_WEBGPU_SHADER_SOURCE`, `ORB_WEBGPU_SHADER_NOISE_WGSL`), not shader functions such as `seedAmbientGeometry`, `integrateParticles`, or `pickParticle`.
- Treat subagent/file-read hypotheses as provisional until CodeAtlas verifies symbol dependents and shared constants.

## Reference materials

| What | Where |
|---|---|
| Maze decompiled JS | `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js` |
| Maze blob preset uniforms | scripts.pretty.js:42424-42433 |
| Maze color RGB uniforms | scripts.pretty.js:42564-42569 (`uRcolor` etc — six float pair, cyan→magenta) |
| Maze visible color formula | index.html:2341-2344 (`base + clamp(vNoise) * 4.0 * (noise - base)`) |
| Maze sphere particle generation | scripts.pretty.js:42869-42876 (`aMove`, `aSpeed`, `aRandomness` random per axis) |
| Maze blob has 16384 particles | scripts.pretty.js:42901 (`getSphere(16384, 1)`) |
| Audit synthesis | `docs/agentic/2026-04-19-maze-hq-audit-synthesis.md` |
| Motion audit | `docs/agentic/2026-04-19-maze-hq-audit-motion.md` |
| GSAP/blob audit | `docs/agentic/2026-04-19-maze-hq-audit-gsap-blob.md` |
| WebGPU decision | `docs/orb/decisions/2026-04-24-webgpu-target.md` |
| M7 milestone | `docs/orb/milestones/M7-webgpu-port.md` |
| Frontend perf rules | `.claude/skills/graph/references/frontend-performance.md` |

## Live verification setup

| Surface | URL |
|---|---|
| Localhost (PC) | `http://localhost:40025/graph` (orb) and `http://localhost:40025/` (landing reference) |
| Tailscale HTTPS (phone) | `https://jonpc-1.taild0afc1.ts.net/graph` (already proxied via `tailscale serve --bg --https=443 http://127.0.0.1:40025`) |
| Dev server | already running on 0.0.0.0:40025 — check with `pgrep -f "next dev" && ss -tlnp \| grep 40025`. If not running: `cd apps/web && npx next dev --hostname 0.0.0.0 -p 40025` |
| chrome-devtools MCP | `mcp__chrome-devtools__list_pages`, `select_page`, `take_screenshot`, `evaluate_script`. Page 2 is `/graph`. |

## Specific reproduction for the open issues

### To see "jagged motion at zoom"

1. Open `/graph` in desktop Chrome at default zoom — orb fills viewport
2. Use mouse-wheel or pinch to zoom in 2-4×
3. Observe whether individual particles now drift through curved paths or still show visible stepping/jitter at close zoom
4. Compare side-by-side with `/` (landing) at similar zoom — landing's 16k particles overlap softly

### To see "color cycle doesn't feel right"

1. Open `/graph` and let it run for one full 16-second cycle
2. Compare to mazehq.com hero (network-fetch the live site or open the captured HTML at `data/research/mazehq-homepage/2026-04-18/index.html` if you can resolve its assets)
3. Note: Maze does not hue-cycle in the captured source; use it as the behavioral reference for single global hot color, FBM-breathing regions, and soft saturation while preserving SoleMD's hue cycle
4. Note: Maze's color regions appear to "breathe" with the radial bulge, which we have via `vNoise * burstScale` outward push

---

## Recommended next-step approaches (ranked)

### A — verify the implemented pass

1. **Run automated checks.** Typecheck, orb WebGPU Jest tests, and eslint for `features/orb/webgpu`.
2. **Capture visual QA.** Open `/graph` and `/` side by side in Chrome, capture default + 2x + 4x zoom screenshots, and note edge texture, color-region coherence, and whether individual points read as particles or a continuous cloud.
3. **Watch render/pick depth.** Radius `2.0` sits exactly at the current intended depth range, but render and pick now share `depthFromZ()`. Verify selection still favors front-most particles at high rotation/zoom.
4. **Compare one full hue cycle.** The hue cycle is preserved; the expected change is less dwell/pop and softer color clipping, not static Maze cyan/magenta.

### B — low-risk follow-ups if visual QA still reads robotic

1. **Tune physics constants first.** Lower `ORB_PHYSICS_MAX_SPEED` or `ORB_PHYSICS_FLOW_ACCELERATION` if particles still jitter; lower `ORB_PHYSICS_HOME_PULL` if paths feel too springy; lower `ORB_PHYSICS_TIME_SCALE` if the vector field changes too fast.
2. **Reduce hot-particle radius growth** from `radius * (1.0 + vNoise * 0.30)` toward `0.21` if hot regions still merge into continuous saturated sheets.
3. **Revert `ORB_BLOB_FREQUENCY` to `0.5`** if the current `0.8` FBM frequency keeps the field too busy now that radius/zoom spread and smooth alpha are in place.

### C — hue-cycle behavior decisions if color still feels wrong

1. **Do not remove the hue cycle.** The product target keeps the cycle; Maze is the behavior reference.
2. **Fork orb-local color timing before changing shared constants.** `ORB_PALETTE_PERIOD_SECONDS` currently mirrors landing's 16 sec cycle. Slower orb-local timing is safe now that the seam exists.
3. **Fork orb-local palette only for diagnosis or product intent.** A Maze-pair diagnostic palette can still cycle globally, but do not edit shared `LANDING_RAINBOW_RGB` unless the landing should intentionally change too.

### D — if A/B/C don't suffice: improve the velocity field

1. **Bitangent noise.** Use two analytic noise gradients and cross them for a divergence-free field. This is cheaper than classic finite-difference curl and closer to fluid particle practice.
2. **True curl noise.** More expensive, but the best provenance for incompressible procedural flow.
3. **Half-rate physics update.** If ALU cost becomes visible at 1M, integrate velocity every other frame and render the latest display state every frame.

### E — if visual tuning doesn't suffice: change the simulation architecture

1. **Two-pass: coarse advection + fine displacement.** Update position via velocity at 30 Hz (advection), apply FBM displacement on top at 60 Hz (texture). Decouples slow flow from fast wobble.
2. **Low-resolution vector-field texture.** Precompute or update a coarse 3D flow field and sample it per particle. This trades ALU for memory/bandwidth and may be better for phone thermals.
3. **Ping-pong state buffers.** Only if in-place updates become a correctness blocker. Current per-particle integration is embarrassingly parallel and safe in-place because each invocation reads/writes only its own index.

---

## Things to NOT do

1. **Don't add WBOIT, GPU sort, or any parallel render subsystem.** The user's `feedback_native_over_overlay` rule. Native WebGPU pipeline only.
2. **Don't reduce particle count below 1M** — user has rejected this explicitly.
3. **Don't add MSAA 4×** — memory cost (~32 MB) doesn't justify; smoothstep alpha handles silhouette aliasing.
4. **Don't restore per-particle palette phase** — already tried, broke Maze color feel (mottled multi-stop).
5. **Don't restore Lissajous (3-axis independent simplex2)** — already tried, deviated from Maze's straight-line oscillation character.
6. **Don't remove the hue cycle as the final product just because Maze is static** — the intended target is Maze behavior/feel carried through SoleMD's hue cycle.
7. **Don't put plans in the ephemeral plan-mode file alone** — durable plans go in `docs/future/<slug>.md` per `feedback_future_plans_location` memory.
8. **Don't skip dt smoothing** — already in place, working, do NOT remove. The `smoothedSimDtSeconds` in `orb-webgpu-runtime.ts` is the canonical fix for frame-variance-coupled sim stutter.
9. **Don't replace `LANDING_RAINBOW_RGB` directly for an orb-only experiment** — fork or parameterize the orb palette first, or the landing page changes too.

---

## Quick sanity checks for a fresh agent

```bash
cd /home/workbench/SoleMD/SoleMD.Graph/apps/web

# Verify build
npx tsc --noEmit
npx jest --runInBand --testPathPatterns='features/orb'
npx eslint features/orb/webgpu/

# Verify dev server alive
ss -tlnp | grep 40025

# View current shader state
sed -n '230,310p' features/orb/webgpu/orb-webgpu-shader.ts  # integrate compute
sed -n '195,225p' features/orb/webgpu/orb-webgpu-shader.ts  # landingNoiseColor
sed -n '440,500p' features/orb/webgpu/orb-webgpu-shader.ts  # vertex + fragment

# View dt smoothing
grep -A 5 'smoothedSimDtSeconds' features/orb/webgpu/orb-webgpu-runtime.ts

# Verify the critical shader/config constants
grep -n "ORB_BLOB_RADIUS\\|depthFromZ\\|ORB_ZOOM_DEFAULT\\|ORB_ZOOM_MIN\\|ORB_PHYSICS_" \
  features/orb/webgpu/orb-webgpu-shader.ts \
  features/orb/webgpu/orb-webgpu-shader-noise.ts \
  features/orb/webgpu/orb-webgpu-visual-config.ts \
  features/orb/webgpu/orb-webgpu-zoom.ts
```

## chrome-devtools MCP one-liners

```js
// FPS sample during programmatic drag
const c = document.querySelector('canvas'); const r = c.getBoundingClientRect();
// (use the script in conversation transcript or evaluate_script tool)

// Toggle perf overlay before reloading /graph; __orbDebug.perfMarks is attached
// during runtime construction only when __orbPerf is already true.
window.__orbPerf = true;

// Capture current frame stats
window.__orbDebug?.perfMarks?.()
```

## Related memories worth re-reading

- `feedback_landing_native_physics.md` — landing storytelling lives in WebGL particles, not overlays
- `feedback_native_over_overlay.md` — hijack pipeline, don't add parallel systems
- `feedback_visual_review_methodology.md` — chrome-devtools side-by-side + numerical pixel diagnosis + targeted minimal patch
- `feedback_codex_review_for_foundation_plans.md` — hand foundation plans to codex:rescue before approval
- `feedback_codex_verifies_audit_severity.md` — codex verify-only pass before recommending fixes
- `reference_phone_dev_https.md` — phone needs https via tailscale serve

## Suggested first move for a new agent

1. Read this doc end to end.
2. Run the sanity checks above.
3. Open `/graph` and `/` side-by-side via chrome-devtools MCP, take screenshots of both at default zoom + 2× zoom + 4× zoom. Visually compare.
4. If still robotic, try the low-risk B-series follow-ups one at a time and re-screenshot after each.
5. For color, preserve the hue cycle; fork orb-local timing/palette only after confirming the current linear progression is still wrong.
6. If still off, escalate to D/E with codex:rescue verification before implementing.
