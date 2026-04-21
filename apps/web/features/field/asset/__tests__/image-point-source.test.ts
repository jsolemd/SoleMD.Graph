import { createImagePointGeometry } from "../image-point-source";
import type { ImageLikeData } from "../field-geometry";

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

function makeRedPixelImage(): ImageLikeData {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  const offset = (2 * 4 + 1) * 4;
  data[offset] = 250;
  data[offset + 3] = 255;
  return { width: 4, height: 4, data };
}

describe("createImagePointGeometry", () => {
  it("routes ImageLikeData directly to FieldGeometry.fromTexture", async () => {
    const geometry = await createImagePointGeometry(makeRedPixelImage(), {
      appendExtents: false,
      textureScale: 1,
      gridRandomness: 0,
      thickness: 0,
      layers: 1,
      colorThreshold: 200,
      random: seededRandom(1),
    });
    expect(geometry.getAttribute("position")!.array.length).toBe(2 * 3);
  });

  it("respects the layers option", async () => {
    const geometry = await createImagePointGeometry(makeRedPixelImage(), {
      appendExtents: false,
      textureScale: 1,
      gridRandomness: 0,
      thickness: 0,
      layers: 3,
      colorThreshold: 200,
      random: seededRandom(1),
    });
    // layers * 2 emissions per bright pixel.
    expect(geometry.getAttribute("position")!.array.length).toBe(3 * 2 * 3);
  });

  it("yields zero points when no pixel exceeds the threshold", async () => {
    const empty: ImageLikeData = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray(2 * 2 * 4),
    };
    const geometry = await createImagePointGeometry(empty, {
      appendExtents: false,
      textureScale: 1,
      gridRandomness: 0,
      thickness: 0,
      layers: 1,
      colorThreshold: 200,
      random: seededRandom(1),
    });
    expect(geometry.getAttribute("position")!.array.length).toBe(0);
  });
});
