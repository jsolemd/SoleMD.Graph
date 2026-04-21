import {
  FIELD_BUCKET_INDEX,
  resolveFieldPointSources,
  SOLEMD_DEFAULT_BUCKETS,
} from "../point-source-registry";

describe("resolveFieldPointSources", () => {
  it("builds the canonical landing point counts for the active stage families", () => {
    const desktopSources = resolveFieldPointSources({
      densityScale: 1,
      isMobile: false,
    });
    const mobileSources = resolveFieldPointSources({
      densityScale: 1,
      isMobile: true,
    });

    expect(desktopSources.blob.pointCount).toBe(16384);
    expect(desktopSources.stream.pointCount).toBe(15000);
    expect(mobileSources.stream.pointCount).toBe(10000);
    expect(desktopSources.objectFormation.pointCount).toBeGreaterThan(0);
  });

  it("reuses cached sources for stable density/mobile keys", () => {
    const first = resolveFieldPointSources({
      densityScale: 1,
      isMobile: false,
    });
    const second = resolveFieldPointSources({
      densityScale: 1,
      isMobile: false,
    });

    expect(second.blob).toBe(first.blob);
    expect(second.stream).toBe(first.stream);
    expect(second.objectFormation).toBe(first.objectFormation);
  });

  it("keeps the stream seeded on the x axis before shader funneling takes over", () => {
    const { stream } = resolveFieldPointSources({
      densityScale: 1,
      isMobile: false,
    });

    const sampleCount = Math.min(120, stream.pointCount);
    for (let index = 0; index < sampleCount; index += 1) {
      const y = stream.buffers.position[index * 3 + 1]!;
      const z = stream.buffers.position[index * 3 + 2]!;

      expect(y).toBe(0);
      expect(z).toBe(0);
    }
  });

  it("keeps shared alpha seeding inside the canonical 0.2 to 1.0 range", () => {
    const { blob, stream, objectFormation } = resolveFieldPointSources({
      densityScale: 1,
      isMobile: false,
    });

    for (const source of [blob, stream, objectFormation]) {
      const sampleCount = Math.min(512, source.pointCount);
      for (let index = 0; index < sampleCount; index += 1) {
        const alpha = source.buffers.aAlpha[index]!;
        expect(alpha).toBeGreaterThanOrEqual(0.2);
        expect(alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it("exposes an aBucket attribute aligned with the SoleMD bucket index", () => {
    const { blob } = resolveFieldPointSources({
      densityScale: 1,
      isMobile: false,
    });
    expect(blob.buffers.aBucket.length).toBe(blob.pointCount);
    for (let index = 0; index < Math.min(512, blob.pointCount); index += 1) {
      const bucket = blob.buffers.aBucket[index]!;
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(SOLEMD_DEFAULT_BUCKETS.length);
      expect(Number.isInteger(bucket)).toBe(true);
    }
    expect(FIELD_BUCKET_INDEX.paper).toBe(0);
    expect(FIELD_BUCKET_INDEX.evidence).toBe(3);
  });

  it("produces a bucket histogram within 2% of SoleMD weights on the blob", () => {
    const { blob } = resolveFieldPointSources({
      densityScale: 1,
      isMobile: false,
    });
    const counts = new Array(SOLEMD_DEFAULT_BUCKETS.length).fill(0);
    for (let index = 0; index < blob.pointCount; index += 1) {
      counts[blob.buffers.aBucket[index]!] += 1;
    }
    SOLEMD_DEFAULT_BUCKETS.forEach((bucket, index) => {
      const observed = counts[index] / blob.pointCount;
      expect(Math.abs(observed - bucket.weight)).toBeLessThan(0.02);
    });
  });

  it("seeds stream funnel attributes with both positive and negative profile branches", () => {
    const { stream } = resolveFieldPointSources({
      densityScale: 1,
      isMobile: false,
    });

    const sampleCount = Math.min(1024, stream.pointCount);
    let minFreq = Number.POSITIVE_INFINITY;
    let maxFreq = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < sampleCount; index += 1) {
      const freq = stream.buffers.aStreamFreq[index]!;
      minFreq = Math.min(minFreq, freq);
      maxFreq = Math.max(maxFreq, freq);
    }

    expect(minFreq).toBeLessThan(0);
    expect(maxFreq).toBeGreaterThan(0);
  });
});
