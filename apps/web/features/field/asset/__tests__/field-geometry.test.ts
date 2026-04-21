import { FieldGeometry, type ImageLikeData } from "../field-geometry";

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

describe("FieldGeometry.sphere", () => {
  it("returns the requested number of points on the unit sphere", () => {
    const geometry = FieldGeometry.sphere({ count: 256, random: seededRandom(1) });
    const position = geometry.getAttribute("position")!.array as Float32Array;
    expect(position.length).toBe(256 * 3);
    for (let i = 0; i < 256; i += 1) {
      const x = position[i * 3]!;
      const y = position[i * 3 + 1]!;
      const z = position[i * 3 + 2]!;
      const length = Math.hypot(x, y, z);
      expect(length).toBeCloseTo(1, 4);
    }
  });

  it("defaults to Maze's 16384 count when no options are given", () => {
    const geometry = FieldGeometry.sphere({ random: seededRandom(1) });
    expect(geometry.getAttribute("position")!.count).toBe(16384);
  });

  it("respects the radius option", () => {
    const geometry = FieldGeometry.sphere({
      count: 64,
      radius: 2.5,
      random: seededRandom(1),
    });
    const position = geometry.getAttribute("position")!.array as Float32Array;
    for (let i = 0; i < 64; i += 1) {
      const x = position[i * 3]!;
      const y = position[i * 3 + 1]!;
      const z = position[i * 3 + 2]!;
      expect(Math.hypot(x, y, z)).toBeCloseTo(2.5, 4);
    }
  });
});

describe("FieldGeometry.stream", () => {
  it("seeds points along the x axis with y = z = 0", () => {
    const geometry = FieldGeometry.stream({
      count: 128,
      random: seededRandom(1),
    });
    const position = geometry.getAttribute("position")!.array as Float32Array;
    expect(position.length).toBe(128 * 3);
    for (let i = 0; i < 128; i += 1) {
      expect(position[i * 3 + 1]).toBe(0);
      expect(position[i * 3 + 2]).toBe(0);
      expect(position[i * 3]!).toBeGreaterThanOrEqual(-2);
      expect(position[i * 3]!).toBeLessThanOrEqual(2);
    }
  });
});

describe("FieldGeometry.fromTexture", () => {
  function makeImage(): ImageLikeData {
    // 4x4 image where pixel (1,2) has red > threshold. All other pixels 0.
    const data = new Uint8ClampedArray(4 * 4 * 4);
    const targetX = 1;
    const targetY = 2;
    const offset = (targetY * 4 + targetX) * 4;
    data[offset] = 250;
    data[offset + 3] = 255;
    return { width: 4, height: 4, data };
  }

  it("emits `layers * 2` points per bright pixel under the default red channel", () => {
    const image = makeImage();
    const geometry = FieldGeometry.fromTexture(image, {
      appendExtents: false,
      textureScale: 1,
      gridRandomness: 0,
      thickness: 0,
      layers: 1,
      colorThreshold: 200,
      random: seededRandom(1),
    });
    const position = geometry.getAttribute("position")!.array as Float32Array;
    expect(position.length).toBe(2 * 3);
    // Both emissions point at the same (x, y), z = +0 / -0.
    expect(position[0]).toBe(position[3]);
    expect(position[1]).toBe(position[4]);
  });

  it("respects the luma channel option for non-red inputs", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    const targetOffset = (1 * 4 + 2) * 4;
    data[targetOffset] = 0;
    data[targetOffset + 1] = 250;
    data[targetOffset + 2] = 0;
    data[targetOffset + 3] = 255;
    const image: ImageLikeData = { width: 4, height: 4, data };

    const redChannel = FieldGeometry.fromTexture(image, {
      appendExtents: false,
      textureScale: 1,
      gridRandomness: 0,
      thickness: 0,
      layers: 1,
      colorThreshold: 200,
      channel: "r",
      random: seededRandom(1),
    });
    expect(redChannel.getAttribute("position")!.array.length).toBe(0);

    const lumaChannel = FieldGeometry.fromTexture(image, {
      appendExtents: false,
      textureScale: 1,
      gridRandomness: 0,
      thickness: 0,
      layers: 1,
      colorThreshold: 120,
      channel: "luma",
      random: seededRandom(1),
    });
    expect(lumaChannel.getAttribute("position")!.array.length).toBe(2 * 3);
  });
});

describe("FieldGeometry.fromVertices", () => {
  it("emits exactly countFactor points per vertex for integer counts", () => {
    const source = new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    const geometry = FieldGeometry.fromVertices(source, {
      countFactor: 5,
      positionRandomness: 0,
      random: seededRandom(1),
    });
    expect(geometry.getAttribute("position")!.count).toBe(15);
  });

  it("produces ~countFactor * vertexCount points on fractional counts", () => {
    const source = new Float32Array(3000);
    // 1000 vertices at origin.
    for (let i = 0; i < 1000; i += 1) {
      source[i * 3] = i * 0.01;
    }
    const geometry = FieldGeometry.fromVertices(source, {
      countFactor: 1.2,
      positionRandomness: 0,
      random: seededRandom(9),
    });
    const count = geometry.getAttribute("position")!.count;
    // Expect 1.2 * 1000 = 1200 ± 5% (seeded RNG variance).
    expect(count).toBeGreaterThan(1200 * 0.95);
    expect(count).toBeLessThan(1200 * 1.05);
  });

  it("applies positionRandomness jitter", () => {
    const source = new Float32Array([0, 0, 0]);
    const geometry = FieldGeometry.fromVertices(source, {
      countFactor: 1,
      positionRandomness: 0.1,
      random: seededRandom(5),
    });
    const position = geometry.getAttribute("position")!.array as Float32Array;
    // Jitter is ±0.05; expect coordinates within that band.
    expect(Math.abs(position[0]!)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(position[1]!)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(position[2]!)).toBeLessThanOrEqual(0.05);
  });
});
