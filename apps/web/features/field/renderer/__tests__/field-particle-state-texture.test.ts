import {
  clearLane,
  clearLanes,
  getParticleStateData,
  getParticleStateTexture,
  LANE_DEFAULTS,
  PARTICLE_STATE_CAPACITY,
  PARTICLE_STATE_LANES,
  resetParticleStateTexture,
  writeLane,
  type ParticleStateLane,
} from "../field-particle-state-texture";

const LANES = ["R", "G", "B", "A"] as const satisfies readonly ParticleStateLane[];
const LANE_INDEX = { R: 0, G: 1, B: 2, A: 3 } as const satisfies Record<
  ParticleStateLane,
  number
>;

function byteOffset(index: number, lane: ParticleStateLane): number {
  return index * PARTICLE_STATE_LANES + LANE_INDEX[lane];
}

function assertLaneDefaults(): void {
  const data = getParticleStateData();
  for (let index = 0; index < PARTICLE_STATE_CAPACITY; index += 1) {
    for (const lane of LANES) {
      expect(data[byteOffset(index, lane)]).toBe(LANE_DEFAULTS[lane]);
    }
  }
}

describe("field-particle-state-texture", () => {
  beforeEach(() => {
    getParticleStateTexture();
    resetParticleStateTexture();
  });

  it("exports the documented lane defaults", () => {
    expect(LANE_DEFAULTS).toEqual({ R: 255, G: 0, B: 0, A: 0 });
  });

  it("resetParticleStateTexture restores lane defaults", () => {
    writeLane("R", 0, 0);
    writeLane("G", 0, 128);
    writeLane("B", 1, 64);
    writeLane("A", 2, 32);

    resetParticleStateTexture();

    assertLaneDefaults();
  });

  it.each(LANES)("writeLane writes only the %s byte and marks the texture dirty", (lane) => {
    const texture = getParticleStateTexture();
    const versionBefore = texture.version;
    const index = 7;
    const data = getParticleStateData();
    const before = {
      R: data[byteOffset(index, "R")],
      G: data[byteOffset(index, "G")],
      B: data[byteOffset(index, "B")],
      A: data[byteOffset(index, "A")],
    };

    writeLane(lane, index, 513);

    expect(data[byteOffset(index, lane)]).toBe(1);
    for (const otherLane of LANES) {
      if (otherLane === lane) continue;
      expect(data[byteOffset(index, otherLane)]).toBe(before[otherLane]);
    }
    expect(texture.version).toBeGreaterThan(versionBefore);
  });

  it("clearLane restores only the requested lane to its default", () => {
    writeLane("R", 3, 0);
    writeLane("G", 3, 5);
    writeLane("B", 3, 6);
    writeLane("A", 3, 7);

    clearLane("G");

    const data = getParticleStateData();
    expect(data[byteOffset(3, "R")]).toBe(0);
    expect(data[byteOffset(3, "G")]).toBe(LANE_DEFAULTS.G);
    expect(data[byteOffset(3, "B")]).toBe(6);
    expect(data[byteOffset(3, "A")]).toBe(7);
  });

  it("clearLane uses R=255 and G/B/A=0 defaults", () => {
    for (const lane of LANES) {
      writeLane(lane, 0, 123);
      clearLane(lane);
      expect(getParticleStateData()[byteOffset(0, lane)]).toBe(LANE_DEFAULTS[lane]);
    }
  });

  it("clearLanes restores multiple lanes in one pass and preserves untouched lanes", () => {
    writeLane("R", 4, 0);
    writeLane("G", 4, 200);
    writeLane("B", 4, 150);
    writeLane("A", 4, 100);

    clearLanes(["R", "G"]);

    const data = getParticleStateData();
    expect(data[byteOffset(4, "R")]).toBe(LANE_DEFAULTS.R);
    expect(data[byteOffset(4, "G")]).toBe(LANE_DEFAULTS.G);
    expect(data[byteOffset(4, "B")]).toBe(150);
    expect(data[byteOffset(4, "A")]).toBe(100);
  });

  it("writeLane rejects out-of-range indices", () => {
    expect(() => writeLane("R", -1, 0)).toThrow(RangeError);
    expect(() => writeLane("R", PARTICLE_STATE_CAPACITY, 0)).toThrow(RangeError);
  });
});
