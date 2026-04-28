import {
  ROTATION_DRAG_GRACE_MS,
  ROTATION_RUNNING_RPS,
} from "../../../field/shared/landing-feel-constants";
import { OrbWebGpuRotationController } from "../orb-webgpu-rotation";

describe("OrbWebGpuRotationController", () => {
  it("runs at the shared landing rotation speed", () => {
    const rotation = new OrbWebGpuRotationController();

    const next = rotation.tick({
      dtSeconds: 2,
      pauseMotion: false,
      rotationSpeedMultiplier: 1,
      selectionActive: false,
      timestampMs: 0,
    });

    expect(next).toBeCloseTo(ROTATION_RUNNING_RPS * 2);
    expect(rotation.state).toBe("running");
  });

  it("suspends after manual twist and resumes after the drag grace window", () => {
    const rotation = new OrbWebGpuRotationController();

    rotation.applyTwist(0.5, 1000);
    const suspended = rotation.tick({
      dtSeconds: 1,
      pauseMotion: false,
      rotationSpeedMultiplier: 1,
      selectionActive: false,
      timestampMs: 1000 + ROTATION_DRAG_GRACE_MS - 1,
    });

    expect(suspended).toBeCloseTo(0.5);
    expect(rotation.state).toBe("suspended-drag");

    const resumed = rotation.tick({
      dtSeconds: 1,
      pauseMotion: false,
      rotationSpeedMultiplier: 1,
      selectionActive: false,
      timestampMs: 1000 + ROTATION_DRAG_GRACE_MS,
    });

    expect(resumed).toBeCloseTo(0.5 + ROTATION_RUNNING_RPS);
    expect(rotation.state).toBe("running");
  });

  it("pauses while selection or reduced motion is active", () => {
    const rotation = new OrbWebGpuRotationController();

    const selected = rotation.tick({
      dtSeconds: 1,
      pauseMotion: false,
      rotationSpeedMultiplier: 1,
      selectionActive: true,
      timestampMs: 0,
    });

    expect(selected).toBeCloseTo(0);
    expect(rotation.state).toBe("paused-selection");

    const reduced = rotation.tick({
      dtSeconds: 1,
      pauseMotion: true,
      rotationSpeedMultiplier: 1,
      selectionActive: false,
      timestampMs: 1000,
    });

    expect(reduced).toBeCloseTo(0);
    expect(rotation.state).toBe("paused-selection");
  });

  it("nudgeRotation eases toward the requested delta over multiple ticks", () => {
    const rotation = new OrbWebGpuRotationController();
    const target = (5 * Math.PI) / 180;
    rotation.nudgeRotation(target, 0);

    const afterOne = rotation.tick({
      dtSeconds: 1 / 60,
      pauseMotion: false,
      rotationSpeedMultiplier: 0,
      selectionActive: false,
      timestampMs: 16,
    });
    expect(afterOne).toBeGreaterThan(0);
    expect(afterOne).toBeLessThan(target);

    let last = afterOne;
    for (let i = 1; i < 240; i += 1) {
      last = rotation.tick({
        dtSeconds: 1 / 60,
        pauseMotion: false,
        rotationSpeedMultiplier: 0,
        selectionActive: false,
        timestampMs: 16 + i * 16,
      });
    }
    expect(last).toBeCloseTo(target, 4);
  });
});
