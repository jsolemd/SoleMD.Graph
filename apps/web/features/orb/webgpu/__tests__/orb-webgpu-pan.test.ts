import {
  ORB_PAN_LIMIT_NDC,
  OrbWebGpuPanController,
} from "../orb-webgpu-pan";

describe("orb WebGPU pan controller", () => {
  it("clamps pan targets to the legal NDC bound on both axes", () => {
    const ctrl = new OrbWebGpuPanController();
    ctrl.setPan({ x: 10, y: -10 });
    expect(ctrl.target).toEqual({
      x: ORB_PAN_LIMIT_NDC,
      y: -ORB_PAN_LIMIT_NDC,
    });
  });

  it("eases the value toward the target then settles exactly on it", () => {
    const ctrl = new OrbWebGpuPanController();
    ctrl.setPan({ x: 0.4, y: -0.2 });
    ctrl.tick({ dtSeconds: 1 / 60, prefersReducedMotion: false });
    expect(ctrl.x).toBeGreaterThan(0);
    expect(ctrl.x).toBeLessThan(0.4);
    for (let i = 0; i < 600; i += 1) {
      ctrl.tick({ dtSeconds: 1 / 60, prefersReducedMotion: false });
    }
    expect(ctrl.x).toBe(0.4);
    expect(ctrl.y).toBe(-0.2);
  });

  it("snaps when prefers-reduced-motion is on", () => {
    const ctrl = new OrbWebGpuPanController();
    ctrl.setPan({ x: 0.3, y: 0.1 });
    ctrl.tick({ dtSeconds: 1 / 60, prefersReducedMotion: true });
    expect(ctrl.x).toBe(0.3);
    expect(ctrl.y).toBe(0.1);
  });

  it("applyPan accumulates onto the current target", () => {
    const ctrl = new OrbWebGpuPanController();
    ctrl.applyPan({ x: 0.06, y: 0 });
    ctrl.applyPan({ x: 0.06, y: 0 });
    expect(ctrl.target.x).toBeCloseTo(0.12);
  });

  it("reset returns target to origin", () => {
    const ctrl = new OrbWebGpuPanController();
    ctrl.setPan({ x: 0.5, y: -0.3 });
    ctrl.reset();
    expect(ctrl.target).toEqual({ x: 0, y: 0 });
  });
});
