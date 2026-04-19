import { gsap } from "gsap";
import {
  Camera,
  Group,
  type ShaderMaterial,
  Vector3,
} from "three";
import type {
  AmbientFieldVisualPresetConfig,
  AmbientFieldStageItemId,
} from "../scene/visual-presets";

// FieldController mirrors Maze's `yr` base controller (scripts.pretty.js:43013-43254).
// It owns the wrapper + mouseWrapper + model hierarchy, carries the
// shader material, and runs the per-frame `loop`, `updateScale`,
// `updateVisibility`, and `animateIn/Out` tweens.
//
// SoleMD note: in R3F the Three.js Group refs are handed in from the
// React layer after reconciliation; the controller does not own them.
// Call `controller.attach({ view, wrapper, mouseWrapper, model, material })`
// once the refs are live, then drive per-frame updates from the render
// loop.

export interface FieldControllerAttachment {
  view: HTMLElement | null;
  wrapper: Group;
  mouseWrapper: Group;
  model: Group;
  material: ShaderMaterial;
}

export interface FieldControllerInit {
  id: AmbientFieldStageItemId;
  preset: AmbientFieldVisualPresetConfig;
}

// Maze: `Tn = CustomEase("custom", "0.5, 0, 0.1, 1")`.
// CustomEase is a Club GSAP plugin not installed here, so we approximate
// via a cubic-bezier ease function with the same control points. The
// curve has a slow start, a fast middle, and a quick finish — close
// enough to Maze's Tn to be visually indistinguishable on a 1 s tween.
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

export abstract class FieldController {
  readonly id: AmbientFieldStageItemId;
  readonly params: AmbientFieldVisualPresetConfig;
  view: HTMLElement | null = null;
  wrapper: Group | null = null;
  mouseWrapper: Group | null = null;
  model: Group | null = null;
  material: ShaderMaterial | null = null;
  visible = false;
  sceneUnits = 0;
  isMobile = false;

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
  }

  // Continuous loop tick — called each frame.
  // Maze: `wrapper.rotation.y += 0.001; material.uniforms.uTime.value += 0.002;`
  // SoleMD reads uTime from `getAmbientFieldElapsedSeconds()` so it does
  // not own uTime here; only idle wrapper rotation.
  loop(dtSec: number): void {
    if (!this.wrapper || !this.params.rotate) return;
    this.wrapper.rotation.y += this.params.rotationVelocity[1] * dtSec;
  }

  // Base updateScale: scene-units / source-height * sceneScale. Subclasses
  // override for aspect-driven stream / pcb variants.
  updateScale(sceneUnits: number, sourceHeight: number, isMobile: boolean): number {
    this.sceneUnits = sceneUnits;
    this.isMobile = isMobile;
    const scale = isMobile
      ? this.params.sceneScaleMobile ?? this.params.sceneScale
      : this.params.sceneScale;
    const base = (sceneUnits / Math.max(sourceHeight, 0.001)) * scale;
    return base;
  }

  // Visibility carry window — default 0.5/0.5, stream 0.7/0.3.
  updateVisibility(scrollY: number, viewportH: number, layerTop: number, layerHeight: number): boolean {
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

  destroy(): void {
    if (this.material) {
      gsap.killTweensOf(this.material.uniforms.uAlpha);
      gsap.killTweensOf(this.material.uniforms.uDepth);
      gsap.killTweensOf(this.material.uniforms.uAmplitude);
    }
  }
}
