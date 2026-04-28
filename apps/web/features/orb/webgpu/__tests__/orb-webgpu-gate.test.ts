import { selectOrbWebGpuProfile } from "../orb-webgpu-gate";

function adapterWithStorageLimit(limit: number): GPUAdapter {
  return {
    limits: {
      maxStorageBufferBindingSize: limit,
    },
  } as unknown as GPUAdapter;
}

describe("selectOrbWebGpuProfile", () => {
  it("uses a high-density profile for large storage-buffer budgets", () => {
    expect(
      selectOrbWebGpuProfile(adapterWithStorageLimit(128 * 1024 * 1024)).name,
    ).toBe("high-density");
  });

  it("keeps smaller WebGPU devices on WebGPU-only lower-density profiles", () => {
    expect(
      selectOrbWebGpuProfile(adapterWithStorageLimit(32 * 1024 * 1024)).name,
    ).toBe("standard");
    expect(selectOrbWebGpuProfile(adapterWithStorageLimit(4 * 1024 * 1024)).name).toBe(
      "minimal",
    );
  });
});
