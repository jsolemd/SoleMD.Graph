import {
  BLOB_AMPLITUDE,
  BLOB_DEPTH,
  BLOB_FREQUENCY,
  BLOB_TIME_FACTOR,
  BLOB_WAVE_SPEED,
  INTRO_DEPTH_BOOST,
  INTRO_DURATION_SECONDS,
  LANDING_BASE_BLUE_RGB,
  LANDING_RAINBOW_PERIOD_SECONDS,
  LANDING_RAINBOW_RGB,
  LANDING_RAINBOW_STOP_SECONDS,
  ROTATION_DRAG_GRACE_MS,
  ROTATION_RUNNING_RPS,
  rgb255ToUnit,
} from "../landing-feel-constants";

describe("landing feel constants", () => {
  it("pins the Maze/SoleMD blob color wheel", () => {
    expect(LANDING_BASE_BLUE_RGB).toEqual([47, 164, 255]);
    expect(LANDING_RAINBOW_RGB).toEqual([
      [255, 122, 60],
      [255, 193, 50],
      [63, 214, 86],
      [32, 217, 168],
      [66, 164, 254],
      [137, 88, 255],
      [212, 9, 254],
      [255, 63, 183],
    ]);
    expect(LANDING_RAINBOW_STOP_SECONDS).toBe(2);
    expect(LANDING_RAINBOW_PERIOD_SECONDS).toBe(16);
  });

  it("pins the blob motion, intro, and rotation envelope", () => {
    expect(BLOB_AMPLITUDE).toBe(0.05);
    expect(BLOB_DEPTH).toBe(0.3);
    expect(BLOB_FREQUENCY).toBe(0.5);
    expect(BLOB_WAVE_SPEED).toBe(1);
    expect(BLOB_TIME_FACTOR).toBe(0.25);
    expect(INTRO_DURATION_SECONDS).toBe(1.4);
    expect(INTRO_DEPTH_BOOST).toBe(2.6);
    expect(ROTATION_RUNNING_RPS).toBe(0.04);
    expect(ROTATION_DRAG_GRACE_MS).toBe(1500);
  });

  it("converts 8-bit colors to unit color space", () => {
    expect(rgb255ToUnit([255, 128, 0])).toEqual([1, 128 / 255, 0]);
  });
});
