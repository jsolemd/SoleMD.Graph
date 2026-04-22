import { tnEase } from "../../controller/FieldController";
import type { FieldSceneState } from "../../scene/visual-presets";
import { visualPresets } from "../../scene/visual-presets";
import { getFieldChapterProgress } from "../field-scroll-state";
import {
  createFieldChapterTimeline,
  type FieldChapterValueMap,
} from "../field-chapter-timeline";

type LandingBlobChapterKey =
  | "alpha"
  | "amplitude"
  | "depth"
  | "frequency"
  | "hotspotMaxNumber"
  | "hotspotOnlyReds"
  | "hotspotOpacity"
  | "modelPositionY"
  | "modelRotationY"
  | "selection"
  | "wrapperScale"
  // Phase A1 per-category selection floors + boost params. BlobController
  // drift-blends these into the matching shader uniforms each tick. Each
  // category floor is independent; lower floor = tighter cull for that
  // bucket. Defaults are 1 (all particles visible, no emphasis).
  | "papersSelection"
  | "entitiesSelection"
  | "relationsSelection"
  | "evidenceSelection"
  // Selection boost color split into three scalar channels so the timeline
  // can tween each independently. BlobController combines R/G/B into the
  // live THREE.Color uniform. Values are normalized 0..1 (not 0..255) —
  // identity = (1, 1, 1).
  | "selectionBoostColorR"
  | "selectionBoostColorG"
  | "selectionBoostColorB"
  | "selectionBoostSize"
  // Info-7 cluster emergence intensity (drives spatial brightness
  // modulation in the shader). Info-8/9 focus-active gate (1 = focus
  // spotlight wake, 0 = disabled). focusActive is continuous so the
  // on/off transition can fade; the discrete focus index itself rotates
  // via the authored Sequence keyframes read by BlobController.
  | "clusterEmergence"
  | "focusActive";

export type LandingBlobChapterState = FieldChapterValueMap<LandingBlobChapterKey>;

const blobPreset = visualPresets.blob;

const baseBlobState: LandingBlobChapterState = {
  alpha: blobPreset.shader.alpha,
  amplitude: blobPreset.shader.amplitude,
  depth: blobPreset.shader.depth,
  frequency: blobPreset.shader.frequency,
  hotspotMaxNumber: 0,
  hotspotOnlyReds: 0,
  hotspotOpacity: 0,
  modelPositionY: 0,
  modelRotationY: 0,
  selection: blobPreset.shader.selection,
  wrapperScale: 1,
  papersSelection: 1,
  entitiesSelection: 1,
  relationsSelection: 1,
  evidenceSelection: 1,
  selectionBoostColorR: 1,
  selectionBoostColorG: 1,
  selectionBoostColorB: 1,
  selectionBoostSize: 1,
  clusterEmergence: 0,
  focusActive: 0,
};

const heroTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  {
    atProgress: 0,
    duration: 0.72,
    to: {
      modelRotationY: Math.PI * 0.08,
    },
  },
]);

const surfaceRailTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  {
    atProgress: 0,
    duration: 0.42,
    to: {
      modelRotationY: Math.PI * 0.14,
    },
  },
  {
    atProgress: 0.42,
    duration: 0.34,
    to: {
      modelRotationY: Math.PI * 0.18,
    },
  },
]);

const storyOneTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  {
    atProgress: 0,
    duration: 0.16,
    to: {
      frequency: 1.7,
      modelRotationY: Math.PI * 0.24,
      // Light the paper bucket: tighten the floor so only the top ~10%
      // of paper particles survive + brighten them via the boost size.
      // Evidence gets a soft ambient 0.3 floor set here and held through
      // every story chapter so the background never over-dominates.
      papersSelection: 0.1,
      evidenceSelection: 0.3,
      selectionBoostSize: 1.6,
    },
  },
  {
    atProgress: 0.12,
    duration: 0.18,
    to: {
      amplitude: 0.25,
      modelRotationY: Math.PI * 0.26,
    },
  },
  {
    atProgress: 0.2,
    duration: 0.08,
    to: {
      hotspotOpacity: 1,
      hotspotMaxNumber: 3,
      modelRotationY: Math.PI * 0.28,
    },
  },
  {
    atProgress: 0.34,
    duration: 0.12,
    to: {
      hotspotMaxNumber: 24,
      modelRotationY: Math.PI * 0.31,
      // Existing Maze-parity hotspot-beat mechanic stays untouched: the
      // shader's per-category floor uses min(categoryFloor, uSelection)
      // so this hotspot floor still thins the whole cloud on top of the
      // paper-specific floor during the hotspots+=1.4 beat.
      selection: blobPreset.shader.selectionHotspotFloor,
    },
  },
  {
    atProgress: 0.48,
    duration: 0.16,
    to: {
      alpha: blobPreset.shader.alphaDiagramFloor,
      amplitude: 0.5,
      depth: 1,
      modelRotationY: Math.PI * 0.33,
      // Codex R3 revised peak — 1.70 replaces the prior 1.72 baseline.
      wrapperScale: 1.7,
    },
  },
  {
    atProgress: 0.7,
    duration: 0.16,
    ease: tnEase,
    to: {
      alpha: 0.78,
      hotspotOpacity: 0,
      modelRotationY: Math.PI * 0.35,
      selection: 1,
      wrapperScale: 1.18,
      // Tail of Story 1: ease paper emphasis down to soft ambient (0.6)
      // and the boost size back to identity so Story 2's entities-lit
      // beat reads as a handoff rather than a stacked highlight.
      papersSelection: 0.6,
      selectionBoostSize: 1.0,
    },
  },
  { atProgress: 0.78, duration: 0.12, to: { hotspotMaxNumber: 0 } },
]);

const storyTwoTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  {
    atProgress: 0,
    duration: 0.26,
    to: {
      alpha: 0.62,
      amplitude: 0.34,
      depth: 0.84,
      modelRotationY: Math.PI * 0.35,
      // Codex R3 revised peak for Story 2.
      wrapperScale: 1.9,
      // Hand off category emphasis: entities tighten to the 0.12 floor
      // (~236 lit entity particles per R4 math), papers hold at 0.6
      // soft ambient from Story 1's tail, evidence stays at 0.3.
      entitiesSelection: 0.12,
      papersSelection: 0.6,
      evidenceSelection: 0.3,
      selectionBoostSize: 1.6,
    },
  },
  {
    atProgress: 0.56,
    duration: 0.24,
    to: {
      alpha: 0.74,
      amplitude: 0.28,
      // Hold the peak into the transition toward Story 3 — the Codex
      // table lets Story 2's peak (1.90) continue until Story 3's
      // entrance nudges it toward 2.10.
      wrapperScale: 1.9,
    },
  },
]);

const storyThreeTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  {
    atProgress: 0,
    duration: 0.2,
    to: {
      alpha: 0.88,
      amplitude: 0.42,
      frequency: 1.9,
      // Codex R3 ceiling — relations need airspace to read as edges in
      // Phase A3, so 2.10 is the peak we hold into Sequence info-7.
      wrapperScale: 2.1,
      // Relations are the lit category here (~105 particles at 0.08
      // per R4 math); entities ease off Story 2's spotlight toward the
      // 0.6 ambient; papers stay at 0.6; evidence held at 0.3.
      relationsSelection: 0.08,
      entitiesSelection: 0.6,
      papersSelection: 0.6,
      evidenceSelection: 0.3,
      selectionBoostSize: 1.6,
    },
  },
  {
    atProgress: 0.32,
    duration: 0.28,
    to: {
      alpha: 0.94,
      amplitude: 0.3,
      modelRotationY: Math.PI * 0.56,
      wrapperScale: 2.1,
    },
  },
  {
    atProgress: 0.68,
    duration: 0.18,
    to: {
      alpha: 0.86,
      amplitude: 0.24,
      wrapperScale: 2.1,
    },
  },
]);

// Sequence is one timeline over section-sequence progress, sub-ranged
// into three beats keyed off `atProgress` windows that mirror the three
// primary beats in the section (info-7 / info-8 / info-9). The continuous
// shader state (alpha/amplitude/wrapperScale/clusterEmergence/focusActive)
// holds focusActive through info-8 + info-9 so BlobController can spotlight
// the single-entity entry (catatonia) across both beats.
const sequenceTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  // info-7 Clusters (0.00 – 0.33): hold the Story 3 peak at 2.10, let
  // every category relax to ambient so no single bucket dominates, and
  // ramp clusterEmergence from 0 → 1 so neighborhoods emerge spatially
  // via the FBM noise field. selectionBoostSize eases back to 1 so no
  // particle reads as spotlighted yet.
  {
    atProgress: 0,
    duration: 0.33,
    to: {
      alpha: 0.92,
      amplitude: 0.22,
      frequency: 1.45,
      wrapperScale: 2.1,
      papersSelection: 0.6,
      entitiesSelection: 0.6,
      relationsSelection: 0.6,
      evidenceSelection: 0.3,
      selectionBoostSize: 1.0,
      clusterEmergence: 1,
      focusActive: 0,
    },
  },
  // info-8 Living Knowledge (0.33 – 0.66): subtle zoom-toward toward
  // 2.00; wake focus-active so BlobController spotlights the info-8
  // single-entity entry (catatonia); clusters fade to 0.3 so the
  // spotlight reads against softened neighborhoods rather than noise.
  {
    atProgress: 0.33,
    duration: 0.33,
    to: {
      alpha: 0.86,
      amplitude: 0.2,
      wrapperScale: 2.0,
      clusterEmergence: 0.3,
      focusActive: 1,
      selectionBoostSize: 1.6,
    },
  },
  // info-9 Educational Modules (0.66 – 1.00): partial pullback to 1.80
  // as the Sequence chapter closes; focus stays on catatonia so the
  // single-entity spotlight carries into the chapter closer.
  {
    atProgress: 0.66,
    duration: 0.34,
    to: {
      alpha: 0.84,
      amplitude: 0.18,
      wrapperScale: 1.8,
      clusterEmergence: 0.3,
      focusActive: 1,
      selectionBoostSize: 1.6,
    },
  },
]);

const ctaTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  // Opening keyframe: contract from the Sequence peak (1.80) toward the
  // bookend while restoring identity on all per-category emphasis so the
  // blob reads as a single uniform substrate again before the bookend
  // flourish.
  {
    atProgress: 0,
    duration: 0.26,
    to: {
      alpha: 1,
      amplitude: 0.46,
      depth: 0.9,
      frequency: 1.75,
      modelRotationY: Math.PI * 0.9,
      wrapperScale: 1.24,
      papersSelection: 1,
      entitiesSelection: 1,
      relationsSelection: 1,
      evidenceSelection: 1,
      selectionBoostSize: 1,
      clusterEmergence: 0,
      focusActive: 0,
    },
  },
  {
    atProgress: 0.32,
    duration: 0.3,
    ease: tnEase,
    to: {
      alpha: blobPreset.shader.alpha,
      amplitude: blobPreset.shader.amplitude,
      depth: blobPreset.shader.depth,
      frequency: blobPreset.shader.frequency,
      modelPositionY: 0,
      modelRotationY: Math.PI * 1.04,
      selection: 1,
      wrapperScale: 1,
      // Bookend: restate identity explicitly so the tight opening-blob
      // aesthetic returns without inheriting residual drift from
      // Sequence. Redundant but keeps CTA self-contained.
      papersSelection: 1,
      entitiesSelection: 1,
      relationsSelection: 1,
      evidenceSelection: 1,
      selectionBoostColorR: 1,
      selectionBoostColorG: 1,
      selectionBoostColorB: 1,
      selectionBoostSize: 1,
      clusterEmergence: 0,
      focusActive: 0,
    },
  },
  {
    atProgress: 0.64,
    duration: 0.18,
    to: {
      amplitude: blobPreset.shader.amplitude,
      depth: blobPreset.shader.depth,
      frequency: blobPreset.shader.frequency,
      modelRotationY: 0,
      wrapperScale: 1,
    },
  },
]);

export function resolveLandingBlobChapterState(
  sceneState: FieldSceneState,
): LandingBlobChapterState {
  let next = { ...baseBlobState };

  next = heroTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-hero"),
  );
  next = surfaceRailTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-surface-rail"),
  );
  next = storyOneTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-story-1"),
  );
  next = storyTwoTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-story-2"),
  );
  next = storyThreeTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-story-3"),
  );
  next = sequenceTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-sequence"),
  );
  next = ctaTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-cta"),
  );

  return next;
}
