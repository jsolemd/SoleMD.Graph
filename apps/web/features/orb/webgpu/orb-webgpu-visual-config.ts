import {
  LANDING_RAINBOW_PERIOD_SECONDS,
  LANDING_RAINBOW_RGB,
} from "../../field/shared/landing-feel-constants";

export const ORB_BLOB_RADIUS = 2.0;
export const ORB_DEPTH_RANGE_RADIUS = ORB_BLOB_RADIUS;
export const ORB_FOCUS_CLUSTER_RADIUS = 0.40;

export const ORB_ZOOM_DEFAULT = 0.385;
export const ORB_ZOOM_MIN = 0.35;
export const ORB_ZOOM_MAX = 4;

export const ORB_PALETTE_RGB = LANDING_RAINBOW_RGB;
export const ORB_PALETTE_STOP_COUNT = ORB_PALETTE_RGB.length;
export const ORB_PALETTE_PERIOD_SECONDS = LANDING_RAINBOW_PERIOD_SECONDS;

export const ORB_FIELD_NOISE_TIME_SCALE = 0.20;

export const ORB_PHYSICS_FLOW_FREQUENCY = 0.55;
export const ORB_PHYSICS_TIME_SCALE = 0.035;
export const ORB_PHYSICS_FLOW_ACCELERATION = 0.035;
export const ORB_PHYSICS_HOME_PULL = 0.45;
export const ORB_PHYSICS_SWIRL_ACCELERATION = 0.015;
export const ORB_PHYSICS_VELOCITY_HALF_LIFE_SECONDS = 0.55;
export const ORB_PHYSICS_MAX_SPEED = 0.06;
export const ORB_PHYSICS_DT_MAX_SECONDS = 1 / 60;

export function formatWgslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : value.toFixed(6);
}
