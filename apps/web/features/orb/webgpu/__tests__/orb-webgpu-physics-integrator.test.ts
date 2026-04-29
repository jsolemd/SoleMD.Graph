import { ORB_WEBGPU_SHADER_SOURCE } from "../orb-webgpu-shader";
import {
  ORB_PHYSICS_DT_MAX_SECONDS,
  ORB_PHYSICS_MAX_SPEED,
  ORB_PHYSICS_VELOCITY_HALF_LIFE_SECONDS,
} from "../orb-webgpu-visual-config";

type Vec3 = readonly [number, number, number];

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function clampLength(v: Vec3, maxLength: number): Vec3 {
  const len = length(v);
  if (len <= maxLength || len <= 1e-6) return v;
  return scale(v, maxLength / len);
}

function integrateVelocity(args: {
  velocity: Vec3;
  acceleration: Vec3;
  dt: number;
}): { dt: number; velocity: Vec3 } {
  const dt = Math.max(0, Math.min(args.dt, ORB_PHYSICS_DT_MAX_SECONDS));
  const accelerated = add(args.velocity, scale(args.acceleration, dt));
  const decay = 0.5 ** (dt / ORB_PHYSICS_VELOCITY_HALF_LIFE_SECONDS);
  return {
    dt,
    velocity: clampLength(scale(accelerated, decay), ORB_PHYSICS_MAX_SPEED),
  };
}

describe("orb WebGPU physics integrator", () => {
  it("clamps simulation dt before integrating velocity", () => {
    const result = integrateVelocity({
      acceleration: [1, 0, 0],
      dt: 0.2,
      velocity: [0, 0, 0],
    });
    expect(result.dt).toBeCloseTo(ORB_PHYSICS_DT_MAX_SECONDS, 6);
  });

  it("applies frame-rate-independent damping to existing velocity", () => {
    const result = integrateVelocity({
      acceleration: [0, 0, 0],
      dt: ORB_PHYSICS_DT_MAX_SECONDS,
      velocity: [0.02, 0, 0],
    });
    const expected =
      0.02 *
      0.5 ** (ORB_PHYSICS_DT_MAX_SECONDS / ORB_PHYSICS_VELOCITY_HALF_LIFE_SECONDS);
    expect(result.velocity[0]).toBeCloseTo(expected, 6);
  });

  it("clamps velocity magnitude to the configured max speed", () => {
    const result = integrateVelocity({
      acceleration: [100, 0, 0],
      dt: ORB_PHYSICS_DT_MAX_SECONDS,
      velocity: [0, 0, 0],
    });
    expect(length(result.velocity)).toBeCloseTo(ORB_PHYSICS_MAX_SPEED, 6);
  });

  it("keeps the shader on persistent position and velocity state", () => {
    expect(ORB_WEBGPU_SHADER_SOURCE).toContain(
      "computePositions[i] = vec4f(currentPos, 0.0);",
    );
    expect(ORB_WEBGPU_SHADER_SOURCE).toContain(
      "computeVelocities[i] = vec4f(velocity, motion.w);",
    );
    expect(ORB_WEBGPU_SHADER_SOURCE).toContain(
      "var velocity = motion.xyz + acceleration * dt;",
    );
  });
});
