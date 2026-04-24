import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from "three";
import {
  bakeFieldAttributes,
  buildBucketIndex,
  SOLEMD_DEFAULT_BUCKETS,
} from "../field-attribute-baker";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGeometry(pointCount: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(pointCount * 3), 3),
  );
  return geometry;
}

describe("bakeFieldAttributes", () => {
  it("writes every Maze attribute plus aBucket onto the geometry", () => {
    const geometry = makeGeometry(128);
    bakeFieldAttributes(geometry, { random: seededRandom(1) });

    for (const name of [
      "aMove",
      "aSpeed",
      "aRandomness",
      "aAlpha",
      "aSelection",
      "aIndex",
      "aStreamFreq",
      "aFunnelThickness",
      "aFunnelNarrow",
      "aFunnelStartShift",
      "aFunnelEndShift",
      "aBucket",
    ]) {
      expect(geometry.getAttribute(name)).toBeDefined();
    }
  });

  it("produces a bucket histogram within 2% of the configured weights", () => {
    const pointCount = 16384;
    const geometry = makeGeometry(pointCount);
    bakeFieldAttributes(geometry, { random: seededRandom(42) });

    const aBucket = geometry.getAttribute("aBucket")!.array as Float32Array;
    const counts = new Array(SOLEMD_DEFAULT_BUCKETS.length).fill(0);
    for (let i = 0; i < aBucket.length; i += 1) {
      counts[aBucket[i]!] += 1;
    }
    const tolerance = 0.02;
    SOLEMD_DEFAULT_BUCKETS.forEach((bucket, index) => {
      const observed = counts[index] / pointCount;
      expect(Math.abs(observed - bucket.weight)).toBeLessThan(tolerance);
    });
  });

  it("keeps per-point random attributes inside their documented ranges", () => {
    const pointCount = 2048;
    const geometry = makeGeometry(pointCount);
    bakeFieldAttributes(geometry, { random: seededRandom(7) });

    const aMove = geometry.getAttribute("aMove")!.array as Float32Array;
    const aSpeed = geometry.getAttribute("aSpeed")!.array as Float32Array;
    const aRandomness = geometry.getAttribute("aRandomness")!.array as Float32Array;
    const aAlpha = geometry.getAttribute("aAlpha")!.array as Float32Array;
    const aSelection = geometry.getAttribute("aSelection")!.array as Float32Array;

    for (let i = 0; i < pointCount; i += 1) {
      expect(aMove[i * 3]!).toBeGreaterThanOrEqual(-30);
      expect(aMove[i * 3]!).toBeLessThanOrEqual(30);
      expect(aMove[i * 3 + 1]!).toBeGreaterThanOrEqual(-30);
      expect(aMove[i * 3 + 1]!).toBeLessThanOrEqual(30);
      expect(aMove[i * 3 + 2]!).toBeGreaterThanOrEqual(-30);
      expect(aMove[i * 3 + 2]!).toBeLessThanOrEqual(30);

      expect(aSpeed[i * 3]!).toBeGreaterThanOrEqual(0);
      expect(aSpeed[i * 3]!).toBeLessThanOrEqual(1);

      // -0 is acceptable; randomnessScale.x = 0 produces -0 for negative inputs.
      expect(Math.abs(aRandomness[i * 3]!)).toBe(0);
      expect(aRandomness[i * 3 + 1]!).toBeGreaterThanOrEqual(-1);
      expect(aRandomness[i * 3 + 1]!).toBeLessThanOrEqual(1);
      expect(aRandomness[i * 3 + 2]!).toBeGreaterThanOrEqual(-0.5);
      expect(aRandomness[i * 3 + 2]!).toBeLessThanOrEqual(0.5);

      expect(aAlpha[i]!).toBeGreaterThanOrEqual(0.2);
      expect(aAlpha[i]!).toBeLessThanOrEqual(1);

      expect(aSelection[i]!).toBeGreaterThanOrEqual(0);
      expect(aSelection[i]!).toBeLessThanOrEqual(1);
    }
  });

  it("ties aIndex to the sequential point ordinal", () => {
    const pointCount = 512;
    const geometry = makeGeometry(pointCount);
    bakeFieldAttributes(geometry, { random: seededRandom(1) });
    const aIndex = geometry.getAttribute("aIndex")!.array as Float32Array;
    for (let i = 0; i < pointCount; i += 1) {
      expect(aIndex[i]).toBe(i);
    }
  });

  it("drives aStreamFreq / funnel attributes from the chosen bucket", () => {
    const pointCount = 512;
    const geometry = makeGeometry(pointCount);
    bakeFieldAttributes(geometry, { random: seededRandom(3) });
    const aBucket = geometry.getAttribute("aBucket")!.array as Float32Array;
    const aStreamFreq = geometry.getAttribute("aStreamFreq")!.array as Float32Array;
    const aFunnelThickness = geometry.getAttribute("aFunnelThickness")!
      .array as Float32Array;
    for (let i = 0; i < pointCount; i += 1) {
      const bucket = SOLEMD_DEFAULT_BUCKETS[aBucket[i]!]!;
      expect(aStreamFreq[i]).toBeCloseTo(bucket.aStreamFreq, 6);
      expect(aFunnelThickness[i]).toBeCloseTo(bucket.aFunnelThickness, 6);
    }
  });

  it("throws when the geometry is missing a position attribute", () => {
    const empty = new BufferGeometry();
    expect(() =>
      bakeFieldAttributes(empty, { random: seededRandom(0) }),
    ).toThrow();
  });

  it("produces a stable bucket index mapping", () => {
    const index = buildBucketIndex(SOLEMD_DEFAULT_BUCKETS);
    expect(index.paper).toBe(0);
    expect(index.entity).toBe(1);
    expect(index.relation).toBe(2);
    expect(index.evidence).toBe(3);
  });

  /* ---- Shared-shader contract: paper-mode attribute defaults ---- */

  it("always bakes aSizeFactor, aLogicalPaperId, aClickAttraction", () => {
    const geometry = makeGeometry(256);
    bakeFieldAttributes(geometry, { random: seededRandom(11) });
    expect(geometry.getAttribute("aSizeFactor")).toBeDefined();
    expect(geometry.getAttribute("aLogicalPaperId")).toBeDefined();
    expect(geometry.getAttribute("aClickAttraction")).toBeDefined();
  });

  it("lands-mode defaults make the shader additions no-ops: size=1, id=-1, click=0", () => {
    const pointCount = 1024;
    const geometry = makeGeometry(pointCount);
    bakeFieldAttributes(geometry, { random: seededRandom(13) });

    const aSizeFactor = geometry.getAttribute("aSizeFactor")!.array as Float32Array;
    const aLogicalPaperId = geometry.getAttribute("aLogicalPaperId")!.array as Float32Array;
    const aClickAttraction = geometry.getAttribute("aClickAttraction")!.array as Float32Array;

    for (let i = 0; i < pointCount; i += 1) {
      expect(aSizeFactor[i]).toBe(1);
      expect(aLogicalPaperId[i]).toBe(-1);
      expect(aClickAttraction[i * 3]).toBe(0);
      expect(aClickAttraction[i * 3 + 1]).toBe(0);
      expect(aClickAttraction[i * 3 + 2]).toBe(0);
    }
  });

  it("marks aClickAttraction for DynamicDraw (orb's d3-force partial updates)", () => {
    const geometry = makeGeometry(128);
    bakeFieldAttributes(geometry, { random: seededRandom(1) });
    const attr = geometry.getAttribute("aClickAttraction")!;
    expect(attr.usage).toBe(DynamicDrawUsage);
  });

  it("lands-mode is bit-exact reproducible across calls with the same seed", () => {
    const geometry1 = makeGeometry(512);
    const geometry2 = makeGeometry(512);
    bakeFieldAttributes(geometry1, { random: seededRandom(9001) });
    bakeFieldAttributes(geometry2, { random: seededRandom(9001) });

    for (const name of [
      "aMove",
      "aSpeed",
      "aRandomness",
      "aAlpha",
      "aSelection",
      "aIndex",
      "aStreamFreq",
      "aFunnelThickness",
      "aFunnelNarrow",
      "aFunnelStartShift",
      "aFunnelEndShift",
      "aBucket",
      "aSizeFactor",
      "aLogicalPaperId",
      "aClickAttraction",
    ]) {
      const a = geometry1.getAttribute(name)!.array as Float32Array;
      const b = geometry2.getAttribute(name)!.array as Float32Array;
      expect(a.length).toBe(b.length);
      for (let i = 0; i < a.length; i += 1) {
        expect(a[i]).toBe(b[i]);
      }
    }
  });
});
