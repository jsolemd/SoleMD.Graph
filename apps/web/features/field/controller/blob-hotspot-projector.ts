import type { Camera, Group, Vector3 } from "three";
import type { FieldPointSource } from "../asset/point-source-types";
import type { FieldSceneState } from "../scene/visual-presets";
import {
  BLOB_HOTSPOT_CARD_COUNT,
  BLOB_HOTSPOT_COUNT,
  getBlobHotspotCycleDurationMs,
  getBlobHotspotPulseEnvelope,
  getPointColorCss,
  hotspotPhaseUsesCycle,
  projectBlobHotspotCandidate,
  sampleBlobHotspotDelayMs,
  selectBlobHotspotCandidate,
  type BlobHotspotRuntime,
  type BlobHotspotState,
  type FieldHotspotFrame,
} from "./blob-hotspot-runtime";

interface ProjectBlobHotspotsArgs {
  camera: Camera;
  elapsedSec: number;
  frames: FieldHotspotFrame[];
  hotspotRefs: HTMLElement[];
  hotspotRuntime: BlobHotspotRuntime[];
  hotspotState: BlobHotspotState;
  model: Group | null;
  pixelRatio?: number;
  pointSource: FieldPointSource | null;
  sceneState: FieldSceneState;
  vector: Vector3;
  viewportHeight: number;
  viewportWidth: number;
  wrapper: Group | null;
}

interface ProjectBlobHotspotsResult {
  frames: FieldHotspotFrame[];
  stageHasOnlyReds: boolean;
  stageHasOnlySingle: boolean;
}

function writeBlobHotspotDom(
  frames: readonly FieldHotspotFrame[],
  hotspotRefs: readonly HTMLElement[],
): void {
  if (hotspotRefs.length === 0) return;
  for (let index = 0; index < hotspotRefs.length; index += 1) {
    const node = hotspotRefs[index];
    if (!node) continue;
    const frame = frames[index];
    if (!frame || !frame.visible) {
      node.style.opacity = "0";
      node.style.transform =
        "translate3d(-9999px, -9999px, 0) scale(0.92)";
      node.classList.remove("is-animating");
      continue;
    }
    node.style.opacity = frame.opacity.toFixed(4);
    node.style.transform = `translate3d(${frame.x}px, ${frame.y}px, 0) scale(${frame.scale})`;
    node.style.setProperty("--afr-color", frame.color);
    if (frame.mode === "dot" && !node.classList.contains("is-animating")) {
      node.classList.add("is-animating");
    }
    if (frame.mode !== "dot" && node.classList.contains("is-animating")) {
      node.classList.remove("is-animating");
    }
  }
}

function resetBlobHotspotFrames(frames: FieldHotspotFrame[]): void {
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!;
    frame.color = "var(--color-soft-blue)";
    frame.mode = "hidden";
    frame.opacity = 0;
    frame.scale = 0.9;
    frame.showCard = index < BLOB_HOTSPOT_CARD_COUNT;
    frame.visible = false;
    frame.x = -9999;
    frame.y = -9999;
  }
}

// Maze hotspot render gate at scripts.pretty.js:43501-43525:
//   - skip if hotspotIndex >= hotspotState.maxNumber
//   - skip if hotspotState.opacity <= 0
//   - finalOpacity = (1 - vector.z) * 2 * hotspotState.opacity
//   - mode is `card` while `has-only-single` (maxNumber <= card count)
//     for the first card slots; `dot` otherwise.
export function projectBlobHotspots({
  camera,
  elapsedSec,
  frames,
  hotspotRefs,
  hotspotRuntime,
  hotspotState,
  model,
  pixelRatio = 1,
  pointSource,
  sceneState,
  vector,
  viewportHeight,
  viewportWidth,
  wrapper,
}: ProjectBlobHotspotsArgs): ProjectBlobHotspotsResult {
  resetBlobHotspotFrames(frames);

  const blobRuntime = sceneState.items.blob;
  const blobVisibility = blobRuntime?.visibility ?? 0;
  const hotspotsActive =
    hotspotState.opacity > 0 && hotspotState.maxNumber > 0;

  if (
    !model ||
    !wrapper ||
    !pointSource ||
    blobVisibility <= 0.01 ||
    !hotspotsActive
  ) {
    const stageHasOnlyReds = hotspotState.onlyReds > 0;
    const stageHasOnlySingle =
      hotspotState.maxNumber > 0 &&
      hotspotState.maxNumber <= BLOB_HOTSPOT_CARD_COUNT;
    writeBlobHotspotDom(frames, hotspotRefs);
    return { frames, stageHasOnlyReds, stageHasOnlySingle };
  }

  wrapper.updateWorldMatrix(true, true);

  const loopMs = elapsedSec * 1000;
  const usedCandidateIndices = new Set<number>();
  const onlyReds = hotspotState.onlyReds > 0;
  const onlySingle =
    hotspotState.maxNumber > 0 &&
    hotspotState.maxNumber <= BLOB_HOTSPOT_CARD_COUNT;

  for (
    let hotspotIndex = 0;
    hotspotIndex < BLOB_HOTSPOT_COUNT;
    hotspotIndex += 1
  ) {
    const frame = frames[hotspotIndex]!;
    const runtime = hotspotRuntime[hotspotIndex]!;

    const withinMaxNumber = hotspotIndex < hotspotState.maxNumber;
    const suppressedByOnlyReds =
      onlyReds && hotspotIndex >= BLOB_HOTSPOT_CARD_COUNT;

    if (!withinMaxNumber || suppressedByOnlyReds) {
      if (runtime.phaseKey !== "hidden") {
        runtime.phaseKey = "hidden";
        runtime.invalidSinceAtMs = null;
      }
      continue;
    }

    const phaseKey: BlobHotspotRuntime["phaseKey"] =
      onlySingle && hotspotIndex < BLOB_HOTSPOT_CARD_COUNT ? "card" : "dot";

    if (runtime.phaseKey !== phaseKey) {
      runtime.phaseKey = phaseKey;
      runtime.invalidSinceAtMs = null;
      runtime.cycleDurationMs = hotspotPhaseUsesCycle(phaseKey)
        ? getBlobHotspotCycleDurationMs({
            hotspotIndex,
            isSingleVisible: onlySingle,
            phaseKey,
          })
        : 0;
      runtime.cycleStartAtMs = hotspotPhaseUsesCycle(phaseKey)
        ? loopMs + sampleBlobHotspotDelayMs()
        : loopMs;
    }

    const shouldReseed =
      runtime.candidateIndex == null ||
      (hotspotPhaseUsesCycle(phaseKey) &&
        runtime.cycleDurationMs > 0 &&
        loopMs >= runtime.cycleStartAtMs + runtime.cycleDurationMs);

    if (shouldReseed) {
      runtime.candidateIndex = null;
      runtime.cycleDurationMs = hotspotPhaseUsesCycle(phaseKey)
        ? getBlobHotspotCycleDurationMs({
            hotspotIndex,
            isSingleVisible: onlySingle,
            phaseKey,
          })
        : 0;
      runtime.cycleStartAtMs = hotspotPhaseUsesCycle(phaseKey)
        ? loopMs + sampleBlobHotspotDelayMs()
        : loopMs;

      const reseeded = selectBlobHotspotCandidate({
        blobModel: model,
        camera,
        maxAttempts: phaseKey === "card" ? 80 : 20,
        source: pointSource,
        usedCandidateIndices,
        vector,
        viewportHeight,
        viewportWidth,
        pixelRatio,
      });
      runtime.candidateIndex = reseeded?.candidateIndex ?? null;
    }

    if (runtime.candidateIndex == null) continue;

    const cycleEnvelope =
      phaseKey === "dot"
        ? getBlobHotspotPulseEnvelope(
            (loopMs - runtime.cycleStartAtMs) /
              Math.max(runtime.cycleDurationMs, 1),
          )
        : 1;
    if (phaseKey === "dot" && cycleEnvelope <= 0.001) continue;

    let projected = projectBlobHotspotCandidate({
      blobModel: model,
      camera,
      candidateIndex: runtime.candidateIndex,
      height: viewportHeight,
      pixelRatio,
      source: pointSource,
      vector,
      width: viewportWidth,
    });

    if (!projected) {
      if (runtime.lastProjected && runtime.invalidSinceAtMs == null) {
        runtime.invalidSinceAtMs = loopMs;
      }
      const withinProjectionGrace =
        runtime.invalidSinceAtMs != null &&
        loopMs - runtime.invalidSinceAtMs < 240;
      if (phaseKey === "card" && runtime.lastProjected && withinProjectionGrace) {
        projected = runtime.lastProjected;
      } else if (phaseKey === "card") {
        runtime.candidateIndex = null;
        const reseeded = selectBlobHotspotCandidate({
          blobModel: model,
          camera,
          maxAttempts: 80,
          source: pointSource,
          usedCandidateIndices,
          vector,
          viewportHeight,
          viewportWidth,
          pixelRatio,
        });
        runtime.candidateIndex = reseeded?.candidateIndex ?? null;
        if (runtime.candidateIndex != null) {
          projected = projectBlobHotspotCandidate({
            blobModel: model,
            camera,
            candidateIndex: runtime.candidateIndex,
            height: viewportHeight,
            pixelRatio,
            source: pointSource,
            vector,
            width: viewportWidth,
          });
        }
      }

      if (!projected) {
        frame.color = getPointColorCss(pointSource, runtime.candidateIndex ?? 0);
        continue;
      }
    }

    usedCandidateIndices.add(projected.candidateIndex);
    runtime.invalidSinceAtMs = null;
    runtime.lastProjected = projected;

    frame.visible = true;
    frame.mode = phaseKey;
    frame.color = getPointColorCss(pointSource, projected.candidateIndex);
    frame.opacity = projected.scale * hotspotState.opacity * cycleEnvelope;
    frame.scale =
      phaseKey === "dot" ? projected.scale * cycleEnvelope : projected.scale;
    frame.x = projected.x;
    frame.y = projected.y;
    frame.showCard = phaseKey === "card";
  }

  writeBlobHotspotDom(frames, hotspotRefs);
  return {
    frames,
    stageHasOnlyReds: onlyReds,
    stageHasOnlySingle: onlySingle,
  };
}
