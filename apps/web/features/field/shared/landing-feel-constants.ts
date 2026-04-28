export type Rgb255 = readonly [number, number, number];
export type RgbUnit = readonly [number, number, number];

export const LANDING_BASE_BLUE_RGB = hexToRgb("#2FA4FF");

export const LANDING_RAINBOW_RGB = [
  hexToRgb("#FF7A3C"),
  hexToRgb("#FFC132"),
  hexToRgb("#3FD656"),
  hexToRgb("#20D9A8"),
  hexToRgb("#42A4FE"),
  hexToRgb("#8958FF"),
  hexToRgb("#D409FE"),
  hexToRgb("#FF3FB7"),
] as const satisfies readonly Rgb255[];

export const LANDING_RAINBOW_STOP_SECONDS = 2;
export const LANDING_RAINBOW_PERIOD_SECONDS =
  LANDING_RAINBOW_RGB.length * LANDING_RAINBOW_STOP_SECONDS;

export const INTRO_DURATION_SECONDS = 1.4;
export const INTRO_DEPTH_BOOST = 2.6;

export const BLOB_AMPLITUDE = 0.05;
export const BLOB_DEPTH = 0.3;
export const BLOB_FREQUENCY = 0.5;
export const BLOB_WAVE_SPEED = 1;
export const BLOB_TIME_FACTOR = 0.25;

export const ROTATION_RUNNING_RPS = 0.04;
export const ROTATION_DRAG_GRACE_MS = 1500;

export function rgb255ToUnit(color: Rgb255): RgbUnit {
  return [color[0] / 255, color[1] / 255, color[2] / 255] as const;
}

function hexToRgb(hex: string): Rgb255 {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff] as const;
}
