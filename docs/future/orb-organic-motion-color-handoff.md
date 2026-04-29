# Orb organic motion + color — handoff

**Date:** 2026-04-28
**Branch:** `feat/orb-as-field-particles`
**Status:** Major fixes landed; two open issues remain — per-particle motion still reads "robotic, not meandering" at 1M density, and the hue cycle's behavior/feel does not yet match mazehq's feel. Updated 2026-04-29 with two rounds of CodeAtlas + subagent research notes; no behavior changes were made by this document pass.

---

## What this is

The SoleMD `/graph` route renders a 1,000,000-particle WebGPU sphere intended to recreate the visual character of Maze Engineering's homepage hero (mazehq.com) and SoleMD's own landing page (`/`), at 60× the density. Multiple iteration rounds have brought it close but not there. This doc is the durable handoff to a fresh agent.

## Current behavior (verified 2026-04-28 via chrome-devtools MCP)

- **Frame timing:** mean 6.06 ms, stdev 0.07 ms during interactive drag (165 Hz monitor). Effectively zero variance.
- **Engine health:** visual recon on 2026-04-29 found 165 fps p50 with 12 ms max during drag; the "robotic" read is visible in still frames and is not a frame-pacing pathology.
- **Twinkle/depth bleed:** gone. Particles read as opaque-cored with smooth halo bleed.
- **Color regions:** spatially coherent yellow/blue patches visible. Hot patches drift as FBM evolves.
- **Pulsation:** dialed back via `ORB_BLOB_AMPLITUDE = 0.02` (Maze's 0.05 felt too strong at orb's tight framing).
- **Motion:** Maze-faithful scalar formula in place — each particle oscillates along a baked random `aMove` direction modulated by a per-particle simplex2 oscillator.
- **Framing baseline:** current WebGPU code is already at `BLOB_RADIUS = 1.40` (`let pos = unit * 1.40`) and `ORB_ZOOM_DEFAULT = 0.55`, not a default `viewZoom = 1.0`.
- **Particle density diagnosis:** `/graph` renders 1M particles in a roughly 600 px sphere, about 3 particles/pixel, so it reads as a continuous probability cloud; the landing reference renders about 16k particles in comparable framing, about 1 particle per 30 pixels, so individual particle identity and irregular edge gaps remain visible.

## 2026-04-29 research update

- **User clarification:** keep the SoleMD hue cycle. The target is not to remove the cycle because Maze is static; the target is for the cycle's behavior and feel to follow Maze's particle language: one global hot color at a time, coherent FBM-driven breathing regions, soft saturation, and no mottled per-particle palette phasing.
- **Maze color is static, not a hue cycle.** Captured Maze uniforms are fixed cyan base (`uRcolor/uGcolor/uBcolor = 40/197/234`) and magenta noise (`uRnoise/uGnoise/uBnoise = 202/50/223`) in `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:42564-42569`. The visible shader applies `base + clamp(vNoise) * 4.0 * (noise - base)` in `data/research/mazehq-homepage/2026-04-18/index.html:2341-2344`. Any "cycling" feel is the FBM/vNoise field evolving over time, not a captured hue tween.
- **SoleMD landing rainbow is an intentional local deviation.** `LANDING_RAINBOW_RGB` is 8 stops at 2 sec per stop (`apps/web/features/field/shared/landing-feel-constants.ts:6-19`), and the landing GSAP cycle uses `ease: "none"` in `apps/web/features/field/controller/blob-color-cycle.ts:63-70`.
- **The orb rainbow implementation is a second deviation.** The orb bakes the shared landing palette into a WebGPU LUT, but `landingNoiseColor()` hard-codes `8.0` stops and cosine-eases each stop (`apps/web/features/orb/webgpu/orb-webgpu-shader.ts:211-223`). Any palette experiment needs an orb-local palette config and stop-count constant first; the production target should preserve the hue cycle unless explicitly changed by the user.
- **Maze motion is bounded displacement.** The captured shader displaces around seed positions with radial FBM plus `aMove * aSpeed * snoise_1_2(...)`, not velocity integration. Velocity integration remains a plausible "meandering" aesthetic, but it is not Maze provenance.
- **Radius/zoom tuning is already partly done.** Current apparent scale is roughly `1.40 * 0.55 = 0.77`. Preserving that apparent size at radius `2.0` needs zoom about `0.385`, below the current `ORB_ZOOM_MIN = 0.5`; this is now the best first visual experiment, but it must be treated as a coordinated two-file change with depth-order and halo-scale checks, not a trivial slider tweak.
- **Depth range ceiling:** current render and pick depth mapping is duplicated at `orb-webgpu-shader.ts:472` and `orb-webgpu-shader.ts:632` as `(2.0 - z) * 0.25`. Radius `2.0` fits that range at the intended boundary; radius above `2.0` requires generalizing the mapping to `(R - z) / (2R)` in both sites.
- **Landing/orb palette seam:** `LANDING_RAINBOW_RGB` is shared by landing (`blob-color-cycle.ts:64`) and orb (`orb-webgpu-resources.ts:466`). Do not edit it for an orb-only palette experiment; fork an orb-local palette first.

## Open issues

### Issue 1 — per-particle motion still feels robotic

User feedback: *"i still feel there is an issue with the movement of each particle being too 'jagged' and 'robotic' and not an organic 'meandering'"*.

Frame timing is clean. The perceived robotic-ness is **per-particle visual character**, not frame variance.

Hypotheses (ranked, most likely first):

0. **Particles are too dense in screen space.** (User-stated 2026-04-28 after evaluating the latest fix.) This remains the leading hypothesis after visual recon. Current code uses `BLOB_RADIUS = 1.40` and default `viewZoom = 0.55`; Maze's 16k feels meandering partly because particles have *room* and preserve individual identity. The verified first tuple is `BLOB_RADIUS = 2.0`, `ORB_ZOOM_DEFAULT = 0.385`, and `ORB_ZOOM_MIN = 0.35`, which preserves current apparent footprint (`R * zoom ~= 0.77`) while roughly doubling world-space disc area.

1. **Position-displacement may be wrong for the desired "meandering" feel, but it is Maze-faithful.** Current formula is bounded oscillation around a fixed seed point. Real meandering would require **velocity integration** or advected flow, where position accumulates over time from an evolving velocity field. That is a new aesthetic direction, not a return to Maze.
2. **Single time axis per particle.** `simplexNoise2(vec2(f32(i), colorTime × 0.25 × speed))`. Per-particle `i` decorrelates spatial neighbors, but the time axis is shared (× speed scalar). At 1M, neighbors-with-similar-speed read as semi-synchronous. Independent per-axis noise (Lissajous) was tried and rejected — but maybe a *softer* multi-frequency variant on the time axis would help.
3. **Time-axis frequency 0.25 too fast.** `colorTime × 0.25 × speed` cycles the noise over ~4 sec at speed=1. Per-frame delta is ~0.004 in noise input, which produces visible per-frame jumps at zoom-in. Slowing to 0.10 or 0.05 might be enough. Easy parameter tweak.
4. **Amplitude/tempo variance may still be too wide, but the old explanation was imprecise.** `motion.w` is a tempo scalar for `landingMotionNoise`, while `attr.rgb` is a narrow amplitude scalar in the displacement term. Narrowing `perParticleSpeed` from `[0.2, 1.0]` to `[0.4, 0.8]` is low implementation risk, but the claim is tempo coherence, not direct amplitude multiplication.
5. **Orb FBM differs from landing/Maze.** Maze/landing use uniform octave time in FBM; the orb currently uses per-octave time scales `[0.4, 0.7, 1.0, 1.4, 1.5]`. This may add useful spatial rhythm, but it is a real Maze-parity deviation and should stay on the candidate list if spread + oscillator tempo do not solve the feel.
6. **The high-density silhouette is inherently too smooth.** At 1M density, the edge contour becomes statistically uniform; Maze/landing keep visible "missing" edge particles that read organic. Particle count reduction is rejected, so radius/zoom spread and sprite/halo/radius tuning carry this burden.

### Issue 2 — hue-cycle behavior does not match mazehq feel

User feedback: *"the color cycle is not working as intended. it doesn't have the same feel as the original mazehq"*.

Current orb model:
- 8-stop rainbow palette `LANDING_RAINBOW_RGB`
- 16 sec total cycle (2 sec per stop)
- Hardware LUT sampler with linear filter (cosine-eased per-stop fractional component)
- All hot particles share same instantaneous color
- Burst formula: `baseColor + vNoise × burstAmp × (noiseColor - baseColor)`, burstAmp ∈ [4.0, 6.0]

Maze reference behavior:
- Static cyan base and static magenta noise uniforms
- No captured hue-cycle period
- Color regions breathe because `vNoise` evolves with the FBM/time field
- Fixed shader multiplier `* 4.0` before clamp

Hypotheses:

1. **Preserve the hue cycle, but make it behave like Maze's single global noise color.** The 8-stop cycle is intentional; Maze's static pair is source provenance for how color should be applied, not a mandate to remove the cycle. At any instant, all hot particles should converge toward one global cycle color, while FBM/vNoise determines where that color breathes through the cloud.
2. **Cycle timing/easing is a SoleMD tuning knob.** There is no Maze hue-cycle period to match. If comparing against the SoleMD landing reference, the orb currently matches the 16 sec period but not the transition shape: landing uses GSAP `ease: "none"`, while orb uses cosine-eased LUT sampling. Linear LUT progression may feel closer to landing/Maze behavior than cosine dwell/pop.
3. **`burstAmp` × global color clamp produces saturated cores, not soft tints.** With `burstAmp = 5.0`, a particle at `vNoise = 0.5` already saturates the color shift to clamp ceiling. The Maze blob uses `*4.0` multiplier; could revert closer to that.
4. **Palette stop count is not centralized.** `landingNoiseColor()` hard-codes `8.0`, while `createOrbPaletteTexture()` derives texture width from `LANDING_RAINBOW_RGB.length`. Even if the final product keeps the 8-stop cycle, this should be centralized before palette/easing experiments.

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
| 11 | `aMove × 0.30` direction magnitude, per-particle speed `[0.2, 1.0]` | Kept — tuned for current feel |

---

## Files that matter

| File | Role |
|---|---|
| `apps/web/features/orb/webgpu/orb-webgpu-shader.ts` | All WGSL: integrate compute, render vertex/fragment, seedAmbientGeometry, picking |
| `apps/web/features/orb/webgpu/orb-webgpu-shader-noise.ts` | `landingFbm`, `landingFieldNoise`, `landingMotionNoise` (currently scalar, was vec3) |
| `apps/web/features/orb/webgpu/orb-webgpu-runtime.ts` | rAF tick, `frame()` arrow, `recreateDepthTexture`, dt smoothing, `colorDt`, `motionDt` |
| `apps/web/features/orb/webgpu/orb-webgpu-resources.ts` | Render pipeline (depthStencil, blend), bind group layouts |
| `apps/web/features/orb/webgpu/orb-webgpu-frame-uniforms.ts` | `packOrbFrameUniforms`, `OrbInteractionBurstEnvelope`, intro depth envelope |
| `apps/web/features/orb/webgpu/orb-webgpu-zoom.ts` | `ORB_ZOOM_DEFAULT = 0.55`, `ORB_ZOOM_MIN = 0.5`, zoom easing |
| `apps/web/features/orb/bake/orb-particle-constants.ts` | `ORB_PARTICLE_CAPACITY`, `ORB_BLOB_AMPLITUDE = 0.02`, `ORB_BLOB_FREQUENCY = 0.8` |
| `apps/web/features/field/renderer/field-vertex-motion.glsl.ts` | **REFERENCE** — original landing's port of Maze's blob shader |
| `apps/web/features/field/scene/visual-presets.ts:232-260` | **REFERENCE** — landing blob preset (uDepth=0.3, uAmplitude=0.05, uFrequency=0.5) |
| `apps/web/features/field/controller/BlobController.ts` | **REFERENCE** — landing tick calls `syncBlobColorCycle` |
| `apps/web/features/field/controller/blob-color-cycle.ts` | **REFERENCE** — landing GSAP rainbow cycle, `ease: "none"` |
| `apps/web/features/field/shared/landing-feel-constants.ts` | Shared landing palette, time constants, Maze-derived blob defaults |

## Verified literals and blast radius

| Surface | Verified fact | Planning implication |
|---|---|---|
| Sphere radius | `unit * 1.40` exists only in `orb-webgpu-shader.ts:559`; other radius mentions are comments | First spread experiment edits one WGSL literal, but comments must be updated too |
| Depth mapping | `(2.0 - z) * 0.25` exists at render depth `orb-webgpu-shader.ts:472` and pick depth `orb-webgpu-shader.ts:632` | Radius above `2.0` must change both sites together |
| Focus halo | `smoothstep(0.28, 0.0, dist)` at `orb-webgpu-shader.ts:441` is in world-space units | Radius `2.0` may need halo radius around `0.40` to preserve relative cluster reach |
| Projection | `projectedCenter` is orthographic/fake perspective, not camera FOV; footprint is governed by `radius * viewZoom` and `depthScale` | `2.0 * 0.385` preserves current apparent footprint (`1.40 * 0.55`) |
| `ORB_ZOOM_DEFAULT` | Used in the zoom controller constructor/reset only; `orb-webgpu-runtime.ts` is the sole dependent | Default/min zoom retune is contained |
| `LANDING_RAINBOW_RGB` | Shared by landing GSAP and orb WebGPU palette texture | Orb palette experiments require an orb-local fork |

## Recon caveats

- Use CodeAtlas for ownership, dependents, and cross-cutting constants before edits.
- Direct file reads are still required for WGSL internals because CodeAtlas indexes the surrounding TS template-literal constants (`ORB_WEBGPU_SHADER_SOURCE`, `ORB_WEBGPU_SHADER_NOISE_WGSL`), not shader functions such as `seedAmbientGeometry`, `landingMotionNoise`, or `pickParticle`.
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
3. Observe individual particles tracing visible back-and-forth oscillations along their baked direction
4. Compare side-by-side with `/` (landing) at similar zoom — landing's 16k particles overlap softly

### To see "color cycle doesn't feel right"

1. Open `/graph` and let it run for one full 16-second cycle
2. Compare to mazehq.com hero (network-fetch the live site or open the captured HTML at `data/research/mazehq-homepage/2026-04-18/index.html` if you can resolve its assets)
3. Note: Maze does not hue-cycle in the captured source; use it as the behavioral reference for single global hot color, FBM-breathing regions, and soft saturation while preserving SoleMD's hue cycle
4. Note: Maze's color regions appear to "breathe" with the radial bulge, which we have via `vNoise * burstScale` outward push

---

## Recommended next-step approaches (ranked)

### A — baseline + first spatial spread experiment

0. **Capture baseline first.** Open `/graph` and `/` side by side in Chrome, capture default + 2x + 4x zoom screenshots, and note edge texture, color-region coherence, and whether individual points read as particles or a continuous cloud.
1. **Apply the verified radius/zoom tuple.** Change `orb-webgpu-shader.ts:559` from `unit * 1.40` to `unit * 2.0`, change `ORB_ZOOM_DEFAULT` in `orb-webgpu-zoom.ts:19` from `0.55` to `0.385`, and change `ORB_ZOOM_MIN` in `orb-webgpu-zoom.ts:20` from `0.5` to `0.35`. This preserves apparent footprint while cutting screen-space density to roughly half.
2. **Retune world-space adjuncts only if the spread exposes a mismatch.** Candidate follow-ups: focus halo `smoothstep(0.28, 0.0, dist)` to about `0.40`, and hot-particle radius growth from `vNoise * 0.30` toward `vNoise * 0.21`. Do these after screenshots, not preemptively.
3. **Update stale comments in the same patch.** Update radius, zoom, and burstAmp comments; `orb-webgpu-shader.ts` currently has a stale nearby comment saying `burstAmp (3..5, mean 4)` even though code is `4..6, mean 5`.
4. **Verify contained blast radius.** Run the orb WebGPU tests and screenshot compare. Watch render/pick depth at poles because radius `2.0` sits exactly at the current depth mapping boundary.

### B — cleanup that should follow the first visual read

1. **Centralize orb visual constants before further tuning.** Create one orb-local source for radius, zoom/default/min, depth mapping range, palette stop count, and motion time factors. Generate WGSL constants from it instead of continuing to hard-code `2.0`, `8.0`, `0.20`, `0.25`, and `(2.0 - z) * 0.25` in separate places.
2. **Add contract tests.** Pin palette stop count/texture width/generated WGSL, depth mapping parity between render and pick, and radius/zoom apparent-scale math. This prevents the next experiment from silently desynchronizing rendering and picking.

### C — low-risk visual parameter experiments

1. **Slow `landingMotionNoise` time axis** from 0.25 → 0.10. Shader-local, low code risk, but still needs visual QA. Leave `landingFieldNoise` at 0.20 for this pass; it already controls color-region drift separately.
2. **Reduce `burstAmp` mean** from 5.0 back toward Maze's fixed 4.0: `burstAmp = 3.5 + pHash * 1.0` — gentler color saturation, more gradient tones visible.
3. **Reduce per-particle tempo variance**: `perParticleSpeed = 0.4 + h6 * 0.4` ([0.4, 0.8] instead of [0.2, 1.0]) — narrower band → less ensemble incoherence.
4. **Revert `ORB_BLOB_FREQUENCY` to 0.5** — now that smoothstep alpha restores bleed, the original Maze frequency may read better.

### D — hue-cycle behavior decisions

1. **Do not remove the hue cycle.** The product target keeps the cycle; Maze is the behavior reference.
2. **First hue-cycle A/B:** keep `LANDING_RAINBOW_RGB`, but compare linear LUT progression against the current cosine dwell/pop. Landing uses `ease: "none"`; a linear cursor may better preserve Maze-like breathing without a "mood ring" pulse.
3. **Second hue-cycle A/B:** if palette itself is implicated, fork an orb-local palette constant before changing colors. Options: slower rainbow with an orb-local stop duration, or a Maze-pair diagnostic palette that still cycles globally. Do not edit shared `LANDING_RAINBOW_RGB` unless the landing should intentionally change too.

### E — if A/C/D don't suffice: smoothing the motion noise

1. **Time-axis FBM** on `landingMotionNoise`: instead of single simplex2, sum 2 octaves at different frequencies. Smoother, more organic per-particle rhythm. ~+30 ALU/particle.
2. **Per-particle phase offset on time axis**: `simplexNoise2(vec2(f32(i), colorTime * 0.25 * speed + phaseOffset))` where phaseOffset is hash-derived. Decorrelates timing across particles without changing Maze's spatial structure.
3. **IIR low-pass on noise output.** Persistent per-particle state can smooth the oscillator with minimal ALU. This needs a real state-buffer design because `velocitiesBuffer` currently stores baked `aMove`/speed and is read every frame.
4. **Cubic Hermite interpolation** between noise samples for C1 time continuity. This costs extra noise work; verify against the frame budget before stacking with other smoothing.

### F — if visual tuning doesn't suffice: change the motion model

1. **Velocity integration.** Persistent per-particle velocity state would allow position to accumulate from an evolving field. This is not Maze provenance; treat it as a deliberate new aesthetic.
2. **Sphere-tangent curl or bitangent noise.** Sample a divergence-free 3D field, project onto the sphere tangent plane, and integrate with a symplectic Euler step. This is the right canon for particle meander; GPU Gems semi-Lagrangian fluid chapters are less directly applicable here.
3. **Two-pass: coarse advection + fine displacement.** Update position via velocity at 30 Hz (advection), apply FBM displacement on top at 60 Hz (texture). Decouples slow flow from fast wobble.

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

# Verify the critical shader literals
grep -n "unit \\* 1.40\\|2.0 - z\\|ORB_ZOOM_DEFAULT\\|ORB_ZOOM_MIN" \
  features/orb/webgpu/orb-webgpu-shader.ts \
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
4. Apply A.1 (`BLOB_RADIUS = 2.0`, `ORB_ZOOM_DEFAULT = 0.385`, `ORB_ZOOM_MIN = 0.35`) and re-screenshot before changing motion/color.
5. If still robotic, apply C.1 (motion-noise time 0.25 → 0.10) and re-screenshot.
6. For color, preserve the hue cycle and start with D.2 (linear cycle progression) before palette forks.
7. If still off, escalate to E/F with codex:rescue verification before implementing.
