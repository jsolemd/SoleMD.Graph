import type { PaperChunk } from "../../stores/geometry-mutation-store";
import {
  ORB_WEBGPU_EVIDENCE_FLAG,
  ORB_WEBGPU_FOCUS_FLAG,
  ORB_WEBGPU_HOVER_FLAG,
  ORB_WEBGPU_NEIGHBOR_FLAG,
  ORB_WEBGPU_SCOPE_FLAG,
  ORB_WEBGPU_SELECTION_FLAG,
  buildOrbWebGpuFlagArray,
  buildOrbWebGpuParticleArrays,
} from "../orb-webgpu-particles";

describe("orb WebGPU particle packing", () => {
  it("packs paper chunks into storage-buffer arrays", () => {
    const chunk: PaperChunk = {
      attributes: new Map([
        [
          1,
          {
            paperId: "paper-1",
            pointId: "point-1",
            clusterId: 7,
            displayLabel: "Paper 1",
            entityCount: 24,
            refCount: 120,
            relationCount: 4,
            x: 320,
            y: -160,
            year: 2024,
          },
        ],
      ]),
      stats: {
        entityHi: Math.log1p(100),
        entityLo: Math.log1p(0),
        refHi: Math.log1p(200),
        refLo: Math.log1p(0),
      },
    };

    const arrays = buildOrbWebGpuParticleArrays({
      chunks: [chunk],
      focus: {
        evidenceIndices: [],
        focusIndex: null,
        hoverIndex: null,
        neighborIndices: [],
        scopeIndices: [],
        selectionIndices: [],
      },
      requestedCount: 8,
    });

    expect(arrays.count).toBe(8);
    expect(arrays.positions[1 * 4]).toBeGreaterThan(0);
    expect(arrays.positions[1 * 4 + 1]).toBeLessThan(0);
    expect(arrays.positions[1 * 4 + 3]).toBeGreaterThan(0.0065);
    expect(arrays.attributes[1 * 4]).toBeGreaterThan(0);
    expect(arrays.attributes[1 * 4 + 3]).toBeGreaterThanOrEqual(0.55);
    expect(arrays.attributes[1 * 4 + 3]).toBeLessThanOrEqual(1.75);
  });

  it("packs focus, hover, evidence, scope, selection, and neighbor flags", () => {
    const flags = buildOrbWebGpuFlagArray(8, {
      evidenceIndices: [1, 3],
      focusIndex: 2,
      hoverIndex: 4,
      neighborIndices: [5],
      scopeIndices: [6],
      selectionIndices: [7],
    });

    expect(flags[1]! & ORB_WEBGPU_EVIDENCE_FLAG).toBeTruthy();
    expect(flags[2]! & ORB_WEBGPU_FOCUS_FLAG).toBeTruthy();
    expect(flags[3]! & ORB_WEBGPU_EVIDENCE_FLAG).toBeTruthy();
    expect(flags[4]! & ORB_WEBGPU_HOVER_FLAG).toBeTruthy();
    expect(flags[5]! & ORB_WEBGPU_NEIGHBOR_FLAG).toBeTruthy();
    expect(flags[6]! & ORB_WEBGPU_SCOPE_FLAG).toBeTruthy();
    expect(flags[7]! & ORB_WEBGPU_SELECTION_FLAG).toBeTruthy();
  });
});
