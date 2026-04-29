import {
  ORB_BLOB_RADIUS,
  ORB_DEPTH_RANGE_RADIUS,
  ORB_FOCUS_CLUSTER_RADIUS,
  ORB_PHYSICS_DT_MAX_SECONDS,
  ORB_PHYSICS_FLOW_FREQUENCY,
  ORB_PHYSICS_FLOW_ACCELERATION,
  ORB_PHYSICS_HOME_PULL,
  ORB_PHYSICS_MAX_SPEED,
  ORB_PHYSICS_SWIRL_ACCELERATION,
  ORB_PHYSICS_TIME_SCALE,
  ORB_PHYSICS_VELOCITY_HALF_LIFE_SECONDS,
  formatWgslFloat,
} from "./orb-webgpu-visual-config";

export const ORB_WEBGPU_SHADER_PHYSICS_WGSL = /* wgsl */ `
const ORB_BLOB_RADIUS = ${formatWgslFloat(ORB_BLOB_RADIUS)};
const ORB_DEPTH_RANGE_RADIUS = ${formatWgslFloat(ORB_DEPTH_RANGE_RADIUS)};
const ORB_FOCUS_CLUSTER_RADIUS = ${formatWgslFloat(ORB_FOCUS_CLUSTER_RADIUS)};
const ORB_PHYSICS_FLOW_FREQUENCY = ${formatWgslFloat(ORB_PHYSICS_FLOW_FREQUENCY)};
const ORB_PHYSICS_TIME_SCALE = ${formatWgslFloat(ORB_PHYSICS_TIME_SCALE)};
const ORB_PHYSICS_FLOW_ACCELERATION = ${formatWgslFloat(ORB_PHYSICS_FLOW_ACCELERATION)};
const ORB_PHYSICS_HOME_PULL = ${formatWgslFloat(ORB_PHYSICS_HOME_PULL)};
const ORB_PHYSICS_SWIRL_ACCELERATION = ${formatWgslFloat(ORB_PHYSICS_SWIRL_ACCELERATION)};
const ORB_PHYSICS_VELOCITY_HALF_LIFE_SECONDS = ${formatWgslFloat(ORB_PHYSICS_VELOCITY_HALF_LIFE_SECONDS)};
const ORB_PHYSICS_MAX_SPEED = ${formatWgslFloat(ORB_PHYSICS_MAX_SPEED)};
const ORB_PHYSICS_DT_MAX_SECONDS = ${formatWgslFloat(ORB_PHYSICS_DT_MAX_SECONDS)};

fn depthFromZ(z: f32) -> f32 {
  return clamp(
    (ORB_DEPTH_RANGE_RADIUS - z) / (2.0 * ORB_DEPTH_RANGE_RADIUS),
    0.0,
    1.0,
  );
}

fn homePositionForIndex(i: u32) -> vec3f {
  let h1 = iHashToFloat(iHash(i));
  let h2 = iHashToFloat(iHash(i ^ 0x9e3779b9u));
  let cosTheta = 2.0 * h1 - 1.0;
  let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  let phi = 6.2831853 * h2;
  let unit = vec3f(cos(phi) * sinTheta, cosTheta, sin(phi) * sinTheta);
  return unit * ORB_BLOB_RADIUS;
}

fn tangentProject(v: vec3f, normal: vec3f) -> vec3f {
  return v - normal * dot(v, normal);
}

fn clampVecLength(v: vec3f, maxLength: f32) -> vec3f {
  let len = length(v);
  if (len <= maxLength || len <= 0.000001) {
    return v;
  }
  return v * (maxLength / len);
}

fn organicFlowField(position: vec3f, colorTime: f32, speed: f32) -> vec3f {
  let p = position * ORB_PHYSICS_FLOW_FREQUENCY;
  let t = colorTime * ORB_PHYSICS_TIME_SCALE * (0.85 + speed * 0.30);
  return vec3f(
    sin(p.y * 1.70 + t) + 0.55 * cos(p.z * 2.10 - t * 0.73),
    sin(p.z * 1.50 - t * 0.91) + 0.55 * cos(p.x * 1.90 + t * 0.61),
    sin(p.x * 1.60 + t * 0.83) + 0.55 * cos(p.y * 2.00 - t * 0.47)
  ) * 0.50;
}
`;
