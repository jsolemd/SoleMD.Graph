// Camera pan for the WebGPU orb. Pan is in NDC after aspect correction,
// so a pan of (0.06, 0) is a fixed 6 % of viewport width regardless of
// the current zoom. Mirrors the zoom controller's reduced-motion gate.
import { clampFinite } from "./orb-webgpu-layout";

// Bound the pan so the orb cannot exit the viewport entirely. 1.2 lets
// the user push the body well past the edge for inspection purposes
// without losing it completely; 1.0 was too tight in practice.
export const ORB_PAN_LIMIT_NDC = 1.2;
const PAN_HALF_LIFE_SECONDS = 0.25;

export interface OrbWebGpuPanVector {
  x: number;
  y: number;
}

export interface OrbWebGpuPanTickInput {
  dtSeconds: number;
  prefersReducedMotion: boolean;
}

export class OrbWebGpuPanController {
  private targetX = 0;
  private targetY = 0;
  private valueX = 0;
  private valueY = 0;

  get x(): number {
    return this.valueX;
  }

  get y(): number {
    return this.valueY;
  }

  get target(): OrbWebGpuPanVector {
    return { x: this.targetX, y: this.targetY };
  }

  setPan(next: OrbWebGpuPanVector): void {
    this.targetX = clampFinite(next.x, -ORB_PAN_LIMIT_NDC, ORB_PAN_LIMIT_NDC);
    this.targetY = clampFinite(next.y, -ORB_PAN_LIMIT_NDC, ORB_PAN_LIMIT_NDC);
  }

  applyPan(delta: OrbWebGpuPanVector): void {
    this.setPan({
      x: this.targetX + delta.x,
      y: this.targetY + delta.y,
    });
  }

  reset(): void {
    this.targetX = 0;
    this.targetY = 0;
  }

  tick(input: OrbWebGpuPanTickInput): OrbWebGpuPanVector {
    if (input.prefersReducedMotion) {
      this.valueX = this.targetX;
      this.valueY = this.targetY;
      return { x: this.valueX, y: this.valueY };
    }
    if (input.dtSeconds <= 0) return { x: this.valueX, y: this.valueY };
    const decay = Math.pow(0.5, input.dtSeconds / PAN_HALF_LIFE_SECONDS);
    this.valueX = this.targetX + (this.valueX - this.targetX) * decay;
    this.valueY = this.targetY + (this.valueY - this.targetY) * decay;
    if (Math.abs(this.valueX - this.targetX) < 1e-4) {
      this.valueX = this.targetX;
    }
    if (Math.abs(this.valueY - this.targetY) < 1e-4) {
      this.valueY = this.targetY;
    }
    return { x: this.valueX, y: this.valueY };
  }
}
