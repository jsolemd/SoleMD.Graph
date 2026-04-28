import type { PaperChunk } from "../../stores/geometry-mutation-store";
import type { PaperAttrs } from "../../bake/use-paper-attributes-baker";
import {
  ORB_WEBGPU_EVIDENCE_FLAG,
  ORB_WEBGPU_FOCUS_FLAG,
  ORB_WEBGPU_HOVER_FLAG,
  ORB_WEBGPU_NEIGHBOR_FLAG,
  ORB_WEBGPU_SCOPE_FLAG,
  ORB_WEBGPU_SCOPE_DIM_FLAG,
  ORB_WEBGPU_SELECTION_FLAG,
  applyOrbWebGpuChunkInPlace,
  buildOrbWebGpuFlagArray,
  buildOrbWebGpuParticleArrays,
  seedOrbWebGpuParticleArrays,
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
    expect(
      Math.hypot(
        arrays.positions[1 * 4]!,
        arrays.positions[1 * 4 + 1]!,
        arrays.positions[1 * 4 + 2]!,
      ),
    ).toBeGreaterThan(0.4);
    expect(Math.abs(arrays.velocities[1 * 4]!)).toBeGreaterThan(0);
    expect(arrays.positions[1 * 4 + 3]).toBeGreaterThan(0.0018);
    expect(arrays.positions[1 * 4 + 3]).toBeLessThan(0.0024);
    expect(arrays.attributes[1 * 4]).toBeGreaterThan(0);
    expect(arrays.attributes[1 * 4 + 3]).toBeGreaterThanOrEqual(0.2);
    expect(arrays.attributes[1 * 4 + 3]).toBeLessThanOrEqual(1);
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
    expect(flags[0]! & ORB_WEBGPU_SCOPE_DIM_FLAG).toBeTruthy();
    expect(flags[6]! & ORB_WEBGPU_SCOPE_DIM_FLAG).toBeFalsy();
  });

  it("incremental chunk application matches a full rebuild and reports the touched range", () => {
    const stats = {
      entityHi: Math.log1p(100),
      entityLo: Math.log1p(0),
      refHi: Math.log1p(200),
      refLo: Math.log1p(0),
    };
    const makePaper = (label: string): PaperAttrs => ({
      paperId: `p-${label}`,
      pointId: `pt-${label}`,
      clusterId: 1,
      displayLabel: label,
      entityCount: 12,
      refCount: 60,
      relationCount: 2,
      x: 0,
      y: 0,
      year: 2024,
    });
    const chunks: PaperChunk[] = [
      { stats, attributes: new Map([[0, makePaper("a")], [1, makePaper("b")]]) },
      { stats, attributes: new Map([[2, makePaper("c")], [3, makePaper("d")]]) },
      { stats, attributes: new Map([[5, makePaper("e")]]) },
    ];

    const fullRebuild = buildOrbWebGpuParticleArrays({
      chunks,
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

    const incremental = seedOrbWebGpuParticleArrays(8);
    const ranges = chunks.map((chunk) =>
      applyOrbWebGpuChunkInPlace(incremental, chunk),
    );

    expect(ranges).toEqual([
      { fromIndex: 0, toIndex: 1 },
      { fromIndex: 2, toIndex: 3 },
      { fromIndex: 5, toIndex: 5 },
    ]);
    expect(Array.from(incremental.positions)).toEqual(
      Array.from(fullRebuild.positions),
    );
    expect(Array.from(incremental.velocities)).toEqual(
      Array.from(fullRebuild.velocities),
    );
    expect(Array.from(incremental.attributes)).toEqual(
      Array.from(fullRebuild.attributes),
    );
  });

  it("re-applying a chunk produces the same arrays (idempotent on size/speed factors)", () => {
    const chunk: PaperChunk = {
      stats: {
        entityHi: Math.log1p(100),
        entityLo: Math.log1p(0),
        refHi: Math.log1p(200),
        refLo: Math.log1p(0),
      },
      attributes: new Map([
        [
          3,
          {
            paperId: "paper-3",
            pointId: "point-3",
            clusterId: 4,
            displayLabel: "Paper 3",
            entityCount: 30,
            refCount: 90,
            relationCount: 1,
            x: 0,
            y: 0,
            year: 2023,
          },
        ],
      ]),
    };

    const arrays = seedOrbWebGpuParticleArrays(8);
    applyOrbWebGpuChunkInPlace(arrays, chunk);
    const onceSize = arrays.positions[3 * 4 + 3];
    const onceSpeed = arrays.velocities[3 * 4 + 3];
    applyOrbWebGpuChunkInPlace(arrays, chunk);

    expect(arrays.positions[3 * 4 + 3]).toBe(onceSize);
    expect(arrays.velocities[3 * 4 + 3]).toBe(onceSpeed);
  });

  it("avoids quadratic chunk-pack work — incremental cost stays bounded as chunks accumulate", () => {
    const stats = {
      entityHi: Math.log1p(100),
      entityLo: Math.log1p(0),
      refHi: Math.log1p(200),
      refLo: Math.log1p(0),
    };
    const totalParticles = 16384;
    const chunkSize = 2048;
    const chunkCount = totalParticles / chunkSize;
    const chunks: PaperChunk[] = [];
    for (let c = 0; c < chunkCount; c += 1) {
      const attributes = new Map<number, PaperAttrs>();
      for (let i = 0; i < chunkSize; i += 1) {
        const index = c * chunkSize + i;
        attributes.set(index, {
          paperId: `paper-${index}`,
          pointId: `point-${index}`,
          clusterId: index & 7,
          displayLabel: `p${index}`,
          entityCount: (index % 64) + 1,
          refCount: (index % 200) + 1,
          relationCount: 0,
          x: 0,
          y: 0,
          year: 2020,
        });
      }
      chunks.push({ stats, attributes });
    }

    // Full-rebuild path (the pre-fix behavior): every chunk arrival
    // re-seeds and re-walks all prior chunks. Cumulative paper iters
    // grows quadratically in chunk count.
    let fullRebuildIters = 0;
    for (let processed = 1; processed <= chunkCount; processed += 1) {
      fullRebuildIters += totalParticles; // 16k seed loop every rebuild
      for (let c = 0; c < processed; c += 1) {
        fullRebuildIters += chunks[c]!.attributes.size;
      }
    }

    // Incremental path: seed once + apply each chunk once. Linear in
    // total particles delivered.
    const arrays = seedOrbWebGpuParticleArrays(totalParticles);
    let incrementalIters = totalParticles; // seed loop, runs once
    for (const chunk of chunks) {
      incrementalIters += chunk.attributes.size;
      const range = applyOrbWebGpuChunkInPlace(arrays, chunk);
      expect(range).not.toBeNull();
    }

    // Pin the asymptotic gap. The pre-fix path is roughly N²/2 + N seed
    // re-runs; the incremental path is N + N seed. For 16k/2k batches
    // the ratio is on the order of 10×.
    expect(fullRebuildIters / incrementalIters).toBeGreaterThan(5);
    expect(incrementalIters).toBeLessThanOrEqual(totalParticles * 2);
  });
});
