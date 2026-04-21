import gsap from "gsap";
import { Camera, Color, PerspectiveCamera, Vector3 } from "three";
import { DECAY, lerpFactor } from "@/lib/motion3d";
import type { FieldPointSource } from "../asset/point-source-types";
import { LANDING_RAINBOW_RGB } from "../scene/accent-palette";
import { resolveLandingBlobChapterState } from "../scroll/chapters/landing-blob-chapter";
import {
  FieldController,
  type FieldControllerInit,
  type FrameContext,
} from "./FieldController";
import {
  BLOB_HOTSPOT_CARD_COUNT,
  BLOB_HOTSPOT_COUNT,
  BLOB_HOTSPOT_IDS,
  getBlobHotspotCycleDurationMs,
  getBlobHotspotPulseEnvelope,
  getPointColorCss,
  hotspotPhaseUsesCycle,
  projectBlobHotspotCandidate,
  sampleBlobHotspotDelayMs,
  selectBlobHotspotCandidate,
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

// GSAP rainbow color cycle: tween `uColorNoise` through the palette one
// stop at a time, `ease: "none"`, `repeat: -1`. ~2s per stop → full
// wheel in ~16s. Tunable.
export const BLOB_COLOR_CYCLE_PER_STOP_SECONDS = 2;

export type { FieldHotspotFrame, BlobHotspotState } from "./blob-hotspot-runtime";
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
  private colorCycleTimeline: gsap.core.Timeline | null = null;
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
    const driftBlend = lerpFactor(dtSec, DECAY.standard);
    const timeFactor = this.getTimeFactor(motionEnabled);
    const visibility = itemState?.visibility ?? 0;
    const chapterState = resolveLandingBlobChapterState(sceneState);

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

    this.syncColorCycle(motionEnabled, shader.colorNoise);

    uniforms.uAlpha.value +=
      (chapterState.alpha - uniforms.uAlpha.value) * driftBlend;
    uniforms.uAmplitude.value +=
      (chapterState.amplitude * motionScale - uniforms.uAmplitude.value) *
      driftBlend;
    uniforms.uFrequency.value +=
      (chapterState.frequency - uniforms.uFrequency.value) * driftBlend;
    uniforms.uSelection.value +=
      (chapterState.selection - uniforms.uSelection.value) * driftBlend;

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
    model.position.y +=
      (sceneUnits * chapterState.modelPositionY - model.position.y) *
      driftBlend;
    model.rotation.y +=
      (chapterState.modelRotationY - model.rotation.y) * driftBlend;

    this.hotspotState.opacity +=
      (chapterState.hotspotOpacity - this.hotspotState.opacity) * driftBlend;
    this.hotspotState.maxNumber +=
      (chapterState.hotspotMaxNumber - this.hotspotState.maxNumber) *
      driftBlend;
    this.hotspotState.onlyReds +=
      (chapterState.hotspotOnlyReds - this.hotspotState.onlyReds) * driftBlend;

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
    wrapper.scale.x += (chapterState.wrapperScale - wrapper.scale.x) * driftBlend;
    wrapper.scale.y += (chapterState.wrapperScale - wrapper.scale.y) * driftBlend;
    wrapper.scale.z += (chapterState.wrapperScale - wrapper.scale.z) * driftBlend;

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

  private stopColorCycle(seed: readonly [number, number, number]): void {
    this.colorCycleTimeline?.kill();
    this.colorCycleTimeline = null;
    const colorUniform = this.material?.uniforms.uColorNoise?.value;
    if (!(colorUniform instanceof Color)) return;
    colorUniform.setRGB(seed[0] / 255, seed[1] / 255, seed[2] / 255);
  }

  private syncColorCycle(
    motionEnabled: boolean,
    seed: readonly [number, number, number],
  ): void {
    if (motionEnabled) {
      if (!this.colorCycleTimeline) this.startColorCycle();
      return;
    }
    if (this.colorCycleTimeline) {
      this.stopColorCycle(seed);
    }
  }

  override destroy(): void {
    this.colorCycleTimeline?.kill();
    this.colorCycleTimeline = null;
    super.destroy();
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
    sceneState: import("../scene/visual-presets").FieldSceneState,
    pixelRatio = 1,
  ): FieldHotspotFrame[] {
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
          pixelRatio,
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
        pixelRatio,
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
            pixelRatio,
          });
          runtime.candidateIndex = reseeded?.candidateIndex ?? null;
          if (runtime.candidateIndex != null) {
            projected = projectBlobHotspotCandidate({
              blobModel,
              camera,
              candidateIndex: runtime.candidateIndex,
              height: viewportHeight,
              pixelRatio,
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
