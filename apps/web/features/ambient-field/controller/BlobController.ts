import gsap from "gsap";
import { Camera, Color, Group, PerspectiveCamera, Vector3 } from "three";
import { DECAY, lerpFactor } from "@/lib/motion3d";
import type { AmbientFieldPointSource } from "../asset/point-source-types";
import { LANDING_RAINBOW_RGB } from "../scene/accent-palette";
import {
  ensureGsapScrollTriggerRegistered,
  FieldController,
  tnEase,
  type FieldControllerInit,
  type FrameContext,
} from "./FieldController";

// BlobController mirrors Maze's `mm` at scripts.pretty.js:43257-43526.

export interface BlobHotspotState {
  interval: number;
  maxNumber: number;
  onlyReds: number;
  opacity: number;
}

export interface AmbientFieldHotspotFrame {
  color: string;
  id: string;
  mode: "card" | "dot" | "hidden";
  opacity: number;
  scale: number;
  showCard: boolean;
  visible: boolean;
  x: number;
  y: number;
}

interface BlobHotspotProjection {
  candidateIndex: number;
  scale: number;
  x: number;
  y: number;
}

interface BlobHotspotRuntime {
  candidateIndex: number | null;
  cycleDurationMs: number;
  cycleStartAtMs: number;
  invalidSinceAtMs: number | null;
  lastProjected: BlobHotspotProjection | null;
  phaseKey: "card" | "dot" | "hidden";
}

// Intro: kill the globe-expand by snapping to baseScale on first frame
// and ramp uDepth down from a boost multiplier over 1.4s so particles
// start scattered along aMove axes and converge onto the sphere. Matches
// Maze's animateIn duration at scripts.pretty.js:43129-43130.
export const INTRO_DURATION_SECONDS = 1.4;
export const INTRO_DEPTH_BOOST = 2.6;

// GSAP rainbow color cycle: tween `uColorNoise` through the palette one
// stop at a time, `ease: "none"`, `repeat: -1`. ~2s per stop → full
// wheel in ~16s. Tunable.
export const BLOB_COLOR_CYCLE_PER_STOP_SECONDS = 2;
export const BLOB_HOTSPOT_COUNT = 40;
export const BLOB_HOTSPOT_CARD_COUNT = 3;
export const BLOB_HOTSPOT_IDS = Array.from(
  { length: BLOB_HOTSPOT_COUNT },
  (_, index) => `blob-hotspot-${index}`,
);

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(min: number, max: number, value: number) {
  if (max <= min) return value >= max ? 1 : 0;
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

function sampleBlobHotspotDelayMs() {
  return Math.random() * 2000;
}

export function getBlobHotspotCycleDurationMs({
  isSingleVisible,
}: {
  hotspotIndex: number;
  isSingleVisible: boolean;
  phaseKey: BlobHotspotRuntime["phaseKey"];
}) {
  return isSingleVisible ? 4000 : 2000;
}

function hotspotPhaseUsesCycle(phaseKey: BlobHotspotRuntime["phaseKey"]) {
  return phaseKey === "dot";
}

export function getBlobHotspotPulseEnvelope(progress: number) {
  if (progress <= 0 || progress >= 1) return 0;
  if (progress < 0.2) return smoothstep(0, 0.2, progress);
  if (progress <= 0.8) return 1;
  return 1 - smoothstep(0.8, 1, progress);
}

function getPointColorCss(
  source: AmbientFieldPointSource,
  candidateIndex: number,
) {
  const colorOffset = candidateIndex * 3;
  const red = Math.max(
    0,
    Math.min(255, Math.round((source.buffers.color[colorOffset] ?? 0) * 255)),
  );
  const green = Math.max(
    0,
    Math.min(
      255,
      Math.round((source.buffers.color[colorOffset + 1] ?? 0) * 255),
    ),
  );
  const blue = Math.max(
    0,
    Math.min(
      255,
      Math.round((source.buffers.color[colorOffset + 2] ?? 0) * 255),
    ),
  );
  return `rgb(${red} ${green} ${blue})`;
}

export function projectBlobHotspotCandidate({
  blobModel,
  camera,
  candidateIndex,
  height,
  source,
  vector,
  width,
}: {
  blobModel: Group;
  camera: Camera;
  candidateIndex: number;
  height: number;
  source: AmbientFieldPointSource;
  vector: Vector3;
  width: number;
}): BlobHotspotProjection | null {
  const positionOffset = candidateIndex * 3;
  const localZ = source.buffers.position[positionOffset + 2] ?? 0;
  if (localZ > 0) return null;

  vector.set(
    source.buffers.position[positionOffset] ?? 0,
    source.buffers.position[positionOffset + 1] ?? 0,
    source.buffers.position[positionOffset + 2] ?? 0,
  );
  blobModel.localToWorld(vector);
  vector.project(camera);

  const x = ((vector.x + 1) * width) / 2;
  const y = ((-vector.y + 1) * height) / 2;
  // Maze: scale = (1 - vector.z) * 2; clamp keeps slot from going micro/oversize.
  const scale = Math.max(0.72, Math.min(1.36, (1 - vector.z) * 2));
  const withinViewport =
    x > 24 &&
    x < width - 24 &&
    y > 24 &&
    y < height - 24 &&
    vector.z < 0.84;

  if (!withinViewport) return null;
  return { candidateIndex, scale, x, y };
}

export function selectBlobHotspotCandidate({
  blobModel,
  camera,
  maxAttempts = 20,
  source,
  usedCandidateIndices,
  vector,
  viewportHeight,
  viewportWidth,
}: {
  blobModel: Group;
  camera: Camera;
  maxAttempts?: number;
  source: AmbientFieldPointSource;
  usedCandidateIndices: Set<number>;
  vector: Vector3;
  viewportHeight: number;
  viewportWidth: number;
}) {
  if (source.pointCount === 0) return null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidateIndex = Math.floor(Math.random() * source.pointCount);
    if (usedCandidateIndices.has(candidateIndex)) continue;
    const projected = projectBlobHotspotCandidate({
      blobModel,
      camera,
      candidateIndex,
      height: viewportHeight,
      source,
      vector,
      width: viewportWidth,
    });
    if (!projected) continue;
    return projected;
  }
  return null;
}

export class BlobController extends FieldController {
  hotspotState: BlobHotspotState = {
    opacity: 0,
    maxNumber: 0,
    onlyReds: 0,
    interval: 2000,
  };
  pointSource: AmbientFieldPointSource | null = null;
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
  private colorCycleTimeline: gsap.core.Timeline | null = null;
  private hotspotVector = new Vector3();
  private lastFrames: AmbientFieldHotspotFrame[] = BLOB_HOTSPOT_IDS.map(
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

  setPointSource(source: AmbientFieldPointSource): void {
    this.pointSource = source;
  }

  getLastFrames(): readonly AmbientFieldHotspotFrame[] {
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

  // Apply the current frame array to the hotspot DOM pool. Called from
  // projectHotspots() after frames are populated. No-op if no refs wired.
  private writeHotspotDom(): void {
    const refs = this.hotspotRefs;
    if (!refs || refs.length === 0) return;
    for (let index = 0; index < refs.length; index += 1) {
      const node = refs[index];
      if (!node) continue;
      const frame = this.lastFrames[index];
      if (!frame || !frame.visible) {
        node.style.opacity = "0";
        node.style.transform =
          "translate3d(-9999px, -9999px, 0) scale(0.92)";
        node.classList.remove("is-animating");
        continue;
      }
      node.style.opacity = frame.opacity.toFixed(4);
      node.style.transform = `translate3d(${frame.x}px, ${frame.y}px, 0) scale(${frame.scale})`;
      // Frame color drives the per-hotspot dot color so it matches its
      // sampled blob particle. Consumers can read it via CSS var.
      node.style.setProperty("--afr-color", frame.color);
      // Only `dot` phase should pulse via CSS keyframes; card / focus hold.
      if (frame.mode === "dot" && !node.classList.contains("is-animating")) {
        node.classList.add("is-animating");
      }
      if (frame.mode !== "dot" && node.classList.contains("is-animating")) {
        node.classList.remove("is-animating");
      }
    }
  }

  // Per-frame work after C8: scroll-linked uniforms (uFrequency, uAmplitude,
  // uDepth, uSelection, uAlpha, wrapper.scale, model.rotation.y,
  // model.position.y) are owned by the ScrollTrigger timeline built in
  // `bindScroll`. `tick()` only owns: shared uniforms (uTime, uPixelRatio,
  // uIsMobile, uScale, uSize, uSpeed), the intro uDepth boost, idle
  // wrapper spin, and wrapper x/z drift on attach.
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
    const driftBlend = lerpFactor(dtSec, DECAY.standard);
    const timeFactor = this.getTimeFactor(motionEnabled);
    const visibility = itemState?.visibility ?? 0;

    const sceneScale = isMobile
      ? preset.sceneScaleMobile ?? preset.sceneScale
      : preset.sceneScale;
    const sourceHeight = Math.max(sourceBounds.maxY - sourceBounds.minY, 0.001);
    const sceneUnits =
      camera instanceof PerspectiveCamera
        ? 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360)
        : 0;
    const baseScale = (sceneUnits / sourceHeight) * sceneScale;
    this.sceneUnits = sceneUnits;
    this.isMobile = isMobile;

    const shaderSize = isMobile
      ? shader.sizeMobile ?? shader.size
      : shader.size;

    uniforms.uTime.value = elapsedSec * timeFactor;
    uniforms.uPixelRatio.value = pixelRatio;
    uniforms.uIsMobile.value = isMobile;
    uniforms.uScale.value = 1 / baseScale;
    uniforms.uSize.value = shaderSize;
    uniforms.uSpeed.value = shader.speed * motionScale;

    // Intro depth boost. Maze's `mm.animateIn` ramps uDepth from a
    // boosted value to baseline. SoleMD now defers uDepth ownership to the
    // ScrollTrigger timeline at the diagram beat (label `diagram` 4.9), so
    // the intro boost is a one-shot uniform value reset on the very first
    // tick and decays via per-frame lerp toward the preset baseline.
    if (!this.introCompleted) {
      const introProgress = clamp01(elapsedSec / INTRO_DURATION_SECONDS);
      const introEase = 1 - (1 - introProgress) * (1 - introProgress);
      const depthBoost = 1 + (INTRO_DEPTH_BOOST - 1) * (1 - introEase);
      uniforms.uDepth.value = shader.depth * depthBoost;
      if (introProgress >= 1) this.introCompleted = true;
    }

    // Bake the scene-fit scale onto the inner `model` group so the
    // ScrollTrigger timeline can tween `wrapper.scale` 1 → 1.8 → 1 on top.
    // (Maze's geometry is sized in world units, so its wrapper sits at
    // unit scale; SoleMD's geometry is unit-sized and needs baseScale on
    // a parent group below the wrapper.)
    model.scale.x = baseScale;
    model.scale.y = baseScale;
    model.scale.z = baseScale;

    wrapper.visible = visibility > 0.01;
    if (!this.wrapperInitialized) {
      wrapper.position.x = sceneUnits * preset.sceneOffset[0];
      wrapper.position.y = sceneUnits * preset.sceneOffset[1];
      wrapper.position.z = preset.sceneOffset[2];
      this.wrapperInitialized = true;
    } else {
      wrapper.position.x +=
        (sceneUnits * preset.sceneOffset[0] - wrapper.position.x) * driftBlend;
      wrapper.position.y +=
        (sceneUnits * preset.sceneOffset[1] - wrapper.position.y) * driftBlend;
      wrapper.position.z +=
        (preset.sceneOffset[2] - wrapper.position.z) * driftBlend;
    }
    wrapper.rotation.x = 0;
    wrapper.rotation.y = elapsedSec * preset.rotationVelocity[1] * motionScale;
    wrapper.rotation.z = 0;

    void sourceBounds;
  }

  // Start (or re-start) the rainbow color cycle. Tweens `uColorNoise`
  // — a live three.Color on the material — through LANDING_RAINBOW_RGB
  // one stop at a time with `ease: "none"` and `repeat: -1`, so the
  // field shows one color wave at a time rather than a static rainbow.
  // Per-particle vNoise variance (driven by aMove / uTime) desynchronizes
  // particles across the field — different parts peak on the current
  // noise hue at different instants, producing the "waves of color"
  // effect.
  private startColorCycle(): void {
    const material = this.material;
    if (!material) return;
    this.colorCycleTimeline?.kill();
    const colorUniform = material.uniforms.uColorNoise?.value;
    if (!(colorUniform instanceof Color)) return;
    const timeline = gsap.timeline({ repeat: -1, ease: "none" });
    for (const [r, g, b] of LANDING_RAINBOW_RGB) {
      timeline.to(colorUniform, {
        r: r / 255,
        g: g / 255,
        b: b / 255,
        duration: BLOB_COLOR_CYCLE_PER_STOP_SECONDS,
        ease: "none",
      });
    }
    this.colorCycleTimeline = timeline;
  }

  override destroy(): void {
    this.colorCycleTimeline?.kill();
    this.colorCycleTimeline = null;
    // Kill the scroll timeline + ScrollTrigger before handing off to the
    // base class. Maze's `unbindScroll` pattern at
    // scripts.pretty.js:43288-43289 runs before the base teardown.
    this.scrollDisposer?.();
    this.scrollDisposer = null;
    super.destroy();
  }

  // Build the Maze blob scroll timeline (scripts.pretty.js:43291-43414).
  // Tweens uniforms + hotspotState + wrapper.scale + model.position.y across
  // a 10-second timeline scrubbed by ScrollTrigger from anchor's `top top`
  // to endAnchor's `bottom top` with `scrub: 1`. Reduced motion: skip
  // construction and snap baseline values onto the material.
  bindScroll(
    anchor: HTMLElement,
    endAnchor?: HTMLElement | null,
  ): () => void {
    ensureGsapScrollTriggerRegistered();
    this.scrollDisposer?.();
    this.scrollDisposer = null;

    const { wrapper, model, material } = this;
    if (!wrapper || !model || !material) return () => {};

    const preset = this.params;
    const { shader } = preset;

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      // Maze skips scroll-binding entirely under reduced motion. Snap
      // baseline preset values onto the uniforms so the blob is still
      // legible and leave hotspotState zeroed. Reduced-motion also skips
      // the rainbow color cycle — `uColorNoise` stays at the preset seed.
      material.uniforms.uAmplitude.value = shader.amplitude;
      material.uniforms.uFrequency.value = shader.frequency;
      material.uniforms.uDepth.value = shader.depth;
      material.uniforms.uAlpha.value = shader.alpha;
      material.uniforms.uSelection.value = shader.selection;
      this.hotspotState.opacity = 0;
      this.hotspotState.maxNumber = 0;
      this.hotspotState.onlyReds = 0;
      return () => {};
    }

    this.startColorCycle();

    const sceneUnits = this.sceneUnits;
    // `paused: true` matches Maze's `gsap.timeline({paused: true})` at
    // scripts.pretty.js:43294. ScrollTrigger.scrub pins the playhead to
    // scroll position; without the explicit pause the timeline would
    // auto-advance for the first tick before ScrollTrigger takes over,
    // which reads as a flicker on first paint.
    const timeline = gsap.timeline({
      paused: true,
      defaults: { duration: 1, ease: "none" },
      scrollTrigger: {
        trigger: anchor,
        endTrigger: endAnchor ?? anchor,
        start: "top top",
        end: "bottom top",
        scrub: 1,
      },
    });

    timeline.fromTo(
      model.rotation,
      { y: 0 },
      { y: Math.PI, duration: 10 },
      0,
    );
    timeline.to(material.uniforms.uFrequency, { value: 1.7, duration: 1.5 }, 0);

    timeline.addLabel("stats", 1);
    timeline.set(material.uniforms.uAmplitude, { value: shader.amplitude }, 1);
    timeline.set(material.uniforms.uFrequency, { value: shader.frequency }, 1);
    timeline.to(
      material.uniforms.uAmplitude,
      { value: 0.25, duration: 0.4 },
      1,
    );

    timeline.addLabel("hotspots", 2);
    timeline.fromTo(
      this.hotspotState,
      { opacity: 0 },
      { opacity: 1, duration: 0.1 },
      2,
    );
    timeline.fromTo(
      this.hotspotState,
      { maxNumber: 0 },
      { maxNumber: 3, duration: 0.1 },
      2,
    );
    timeline.to(
      this.hotspotState,
      { maxNumber: 40, duration: 0.1 },
      "hotspots+=1.2",
    );
    // uSelection floor: Maze ports 1 → 0.3 here (70% of particles
    // gated out via `aSelection > uSelection`). For the SoleMD landing
    // we raise the floor to `selectionHotspotFloor` so the blob keeps
    // its density through the hotspot beat; a restore to 1 at the
    // respond label brings the rest back for the end of the story.
    timeline.fromTo(
      material.uniforms.uSelection,
      { value: 1 },
      { value: shader.selectionHotspotFloor, duration: 0.6 },
      "hotspots+=1.4",
    );
    timeline.to(
      this.hotspotState,
      { opacity: 0, duration: 0.1 },
      "hotspots+=2.4",
    );

    timeline.addLabel("diagram", 4.9);
    timeline.fromTo(
      material.uniforms.uDepth,
      { value: shader.depth },
      { value: 1, duration: 0.4 },
      4.9,
    );
    // uAlpha floor: Maze ports 1 → 0 here (full fade at the diagram
    // beat). SoleMD holds a floor so the silhouette stays readable
    // across the full story — same beat, non-zero endpoint.
    timeline.fromTo(
      material.uniforms.uAlpha,
      { value: 1 },
      { value: shader.alphaDiagramFloor, duration: 0.4 },
      4.9,
    );
    timeline.fromTo(
      wrapper.scale,
      { x: 1, y: 1, z: 1 },
      { x: 1.8, y: 1.8, z: 1.8, duration: 1 },
      4.9,
    );
    timeline.to(
      material.uniforms.uAmplitude,
      { value: 0.5, duration: 0.8, ease: tnEase },
      4.9,
    );

    timeline.addLabel("shrink", 6.3);
    // Two fromTo tweens on uAlpha exist (diagram 1→0 at 4.9 and shrink
    // 0→1 here). Both default to `immediateRender: true`, so the second
    // one constructed writes uAlpha=0 onto the live uniform at bind time
    // and the blob disappears until the playhead actually reaches a
    // tween. `immediateRender: false` on the later fromTo is the GSAP-
    // documented fix for this specific multi-fromTo-on-same-property case.
    timeline.fromTo(
      material.uniforms.uAlpha,
      { value: shader.alphaDiagramFloor },
      { value: 1, duration: 0.3, immediateRender: false },
      6.3,
    );
    timeline.to(
      wrapper.scale,
      { x: 1, y: 1, z: 1, duration: 1, ease: tnEase },
      6.3,
    );

    timeline.addLabel("quickly", 7.2);
    timeline.to(this.hotspotState, { maxNumber: 3, duration: 0.1 }, 7.2);
    timeline.fromTo(
      this.hotspotState,
      { onlyReds: 0 },
      { onlyReds: 1, duration: 0.1 },
      7.2,
    );
    timeline.to(
      this.hotspotState,
      { opacity: 1, duration: 0.1 },
      "quickly+=0.1",
    );

    timeline.addLabel("respond", 7.9);
    timeline.to(this.hotspotState, { opacity: 0, duration: 0.1 }, 7.9);
    // Restore uSelection back to 1 as the hotspots fade, so the
    // remaining ~15% of gated particles return to full density for the
    // end of the story.
    timeline.to(
      material.uniforms.uSelection,
      { value: 1, duration: 0.4, immediateRender: false },
      7.9,
    );

    timeline.addLabel("end", 9);
    timeline.fromTo(
      model.position,
      { y: 0 },
      { y: sceneUnits * 0.5, duration: 1 },
      9,
    );

    timeline.addPause(10);

    const disposer = () => {
      timeline.scrollTrigger?.kill();
      timeline.kill();
    };
    this.scrollDisposer = disposer;
    return disposer;
  }

  // Maze hotspot render gate at scripts.pretty.js:43501-43525:
  //   - skip if hotspotIndex >= hotspotState.maxNumber
  //   - skip if hotspotState.opacity <= 0
  //   - finalOpacity = (1 - vector.z) * 2 * hotspotState.opacity
  //   - mode is `card` while `has-only-single` (maxNumber ≤ card count)
  //     for the first card slots; `dot` otherwise.
  projectHotspots(
    camera: Camera,
    viewportWidth: number,
    viewportHeight: number,
    elapsedSec: number,
    sceneState: import("../scene/visual-presets").AmbientFieldSceneState,
  ): AmbientFieldHotspotFrame[] {
    const frames = this.lastFrames;
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index]!;
      frame.color = "var(--color-soft-blue)";
      frame.mode = "hidden";
      frame.opacity = 0;
      frame.scale = 0.9;
      frame.showCard = index < BLOB_HOTSPOT_CARD_COUNT;
      frame.visible = false;
      frame.x = -9999;
      frame.y = -9999;
    }

    const blobModel = this.model;
    const blobWrapper = this.wrapper;
    const pointSource = this.pointSource;
    const blobRuntime = sceneState.items.blob;
    const blobVisibility = blobRuntime?.visibility ?? 0;
    const hotspotState = this.hotspotState;
    const hotspotsActive =
      hotspotState.opacity > 0 && hotspotState.maxNumber > 0;

    if (
      !blobModel ||
      !blobWrapper ||
      !pointSource ||
      blobVisibility <= 0.01 ||
      !hotspotsActive
    ) {
      this.stageHasOnlyReds = hotspotState.onlyReds > 0;
      this.stageHasOnlySingle =
        hotspotState.maxNumber > 0 &&
        hotspotState.maxNumber <= BLOB_HOTSPOT_CARD_COUNT;
      this.writeHotspotDom();
      return frames;
    }

    blobWrapper.updateWorldMatrix(true, true);

    const loopMs = elapsedSec * 1000;
    const usedCandidateIndices = new Set<number>();
    const vector = this.hotspotVector;
    const onlyReds = hotspotState.onlyReds > 0;
    const onlySingle =
      hotspotState.maxNumber > 0 &&
      hotspotState.maxNumber <= BLOB_HOTSPOT_CARD_COUNT;

    for (
      let hotspotIndex = 0;
      hotspotIndex < BLOB_HOTSPOT_COUNT;
      hotspotIndex += 1
    ) {
      const frame = frames[hotspotIndex]!;
      const runtime = this.hotspotRuntime[hotspotIndex]!;

      const withinMaxNumber = hotspotIndex < hotspotState.maxNumber;
      // `has-only-reds` suppresses the non-card hotspots once the timeline
      // hits the quickly beat. Skip projection to save work.
      const suppressedByOnlyReds =
        onlyReds && hotspotIndex >= BLOB_HOTSPOT_CARD_COUNT;

      if (!withinMaxNumber || suppressedByOnlyReds) {
        if (runtime.phaseKey !== "hidden") {
          runtime.phaseKey = "hidden";
          runtime.invalidSinceAtMs = null;
        }
        continue;
      }

      const phaseKey: BlobHotspotRuntime["phaseKey"] =
        onlySingle && hotspotIndex < BLOB_HOTSPOT_CARD_COUNT ? "card" : "dot";

      if (runtime.phaseKey !== phaseKey) {
        runtime.phaseKey = phaseKey;
        runtime.invalidSinceAtMs = null;
        runtime.cycleDurationMs = hotspotPhaseUsesCycle(phaseKey)
          ? getBlobHotspotCycleDurationMs({
              hotspotIndex,
              isSingleVisible: onlySingle,
              phaseKey,
            })
          : 0;
        runtime.cycleStartAtMs = hotspotPhaseUsesCycle(phaseKey)
          ? loopMs + sampleBlobHotspotDelayMs()
          : loopMs;
      }

      const shouldReseed =
        runtime.candidateIndex == null ||
        (hotspotPhaseUsesCycle(phaseKey) &&
          runtime.cycleDurationMs > 0 &&
          loopMs >= runtime.cycleStartAtMs + runtime.cycleDurationMs);

      if (shouldReseed) {
        runtime.candidateIndex = null;
        runtime.cycleDurationMs = hotspotPhaseUsesCycle(phaseKey)
          ? getBlobHotspotCycleDurationMs({
              hotspotIndex,
              isSingleVisible: onlySingle,
              phaseKey,
            })
          : 0;
        runtime.cycleStartAtMs = hotspotPhaseUsesCycle(phaseKey)
          ? loopMs + sampleBlobHotspotDelayMs()
          : loopMs;

        const reseeded = selectBlobHotspotCandidate({
          blobModel,
          camera,
          maxAttempts: phaseKey === "card" ? 80 : 20,
          source: pointSource,
          usedCandidateIndices,
          vector,
          viewportHeight,
          viewportWidth,
        });
        runtime.candidateIndex = reseeded?.candidateIndex ?? null;
      }

      if (runtime.candidateIndex == null) continue;

      const cycleEnvelope =
        phaseKey === "dot"
          ? getBlobHotspotPulseEnvelope(
              (loopMs - runtime.cycleStartAtMs) /
                Math.max(runtime.cycleDurationMs, 1),
            )
          : 1;
      if (phaseKey === "dot" && cycleEnvelope <= 0.001) continue;

      let projected = projectBlobHotspotCandidate({
        blobModel,
        camera,
        candidateIndex: runtime.candidateIndex,
        height: viewportHeight,
        source: pointSource,
        vector,
        width: viewportWidth,
      });

      if (!projected) {
        if (runtime.lastProjected && runtime.invalidSinceAtMs == null) {
          runtime.invalidSinceAtMs = loopMs;
        }
        const withinProjectionGrace =
          runtime.invalidSinceAtMs != null &&
          loopMs - runtime.invalidSinceAtMs < 240;
        if (phaseKey === "card" && runtime.lastProjected && withinProjectionGrace) {
          projected = runtime.lastProjected;
        } else if (phaseKey === "card") {
          runtime.candidateIndex = null;
          const reseeded = selectBlobHotspotCandidate({
            blobModel,
            camera,
            maxAttempts: 80,
            source: pointSource,
            usedCandidateIndices,
            vector,
            viewportHeight,
            viewportWidth,
          });
          runtime.candidateIndex = reseeded?.candidateIndex ?? null;
          if (runtime.candidateIndex != null) {
            projected = projectBlobHotspotCandidate({
              blobModel,
              camera,
              candidateIndex: runtime.candidateIndex,
              height: viewportHeight,
              source: pointSource,
              vector,
              width: viewportWidth,
            });
          }
        }

        if (!projected) {
          frame.color = getPointColorCss(
            pointSource,
            runtime.candidateIndex ?? 0,
          );
          continue;
        }
      }

      usedCandidateIndices.add(projected.candidateIndex);
      runtime.invalidSinceAtMs = null;
      runtime.lastProjected = projected;

      frame.visible = true;
      frame.mode = phaseKey;
      frame.color = getPointColorCss(pointSource, projected.candidateIndex);
      // Maze final opacity: depthScale * hotspotState.opacity. `cycleEnvelope`
      // is 1 for `card` and the per-pulse envelope for `dot`.
      frame.opacity = projected.scale * hotspotState.opacity * cycleEnvelope;
      frame.scale =
        phaseKey === "dot"
          ? projected.scale * cycleEnvelope
          : projected.scale;
      frame.x = projected.x;
      frame.y = projected.y;
      frame.showCard = phaseKey === "card";
    }

    this.stageHasOnlyReds = onlyReds;
    this.stageHasOnlySingle = onlySingle;

    this.writeHotspotDom();
    return frames;
  }
}
