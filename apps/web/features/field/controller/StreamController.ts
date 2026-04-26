import { PerspectiveCamera } from "three";
import { DECAY, lerpFactor } from "@/lib/motion3d";
import { resolveLandingStreamChapterState } from "../scroll/chapters/landing-stream-chapter";
import { FieldController, type FrameContext } from "./FieldController";

// StreamController mirrors Maze's `ug` at scripts.pretty.js:49326-49345.
// Aspect-driven scale so the conveyor reads consistently across viewports:
//   scale = 250 * (innerW/innerH) / (1512/748)   desktop
//   scale = 168                                   mobile
const MAZE_REFERENCE_ASPECT = 1512 / 748;
const MAZE_DESKTOP_BASE = 250;
const MAZE_MOBILE_BASE = 168;

export class StreamController extends FieldController {
  updateScale(
    _sceneUnits: number,
    _sourceHeight: number,
    isMobile: boolean,
  ): number {
    this.isMobile = isMobile;
    const sceneScale = isMobile
      ? this.params.sceneScaleMobile ?? this.params.sceneScale
      : this.params.sceneScale;
    if (isMobile) return MAZE_MOBILE_BASE * sceneScale;
    if (typeof window === "undefined") return MAZE_DESKTOP_BASE * sceneScale;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    return MAZE_DESKTOP_BASE * (aspect / MAZE_REFERENCE_ASPECT) * sceneScale;
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
    // Slice B (orb-3d-physics-taxonomy.md §9.3): see BlobController for
    // the rationale — pauseScale composes with motionScale, the user
    // tempo rides `uTimeFactor` only, entropy rides amplitude/frequency.
    const pauseScale = sceneState.motionPaused ? 0 : 1;
    const timeMul = pauseScale * sceneState.motionSpeedMultiplier;
    const rotMul =
      pauseScale * motionScale * sceneState.rotationSpeedMultiplier;
    const entropyMul = sceneState.ambientEntropy;
    const driftBlend = lerpFactor(dtSec, DECAY.standard);
    const timeFactor = this.getTimeFactor(motionEnabled);
    // Slice B: integrate `uTime` (see BlobController for rationale).
    this.accumulatedUTime += dtSec * timeMul;
    const visibility = itemState?.visibility ?? 0;
    const chapterState = resolveLandingStreamChapterState(sceneState);

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

    uniforms.uTime.value = this.accumulatedUTime;
    uniforms.uTimeFactor.value = timeFactor;
    uniforms.uPixelRatio.value = pixelRatio;
    uniforms.uIsMobile.value = isMobile;
    uniforms.uScale.value = 1 / baseScale;
    uniforms.uAlpha.value +=
      (shaderAlpha * visibility * chapterState.alpha - uniforms.uAlpha.value) *
      driftBlend;
    uniforms.uAmplitude.value +=
      (chapterState.amplitude * motionScale * entropyMul -
        uniforms.uAmplitude.value) *
      driftBlend;
    uniforms.uDepth.value +=
      (chapterState.depth - uniforms.uDepth.value) * driftBlend;
    // Slice B: entropy is amplitude-only (see BlobController).
    uniforms.uFrequency.value +=
      (chapterState.frequency - uniforms.uFrequency.value) * driftBlend;
    uniforms.uSize.value = shaderSize;
    uniforms.uSpeed.value = shader.speed * motionScale;
    uniforms.uSelection.value +=
      (chapterState.selection - uniforms.uSelection.value) * driftBlend;
    uniforms.uFunnelDistortion.value = shader.funnelDistortion;
    uniforms.uFunnelStartShift.value = shader.funnelStartShift;
    uniforms.uFunnelEndShift.value = shader.funnelEndShift;

    const targetScale = baseScale;
    // Sticky Y correction: when the stream is sticky-pinned at the
    // viewport center, subtract half its own scene-units offset so the
    // conveyor does not drift off-axis as the wrapper scale animates.
    const viewportCenterRatio = 0.0; // no sticky offset active in C5
    const targetPositionY =
      sceneUnits * preset.sceneOffset[1] - sceneUnits * viewportCenterRatio;
    const targetRotationX = preset.sceneRotation[0];
    const targetRotationY = preset.sceneRotation[1];
    const targetRotationZ = preset.sceneRotation[2];
    const idleRotationY =
      elapsedSec * preset.rotationVelocity[1] * rotMul;

    wrapper.visible = visibility > 0.01;
    wrapper.position.x +=
      (sceneUnits * preset.sceneOffset[0] - wrapper.position.x) * driftBlend;
    wrapper.position.y += (targetPositionY - wrapper.position.y) * driftBlend;
    wrapper.position.z +=
      (chapterState.wrapperZ - wrapper.position.z) * driftBlend;
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
}
