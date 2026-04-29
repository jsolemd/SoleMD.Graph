import {
  ORB_ZOOM_DEFAULT,
  ORB_ZOOM_MAX,
  ORB_ZOOM_MIN,
  OrbWebGpuZoomController,
} from "../orb-webgpu-zoom";

describe("orb WebGPU zoom controller", () => {
  it("starts at the default zoom and clamps targets to the legal range", () => {
    const ctrl = new OrbWebGpuZoomController();
    expect(ctrl.zoom).toBe(ORB_ZOOM_DEFAULT);

    ctrl.setZoom(10);
    expect(ctrl.target).toBe(ORB_ZOOM_MAX);

    ctrl.setZoom(0.01);
    expect(ctrl.target).toBe(ORB_ZOOM_MIN);
  });

  it("eases the value toward the target over multiple ticks", () => {
    const ctrl = new OrbWebGpuZoomController();
    ctrl.setZoom(2);
    ctrl.tick({ dtSeconds: 1 / 60, prefersReducedMotion: false });
    const afterOneTick = ctrl.zoom;
    expect(afterOneTick).toBeGreaterThan(ORB_ZOOM_DEFAULT);
    expect(afterOneTick).toBeLessThan(2);

    for (let i = 0; i < 600; i += 1) {
      ctrl.tick({ dtSeconds: 1 / 60, prefersReducedMotion: false });
    }
    expect(ctrl.zoom).toBe(2);
  });

  it("snaps instantly when prefers-reduced-motion is set", () => {
    const ctrl = new OrbWebGpuZoomController();
    ctrl.setZoom(3);
    ctrl.tick({ dtSeconds: 1 / 60, prefersReducedMotion: true });
    expect(ctrl.zoom).toBe(3);
  });

  it("applyZoom multiplies the current target", () => {
    const ctrl = new OrbWebGpuZoomController();
    ctrl.setZoom(1);
    ctrl.applyZoom(1.2);
    expect(ctrl.target).toBeCloseTo(1.2);
    ctrl.applyZoom(1.5);
    expect(ctrl.target).toBeCloseTo(1.8);
  });

  it("reset returns the target to default", () => {
    const ctrl = new OrbWebGpuZoomController();
    ctrl.setZoom(2);
    ctrl.reset();
    expect(ctrl.target).toBe(ORB_ZOOM_DEFAULT);
  });
});
