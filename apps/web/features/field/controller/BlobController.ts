import { PerspectiveCamera, Vector3, type Camera } from "three";
import { DECAY, lerpFactor } from "@/lib/motion3d";
import type { FieldPointSource } from "../asset/point-source-types";
import { resolveLandingBlobChapterState } from "../scroll/chapters/landing-blob-chapter";
import {
  INFO_EIGHT_FOCUS_ENTRY,
  type InfoNineStepFocusEntry,
} from "../surfaces/FieldLandingPage/field-lit-particle-indices";
import {
  FieldController,
  FOCUS_MEMBER_SLOT_COUNT,
  type FieldControllerInit,
  type FrameContext,
} from "./FieldController";
import {
  createBlobColorCycleState,
  destroyBlobColorCycle,
  syncBlobColorCycle,
} from "./blob-color-cycle";
import { projectBlobHotspots } from "./blob-hotspot-projector";
import {
  BLOB_HOTSPOT_CARD_COUNT,
  BLOB_HOTSPOT_IDS,
  sampleBlobHotspotDelayMs,
  type FieldHotspotFrame,
  type BlobHotspotRuntime,
  type BlobHotspotState,
} from "./blob-hotspot-runtime";

// BlobController mirrors Maze's `mm` at scripts.pretty.js:43257-43526.

// Intro: kill the globe-expand by snapping to baseScale on first frame
// and ramp uDepth down from a boost multiplier over 1.4s so particles
// start scattered along aMove axes and converge onto the sphere. Matches
// Maze's animateIn duration at scripts.pretty.js:43129-43130.
export const INTRO_DURATION_SECONDS = 1.4;
export const INTRO_DEPTH_BOOST = 2.6;

// Slice A1.1: orb-mode reference camera distance for sceneUnits. Matches
// the initial Z FieldCanvas constructs the perspective camera with
// (`position: [0, 0, 400]`). Freezing the world scale against this fixed
// reference is what turns dolly-in into a fly-through — the galaxy stays
// the same world size as the camera moves through it, so particles
// parallax instead of re-normalizing around the viewer.
export const ORB_REFERENCE_CAMERA_Z = 400;

// Slice A1.1: orb-mode point depth attenuation target. Tuned within the
// 0.15–0.35 band the corrective slice scopes; 0.2 gives the camera-move
// the right "fly through stars" feel without flattening particles into
// stickers (which 0.0 would).
export const ORB_POINT_DEPTH_ATTENUATION = 0.2;

// Time constant (seconds) for keyboard-rotate impulse drain. At 60fps a
// single 5° tap drains ~17% per frame and resolves visually inside
// ~250ms — fast enough to feel responsive, slow enough to lift the
// per-frame snap that pure `applyTwist` produced between browser
// key-repeats. Holding the key (~30 Hz repeat) accumulates into a
// stable continuous spin because the drain rate matches the input rate.
const TWIST_IMPULSE_TAU_SEC = 0.1;
// Below this, the residual spin is sub-pixel; clear it instead of
// asymptoting forever so `pendingTwist` doesn't carry FP noise.
const TWIST_IMPULSE_EPSILON_RAD = 1e-5;

// Manual orb inspection should reuse the landing field's existing burst
// vocabulary: a short lift in noise frequency, amplitude, and survivor point
// size. Rotation/camera transforms do not change `vNoise` by themselves
// because the shader samples local particle coordinates before model/view
// transforms, so interaction needs an explicit controller-owned envelope.
const ORB_INTERACTION_BURST_FREQUENCY = 1.7;
const ORB_INTERACTION_BURST_AMPLITUDE = 0.25;
const ORB_INTERACTION_BURST_SELECTION_BOOST_SIZE = 1.6;
const ORB_INTERACTION_BURST_HALF_LIFE_SEC = 0.48;
const ORB_INTERACTION_BURST_EPSILON = 1e-3;
const ORB_INTERACTION_BURST_KEY_STRENGTH = 0.34;
const ORB_INTERACTION_BURST_CONTROL_STRENGTH = 0.1;
const ORB_INTERACTION_BURST_TWIST_GAIN = 2.6;

export type { FieldHotspotFrame, BlobHotspotState } from "./blob-hotspot-runtime";
export { BLOB_COLOR_CYCLE_PER_STOP_SECONDS } from "./blob-color-cycle";
export {
  BLOB_HOTSPOT_CARD_COUNT,
  BLOB_HOTSPOT_COUNT,
  BLOB_HOTSPOT_IDS,
  getBlobHotspotCycleDurationMs,
  getBlobHotspotPulseEnvelope,
  projectBlobHotspotCandidate,
  selectBlobHotspotCandidate,
} from "./blob-hotspot-runtime";

export class BlobController extends FieldController {
  hotspotState: BlobHotspotState = {
    opacity: 0,
    maxNumber: 0,
    onlyReds: 0,
    interval: 2000,
  };
  pointSource: FieldPointSource | null = null;
  hotspotRuntime: BlobHotspotRuntime[] = BLOB_HOTSPOT_IDS.map(() => ({
    candidateIndex: null,
    cycleDurationMs: 0,
    cycleStartAtMs: 0,
    invalidSinceAtMs: null,
    lastProjected: null,
    phaseKey: "hidden",
  }));
  // Stage-level phase gates. Consumers mirror these into the `.afr-stage`
  // element via `has-only-reds` / `has-only-single` classes.
  stageHasOnlyReds = false;
  stageHasOnlySingle = false;
  private wrapperInitialized = false;
  private introCompleted = false;
  private colorCycleState = createBlobColorCycleState();
  // Pending wrapper-twist budget (radians). Consumed exponentially each
  // tick so a discrete keyboard impulse rotates over multiple frames
  // instead of snapping. Only `addTwistImpulse` writes here; gesture-
  // driven `applyTwist` stays immediate so finger / trackpad don't lag
  // behind the input.
  private pendingTwist = 0;
  private interactionBurst = 0;
  private hotspotVector = new Vector3();
  private lastFrames: FieldHotspotFrame[] = BLOB_HOTSPOT_IDS.map(
    (id, index) => ({
      color: "var(--color-soft-blue)",
      id,
      mode: "hidden",
      opacity: 0,
      scale: 0.9,
      showCard: index < BLOB_HOTSPOT_CARD_COUNT,
      visible: false,
      x: -9999,
      y: -9999,
    }),
  );

  constructor(init: FieldControllerInit) {
    super(init);
  }

  setPointSource(source: FieldPointSource): void {
    this.pointSource = source;
  }

  getLastFrames(): readonly FieldHotspotFrame[] {
    return this.lastFrames;
  }

  // Per-hotspot reseed. Called from the DOM pool's `animationend` listener
  // (one per slot). Matches Maze's pattern where each hotspot's cycle is
  // independent of its neighbors — `scripts.pretty.js:43421-43457`.
  onHotspotAnimationEnd(index: number): void {
    const runtime = this.hotspotRuntime[index];
    if (!runtime) return;
    runtime.candidateIndex = null;
    runtime.lastProjected = null;
    runtime.invalidSinceAtMs = null;
    const loopMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    runtime.cycleStartAtMs = loopMs + sampleBlobHotspotDelayMs();
  }

  // Apply stage-level phase gates to the `.afr-stage` element.
  applyStageGates(stage: HTMLElement | null): void {
    if (!stage) return;
    stage.classList.toggle("afr-has-only-reds", this.stageHasOnlyReds);
    stage.classList.toggle("afr-has-only-single", this.stageHasOnlySingle);
  }

  // Blob motion now resolves from the shared landing chapter state instead
  // of a controller-local ScrollTrigger timeline. The controller keeps
  // ownership of per-frame smoothing, intro depth settling, hotspot
  // projection, and idle wrapper spin.
  tick(context: FrameContext): void {
    const {
      camera,
      dtSec,
      elapsedSec,
      isMobile,
      itemState,
      pixelRatio,
      sceneState,
      sourceBounds,
      uniforms,
    } = context;

    const { wrapper, model, material } = this;
    if (!wrapper || !model || !material) return;

    const preset = this.params;
    const { shader } = preset;
    const motionEnabled = sceneState.motionEnabled;
    const motionScale = motionEnabled ? 1 : 0.16;
    // Slice B (orb-3d-physics-taxonomy.md §9.3): pauseScale is a hard
    // freeze (0 / 1), motionScale is the reduced-motion floor. They
    // compose multiplicatively so pause halts every consumer regardless
    // of the floor.
    const pauseScale = sceneState.motionPaused ? 0 : 1;
    const timeMul = pauseScale * sceneState.motionSpeedMultiplier;
    const rotMul =
      pauseScale * motionScale * sceneState.rotationSpeedMultiplier;
    const entropyMul = sceneState.ambientEntropy;
    const driftBlend = lerpFactor(dtSec, DECAY.standard);
    const timeFactor = this.getTimeFactor(motionEnabled);
    // Slice B: integrate `uTime` instead of pinning it to the module
    // clock. timeMul scales how fast the noise coordinate advances and
    // collapses to 0 on hard pause, so changing speed adjusts the
    // *rate of change* without shifting the noise sample location.
    this.accumulatedUTime += dtSec * timeMul;
    const visibility = itemState?.visibility ?? 0;
    const chapterState = resolveLandingBlobChapterState(sceneState);

    const sceneScale = isMobile
      ? preset.sceneScaleMobile ?? preset.sceneScale
      : preset.sceneScale;
    const sourceHeight = Math.max(sourceBounds.maxY - sourceBounds.minY, 0.001);
    // Orb mode freezes the camera-distance term so dolly does not
    // re-normalize the galaxy around the viewer. Landing keeps the
    // live formula so scroll-driven scaling still tracks `camera.fov`
    // changes if any.
    const orbCameraActive = sceneState.orbCameraActive;
    const sceneCameraZ = orbCameraActive
      ? ORB_REFERENCE_CAMERA_Z
      : camera.position.z;
    const sceneUnits =
      camera instanceof PerspectiveCamera
        ? 2 * sceneCameraZ * Math.tan((camera.fov * Math.PI) / 360)
        : 0;
    const baseScale = (sceneUnits / sourceHeight) * sceneScale;
    this.sceneUnits = sceneUnits;
    this.isMobile = isMobile;

    const shaderSize = isMobile
      ? shader.sizeMobile ?? shader.size
      : shader.size;

    uniforms.uTime.value = this.accumulatedUTime;
    uniforms.uTimeFactor.value = timeFactor;
    uniforms.uPixelRatio.value = pixelRatio;
    uniforms.uIsMobile.value = isMobile;
    uniforms.uScale.value = 1 / baseScale;
    uniforms.uSize.value = shaderSize;
    uniforms.uSpeed.value = shader.speed * motionScale;

    const interactionBurst =
      motionEnabled && orbCameraActive ? this.interactionBurst : 0;

    // Slice A1.1: blend the point-size depth attenuation toward the
    // active mode's target. Drift-blended (not snapped) so 3D ↔ 2D and
    // /landing ↔ /graph transitions ease the visual change instead of
    // popping particle sizes on toggle.
    const depthAttenuationTarget = orbCameraActive
      ? ORB_POINT_DEPTH_ATTENUATION
      : 1;
    uniforms.uPointDepthAttenuation.value +=
      (depthAttenuationTarget - uniforms.uPointDepthAttenuation.value) *
      driftBlend;
    uniforms.uOrbFocusActive.value +=
      ((sceneState.orbFocusActive ? 1 : 0) -
        uniforms.uOrbFocusActive.value) *
      driftBlend;

    syncBlobColorCycle({
      material,
      motionEnabled,
      seed: shader.colorNoise,
      state: this.colorCycleState,
      timeScale: timeMul,
    });

    uniforms.uAlpha.value +=
      (chapterState.alpha - uniforms.uAlpha.value) * driftBlend;
    const burstAmplitudeTarget = Math.max(
      chapterState.amplitude,
      ORB_INTERACTION_BURST_AMPLITUDE,
    );
    const amplitudeTarget =
      (chapterState.amplitude +
        (burstAmplitudeTarget - chapterState.amplitude) * interactionBurst) *
      motionScale *
      entropyMul;
    uniforms.uAmplitude.value +=
      (amplitudeTarget - uniforms.uAmplitude.value) * driftBlend;
    // Slice B: entropy drives amplitude only. The shader's color
    // distribution rides the same noise field that uFrequency
    // controls, so scaling uFrequency to zero flattens the rainbow
    // into a single hue. Keeping uFrequency at its preset/chapter
    // baseline preserves the chromatic spread; entropy reads as
    // "how far particles drift" instead of "how chromatically alive
    // the field is."
    const burstFrequencyTarget = Math.max(
      chapterState.frequency,
      ORB_INTERACTION_BURST_FREQUENCY,
    );
    const frequencyTarget =
      chapterState.frequency +
      (burstFrequencyTarget - chapterState.frequency) * interactionBurst;
    uniforms.uFrequency.value +=
      (frequencyTarget - uniforms.uFrequency.value) * driftBlend;
    uniforms.uSelection.value +=
      (chapterState.selection - uniforms.uSelection.value) * driftBlend;

    // Reduced-motion + Phase A1 per-category targets. When motion is
    // disabled the blob reads as a single uniform substrate: every
    // per-category floor snaps to 1, the selection boost collapses to
    // identity, clusterEmergence and focusActive shut off. We overwrite
    // the chapterState targets here (rather than short-circuiting the
    // blend below) so the drift-blend still runs — that keeps the
    // transition in-and-out of reduced motion smooth instead of
    // snap-popping uniforms on toggle.
    const papersTarget = motionEnabled ? chapterState.papersSelection : 1;
    const entitiesTarget = motionEnabled ? chapterState.entitiesSelection : 1;
    const relationsTarget = motionEnabled ? chapterState.relationsSelection : 1;
    const evidenceTarget = motionEnabled ? chapterState.evidenceSelection : 1;
    const boostColorRTarget = motionEnabled
      ? chapterState.selectionBoostColorR
      : 1;
    const boostColorGTarget = motionEnabled
      ? chapterState.selectionBoostColorG
      : 1;
    const boostColorBTarget = motionEnabled
      ? chapterState.selectionBoostColorB
      : 1;
    const baseBoostSizeTarget = motionEnabled
      ? chapterState.selectionBoostSize
      : 1;
    const burstBoostSizeTarget = Math.max(
      baseBoostSizeTarget,
      ORB_INTERACTION_BURST_SELECTION_BOOST_SIZE,
    );
    const boostSizeTarget =
      baseBoostSizeTarget +
      (burstBoostSizeTarget - baseBoostSizeTarget) * interactionBurst;
    const clusterEmergenceTarget = motionEnabled
      ? chapterState.clusterEmergence
      : 0;
    const focusActiveTarget = motionEnabled ? chapterState.focusActive : 0;

    uniforms.uPapersSelection.value +=
      (papersTarget - uniforms.uPapersSelection.value) * driftBlend;
    uniforms.uEntitiesSelection.value +=
      (entitiesTarget - uniforms.uEntitiesSelection.value) * driftBlend;
    uniforms.uRelationsSelection.value +=
      (relationsTarget - uniforms.uRelationsSelection.value) * driftBlend;
    uniforms.uEvidenceSelection.value +=
      (evidenceTarget - uniforms.uEvidenceSelection.value) * driftBlend;

    // Boost color is a live THREE.Color; blend each channel independently
    // so timelines can tween R/G/B separately. The shader mixes the blob's
    // palette toward (vColor * boostColor), so identity (1,1,1) is a no-op.
    const boostColor = uniforms.uSelectionBoostColor.value;
    boostColor.r += (boostColorRTarget - boostColor.r) * driftBlend;
    boostColor.g += (boostColorGTarget - boostColor.g) * driftBlend;
    boostColor.b += (boostColorBTarget - boostColor.b) * driftBlend;

    uniforms.uSelectionBoostSize.value +=
      (boostSizeTarget - uniforms.uSelectionBoostSize.value) * driftBlend;
    uniforms.uClusterEmergence.value +=
      (clusterEmergenceTarget - uniforms.uClusterEmergence.value) * driftBlend;
    uniforms.uFocusActive.value +=
      (focusActiveTarget - uniforms.uFocusActive.value) * driftBlend;

    // Focus entity lookup: the Sequence keyframe holds focusActive while
    // info-8 / info-9 are on screen, so BlobController spotlights the
    // single-entity entry (catatonia) whenever that gate is open. The
    // continuous uFocusActive tween (drift-blended above) is what the
    // shader uses to fade the spotlight in/out.
    let focusEntry: InfoNineStepFocusEntry | null = null;
    if (motionEnabled && chapterState.focusActive > 0.01) {
      focusEntry = INFO_EIGHT_FOCUS_ENTRY;
    }

    if (focusEntry) {
      uniforms.uFocusEntityIndex.value = focusEntry.focusIndex;
      const memberBuffer = uniforms.uFocusMembers.value;
      const count = Math.min(
        focusEntry.memberIndices.length,
        FOCUS_MEMBER_SLOT_COUNT,
      );
      for (let i = 0; i < FOCUS_MEMBER_SLOT_COUNT; i += 1) {
        memberBuffer[i] = i < count ? (focusEntry.memberIndices[i] ?? -1) : -1;
      }
      uniforms.uFocusMemberCount.value = count;
    } else {
      uniforms.uFocusEntityIndex.value = -1;
      uniforms.uFocusMemberCount.value = 0;
    }

    const targetDepth = chapterState.depth;
    if (!this.introCompleted) {
      const introProgress = Math.max(
        0,
        Math.min(1, elapsedSec / INTRO_DURATION_SECONDS),
      );
      const introEase = 1 - (1 - introProgress) * (1 - introProgress);
      const depthBoost = 1 + (INTRO_DEPTH_BOOST - 1) * (1 - introEase);
      uniforms.uDepth.value +=
        (targetDepth * depthBoost - uniforms.uDepth.value) * driftBlend;
      if (introProgress >= 1) this.introCompleted = true;
    } else {
      uniforms.uDepth.value +=
        (targetDepth - uniforms.uDepth.value) * driftBlend;
    }

    model.scale.x = baseScale;
    model.scale.y = baseScale;
    model.scale.z = baseScale;
    // Slice A1.1: in orb mode, drive the model toward origin + identity
    // rotation so drei `<CameraControls>` (whose orbit target is at
    // (0,0,0)) actually rotates around the visible orb center. Landing
    // keeps chapter-driven model offsets so the scroll choreography
    // stays intact.
    const modelTargetPosY = orbCameraActive
      ? 0
      : sceneUnits * chapterState.modelPositionY;
    const modelTargetRotY = orbCameraActive ? 0 : chapterState.modelRotationY;
    model.position.y += (modelTargetPosY - model.position.y) * driftBlend;
    model.rotation.y += (modelTargetRotY - model.rotation.y) * driftBlend;

    this.hotspotState.opacity +=
      (chapterState.hotspotOpacity - this.hotspotState.opacity) * driftBlend;
    this.hotspotState.maxNumber +=
      (chapterState.hotspotMaxNumber - this.hotspotState.maxNumber) *
      driftBlend;
    this.hotspotState.onlyReds +=
      (chapterState.hotspotOnlyReds - this.hotspotState.onlyReds) * driftBlend;

    wrapper.visible = visibility > 0.01;
    // Slice A1.1: orb mode anchors the wrapper at world origin so
    // drei `<CameraControls>` (target at (0,0,0)) orbits around the
    // visible orb center -- preset.sceneOffset is a landing-only nudge
    // for the scroll storytelling and would otherwise cause the camera
    // to swing the orb through an arc as you drag.
    const wrapperTargetX = orbCameraActive
      ? 0
      : sceneUnits * preset.sceneOffset[0];
    const wrapperTargetY = orbCameraActive
      ? 0
      : sceneUnits * preset.sceneOffset[1];
    const wrapperTargetZ = orbCameraActive ? 0 : preset.sceneOffset[2];
    if (!this.wrapperInitialized) {
      wrapper.position.x = wrapperTargetX;
      wrapper.position.y = wrapperTargetY;
      wrapper.position.z = wrapperTargetZ;
      this.wrapperInitialized = true;
    } else {
      wrapper.position.x += (wrapperTargetX - wrapper.position.x) * driftBlend;
      wrapper.position.y += (wrapperTargetY - wrapper.position.y) * driftBlend;
      wrapper.position.z += (wrapperTargetZ - wrapper.position.z) * driftBlend;
    }
    wrapper.rotation.x = 0;
    if (orbCameraActive) {
      // Orb mode: delta-accumulated rotation, paused while the user is
      // actively orbiting via drei `<CameraControls>`. This keeps two
      // rotations from compounding into a sliding-plane feel during
      // drag, and the delta accumulator (vs the clock-driven absolute
      // formula) means release-to-screensaver resumes from the held
      // angle instead of snapping forward by however long the drag
      // lasted.
      if (!sceneState.orbInteracting) {
        wrapper.rotation.y +=
          dtSec * preset.rotationVelocity[1] * rotMul;
      }
    } else {
      // Landing: original clock-driven absolute rotation. `rotMul`
      // collapses to `motionScale` on landing because OrbSurface is
      // the only writer of `rotationSpeedMultiplier` and `motionPaused`
      // — landing scene state defaults both to identity.
      wrapper.rotation.y =
        elapsedSec * preset.rotationVelocity[1] * rotMul;
    }
    // Drain queued keyboard-impulse rotations exponentially so a 5°
    // tap unfolds across ~10 frames instead of snapping. Composes
    // additively with the auto-rotation above and survives pause —
    // user inspection rotations should still work when motion is
    // frozen. Cleared below `TWIST_IMPULSE_EPSILON_RAD` to avoid FP
    // residue accumulating in the buffer.
    if (this.pendingTwist !== 0) {
      const drainFraction = 1 - Math.exp(-dtSec / TWIST_IMPULSE_TAU_SEC);
      const drain = this.pendingTwist * drainFraction;
      wrapper.rotation.y += drain;
      this.pendingTwist -= drain;
      if (Math.abs(this.pendingTwist) < TWIST_IMPULSE_EPSILON_RAD) {
        this.pendingTwist = 0;
      }
    }
    wrapper.rotation.z = 0;
    // Phase A1 mobile cap: clamp wrapperScale at 1.6 on mobile. Codex R3
    // noted desktop cropping gets catastrophic past ~2.2; the mobile
    // ceiling is tighter because the viewport is proportionally narrower
    // and there's no dead margin to crop into. Implemented as a per-call
    // clamp (not a preset field) — alphaMobile isn't read by the
    // controller today (Codex R6), so following the same per-call pattern
    // avoids growing the preset surface.
    const wrapperScaleTarget = isMobile
      ? Math.min(chapterState.wrapperScale, 1.6)
      : chapterState.wrapperScale;
    wrapper.scale.x += (wrapperScaleTarget - wrapper.scale.x) * driftBlend;
    wrapper.scale.y += (wrapperScaleTarget - wrapper.scale.y) * driftBlend;
    wrapper.scale.z += (wrapperScaleTarget - wrapper.scale.z) * driftBlend;

    this.decayInteractionBurst(dtSec);

    void sourceBounds;
  }

  /**
   * Apply a one-frame yaw delta to the orb wrapper. Used by gesture
   * lanes that already deliver smooth per-frame deltas — the mobile
   * two-finger twist (`OrbTouchTwist`), the Safari trackpad rotate
   * gesturechange handler, etc. Each call is added directly to
   * `wrapper.rotation.y`; the caller is responsible for sign + coord
   * conventions.
   *
   * No-op when no wrapper is attached (orb not mounted yet) or the
   * delta is non-finite. Composes additively with the per-frame auto-
   * rotation in `tick()`; the auto-rotation is paused while
   * `sceneState.orbInteracting === true`, so a drei wake-driven gesture
   * + concurrent twist won't double-spin. Also feeds the explicit
   * interaction-burst envelope; transform changes alone do not affect
   * shader-local `vNoise`.
   *
   * For discrete inputs (keyboard `<` / `>`) use `addTwistImpulse`
   * instead — direct add of a 5° step would snap visibly between
   * key-repeat frames.
   */
  applyTwist(deltaRadians: number): void {
    if (!Number.isFinite(deltaRadians)) return;
    if (!this.wrapper) return;
    this.wrapper.rotation.y += deltaRadians;
    this.triggerInteractionBurst(
      Math.min(1, Math.abs(deltaRadians) * ORB_INTERACTION_BURST_TWIST_GAIN),
    );
  }

  /**
   * Queue a smoothed yaw impulse (radians). Used by the keyboard
   * handler so a discrete 5° tap rotates over multiple frames instead
   * of snapping between browser key-repeats. Each tick consumes a
   * fraction of `pendingTwist` proportional to dt and the time
   * constant `TWIST_IMPULSE_TAU_SEC`; held keys naturally accumulate
   * into a continuous spin and the tail decays smoothly on release.
   * The visual burst is queued here too so keyboard rotation uses the
   * same controller path as touch / trackpad rotation.
   */
  addTwistImpulse(deltaRadians: number): void {
    if (!Number.isFinite(deltaRadians)) return;
    this.pendingTwist += deltaRadians;
    this.triggerInteractionBurst(ORB_INTERACTION_BURST_KEY_STRENGTH);
  }

  triggerInteractionBurst(strength = ORB_INTERACTION_BURST_CONTROL_STRENGTH): void {
    if (!Number.isFinite(strength) || strength <= 0) return;
    this.interactionBurst = Math.min(1, this.interactionBurst + strength);
  }

  private decayInteractionBurst(dtSec: number): void {
    if (this.interactionBurst <= 0) return;
    this.interactionBurst *= 0.5 ** (dtSec / ORB_INTERACTION_BURST_HALF_LIFE_SEC);
    if (this.interactionBurst < ORB_INTERACTION_BURST_EPSILON) {
      this.interactionBurst = 0;
    }
  }

  override destroy(): void {
    destroyBlobColorCycle(this.colorCycleState);
    super.destroy();
  }

  projectHotspots(
    camera: Camera,
    viewportWidth: number,
    viewportHeight: number,
    elapsedSec: number,
    sceneState: import("../scene/visual-presets").FieldSceneState,
    pixelRatio = 1,
  ): FieldHotspotFrame[] {
    const result = projectBlobHotspots({
      camera,
      elapsedSec,
      frames: this.lastFrames,
      hotspotRefs: this.hotspotRefs,
      hotspotRuntime: this.hotspotRuntime,
      hotspotState: this.hotspotState,
      model: this.model,
      pixelRatio,
      pointSource: this.pointSource,
      sceneState,
      vector: this.hotspotVector,
      viewportHeight,
      viewportWidth,
      wrapper: this.wrapper,
    });
    this.stageHasOnlyReds = result.stageHasOnlyReds;
    this.stageHasOnlySingle = result.stageHasOnlySingle;
    return result.frames;
  }
}
