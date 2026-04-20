import gsap from "gsap";
import { PerspectiveCamera } from "three";
import { DECAY, lerpFactor } from "@/lib/motion3d";
import {
  ensureGsapScrollTriggerRegistered,
  FieldController,
  type FrameContext,
} from "./FieldController";

// PcbController mirrors Maze's `_m` at scripts.pretty.js:43615-43630.
// Horizon-laying bitmap: x rotation -80 degrees, wrapper.z scrubbed
// -200 → 0 across the section (owned by bindScroll in C8). Scale honors
// the preset's sceneScale directly because the geometry is already sized
// in CSS pixel space.
export class PcbController extends FieldController {
  updateScale(
    sceneUnits: number,
    sourceHeight: number,
    isMobile: boolean,
  ): number {
    this.sceneUnits = sceneUnits;
    this.isMobile = isMobile;
    const sceneScale = isMobile
      ? this.params.sceneScaleMobile ?? this.params.sceneScale
      : this.params.sceneScale;
    return (sceneUnits / Math.max(sourceHeight, 0.001)) * sceneScale;
  }

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
    const localProgress = itemState?.localProgress ?? 0;

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

    const shaderAlpha = isMobile
      ? shader.alphaMobile ?? shader.alpha
      : shader.alpha;
    const shaderSize = isMobile
      ? shader.sizeMobile ?? shader.size
      : shader.size;

    uniforms.uTime.value = elapsedSec * timeFactor;
    uniforms.uPixelRatio.value = pixelRatio;
    uniforms.uIsMobile.value = isMobile;
    uniforms.uScale.value = 1 / baseScale;
    uniforms.uAlpha.value = shaderAlpha * visibility;
    uniforms.uAmplitude.value = shader.amplitude * motionScale;
    uniforms.uDepth.value = shader.depth;
    uniforms.uFrequency.value = shader.frequency;
    uniforms.uSize.value = shaderSize;
    uniforms.uSpeed.value = shader.speed * motionScale;
    uniforms.uSelection.value = shader.selection;
    uniforms.uFunnelDistortion.value = shader.funnelDistortion;
    uniforms.uFunnelStartShift.value = shader.funnelStartShift;
    uniforms.uFunnelEndShift.value = shader.funnelEndShift;
    uniforms.uSynthesisCluster.value = 0;

    const targetScale = baseScale;
    const targetPositionY = sceneUnits * preset.sceneOffset[1];
    const targetRotationX =
      preset.sceneRotation[0] + preset.scrollRotation[0] * localProgress;
    const targetRotationY =
      preset.sceneRotation[1] + preset.scrollRotation[1] * localProgress;
    const targetRotationZ =
      preset.sceneRotation[2] + preset.scrollRotation[2] * localProgress;
    const idleRotationY =
      elapsedSec * preset.rotationVelocity[1] * motionScale;

    wrapper.visible = visibility > 0.01;
    wrapper.position.x +=
      (sceneUnits * preset.sceneOffset[0] - wrapper.position.x) * driftBlend;
    wrapper.position.y += (targetPositionY - wrapper.position.y) * driftBlend;
    // wrapper.position.z is owned by `bindScroll` (scrolled -200 → 0).
    wrapper.scale.x += (targetScale - wrapper.scale.x) * driftBlend;
    wrapper.scale.y += (targetScale - wrapper.scale.y) * driftBlend;
    wrapper.scale.z += (targetScale - wrapper.scale.z) * driftBlend;
    wrapper.rotation.x = 0;
    wrapper.rotation.y = idleRotationY;
    wrapper.rotation.z = 0;

    model.rotation.x = targetRotationX;
    model.rotation.y = targetRotationY;
    model.rotation.z = targetRotationZ;
  }

  // Maze pcb bindScroll (scripts.pretty.js:43615-43630): wrapper.z scrubs
  // -200 → 0 across the section, pulling the horizon mesh toward the camera.
  bindScroll(
    anchor: HTMLElement,
    endAnchor?: HTMLElement | null,
  ): () => void {
    ensureGsapScrollTriggerRegistered();
    this.scrollDisposer?.();
    this.scrollDisposer = null;

    const { wrapper } = this;
    if (!wrapper) return () => {};

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      wrapper.position.z = 0;
      return () => {};
    }

    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: anchor,
        endTrigger: endAnchor ?? anchor,
        start: "top bottom",
        end: "bottom top",
        scrub: true,
      },
    });
    timeline.fromTo(wrapper.position, { z: -200 }, { z: 0 }, 0);

    const disposer = () => {
      timeline.scrollTrigger?.kill();
      timeline.kill();
    };
    this.scrollDisposer = disposer;
    return disposer;
  }
}
