import { BufferAttribute, BufferGeometry } from "three";

import { bakeFieldAttributes } from "@/features/field/asset/field-attribute-baker";
import { applyPaperAttributeOverrides } from "../apply-paper-overrides";
import type { PaperAttributesMap } from "../use-paper-attributes-baker";

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

function makeBakedGeometry(pointCount: number, seed = 1): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(pointCount * 3), 3),
  );
  bakeFieldAttributes(geometry, { random: seededRandom(seed) });
  return geometry;
}

describe("applyPaperAttributeOverrides", () => {
  it("no-op when the map is empty", () => {
    const geometry = makeBakedGeometry(64);
    const aSpeedBefore = new Float32Array(
      (geometry.getAttribute("aSpeed")!.array as Float32Array).slice(),
    );
    applyPaperAttributeOverrides(geometry, new Map());
    const aSpeedAfter = geometry.getAttribute("aSpeed")!.array as Float32Array;
    for (let i = 0; i < aSpeedBefore.length; i += 1) {
      expect(aSpeedAfter[i]).toBe(aSpeedBefore[i]);
    }
  });

  it("overrides aBucket=0 and rewrites aSpeed/aClickPack.w where paper data is present", () => {
    const pointCount = 256;
    const geometry = makeBakedGeometry(pointCount);
    const paperAttributes: PaperAttributesMap = new Map();
    for (let i = 0; i < pointCount / 2; i += 1) {
      paperAttributes.set(i, {
        paperId: `paper-${i}`,
        clusterId: i % 10,
        refCount: i * 3,
        entityCount: (i % 20) + 1,
        relationCount: i % 5,
        year: 2020,
      });
    }
    applyPaperAttributeOverrides(geometry, paperAttributes);

    const aBucket = geometry.getAttribute("aBucket")!.array as Float32Array;
    const aClickPack = geometry.getAttribute("aClickPack")!.array as Float32Array;
    const aSpeed = geometry.getAttribute("aSpeed")!.array as Float32Array;

    for (let i = 0; i < pointCount / 2; i += 1) {
      expect(aBucket[i]).toBe(0);
      // aClickPack.w (every 4th float) holds sizeFactor, mapped into
      // [0.8, 2.6] via log-percentile-pow shape.
      expect(aClickPack[i * 4 + 3]!).toBeGreaterThanOrEqual(0.8);
      expect(aClickPack[i * 4 + 3]!).toBeLessThanOrEqual(2.6);
      // All three axes share the same citation-derived speed.
      expect(aSpeed[i * 3]).toBe(aSpeed[i * 3 + 1]);
      expect(aSpeed[i * 3 + 1]).toBe(aSpeed[i * 3 + 2]);
      // Speed factor is bounded into [0.55, 1.75] — never zero, never
      // the hyperactive 3.0 of the pre-port mapping.
      expect(aSpeed[i * 3]!).toBeGreaterThanOrEqual(0.55);
      expect(aSpeed[i * 3]!).toBeLessThanOrEqual(1.75);
    }
    // Particles without paper data keep lands-mode defaults. aBucket
    // retains whatever lands-mode picked (one of 0..3).
    for (let i = pointCount / 2; i < pointCount; i += 1) {
      expect(aClickPack[i * 4 + 3]).toBe(1); // sizeFactor lands-mode default
      expect([0, 1, 2, 3]).toContain(aBucket[i]);
    }
  });

  it("rewrites aStreamFreq / funnel attributes to the paper bucket values for overridden particles", () => {
    const geometry = makeBakedGeometry(32);
    const paperAttributes: PaperAttributesMap = new Map([
      [
        0,
        {
          paperId: "x",
          clusterId: 0,
          refCount: 5,
          entityCount: 5,
          relationCount: 5,
          year: null,
        },
      ],
    ]);
    applyPaperAttributeOverrides(geometry, paperAttributes);
    const aStreamFreq = geometry.getAttribute("aStreamFreq")!.array as Float32Array;
    const aFunnelThickness = geometry.getAttribute("aFunnelThickness")!
      .array as Float32Array;
    // Paper bucket values from SOLEMD_DEFAULT_BUCKETS[0]:
    //   aStreamFreq: 0.1, aFunnelThickness: 0.1
    expect(aStreamFreq[0]).toBeCloseTo(0.1, 6);
    expect(aFunnelThickness[0]).toBeCloseTo(0.1, 6);
  });

  it("high citation counts produce low speed (gravitational anchors)", () => {
    const geometry = makeBakedGeometry(4);
    const paperAttributes: PaperAttributesMap = new Map([
      [0, { paperId: "a", clusterId: 0, refCount: 0, entityCount: 1, relationCount: 0, year: null }],
      [1, { paperId: "b", clusterId: 0, refCount: 10, entityCount: 1, relationCount: 0, year: null }],
      [2, { paperId: "c", clusterId: 0, refCount: 100, entityCount: 1, relationCount: 0, year: null }],
      [3, { paperId: "d", clusterId: 0, refCount: 1000, entityCount: 1, relationCount: 0, year: null }],
    ]);
    // Stats anchored at the supplied min/max in log space. The applier
    // maps log1p(refCount) into [refLo, refHi] via gamma-eased pow.
    applyPaperAttributeOverrides(geometry, paperAttributes, {
      stats: {
        refLo: Math.log1p(0),
        refHi: Math.log1p(1000),
        entityLo: Math.log1p(1),
        entityHi: Math.log1p(1),
      },
    });
    const aSpeed = geometry.getAttribute("aSpeed")!.array as Float32Array;
    // Particle i's X speed lives at aSpeed[i * 3]. Higher refCount →
    // lower speed factor (monotonic via the FAST→SLOW mix).
    expect(aSpeed[0 * 3]!).toBeGreaterThan(aSpeed[1 * 3]!);
    expect(aSpeed[1 * 3]!).toBeGreaterThan(aSpeed[2 * 3]!);
    expect(aSpeed[2 * 3]!).toBeGreaterThan(aSpeed[3 * 3]!);
    // Most-cited paper (refCount == refHi anchor) lands at the SLOW end.
    expect(aSpeed[3 * 3]!).toBeCloseTo(0.55, 5);
    // Uncited paper (refCount == refLo anchor) lands at the FAST end.
    expect(aSpeed[0 * 3]!).toBeCloseTo(1.75, 5);
  });

  it("bumps BufferAttribute.version on mutated attributes so the GPU resyncs", () => {
    // THREE.BufferAttribute's `needsUpdate` is a setter-only property that
    // increments `version`; reading it returns undefined. Assert the
    // observable effect (version bump) instead.
    const geometry = makeBakedGeometry(16);
    const paperAttributes: PaperAttributesMap = new Map([
      [0, { paperId: "x", clusterId: 0, refCount: 1, entityCount: 1, relationCount: 0, year: null }],
    ]);
    const namesToCheck = [
      "aSpeed",
      "aClickPack",
      "aBucket",
      "aStreamFreq",
      "aFunnelThickness",
      "aFunnelNarrow",
      "aFunnelStartShift",
      "aFunnelEndShift",
    ];
    const before: Record<string, number> = {};
    for (const name of namesToCheck) {
      before[name] = geometry.getAttribute(name)!.version;
    }
    applyPaperAttributeOverrides(geometry, paperAttributes);
    for (const name of namesToCheck) {
      expect(geometry.getAttribute(name)!.version).toBeGreaterThan(before[name]!);
    }
  });

  it("throws when the geometry hasn't been baked first", () => {
    const bare = new BufferGeometry();
    bare.setAttribute("position", new BufferAttribute(new Float32Array(9), 3));
    const paperAttributes: PaperAttributesMap = new Map([
      [0, { paperId: "x", clusterId: 0, refCount: 1, entityCount: 1, relationCount: 0, year: null }],
    ]);
    expect(() =>
      applyPaperAttributeOverrides(bare, paperAttributes),
    ).toThrow(/missing field-shader attributes/);
  });

  it("addUpdateRange marks the contiguous slice, not the whole buffer", () => {
    const pointCount = 128;
    const geometry = makeBakedGeometry(pointCount);
    const paperAttributes: PaperAttributesMap = new Map();
    // Chunk covers particles 10..19 — contiguous range of 10.
    for (let i = 10; i < 20; i += 1) {
      paperAttributes.set(i, {
        paperId: `p-${i}`,
        clusterId: 0,
        refCount: i,
        entityCount: 1,
        relationCount: 0,
        year: null,
      });
    }
    applyPaperAttributeOverrides(geometry, paperAttributes);

    // aBucket (itemSize=1): offset=10, count=10
    const aBucket = geometry.getAttribute("aBucket")!;
    expect(aBucket.updateRanges).toEqual([{ start: 10, count: 10 }]);
    // aSpeed (itemSize=3): offset=30, count=30
    const aSpeed = geometry.getAttribute("aSpeed")!;
    expect(aSpeed.updateRanges).toEqual([{ start: 30, count: 30 }]);
    // aClickPack (itemSize=4): offset=40, count=40
    const aClickPack = geometry.getAttribute("aClickPack")!;
    expect(aClickPack.updateRanges).toEqual([{ start: 40, count: 40 }]);
  });

  it("calls the invalidate callback when provided", () => {
    const geometry = makeBakedGeometry(16);
    const paperAttributes: PaperAttributesMap = new Map([
      [0, { paperId: "x", clusterId: 0, refCount: 1, entityCount: 1, relationCount: 0, year: null }],
    ]);
    const invalidate = jest.fn();
    applyPaperAttributeOverrides(geometry, paperAttributes, { invalidate });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("does not invalidate when the map is empty", () => {
    const geometry = makeBakedGeometry(16);
    const invalidate = jest.fn();
    applyPaperAttributeOverrides(geometry, new Map(), { invalidate });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
