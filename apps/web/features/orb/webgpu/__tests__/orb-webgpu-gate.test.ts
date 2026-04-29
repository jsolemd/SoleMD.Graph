import {
  ORB_PARTICLE_CAPACITY,
  ORB_PARTICLE_DISPLAY_BYTES,
} from "../../bake/orb-particle-constants";
import { selectOrbWebGpuProfile } from "../orb-webgpu-gate";

function adapterWithStorageLimit(limit: number): GPUAdapter {
  return {
    limits: {
      maxStorageBufferBindingSize: limit,
    },
  } as unknown as GPUAdapter;
}

describe("selectOrbWebGpuProfile", () => {
  it("hits full ORB_PARTICLE_CAPACITY when the adapter binding fits it", () => {
    const enoughBytes = ORB_PARTICLE_CAPACITY * ORB_PARTICLE_DISPLAY_BYTES * 4;
    const profile = selectOrbWebGpuProfile(adapterWithStorageLimit(enoughBytes));
    expect(profile.maxParticles).toBe(ORB_PARTICLE_CAPACITY);
    expect(profile.radiusScale).toBeCloseTo(1, 6);
    expect(profile.name).toBe("full-density");
  });

  it("clamps maxParticles down when the adapter binding cannot hold the full count", () => {
    // Half the bytes needed to fit ORB_PARTICLE_CAPACITY at 48 B each.
    const halfFitBytes = (ORB_PARTICLE_CAPACITY * ORB_PARTICLE_DISPLAY_BYTES) / 2;
    const profile = selectOrbWebGpuProfile(adapterWithStorageLimit(halfFitBytes));
    expect(profile.maxParticles).toBe(ORB_PARTICLE_CAPACITY / 2);
    expect(profile.name).toBe("capacity-limited");
  });

  it("compensates for sparse density by scaling the visual radius up", () => {
    // Quarter-fit → maxParticles is a quarter of capacity → radiusScale is
    // (4)^0.25 = sqrt(2) ≈ 1.414.
    const quarterFitBytes = (ORB_PARTICLE_CAPACITY * ORB_PARTICLE_DISPLAY_BYTES) / 4;
    const profile = selectOrbWebGpuProfile(adapterWithStorageLimit(quarterFitBytes));
    expect(profile.radiusScale).toBeCloseTo(Math.SQRT2, 4);
  });

  it("never returns zero maxParticles even when the adapter reports nothing", () => {
    const profile = selectOrbWebGpuProfile(adapterWithStorageLimit(0));
    expect(profile.maxParticles).toBeGreaterThanOrEqual(1);
  });
});
