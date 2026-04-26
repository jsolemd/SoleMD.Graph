# Orb 3D physics configuration taxonomy (Slice B0)

> Status: **B0 deliverable.** Gates Slice B implementation
> (`docs/future/orb-3d-cosmograph-parity-plan.md` lines 426–438).
> Until this doc is approved, B's MVP motion/physics controls do
> not land.

## 1. Goal

B0 produces the control taxonomy + write-site map that B's
implementation plan consumes. It answers four questions before
any UI ships:

1. Which controls go into which bucket
   (camera / ambient visual physics / data physics)?
2. Which existing controller field, shader uniform, GSAP timeline,
   or position initializer does each candidate touch — cited
   `file:line`?
3. Is each candidate Ship in B / Defer / Needs User Decision —
   and what is the gate that would unblock a Defer?
4. What is the canonical name for the ambient-tempo multiplier so
   B never ships two sliders writing the same uniform?

The hard rule restated from the parity plan
(`docs/future/orb-3d-cosmograph-parity-plan.md` lines 489–499):

> Every control must change a specific existing controller/shader
> value or a named future force term. "Gravity" mode is not a
> vibe toggle; it must be tied to focus/citation/cluster data or
> stay deferred.

## 2. Three-bucket categorization

Every candidate goes in **exactly one** of these buckets. A
candidate that straddles two buckets is decomposed until each
piece sits in one.

### 2a. Camera bucket — out of scope for B

These knobs already shipped via slice A1 (drei `<CameraControls>`
mounted in `FieldScene` per
`docs/future/orb-3d-cosmograph-parity-plan.md` lines 417–422) or
are reserved for view-state work. They are listed here only so
they don't get pulled into B by mistake. **B does not add any
new camera control.**

- Orbit / rotate around target — A1.
- Dolly / zoom — A1.
- Two-finger pan + pinch — A1.1 / A1.2.
- Mobile twist — A1.2 (`BlobController.applyTwist`,
  `BlobController.ts:494`).
- Reset view / fit-to-orb — reserved (not B0/B work).

### 2b. Ambient visual physics — B's MVP scope

Affects how the orb *feels* at rest. No graph data signal.
Modulates existing controller / uniform / GSAP timeline values
that are already wired in the field pipeline.

- Pause / play motion (already wired via `pauseMotion`; UI gap).
- Rotation speed multiplier (scales `rotationVelocity[1]` term).
- Ambient motion speed multiplier (scales shader time **once** via
  `uTimeFactor`, plus GSAP `timeScale`; it does not scale amplitude).
- Entropy / randomness (drives `uAmplitude` / `uFrequency`
  via a substrate-safe blend factor — does not re-seed positions).

### 2c. Data physics — deferred

Pulls particles based on **graph signals**: selectedNode, citation
neighbors, cluster centroids, entity focus, semantic neighbors.
None of these data sources is wired into the orb pipeline yet
(C / F / G prerequisite). Any control here ships only after the
data signal exists.

- `focusGravity` — deferred to **after C** (selectedNode +
  G-lane focus excitation).
- `clusterWells` — deferred until cluster centroids exist as a
  named force term backed by a real cluster table / centroid
  computation.
- Citation attraction / semantic neighbor pull — deferred,
  post-F.
- `globe` formation preset — deferred pending a stable
  spherical projection probe (see §7).
- `natural` formation preset — collapses to "do nothing" today
  (the existing landing/orb baseline); not promoted to a UI
  control until a second formation has shipped.

## 3. Names That Are Allowed

These four words are reserved. UI copy, store fields, and shader
uniforms must use them only with the meanings below. Anything
that wants to use one of these words without meeting its bar
either renames itself or stays deferred.

| Word | Allowed only when… | Disallowed sense |
|---|---|---|
| **cohesion** | A center / cluster pull with **no graph signal** — e.g. "calm everything inward" | Calling such a pull "gravity" |
| **gravity** | Pull is driven by a real graph signal: `selectedNode`, citation neighbors, cluster centroid, entity focus, or semantic neighbor data | Vibe toggle with no data input |
| **entropy** | Noise amplitude / frequency / randomness feel — modulates `uAmplitude` / `uFrequency` blend targets | Re-seeding particle positions, or random restart of layout |
| **orbit** | Camera / object-inspection movement only (drei `<CameraControls>`) | Describing a particle-physics term — a particle doesn't "orbit," it follows a force term |

## 4. Existing knobs inventory

One row per knob B could hijack. All citations resolve in the
current `feat/orb-as-field-particles` worktree.

### 4a. Per-controller motion scaling (Blob / Stream / ObjectFormation)

| Knob | Where | Notes |
|---|---|---|
| `motionScale = motionEnabled ? 1 : 0.16` | `BlobController.ts:196–197`, `StreamController.ts:47–48`, `ObjectFormationController.ts:45–46` | Binary today (full vs reduced). This remains the reduced-motion / low-power floor. It is **not** the user speed multiplier. |
| `uniforms.uSpeed.value = shader.speed * motionScale` | `BlobController.ts:233`, `StreamController.ts:89`, `ObjectFormationController.ts:81` | Preset drift-speed baseline plus reduced-motion floor. B does not scale this with `motionSpeedMultiplier` because the shader already multiplies `uSpeed * uTimeFactor`; scaling both would double-count speed. |
| `uniforms.uAmplitude.value` write per controller | Blob blends toward `chapterState.amplitude * motionScale` at `BlobController.ts:250–252`; Stream blends toward `chapterState.amplitude * motionScale` at `StreamController.ts:81–83`; ObjectFormation direct-assigns `shader.amplitude * motionScale` at `ObjectFormationController.ts:77` (no chapter-state blend) | Drift amplitude. `ambientEntropy` rides here; `motionSpeedMultiplier` does not. The shape difference matters for the §9 write — Blob/Stream multiply inside the blend target, ObjectFormation multiplies the assigned value. |
| `wrapper.rotation.y += dtSec * preset.rotationVelocity[1] * motionScale` (orb) | `BlobController.ts:407–408` | Delta-accumulated; paused while `orbInteracting`. The rotation-speed multiplier rides here. |
| `wrapper.rotation.y = elapsedSec * preset.rotationVelocity[1] * motionScale` (landing) | `BlobController.ts:412–413` | Clock-driven absolute formula; landing storytelling reads this. Rotation-speed multiplier must NOT corrupt landing chapter timing. |
| `idleRotationY = elapsedSec * preset.rotationVelocity[1] * motionScale` | `StreamController.ts:106–107`, `ObjectFormationController.ts:95–96` | Same shape as blob landing path. |
| `uniforms.uTimeFactor.value = this.getTimeFactor(motionEnabled)` | `BlobController.ts:228`, `StreamController.ts:74`, `ObjectFormationController.ts:72`; impl at `FieldController.ts:169–181` | Per-layer factors: enabled returns `objectFormation 0.6 / blob 0.25 / stream 0.12`; disabled returns `0.2 / 0.1 / 0.04` (`FieldController.ts:172–180`). The exported function signature is `(id, motionEnabled)`; the controller method at `FieldController.ts:286–288` binds `id`. `motionSpeedMultiplier` composes here at the consumer. |

### 4b. GSAP timelines

| Timeline | Where | Type | Multiplier wiring |
|---|---|---|---|
| `colorCycleTimeline` | Field at `BlobController.ts:94`; constructed in `startColorCycle()` at `BlobController.ts:441–458` (timeline at `:447`); guarded by `syncColorCycle()` method at `BlobController.ts:468–479`; called once per tick at `BlobController.ts:246` | Long-running, `repeat: -1` | `this.colorCycleTimeline?.timeScale(<multiplier>)` whenever multiplier changes — wire inside the `syncColorCycle` body (`:468–479`), not at the call site. Already `motionEnabled`-aware (`syncColorCycle` kills + re-seeds on disable). |
| `animateIn()` | `FieldController.ts:317–360` (timeline construct at :329) | One-shot, 1.4s | Don't scale; one-shot intros are timing-sensitive. |
| `animateOut()` | `FieldController.ts:362–416` (timeline construct at :381) | One-shot, 1s | Don't scale; same reasoning. |
| `bindScroll()` ScrollTrigger | `ObjectFormationController.ts:117–153` (timeline at :136–145) | scroll-driven | Already short-circuited under `prefers-reduced-motion` at :128–134; multiplier should NOT re-enable it. |

### 4c. Motion gates already in place

| Field | Where | Source | Notes |
|---|---|---|---|
| `pauseMotion` | Field declared at `shell-store.ts:31`; setter declared at `:35`; setter implemented at `:49` | User | No UI consumer today. B wires the pause/play toggle here. |
| `lowPowerProfile` | Field declared at `shell-store.ts:32`; setter declared at `:36`; setter implemented at `:50` | User | `'auto' \| 'on' \| 'off'`. Used in motionEnabled derivation. |
| `prefersReducedMotion` | Field declared at `shell-store.ts:33`; setter declared at `:37`; setter implemented at `:51–52` | System (matchMedia) | **Stays orthogonal.** Multiplier never collapses this. |
| `motionEnabled` derivation — orb path | `apps/web/features/orb/surface/OrbSurface.tsx:81–88` | Consumer | Today combines `!pauseMotion && lowPowerProfile !== "on" && !prefersReducedMotion`. B splits `pauseMotion` into `motionPaused` so user pause can hard-freeze without invoking the reduced-motion floor. |
| `motionEnabled` derivation — landing path | `apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx:351` | Consumer (partial) | Today writes only `motionEnabled = !reducedMotion` — does **not** read `pauseMotion` or `lowPowerProfile`. B does not change this; landing stays out of the multiplier wiring (see §9.2). |

### 4d. Position initializers

| Initializer | Where | Topology |
|---|---|---|
| `fibonacci` (sphere surface) | `position-initializers.ts:123–140`; factory branch at `:170–176` | Even shell on unit sphere; deterministic phase per seed |
| `cluster-ball` (volumetric clusters) | `position-initializers.ts:52–105`; factory branch at `:178–193` | Centroid-on-sphere + Gaussian halo; needs `numCentroids` |
| `random-sphere` (Marsaglia surface) | `position-initializers.ts:195–211` | Uniform sphere surface |

These three are the only authored topologies. **Any new
formation preset must either reuse one of these or add a new
named initializer.** No "vibe" presets allowed.

### 4e. Visual presets and scene state shape

| Surface | Where | Notes |
|---|---|---|
| `FieldSceneState` interface | `visual-presets.ts:113–137` | Carries `motionEnabled`, `orbCameraActive`, `orbInteracting` today. The chosen multiplier joins this struct as a sibling of `motionEnabled` — see §5. |
| Per-controller `rotationVelocity`, `shader.speed`, `shader.amplitude` defaults | `visual-presets.ts:188 (blob)`, `:237 (stream)`, `:285 (objectFormation)`; shader defaults at `:199–227 / :246–274 / :296–324` | Defaults live here. Multipliers ride *over* these defaults; do not edit defaults. |

## 5. Duplicate-slider decision

**Decision: Option (A).** B ships exactly **one** ambient-tempo
multiplier, named `motionSpeedMultiplier`. `particleMotionSpeed`
is **deferred** as a separate concept and not given a slider in
B.

### Reasoning

- The ambient-tempo write site is the existing `uTimeFactor`
  consumer in every controller, plus Blob's GSAP `timeScale`.
  The shader multiplies `uTimeFactor * uSpeed`, so B must scale
  **one** of those values, not both. B chooses `uTimeFactor`
  because it preserves preset `shader.speed` as the native layer
  default.
- A second `particleMotionSpeed` slider would write the same
  `uSpeed` family of uniforms from a parallel store field. That
  is the exact "two sliders, one write" failure mode the parity
  plan rejects.
- A future `particleMotionSpeed` control that touches `uSpeed`
  instead of `uTimeFactor` is conceivable — for instance, a
  per-layer drift-only knob that leaves color-cycle tempo alone.
  But that is a refinement *of* `motionSpeedMultiplier`, not a
  sibling. **Concrete unblocking gate:** ship only when user
  telemetry or a documented design ask shows a case the global
  multiplier cannot serve — specifically, a request to vary drift
  tempo across the three layers (blob / stream / objectFormation)
  independently. Until that case is named in writing, the global
  multiplier is the only ambient-tempo knob.

### Naming locked

| Concept | Field | Type | Default | Range |
|---|---|---|---|---|
| Global ambient tempo (Bucket 2b) | `motionSpeedMultiplier` | `number` | `1.5` | `[0.5, 3.0]`, step `0.05` |
| Rotation-only tempo (Bucket 2b) | `rotationSpeedMultiplier` | `number` | `1.0` | `[0.0, 2.0]`, step `0.05` |
| Entropy / randomness (Bucket 2b) | `ambientEntropy` | `number` | `1.0` | `[0.0, 2.0]`, step `0.05` |

**Default 1.5 baseline (post-B0).** The legacy controllers wrote
`uTime = elapsedSec` (rate 1.0 by definition). Live testing showed
that rate read as too slow against the orb-mode camera —
particles drifted just enough to see, but the field felt static.
Bumping the baseline tempo to 1.5 made the orb feel alive
without breaking landing chapter timing (chapter math reads
chapter-state floats, not `uTime` directly). The shell-store
default and the `FieldSceneState` default are both 1.5; the
slider's reset target and center-dot mark also sit at 1.5×.
`rotationSpeedMultiplier` and `ambientEntropy` keep 1.0 as the
neutral baseline because their effects scale faster — 1.5×
rotation feels noticeably busy and 1.5× entropy starts pushing
particles outside the wrapper bounds.

Why a separate `rotationSpeedMultiplier` (vs folding rotation
into the global tempo): the parity plan calls them out as
distinct controls
(`docs/future/orb-3d-cosmograph-parity-plan.md` lines 432–434),
and the user model is different — "I want the orb to spin
slower while particles still drift normally" is a coherent ask
that a single global multiplier cannot answer. The two
multiplier write sites do not overlap (rotation rides
`rotationVelocity[1]`; ambient tempo rides `uTimeFactor` while
entropy rides `uAmplitude` / `uFrequency`), so no double-write
concern.

`particleMotionSpeed` is **NOT** a reserved field name in B.
The parity plan's mention of it
(`docs/future/orb-3d-cosmograph-parity-plan.md` line 477) is
recorded here as a deferred concept, not promoted to a slider.

## 6. Candidate controls — Ambient Visual Physics bucket

Each candidate is fully specified for B implementation.

### 6.1 Pause / play motion

- **Semantic:** "Stop everything." Particles freeze drift,
  rotation halts, color cycle pauses, scroll-driven physics in
  ObjectFormation goes static.
- **Mapped knobs:** writes `useShellStore.pauseMotion`
  (`shell-store.ts:31`) via the existing setter
  (`shell-store.ts:35` declared, `:49` implemented). Consumed
  in the orb-path derivation
  (`apps/web/features/orb/surface/OrbSurface.tsx:81–88`).
  **B0 correction:** `sceneState.motionEnabled = false` is a
  reduced-motion floor today, not a hard pause; the controllers
  still run at `motionScale = 0.16` and non-zero `uTimeFactor`.
  If the UI says "Pause", B must mirror `pauseMotion` into a
  distinct `sceneState.motionPaused` (or equivalent hard-pause
  scalar), remove `pauseMotion` from the `motionEnabled`
  derivation, and drive time / rotation / color-cycle scale to
  zero.
  The landing path
  (`FieldLandingPage.tsx:351`) only honors OS reduced-motion
  today — `pauseMotion` does not affect landing, by design,
  because landing chapter timing is timeline-locked.
  **Zero new shell-store field; one new scene-state mirror,
  see §9.2.**
- **Default:** `false` (motion on).
- **Reduced-motion behavior:** OS reduced-motion already drives
  `motionEnabled` to false through the consumer-side derivation;
  the user toggle remains independently writable per
  `feedback_user_vs_system_motion_inputs`. UI: the toggle shows
  the user's `pauseMotion` value, not the derived state.
- **Low-power behavior:** `lowPowerProfile === 'on'` already
  forces `motionEnabled = false` at the consumer; the toggle
  remains independently writable.
- **2D equivalent:** N/A (this is a 3D-substrate concept; 2D
  Cosmograph has its own simulation pause). Lives in 3D chrome.
- **Shell-store field:** `pauseMotion` (already exists).

### 6.2 Rotation speed (`rotationSpeedMultiplier`)

- **Semantic:** "Slow / speed up the orb's idle spin without
  changing how particles drift."
- **Mapped knobs:**
  - Orb path: `BlobController.ts:407–408` — multiply
    `preset.rotationVelocity[1] * motionScale` by
    `sceneState.rotationSpeedMultiplier`, with hard-pause scale
    applied separately if `sceneState.motionPaused` is true.
  - Landing path: `BlobController.ts:412–413` — same multiply.
  - Stream/objectFormation idle paths:
    `StreamController.ts:106–107`,
    `ObjectFormationController.ts:95–96`.
- **Default:** `1.0`.
- **Range:** `[0.0, 2.0]`, step `0.05`. `0.0` halts rotation
  but does not pause particles — distinct from §6.1.
- **Reduced-motion behavior:** `motionScale` already collapses
  to `0.16` under reduced motion; multiplier composes
  multiplicatively, so reduced-motion floor is preserved.
- **Low-power behavior:** Same — composes through `motionScale`.
- **2D equivalent:** Cosmograph 2D has no orbit-spin concept.
  3D-only chrome.
- **Shell-store field:** new `rotationSpeedMultiplier: number`
  on `useShellStore`.

Manual inspection burst is controller-owned, not transform-derived. The
field shader samples `vNoise` from local particle coordinates before
wrapper/camera transforms, so `<` / `>`, two-finger twist, Safari
trackpad twist, and active camera ROTATE events must call
`BlobController.triggerInteractionBurst()` (directly or through
`addTwistImpulse` / `applyTwist`). The burst reuses existing landing
uniform lanes — `uAmplitude`, `uFrequency`, and
`uSelectionBoostSize` — with a short half-life envelope. Do not add a
parallel color layer or assume camera azimuth changes the shader noise
field.

### 6.3 Ambient motion speed (`motionSpeedMultiplier`)

- **Semantic:** "Speed / slow the entire ambient drift —
  particles drift faster or slower without rotating differently."
- **Mapped knobs:**
  - **Implementation correction (post-B0).** Scaling `uTimeFactor`
    by the multiplier was the original B0 plan, but the shader
    samples noise at `uTime * uTimeFactor` as a *coordinate*, not
    a rate. Multiplying that coordinate causes a visible jump on
    speed change (the noise sample location shifts, then advances
    at the new rate). Real fix: integrate `uTime` itself per
    controller — `accumulatedUTime += dtSec * timeMul` where
    `timeMul = pauseScale * motionSpeedMultiplier`. `uTimeFactor`
    stays at its `getTimeFactor(motionEnabled)` baseline. Then
    `timeMul = 0` freezes in place (no jump) and `timeMul = 2`
    advances the noise coordinate twice as fast. Per-controller
    accumulator field on `FieldController` (`accumulatedUTime`).
  - `this.colorCycleTimeline?.timeScale(motionSpeedMultiplier)`
    inside the `syncColorCycle()` method body
    (`BlobController.ts:468–479`); per-tick call site at
    `BlobController.ts:246`. GSAP `timeScale(0)` correctly freezes
    the playhead, so this lane never had the jump issue.
- **Default:** `1.0`.
- **Range:** `[0.25, 2.0]`, step `0.05`. `0.0` is reserved for
  §6.1 (pause) so the multiplier can't double as pause.
- **Reduced-motion behavior:** `motionEnabled=false` still applies
  the existing reduced-motion floor. The user speed multiplier
  does not re-enable motion under reduced-motion or low-power.
- **Low-power behavior:** Same — low-power wins over the speed
  slider through the existing `motionEnabled` derivation.
- **2D equivalent:** Cosmograph 2D has its own simulation alpha
  / friction knobs but no direct "particle drift speed" — the
  2D substrate doesn't drift. 3D-only chrome.
- **Shell-store field:** new `motionSpeedMultiplier: number`.

### 6.4 Entropy / randomness (`ambientEntropy`)

- **Semantic:** "How chaotic does the cloud feel?" High entropy
  = bigger amplitude / higher frequency drift — exploratory
  cloud. Low entropy = calm atlas. **Does not re-seed
  positions** (per the §3 reservation).
- **Mapped knobs:**
  - `uniforms.uAmplitude.value` blend target at
    `BlobController.ts:250–252` etc. — multiplied by
    `ambientEntropy` after the existing `motionScale` factor.
  - **Implementation correction (post-B0).** The original B0 plan
    also scaled `uniforms.uFrequency.value` by `ambientEntropy`.
    Live testing showed this collapses the chromatic field to a
    single hue at low entropy because the noise field's spatial
    cell size (driven by `uFrequency`) is the same field the
    shader uses to distribute colors across particles. Scaling
    `uFrequency` to zero flattens the noise → all particles see
    the same vNoise → uniform color. Entropy is now
    **amplitude-only**: `uFrequency` stays at its preset/chapter
    baseline so the rainbow spread is preserved at any entropy.
- **Default:** `1.0`.
- **Range:** `[0.0, 2.0]`, step `0.05`. `0.0` flattens the
  noise field — particles still drift via uSpeed but the
  amplitude/frequency contribution mutes.
- **Reduced-motion behavior:** Compose through `motionScale` so
  reduced-motion users still see a calm field at any entropy.
- **Low-power behavior:** Hard cap at `1.0` when
  `lowPowerProfile === 'on'` to prevent high-frequency drift
  burning battery (per parity-plan rule "low-power disables
  high-frequency drift",
  `docs/future/orb-3d-cosmograph-parity-plan.md` line 495). Cap
  applied at the consumer, not stored back into the field.
- **2D equivalent:** None — 2D Cosmograph has no analog noise
  field. 3D-only chrome.
- **Shell-store field:** new `ambientEntropy: number`.

## 7. Candidate controls — Data Physics bucket

Each preset / force term gets a verdict + the gate that would
unblock it.

### 7.1 `natural`

- **Verdict:** **Defer** (effectively no-op today).
- **Gate:** A second formation must exist before "natural"
  becomes a meaningful UI choice. Until then, "natural" =
  current orb baseline = no UI.
- **Mapping check:** Today's orb uses
  `position-initializers.ts:170–176` (`fibonacci`) for the
  evenly distributed shell. There is no separate "natural"
  initializer; the word would be a synonym for "current."
- **Why not Ship:** A toggle with one option is not a control.

### 7.2 `globe`

- **Verdict:** **Needs User Decision** — leans Defer.
- **Gate:** Stable spherical projection without re-baking
  paper attribute integrity. The probe is:
  > Can the existing `fibonacciSphereSampler`
  > (`position-initializers.ts:123–140`), keyed by stable
  > `aIndex` per paper, project the current point set onto a
  > sphere surface **without** re-running
  > `field-attribute-baker.ts` and **without** changing
  > `aIndex` ↔ paper-id identity?
- **Probe outcome (asserted, not verified):** Today the field
  bakes positions once at asset-load time and writes them into
  per-attribute buffers (`field-attribute-baker.ts`,
  pos-write at `:241–278`). The position attribute is static;
  there is no live "swap initializer" path. The current vertex
  shader (`field-vertex-motion.glsl.ts:35–68`) starts
  displacement directly from `position`; **there is no
  existing `uFormationBlend` uniform and no globe lane in the
  baker.** Adding globe would require either:
  1. A second baked attribute buffer (`aPosGlobe`) the shader
     mixes between via a new uniform `uFormationBlend` — adds
     a vertex attribute (G0 said no), OR
  2. A runtime shader-side projection (e.g. vec3 normalized to
     unit sphere via `aPosition`) gated by a new
     `uFormationBlend` uniform plus the matching shader code
     — additive only, no new attribute, but **this is a
     real spike**, not a verified path.
- **Why Defer:** Option 2 is the cleaner direction *if* it
  works, but B0 has not run the spike. Even with the spike
  succeeding, globe needs shader work + a blend uniform + a
  UI surface that toggles between named formations. None of
  that is critical-path for B's MVP.
- **Open question:** see §10.1.

### 7.3 `clusterWells`

- **Verdict:** **Defer.**
- **Gate:** Cluster centroid data must exist as a named force
  term backed by a real cluster table. The existing
  `cluster-ball` initializer
  (`position-initializers.ts:52–105`) takes a `clusterId` per
  point and places it near a centroid — but that is a
  *static spatial layout*, not a runtime attractor. A "cluster
  well" is a force term that pulls toward the cluster centroid
  *during* simulation.
- **Why Defer:** No simulation loop today (positions are
  static). Adding live force-term integration is its own slice
  (post-F at the earliest, more likely H-tier).
- **Word reservation check:** "wells" passes — implies pull
  toward a discrete data-driven attractor. Don't ship without
  the data.

### 7.4 `focusGravity`

- **Verdict:** **Defer to after C.**
- **Gate:** `selectedNode` must drive G-lane focus excitation
  (slice C: hover ring + spotlight,
  `docs/future/orb-3d-cosmograph-parity-plan.md` lines 441–443).
  Once a focus signal exists in the particle-state texture, a
  gravitational pull toward the focused paper's position
  becomes definable.
- **Word reservation check:** "gravity" passes — pull is driven
  by `selectedNode`, a real graph signal.
- **Why Defer:** Depends on slices C and likely G-lane work
  shipping first. Naming itself "gravity" on day one would
  pre-commit to a force-term contract that doesn't yet have a
  data shape.

## 8. Verdict table

The B-implementation shortlist. One row per candidate.

| Candidate | Bucket | Verdict | Reason / Gate |
|---|---|---|---|
| Pause / play motion | Ambient | **Ship in B** | `pauseMotion` field exists; B wires the missing UI and mirrors it into `sceneState.motionPaused` so pause is a hard freeze, not the reduced-motion floor. |
| Rotation speed multiplier | Ambient | **Ship in B** | `rotationVelocity[1] * motionScale` is the single write site per controller. New `rotationSpeedMultiplier` shell field. |
| Ambient motion speed multiplier | Ambient | **Ship in B** | Scales `uTimeFactor` once plus GSAP `timeScale`. Does not scale `uSpeed` or `uAmplitude`. New `motionSpeedMultiplier` shell field. |
| Entropy / randomness | Ambient | **Ship in B** | Hijacks `uAmplitude` and `uFrequency` blend targets. New `ambientEntropy` shell field. Capped under low-power. |
| `particleMotionSpeed` (separate slider) | — | **Defer (collapsed)** | Subsumed by `motionSpeedMultiplier`. No second slider writing the same uniforms. |
| `natural` formation preset | Data | **Defer** | Effectively no-op today; promote when a second formation exists. |
| `globe` formation preset | Data | **Needs User Decision** | Stable spherical projection — option 2 (shader-side projection + new `uFormationBlend`) is asserted but not verified; live shader has no such uniform and baker has no globe lane today. Requires a shader spike before shipping. See §10.1. |
| `clusterWells` formation preset | Data | **Defer** | No live simulation / force-term loop; no runtime cluster centroid data signal. Re-evaluate post-F. |
| `focusGravity` | Data | **Defer to after C** | Needs `selectedNode` + G-lane focus excitation. Naming the word "gravity" gated on data signal. |

## 9. B implementation map

For every "Ship in B" row, the exact write sites the control
touches in implementation order.

### 9.1 Shell-store fields (one commit)

`apps/web/features/graph/stores/shell-store.ts`:

- Add fields after `prefersReducedMotion` (`shell-store.ts:33`):
  - `motionSpeedMultiplier: number` — initial `1.0`
  - `rotationSpeedMultiplier: number` — initial `1.0`
  - `ambientEntropy: number` — initial `1.0`
- Add setters mirroring `setPauseMotion` shape
  (`shell-store.ts:35`):
  - `setMotionSpeedMultiplier(value: number): void`
  - `setRotationSpeedMultiplier(value: number): void`
  - `setAmbientEntropy(value: number): void`
- Update `INITIAL_SHELL_STATE` (`shell-store.ts:41–45`) and
  `reset()` (`shell-store.ts:53`).

### 9.2 Scene state plumbing (one commit)

`apps/web/features/field/scene/visual-presets.ts`:

- Add to `FieldSceneState` interface
  (`visual-presets.ts:113–137`):
  - `motionPaused: boolean`
  - `motionSpeedMultiplier: number`
  - `rotationSpeedMultiplier: number`
  - `ambientEntropy: number`
- Update `createFieldSceneState()`
  (`visual-presets.ts:340–353`) to default `motionPaused` to
  `false` and each multiplier to `1.0`.

`apps/web/features/orb/surface/OrbSurface.tsx` near line 81–88:
change the bridge from the current combined expression to two
separate writes:

```ts
sceneState.motionPaused = pauseMotion;
sceneState.motionEnabled = lowPowerProfile !== "on" && !prefersReducedMotion;
```

Then also write `motionSpeedMultiplier`,
`rotationSpeedMultiplier`, `ambientEntropy` into
`sceneStateRef.current` on each shell-store change. Apply low-power
cap on `ambientEntropy` here (§6.4).

`apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx`:
**do not** wire the multipliers into the landing path. Landing
storytelling assumes baseline tempo for chapter timing;
multipliers stay orb-only. Confirm by leaving the existing
`reducedMotion`-only write at `FieldLandingPage.tsx:351`
untouched.

### 9.3 Controller write sites (one commit per controller)

Per controller, keep `motionScale` as the reduced-motion /
low-power floor, then compose the user-facing knobs around it:

```ts
// Read once per tick.
const motionScale = sceneState.motionEnabled ? 1 : 0.16;
const pauseScale = sceneState.motionPaused ? 0 : 1;
const timeMul = pauseScale * sceneState.motionSpeedMultiplier;
const rotMul = pauseScale * motionScale * sceneState.rotationSpeedMultiplier;
const entropyMul = sceneState.ambientEntropy;
```

**`BlobController.ts`:**

- Keep `* motionScale` at `:233` (uSpeed). Do not multiply by
  `motionSpeedMultiplier`.
- Replace `* motionScale` at `:251–252` (uAmplitude) with
  `* motionScale * entropyMul`.
- **Do not scale `uFrequency` by entropy** — see §6.4
  correction. Leave the existing `uFrequency` write at
  `:253–254` untouched.
- Replace `* motionScale` at `:407–408` (orb idle spin) with
  `* rotMul`.
- Replace `* motionScale` at `:412–413` (landing absolute spin)
  with `* rotMul`. **Verify this does not corrupt landing
  chapter timing** — landing scene state defaults
  `rotationSpeedMultiplier` to `1.0` and never writes it (per
  §9.2), so the math is identity on landing.
- In the `syncColorCycle()` method body
  (`BlobController.ts:468–479`) — **not** at the per-tick call
  site `:246` — after the `startColorCycle()` call inside the
  `motionEnabled` branch, wire
  `this.colorCycleTimeline?.timeScale(timeMul)`. The method
  already runs every tick via the call at `:246`, so guard the
  re-apply against a private `lastTimeScale` field to avoid
  redundant writes.

**`StreamController.ts`:**

- Keep `* motionScale` at `:89` (uSpeed). Do not multiply by
  `motionSpeedMultiplier`.
- Replace `* motionScale` at `:81–83` (uAmplitude) with
  `* motionScale * entropyMul`.
- **Do not scale `uFrequency` by entropy** (see §6.4
  correction).
- Replace `* motionScale` at `:106–107` (idle rotation) with
  `* rotMul`.

**`ObjectFormationController.ts`:**

- Keep `* motionScale` at `:81` (uSpeed). Do not multiply by
  `motionSpeedMultiplier`.
- Replace `* motionScale` at `:77` (uAmplitude) with
  `* motionScale * entropyMul`.
- **Do not scale `uFrequency` by entropy** (see §6.4
  correction).
- Replace `* motionScale` at `:95–96` (idle rotation) with
  `* rotMul`.
- **Do not** touch `bindScroll()` at `:117–153`. The
  `prefers-reduced-motion` short-circuit at `:128–134` is the
  authority for that path.

**`FieldController.ts`:**

- `getTimeFactor()` at `:169–181`: leave the function shape
  alone. The simplest path is to multiply at the consumer:
  `uniforms.uTimeFactor.value = getTimeFactor(id, motionEnabled) * timeMul`.
  This keeps `getTimeFactor` pure and avoids growing its
  signature.
- `animateIn()` at `:317–360` and `animateOut()` at `:362–416`:
  no change. One-shot intros stay at unscaled speed.

### 9.4 UI mount (one commit)

A new `<MotionControlPanel>` component is the user-facing
surface for the four ambient knobs. B0 fixes the data shape
and the store-write contract; B's own plan picks the panel's
file path and visual layout.

**Store writes (concrete, not TBD).** Of the four setters
below, only `setPauseMotion` exists in the store today
(`shell-store.ts:35` declared, `:49` implemented). The other
three are **new** state added in §9.1 — they do not exist on
`ShellState` yet, and Slice B's first commit must land §9.1
(store fields + setters) before the panel can wire them.

- Pause / play toggle → `useShellStore.getState().setPauseMotion(value: boolean)` — **existing** setter at `shell-store.ts:49`.
- Rotation speed slider → `useShellStore.getState().setRotationSpeedMultiplier(value: number)` — **new** setter from §9.1.
- Ambient motion speed slider → `useShellStore.getState().setMotionSpeedMultiplier(value: number)` — **new** setter from §9.1.
- Entropy slider → `useShellStore.getState().setAmbientEntropy(value: number)` — **new** setter from §9.1.

In a React component, prefer the hook form
(`useShellStore((s) => s.setPauseMotion)` etc.) so re-renders
are scoped to the relevant slice.

**Mount path:** the panel attaches through the existing
`<OrbChromeBar>` panel-slot pattern (shipped in slice A0.5).
B's plan picks the chromebar slot index and the toggle
copy.

## 10. Open questions

### 10.1 Globe formation: ship or defer?

Probe status (§7.2): the cleaner shape (option 2 — runtime
shader-side projection + a new `uFormationBlend` uniform) is
**asserted, not verified**. The live shader has no
`uFormationBlend` and the baker has no globe lane today, so
shipping globe in B requires a real shader spike before the
slider can land.

Question for the user: should B0 commission a globe spike
(authorize a small shader-side experiment in B that wires the
`uFormationBlend` uniform + projection term, then promote globe
to "Ship in B" if the spike succeeds), or stay deferred to its
own "formations" slice?

**Recommendation:** Defer. B's value is the four ambient knobs
landing cleanly. A formation toggle is its own design surface
(needs naming, needs a default, needs to interact with future
data-physics presets). Pulling an unverified shader spike into
B inflates its scope.

### 10.2 Where does the multiplier live in the panel?

`<MotionControlPanel>` vs `<OrbPhysicsConfigPanel>`: B0 leaves
the panel split to slice B's plan. Mentioning both names so
B doesn't accidentally ship two panels for the same four fields.

### 10.3 Per-controller override

Should `motionSpeedMultiplier` be a single global, or per-layer
(blob / stream / objectFormation)? B0 recommends global. The
landing `FieldSceneState` default of `1.0` keeps landing timing
intact; the orb is the only surface where the multiplier
deviates from `1.0` today. If a per-layer need arises, it ships
as a refinement after B without breaking the global field.

## 11. Verification

Before B begins:

1. Markdown renders without broken tables.
2. Every `file:line` citation in §4 and §9 resolves on the
   current `feat/orb-as-field-particles` worktree.
3. Every "Ship in B" row in §8 has at least one concrete write
   site named in §9.
4. Every "Defer" row in §8 names its gate (the condition that
   would unblock it).
5. The §3 word reservations are enforced: no candidate uses
   "gravity" without a graph-signal source named.
6. Hand to **codex:rescue verify-only** per
   `feedback_codex_review_for_foundation_plans`. MEDIUM/HIGH
   findings block B start.
7. Final user read-through: every candidate has a verdict, no
   silent defers, no duplicate sliders, no "vibe" presets.
