import { Color } from "three";
import { AMBIENT_FIELD_BUCKET_INDEX } from "../../asset/point-source-registry";
import { SOLEMD_BURST_COLORS } from "../../scene/burst-config";
import { createBurstController } from "../burst-controller";

function syntheticMaterial() {
  return {
    uniforms: {
      uBurstType: { value: -1 },
      uBurstStrength: { value: 0 },
      uBurstColor: { value: new Color("#000000") },
      uBurstRegionScale: { value: 0 },
      uBurstSoftness: { value: 0 },
    },
  };
}

function settleAndRead(
  controller: ReturnType<typeof createBurstController>,
): ReturnType<typeof syntheticMaterial> {
  // Step past the 1 ms half-life so strength settles to ~1.
  for (let i = 0; i < 10; i += 1) controller.step(16);
  const material = syntheticMaterial();
  controller.apply(material as never);
  return material;
}

describe("createBurstController", () => {
  it("resolves the canonical semantic color per active bucket", () => {
    const controller = createBurstController({
      bucketIndex: AMBIENT_FIELD_BUCKET_INDEX,
      semanticColorMap: SOLEMD_BURST_COLORS,
      halfLifeMs: 1,
    });

    for (const bucket of ["paper", "entity", "relation", "evidence"]) {
      controller.setActive(bucket, 1);
      const material = settleAndRead(controller);
      const expected = new Color(SOLEMD_BURST_COLORS[bucket]!);
      expect(material.uniforms.uBurstColor.value.r).toBeCloseTo(expected.r, 5);
      expect(material.uniforms.uBurstColor.value.g).toBeCloseTo(expected.g, 5);
      expect(material.uniforms.uBurstColor.value.b).toBeCloseTo(expected.b, 5);
      expect(material.uniforms.uBurstType.value).toBe(
        AMBIENT_FIELD_BUCKET_INDEX[bucket],
      );
    }
  });

  it("clears burst type when setActive is null", () => {
    const controller = createBurstController({
      bucketIndex: AMBIENT_FIELD_BUCKET_INDEX,
      semanticColorMap: SOLEMD_BURST_COLORS,
      halfLifeMs: 1,
    });
    controller.setActive("paper", 1);
    controller.step(16);
    controller.setActive(null, 0);
    for (let i = 0; i < 30; i += 1) controller.step(16);
    const material = syntheticMaterial();
    controller.apply(material as never);
    expect(material.uniforms.uBurstType.value).toBe(-1);
    expect(material.uniforms.uBurstStrength.value).toBeLessThan(0.05);
  });
});
