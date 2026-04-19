import { resolveAmbientFieldPointSources } from "../point-source-registry";

describe("resolveAmbientFieldPointSources", () => {
  it("builds Maze-parity point counts for the canonical homepage scenes", () => {
    const desktopSources = resolveAmbientFieldPointSources({
      densityScale: 1,
      isMobile: false,
    });
    const mobileSources = resolveAmbientFieldPointSources({
      densityScale: 1,
      isMobile: true,
    });

    expect(desktopSources.blob.pointCount).toBe(16384);
    expect(desktopSources.stream.pointCount).toBe(15000);
    expect(mobileSources.stream.pointCount).toBe(10000);
    expect(desktopSources.pcb.pointCount).toBeGreaterThan(0);
  });

  it("reuses cached sources for stable density/mobile keys", () => {
    const first = resolveAmbientFieldPointSources({
      densityScale: 1,
      isMobile: false,
    });
    const second = resolveAmbientFieldPointSources({
      densityScale: 1,
      isMobile: false,
    });

    expect(second.blob).toBe(first.blob);
    expect(second.stream).toBe(first.stream);
    expect(second.pcb).toBe(first.pcb);
  });

  it("keeps the stream seeded on the x axis before shader funneling takes over", () => {
    const { stream } = resolveAmbientFieldPointSources({
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

  it("keeps shared alpha seeding inside the Maze-style 0.2 to 1.0 range", () => {
    const { blob, stream, pcb } = resolveAmbientFieldPointSources({
      densityScale: 1,
      isMobile: false,
    });

    for (const source of [blob, stream, pcb]) {
      const sampleCount = Math.min(512, source.pointCount);
      for (let index = 0; index < sampleCount; index += 1) {
        const alpha = source.buffers.aAlpha[index]!;
        expect(alpha).toBeGreaterThanOrEqual(0.2);
        expect(alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it("seeds stream funnel attributes with both positive and negative profile branches", () => {
    const { stream } = resolveAmbientFieldPointSources({
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
