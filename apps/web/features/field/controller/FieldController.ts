import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  Camera,
  Color,
  Group,
  Texture,
  type ShaderMaterial,
  Vector3,
} from "three";

let scrollTriggerRegistered = false;

// Register ScrollTrigger once on the browser. Idempotent so subclass
// `bindScroll` calls and the scroll-driver bootstrap can both invoke it.
export function ensureGsapScrollTriggerRegistered(): void {
  if (scrollTriggerRegistered) return;
  if (typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  scrollTriggerRegistered = true;
}
import { attachMouseParallax } from "../renderer/mouse-parallax-wrapper";
import { projectToScreen } from "../overlay/field-anchor-projector";
import {
  getParticleStateTexture,
  PARTICLE_STATE_TEXTURE_SIZE,
} from "../renderer/field-particle-state-texture";
import type {
  FieldSceneState,
  FieldStageItemId,
  FieldStageItemState,
  FieldVisualPresetConfig,
} from "../scene/visual-presets";

// FieldController mirrors Maze's `yr` base controller (scripts.pretty.js:43013-43254).
// Owns the wrapper + mouseWrapper + model hierarchy, carries the shader
// material, and exposes the shared controller contract. Stage scroll state
// is now centralized in `scroll/field-scroll-state.ts`; subclasses
// read chapter progress during `tick(FrameContext)` rather than constructing
// their own ScrollTriggers.

// Fixed-size focus-member buffer. Eight stable slots covers any Phase A1
// step (info-8 spotlights one entity; info-9 steps carry ≤3 member papers
// plus slack). The shader iterates zero..uFocusMemberCount and ignores
// trailing -1 sentinels; rebuilding this array needs no reallocation.
export const FOCUS_MEMBER_SLOT_COUNT = 8;
export const FOCUS_MEMBER_EMPTY: readonly number[] = Array.from(
  { length: FOCUS_MEMBER_SLOT_COUNT },
  () => -1,
);

export interface LayerUniforms {
  [uniform: string]: { value: unknown };
  pointTexture: { value: Texture };
  uAlpha: { value: number };
  uAmplitude: { value: number };
  uColorBase: { value: Color };
  uColorNoise: { value: Color };
  uDepth: { value: number };
  uFrequency: { value: number };
  uFunnelDistortion: { value: number };
  uFunnelEnd: { value: number };
  uFunnelEndShift: { value: number };
  uFunnelNarrow: { value: number };
  uFunnelStart: { value: number };
  uFunnelStartShift: { value: number };
  uFunnelThick: { value: number };
  uHeight: { value: number };
  uIsMobile: { value: boolean };
  uLightMode: { value: number };
  uPixelRatio: { value: number };
  uScale: { value: number };
  uSelection: { value: number };
  uPapersSelection: { value: number };
  uEntitiesSelection: { value: number };
  uRelationsSelection: { value: number };
  uEvidenceSelection: { value: number };
  uSelectionBoostColor: { value: Color };
  uSelectionBoostSize: { value: number };
  uClusterEmergence: { value: number };
  uFocusEntityIndex: { value: number };
  uFocusMembers: { value: number[] };
  uFocusMemberCount: { value: number };
  uFocusActive: { value: number };
  // Paper-mode click-attraction gate. 0 in lands-mode; step 7 tweens to
  // ~1 during a d3-force-3d click sim, then back to 0.
  uClickStrength: { value: number };
  uSize: { value: number };
  uSpeed: { value: number };
  uStream: { value: number };
  uTime: { value: number };
  uTimeFactor: { value: number };
  uWidth: { value: number };
  // Slice 8/C: per-particle dynamic state texture (R = scope, G =
  // focus/hover excitation, B/A reserved). Bound to the same module-
  // singleton DataTexture for every layer; only orb-mode layers gate
  // the sampler on via uScopeDimEnabled.
  uParticleStateTex: { value: Texture };
  uParticleStateTexSize: { value: number };
  uScopeDimEnabled: { value: number };
  uScopeDimFloor: { value: number };
  uOrbFocusActive: { value: number };
  // Slice A1.1: gates the screen-space `100/dist` point-size falloff.
  // Default 1.0 reproduces the prior landing behavior bit-exactly;
  // BlobController blends it toward ~0.2 in orb mode so dollying
  // through the field reads as parallax, not sprite zoom.
  uPointDepthAttenuation: { value: number };
}

export interface FieldControllerAttachment {
  view: HTMLElement | null;
  wrapper: Group;
  mouseWrapper: Group;
  model: Group;
  material: ShaderMaterial;
  hotspotRefs?: HTMLElement[];
}

export interface FieldControllerInit {
  id: FieldStageItemId;
  preset: FieldVisualPresetConfig;
}

// Maze: `Tn = CustomEase("custom", "0.5, 0, 0.1, 1")`. CustomEase is a
// Club GSAP plugin not installed here, so we approximate with a cubic
// bezier using the same control points.
export function tnEase(t: number): number {
  return cubicBezier(0.5, 0, 0.1, 1)(t);
}

function cubicBezier(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
): (t: number) => number {
  const bx = (t: number) => {
    const it = 1 - t;
    return 3 * it * it * t * p1x + 3 * it * t * t * p2x + t * t * t;
  };
  const by = (t: number) => {
    const it = 1 - t;
    return 3 * it * it * t * p1y + 3 * it * t * t * p2y + t * t * t;
  };
  const dbx = (t: number) => {
    const it = 1 - t;
    return (
      3 * it * it * p1x + 6 * it * t * (p2x - p1x) + 3 * t * t * (1 - p2x)
    );
  };
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i += 1) {
      const dx = dbx(u);
      if (Math.abs(dx) < 1e-6) break;
      u -= (bx(u) - x) / dx;
      u = Math.max(0, Math.min(1, u));
    }
    return by(u);
  };
}

// Per-layer uTime multiplier. Maze drives `uTime` directly from a GSAP
// timeline playhead (1:1 real-time). SoleMD runs on a module clock, so
// we scale per layer: blob 0.25 / objectFormation 0.6 / stream 0.12 on desktop;
// 0.1 / 0.2 / 0.04 with motion disabled. The value is written to the
// `uTimeFactor` uniform each tick; the shader performs the multiply, so
// `uTime` remains absolute seconds (framerate independent).
export function getTimeFactor(
  id: FieldStageItemId,
  motionEnabled: boolean,
): number {
  if (motionEnabled) {
    if (id === "objectFormation") return 0.6;
    if (id === "blob") return 0.25;
    return 0.12;
  }
  if (id === "objectFormation") return 0.2;
  if (id === "blob") return 0.1;
  return 0.04;
}

export abstract class FieldController {
  readonly id: FieldStageItemId;
  readonly params: FieldVisualPresetConfig;
  view: HTMLElement | null = null;
  wrapper: Group | null = null;
  mouseWrapper: Group | null = null;
  model: Group | null = null;
  material: ShaderMaterial | null = null;
  hotspotRefs: HTMLElement[] = [];
  visible = false;
  sceneUnits = 0;
  isMobile = false;
  // Slice B (orb-3d-physics-taxonomy.md §6.3): per-controller accumulator
  // for the `uTime` uniform. The shader samples noise at
  // `uTime * uTimeFactor`, so freezing or rescaling motion has to happen
  // by stopping or rescaling how fast `uTime` advances — NOT by zeroing
  // `uTimeFactor`, which would jump the noise sample coordinate to the
  // origin and produce a visible pop. Subclass tick() integrates this
  // forward each frame as `dtSec * timeMul` where timeMul collapses pause
  // and the user motion-speed multiplier.
  protected accumulatedUTime = 0;
  protected mouseParallaxDisposer: (() => void) | null = null;
  protected scrollDisposer: (() => void) | null = null;
  private readonly attachmentReady: Promise<void>;
  private resolveAttachmentReady!: () => void;
  private attachedOnce = false;

  constructor({ id, preset }: FieldControllerInit) {
    this.id = id;
    this.params = preset;
    this.attachmentReady = new Promise<void>((resolve) => {
      this.resolveAttachmentReady = resolve;
    });
  }

  attach(attachment: FieldControllerAttachment): void {
    this.view = attachment.view;
    this.wrapper = attachment.wrapper;
    this.mouseWrapper = attachment.mouseWrapper;
    this.model = attachment.model;
    this.material = attachment.material;
    if (attachment.hotspotRefs) this.hotspotRefs = attachment.hotspotRefs;
    if (!this.attachedOnce) {
      this.attachedOnce = true;
      this.resolveAttachmentReady();
    }
  }

  // Build the full uniform bag for this controller's preset. Single-pair
  // Maze color uniforms: the blob's `uColorNoise` is further tweened at
  // runtime by BlobController through `LANDING_RAINBOW_RGB`; stream/objectFormation
  // hold the cyan→magenta pair statically.
  createLayerUniforms(
    isMobile: boolean,
    pointTexture: Texture,
    lightMode = 0,
    options: { scopeDimEnabled?: boolean } = {},
  ): LayerUniforms {
    const preset = this.params;
    const { shader } = preset;
    const [baseR, baseG, baseB] = shader.colorBase;
    const [noiseR, noiseG, noiseB] = shader.colorNoise;
    const [boostR, boostG, boostB] = shader.selectionBoostColor;
    return {
      pointTexture: { value: pointTexture },
      uIsMobile: { value: isMobile },
      uLightMode: { value: lightMode },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uTimeFactor: { value: 1 },
      uScale: { value: 1 / preset.sceneScale },
      uSpeed: { value: shader.speed },
      uSize: { value: shader.size },
      uAlpha: { value: shader.alpha },
      uDepth: { value: shader.depth },
      uAmplitude: { value: shader.amplitude },
      uFrequency: { value: shader.frequency },
      uSelection: { value: shader.selection },
      uPapersSelection: { value: shader.papersSelection },
      uEntitiesSelection: { value: shader.entitiesSelection },
      uRelationsSelection: { value: shader.relationsSelection },
      uEvidenceSelection: { value: shader.evidenceSelection },
      uSelectionBoostColor: {
        value: new Color(boostR / 255, boostG / 255, boostB / 255),
      },
      uSelectionBoostSize: { value: shader.selectionBoostSize },
      uClusterEmergence: { value: shader.clusterEmergence },
      uFocusEntityIndex: { value: -1 },
      uFocusMembers: { value: FOCUS_MEMBER_EMPTY.slice() },
      uFocusMemberCount: { value: 0 },
      uFocusActive: { value: 0 },
      uClickStrength: { value: 0 },
      uWidth: { value: shader.width },
      uHeight: { value: shader.height },
      uStream: { value: shader.stream },
      uFunnelStart: { value: shader.funnelStart },
      uFunnelEnd: { value: shader.funnelEnd },
      uFunnelThick: { value: shader.funnelThick },
      uFunnelNarrow: { value: shader.funnelNarrow },
      uFunnelStartShift: { value: shader.funnelStartShift },
      uFunnelEndShift: { value: shader.funnelEndShift },
      uFunnelDistortion: { value: shader.funnelDistortion },
      uColorBase: { value: new Color(baseR / 255, baseG / 255, baseB / 255) },
      uColorNoise: { value: new Color(noiseR / 255, noiseG / 255, noiseB / 255) },
      uParticleStateTex: { value: getParticleStateTexture() },
      uParticleStateTexSize: { value: PARTICLE_STATE_TEXTURE_SIZE },
      uScopeDimEnabled: { value: options.scopeDimEnabled ? 1 : 0 },
      uScopeDimFloor: { value: 0.18 },
      uOrbFocusActive: { value: 0 },
      uPointDepthAttenuation: { value: 1 },
    };
  }

  getTimeFactor(motionEnabled: boolean): number {
    return getTimeFactor(this.id, motionEnabled);
  }

  // Idle wrapper rotation; FieldScene currently drives rotations directly
  // from `loopSeconds * rotationVelocity.y`, so the loop() default is a
  // dt-local increment used by subclasses.
  loop(dtSec: number): void {
    if (!this.wrapper || !this.params.rotate) return;
    this.wrapper.rotation.y += this.params.rotationVelocity[1] * dtSec;
  }

  // Base updateScale: scene-units / source-height * sceneScale.
  updateScale(sceneUnits: number, sourceHeight: number, isMobile: boolean): number {
    this.sceneUnits = sceneUnits;
    this.isMobile = isMobile;
    const scale = isMobile
      ? this.params.sceneScaleMobile ?? this.params.sceneScale
      : this.params.sceneScale;
    const base = (sceneUnits / Math.max(sourceHeight, 0.001)) * scale;
    return base;
  }

  // Visibility ownership: each concrete controller writes `uniforms.uAlpha`
  // and `wrapper.visible` in its own tick() from
  // `context.itemState.visibility` (the aggregated shared-chapter signal).
  // There is no base-class fallback — the previous `updateVisibility()`
  // method was dead code because no caller invoked it and every subclass
  // already owned the write. See `.claude/skills/module/SKILL.md` §4
  // "Controller + resolver contract".

  animateIn(): Promise<void> {
    if (!this.material) return Promise.resolve();
    const uniforms = this.material.uniforms;
    const wrapper = this.wrapper;
    gsap.killTweensOf(uniforms.uAlpha);
    gsap.killTweensOf(uniforms.uDepth);
    gsap.killTweensOf(uniforms.uAmplitude);
    if (wrapper && this.params.rotateAnimation) {
      gsap.killTweensOf(wrapper.rotation);
    }

    return new Promise((resolve) => {
      const timeline = gsap.timeline({
        defaults: { duration: 1.4, ease: tnEase },
        onComplete: resolve,
      });
      timeline.fromTo(
        uniforms.uAlpha,
        { value: this.params.alphaOut },
        { value: this.params.shader.alpha },
        0,
      );
      timeline.fromTo(
        uniforms.uDepth,
        { value: this.params.depthOut },
        { value: this.params.shader.depth },
        0,
      );
      timeline.fromTo(
        uniforms.uAmplitude,
        { value: this.params.amplitudeOut },
        { value: this.params.shader.amplitude },
        0,
      );
      if (wrapper && this.params.rotateAnimation) {
        timeline.fromTo(
          wrapper.rotation,
          { y: 0 },
          { y: Math.PI },
          0,
        );
      }
    });
  }

  animateOut(
    side: "top" | "bottom" | "center",
    instant = false,
  ): Promise<void> {
    if (!this.material) return Promise.resolve();
    const uniforms = this.material.uniforms;
    const wrapper = this.wrapper;
    const duration = instant ? 0 : 1;
    gsap.killTweensOf(uniforms.uAlpha);
    gsap.killTweensOf(uniforms.uDepth);
    gsap.killTweensOf(uniforms.uAmplitude);
    if (wrapper && this.params.rotateAnimation) {
      gsap.killTweensOf(wrapper.rotation);
    }

    const rotationDelta =
      side === "top" ? -Math.PI : side === "bottom" ? Math.PI : 0;

    return new Promise((resolve) => {
      const timeline = gsap.timeline({
        defaults: { duration, ease: tnEase },
        onComplete: resolve,
      });
      timeline.to(
        uniforms.uAlpha,
        {
          value: this.params.alphaOut,
        },
        0,
      );
      timeline.to(
        uniforms.uDepth,
        {
          value: this.params.depthOut,
        },
        0,
      );
      timeline.to(
        uniforms.uAmplitude,
        {
          value: this.params.amplitudeOut,
        },
        0,
      );
      if (wrapper && this.params.rotateAnimation && rotationDelta !== 0) {
        timeline.to(
          wrapper.rotation,
          {
            y: wrapper.rotation.y + rotationDelta,
          },
          0,
        );
      }
    });
  }

  // Attach GSAP mouse-parallax to a group (typically `mouseWrapper`).
  attachMouseParallaxTo(group: Group): void {
    this.mouseParallaxDisposer?.();
    this.mouseParallaxDisposer = attachMouseParallax(group);
  }

  bindScroll(
    _anchor: HTMLElement,
    _endAnchor?: HTMLElement | null,
  ): () => void {
    void _anchor;
    void _endAnchor;
    return () => {};
  }

  // Contract: viewportWidth/Height are in PHYSICAL pixels
  // (state.gl.domElement.{width,height}) to match how projectHotspots is
  // already called from FieldScene. Output x/y are CSS pixels so DOM
  // consumers can feed them straight into translate3d without a second
  // conversion. pixelRatio is passed explicitly so SSR paths can stay
  // deterministic — no window.devicePixelRatio read here.
  toScreenPosition(
    target: Vector3,
    camera: Camera,
    viewportWidth: number,
    viewportHeight: number,
    pixelRatio: number,
    scratch: Vector3 = new Vector3(),
  ): { x: number; y: number; z: number } {
    if (!this.model || !this.wrapper || !this.mouseWrapper) {
      return { x: 0, y: 0, z: 0 };
    }
    scratch.copy(target);
    this.model.localToWorld(scratch);
    return projectToScreen(
      scratch,
      camera,
      viewportWidth,
      viewportHeight,
      pixelRatio,
    );
  }

  // FrameContext is the per-frame bundle FieldScene passes on each tick.
  // Subclasses use it to drive uniforms + wrapper transforms.
  tick(_context: FrameContext): void {
    void _context;
  }

  whenReady(): Promise<void> {
    return this.attachmentReady;
  }

  destroy(): void {
    if (this.material) {
      gsap.killTweensOf(this.material.uniforms.uAlpha);
      gsap.killTweensOf(this.material.uniforms.uDepth);
      gsap.killTweensOf(this.material.uniforms.uAmplitude);
    }
    this.mouseParallaxDisposer?.();
    this.mouseParallaxDisposer = null;
    this.scrollDisposer?.();
    this.scrollDisposer = null;
  }
}

export interface FrameContext {
  camera: Camera;
  dtSec: number;
  elapsedSec: number;
  isMobile: boolean;
  itemState: FieldStageItemState;
  pixelRatio: number;
  sceneState: FieldSceneState;
  sourceBounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  uniforms: LayerUniforms;
  viewportHeight: number;
  viewportWidth: number;
  wrapperInitialized: boolean;
  markWrapperInitialized: () => void;
}
