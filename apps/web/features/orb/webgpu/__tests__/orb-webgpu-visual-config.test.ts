import { LANDING_RAINBOW_RGB } from "../../../field/shared/landing-feel-constants";
import { ORB_WEBGPU_SHADER_SOURCE } from "../orb-webgpu-shader";
import { ORB_WEBGPU_SHADER_NOISE_WGSL } from "../orb-webgpu-shader-noise";
import {
  ORB_BLOB_RADIUS,
  ORB_DEPTH_RANGE_RADIUS,
  ORB_FIELD_NOISE_TIME_SCALE,
  ORB_FOCUS_CLUSTER_RADIUS,
  ORB_PALETTE_PERIOD_SECONDS,
  ORB_PALETTE_RGB,
  ORB_PALETTE_STOP_COUNT,
  ORB_PHYSICS_DT_MAX_SECONDS,
  ORB_PHYSICS_FLOW_ACCELERATION,
  ORB_PHYSICS_FLOW_FREQUENCY,
  ORB_PHYSICS_HOME_PULL,
  ORB_PHYSICS_MAX_SPEED,
  ORB_PHYSICS_SWIRL_ACCELERATION,
  ORB_PHYSICS_TIME_SCALE,
  ORB_PHYSICS_VELOCITY_HALF_LIFE_SECONDS,
  ORB_ZOOM_DEFAULT,
  ORB_ZOOM_MIN,
  formatWgslFloat,
} from "../orb-webgpu-visual-config";

describe("orb WebGPU visual config", () => {
  it("preserves the apparent footprint while widening world-space radius", () => {
    expect(ORB_BLOB_RADIUS).toBe(2.0);
    expect(ORB_ZOOM_DEFAULT).toBeCloseTo(0.385, 6);
    expect(ORB_BLOB_RADIUS * ORB_ZOOM_DEFAULT).toBeCloseTo(1.4 * 0.55, 6);
    expect(ORB_ZOOM_MIN).toBeLessThan(ORB_ZOOM_DEFAULT);
  });

  it("keeps depth and focus ranges in sync with the wider sphere", () => {
    expect(ORB_DEPTH_RANGE_RADIUS).toBeGreaterThanOrEqual(ORB_BLOB_RADIUS);
    expect(ORB_FOCUS_CLUSTER_RADIUS).toBeCloseTo(0.28 * (2.0 / 1.4), 6);
  });

  it("keeps physics constants in a stable organic-motion range", () => {
    expect(ORB_PHYSICS_FLOW_FREQUENCY).toBeGreaterThan(0);
    expect(ORB_PHYSICS_TIME_SCALE).toBeLessThan(ORB_FIELD_NOISE_TIME_SCALE);
    expect(ORB_PHYSICS_FLOW_ACCELERATION).toBeGreaterThan(0);
    expect(ORB_PHYSICS_HOME_PULL).toBeGreaterThan(ORB_PHYSICS_FLOW_ACCELERATION);
    expect(ORB_PHYSICS_SWIRL_ACCELERATION).toBeGreaterThan(0);
    expect(ORB_PHYSICS_VELOCITY_HALF_LIFE_SECONDS).toBeGreaterThan(0);
    expect(ORB_PHYSICS_MAX_SPEED).toBeGreaterThan(0);
    expect(ORB_PHYSICS_DT_MAX_SECONDS).toBeCloseTo(1 / 60, 6);
  });

  it("forks orb palette ownership without changing the landing palette value", () => {
    expect(ORB_PALETTE_RGB).toEqual(LANDING_RAINBOW_RGB);
    expect(ORB_PALETTE_STOP_COUNT).toBe(ORB_PALETTE_RGB.length);
  });

  it("generates shader constants from the shared visual config", () => {
    expect(ORB_WEBGPU_SHADER_SOURCE).toContain(
      `const ORB_BLOB_RADIUS = ${formatWgslFloat(ORB_BLOB_RADIUS)};`,
    );
    expect(ORB_WEBGPU_SHADER_SOURCE).toContain(
      `const ORB_DEPTH_RANGE_RADIUS = ${formatWgslFloat(ORB_DEPTH_RANGE_RADIUS)};`,
    );
    for (const [name, value] of [
      ["ORB_PHYSICS_FLOW_FREQUENCY", ORB_PHYSICS_FLOW_FREQUENCY],
      ["ORB_PHYSICS_TIME_SCALE", ORB_PHYSICS_TIME_SCALE],
      ["ORB_PHYSICS_FLOW_ACCELERATION", ORB_PHYSICS_FLOW_ACCELERATION],
      ["ORB_PHYSICS_HOME_PULL", ORB_PHYSICS_HOME_PULL],
      ["ORB_PHYSICS_SWIRL_ACCELERATION", ORB_PHYSICS_SWIRL_ACCELERATION],
      [
        "ORB_PHYSICS_VELOCITY_HALF_LIFE_SECONDS",
        ORB_PHYSICS_VELOCITY_HALF_LIFE_SECONDS,
      ],
      ["ORB_PHYSICS_MAX_SPEED", ORB_PHYSICS_MAX_SPEED],
      ["ORB_PHYSICS_DT_MAX_SECONDS", ORB_PHYSICS_DT_MAX_SECONDS],
    ] as const) {
      expect(ORB_WEBGPU_SHADER_SOURCE).toContain(
        `const ${name} = ${formatWgslFloat(value)};`,
      );
    }
    expect(ORB_WEBGPU_SHADER_NOISE_WGSL).toContain(
      `const ORB_PALETTE_PERIOD_SECONDS = ${formatWgslFloat(ORB_PALETTE_PERIOD_SECONDS)};`,
    );
    expect(ORB_WEBGPU_SHADER_NOISE_WGSL).toContain(
      `const ORB_FIELD_NOISE_TIME_SCALE = ${formatWgslFloat(ORB_FIELD_NOISE_TIME_SCALE)};`,
    );
  });
});
