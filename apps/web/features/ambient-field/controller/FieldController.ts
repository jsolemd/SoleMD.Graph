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
import type {
  AmbientFieldSceneState,
  AmbientFieldStageItemId,
  AmbientFieldStageItemState,
  AmbientFieldVisualPresetConfig,
} from "../scene/visual-presets";

// FieldController mirrors Maze's `yr` base controller (scripts.pretty.js:43013-43254).
// Owns the wrapper + mouseWrapper + model hierarchy, carries the shader
// material, and runs per-frame `loop`, `updateScale`, `updateVisibility`,
// and `animateIn/Out` tweens. In R3F the Three.js Group refs are handed
// in from the React layer after reconciliation.

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
  uPixelRatio: { value: number };
  uScale: { value: number };
  uSelection: { value: number };
  uSize: { value: number };
  uSpeed: { value: number };
  uStream: { value: number };
  uTime: { value: number };
  uWidth: { value: number };
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
  id: AmbientFieldStageItemId;
  preset: AmbientFieldVisualPresetConfig;
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
// we scale per layer: blob 0.25 / pcb 0.6 / stream 0.12 on desktop;
// 0.1 / 0.2 / 0.04 with motion disabled.
export function getTimeFactor(
  id: AmbientFieldStageItemId,
  motionEnabled: boolean,
): number {
  if (motionEnabled) {
    if (id === "pcb") return 0.6;
    if (id === "blob") return 0.25;
    return 0.12;
  }
  if (id === "pcb") return 0.2;
  if (id === "blob") return 0.1;
  return 0.04;
}

export abstract class FieldController {
  readonly id: AmbientFieldStageItemId;
  readonly params: AmbientFieldVisualPresetConfig;
  view: HTMLElement | null = null;
  wrapper: Group | null = null;
  mouseWrapper: Group | null = null;
  model: Group | null = null;
  material: ShaderMaterial | null = null;
  hotspotRefs: HTMLElement[] = [];
  visible = false;
  sceneUnits = 0;
  isMobile = false;
  protected mouseParallaxDisposer: (() => void) | null = null;
  protected scrollDisposer: (() => void) | null = null;

  constructor({ id, preset }: FieldControllerInit) {
    this.id = id;
    this.params = preset;
  }

  attach(attachment: FieldControllerAttachment): void {
    this.view = attachment.view;
    this.wrapper = attachment.wrapper;
    this.mouseWrapper = attachment.mouseWrapper;
    this.model = attachment.model;
    this.material = attachment.material;
    if (attachment.hotspotRefs) this.hotspotRefs = attachment.hotspotRefs;
  }

  // Build the full uniform bag for this controller's preset. Single-pair
  // Maze color uniforms: the blob's `uColorNoise` is further tweened at
  // runtime by BlobController through `LANDING_RAINBOW_RGB`; stream/pcb
  // hold the cyan→magenta pair statically.
  createLayerUniforms(isMobile: boolean, pointTexture: Texture): LayerUniforms {
    const preset = this.params;
    const { shader } = preset;
    const [baseR, baseG, baseB] = shader.colorBase;
    const [noiseR, noiseG, noiseB] = shader.colorNoise;
    return {
      pointTexture: { value: pointTexture },
      uIsMobile: { value: isMobile },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uScale: { value: 1 / preset.sceneScale },
      uSpeed: { value: shader.speed },
      uSize: { value: shader.size },
      uAlpha: { value: shader.alpha },
      uDepth: { value: shader.depth },
      uAmplitude: { value: shader.amplitude },
      uFrequency: { value: shader.frequency },
      uSelection: { value: shader.selection },
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

  updateVisibility(
    scrollY: number,
    viewportH: number,
    layerTop: number,
    layerHeight: number,
  ): boolean {
    const entryFactor = this.params.entryFactor ?? 0.5;
    const exitFactor = this.params.exitFactor ?? 0.5;
    const isVisible =
      layerTop + layerHeight > scrollY + viewportH * exitFactor &&
      layerTop < scrollY + viewportH * entryFactor;

    if (isVisible !== this.visible) {
      this.visible = isVisible;
      if (isVisible) this.animateIn();
      else this.animateOut("bottom");
    }

    return isVisible;
  }

  animateIn(): void {
    if (!this.material) return;
    const uniforms = this.material.uniforms;
    gsap.killTweensOf(uniforms.uAlpha);
    gsap.killTweensOf(uniforms.uDepth);
    gsap.killTweensOf(uniforms.uAmplitude);
    gsap.to(uniforms.uAlpha, {
      value: this.params.shader.alpha,
      duration: 1.4,
      ease: tnEase,
    });
    gsap.to(uniforms.uDepth, {
      value: this.params.shader.depth,
      duration: 1.4,
      ease: tnEase,
    });
    gsap.to(uniforms.uAmplitude, {
      value: this.params.shader.amplitude,
      duration: 1.4,
      ease: tnEase,
    });
  }

  animateOut(side: "top" | "bottom" | "center", instant = false): void {
    if (!this.material) return;
    const uniforms = this.material.uniforms;
    const duration = instant ? 0 : 1;
    gsap.killTweensOf(uniforms.uAlpha);
    gsap.killTweensOf(uniforms.uDepth);
    gsap.killTweensOf(uniforms.uAmplitude);
    gsap.to(uniforms.uAlpha, {
      value: this.params.alphaOut,
      duration,
      ease: tnEase,
    });
    gsap.to(uniforms.uDepth, {
      value: this.params.depthOut,
      duration,
      ease: tnEase,
    });
    gsap.to(uniforms.uAmplitude, {
      value: this.params.amplitudeOut,
      duration,
      ease: tnEase,
    });
    void side;
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
    ensureGsapScrollTriggerRegistered();
    void _anchor;
    void _endAnchor;
    return () => {};
  }

  toScreenPosition(
    target: Vector3,
    camera: Camera,
    viewportWidth: number,
    viewportHeight: number,
    scratch: Vector3 = new Vector3(),
  ): { x: number; y: number; z: number } {
    if (!this.model || !this.wrapper || !this.mouseWrapper) {
      return { x: 0, y: 0, z: 0 };
    }
    scratch.copy(target);
    this.model.localToWorld(scratch);
    scratch.project(camera);
    const x = ((scratch.x + 1) * viewportWidth) / 2;
    const y = ((-scratch.y + 1) * viewportHeight) / 2;
    const z = scratch.z;
    return { x, y, z };
  }

  // FrameContext is the per-frame bundle FieldScene passes on each tick.
  // Subclasses use it to drive uniforms + wrapper transforms.
  tick(_context: FrameContext): void {
    void _context;
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
  itemState: AmbientFieldStageItemState;
  pixelRatio: number;
  sceneState: AmbientFieldSceneState;
  sourceBounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  uniforms: LayerUniforms;
  viewportHeight: number;
  viewportWidth: number;
  wrapperInitialized: boolean;
  markWrapperInitialized: () => void;
}
