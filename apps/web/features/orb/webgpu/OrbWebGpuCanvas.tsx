"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useShellStore } from "@/features/graph/stores";
import { useOrbPickerStore, type OrbPickerHandle } from "../interaction/orb-picker-store";
import { useOrbFocusVisualStore } from "../stores/focus-visual-store";
import { useOrbGeometryMutationStore } from "../stores/geometry-mutation-store";
import {
  useOrbSnapshotStore,
  type OrbSnapshotHandle,
} from "../stores/snapshot-store";
import {
  applyOrbWebGpuChunkInPlace,
  buildOrbWebGpuFlagArray,
  resolveOrbWebGpuParticleCount,
  seedOrbWebGpuParticleArrays,
  type OrbWebGpuParticleArrays,
} from "./orb-webgpu-particles";
import {
  OrbWebGpuUnavailableError,
  requireOrbWebGpu,
  type OrbWebGpuProfile,
  type OrbWebGpuUnavailableReason,
} from "./orb-webgpu-gate";
import {
  createOrbWebGpuRuntime,
  type OrbWebGpuRuntime,
} from "./orb-webgpu-runtime";
import {
  useOrbWebGpuRuntimeStore,
  type OrbWebGpuControlHandle,
} from "./orb-webgpu-runtime-store";

export type OrbWebGpuCanvasStatus =
  | { kind: "initializing" }
  | { kind: "running"; profile: OrbWebGpuProfile }
  | { kind: "unsupported"; reason: OrbWebGpuUnavailableReason }
  | { kind: "device-lost"; message: string }
  | { kind: "error"; message: string };

export interface OrbWebGpuCanvasProps {
  particleCount: number | null;
  onStatusChange?: (status: OrbWebGpuCanvasStatus) => void;
}

export function OrbWebGpuCanvas({
  particleCount,
  onStatusChange,
}: OrbWebGpuCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<OrbWebGpuRuntime | null>(null);
  const [runtime, setRuntime] = useState<OrbWebGpuRuntime | null>(null);
  const [status, setStatus] = useState<OrbWebGpuCanvasStatus>({
    kind: "initializing",
  });
  const ambientEntropy = useShellStore((s) => s.ambientEntropy);
  const motionSpeedMultiplier = useShellStore((s) => s.motionSpeedMultiplier);
  const pauseMotion = useShellStore((s) => s.pauseMotion);
  const prefersReducedMotion = useShellStore((s) => s.prefersReducedMotion);
  const rotationSpeedMultiplier = useShellStore(
    (s) => s.rotationSpeedMultiplier,
  );
  const focusIndex = useOrbFocusVisualStore((s) => s.focusIndex);
  const hoverIndex = useOrbFocusVisualStore((s) => s.hoverIndex);
  const evidenceIndices = useOrbFocusVisualStore((s) => s.evidenceIndices);
  const neighborIndices = useOrbFocusVisualStore((s) => s.neighborIndices);
  const scopeIndices = useOrbFocusVisualStore((s) => s.scopeIndices);
  const selectionIndices = useOrbFocusVisualStore((s) => s.selectionIndices);

  const focus = useMemo(
    () => ({
      evidenceIndices,
      focusIndex,
      hoverIndex,
      neighborIndices,
      scopeIndices,
      selectionIndices,
    }),
    [
      evidenceIndices,
      focusIndex,
      hoverIndex,
      neighborIndices,
      scopeIndices,
      selectionIndices,
    ],
  );

  const particleArraysRef = useRef<OrbWebGpuParticleArrays | null>(null);
  const [particleArraysCount, setParticleArraysCount] = useState(0);
  // The seed/upload effect is keyed on the resolved count rather than
  // the raw `particleCount` prop so the null → 16384 transition that
  // happens when the paper baker reports its row count does NOT tear
  // down and rebuild the typed arrays. Both null and the typical
  // resolved value clamp to ORB_PARTICLE_CAPACITY.
  const resolvedParticleCount = resolveOrbWebGpuParticleCount(particleCount);

  const flagArray = useMemo(
    () => buildOrbWebGpuFlagArray(particleArraysCount, focus),
    [focus, particleArraysCount],
  );

  const motionSettings = useMemo(
    () => ({
      ambientEntropy,
      motionSpeedMultiplier,
      // pauseMotion is the user-facing toggle; prefersReducedMotion is
      // the OS signal. The runtime keeps them separate (per
      // feedback_user_vs_system_motion_inputs) so each consumer can
      // derive the gate it needs — pauseMotion freezes ambient motion,
      // prefersReducedMotion snaps the camera ease.
      pauseMotion,
      prefersReducedMotion,
      rotationSpeedMultiplier,
      selectionActive:
        focusIndex != null ||
        selectionIndices.length > 0 ||
        scopeIndices.length > 0,
    }),
    [
      ambientEntropy,
      focusIndex,
      motionSpeedMultiplier,
      pauseMotion,
      prefersReducedMotion,
      rotationSpeedMultiplier,
      scopeIndices,
      selectionIndices,
    ],
  );

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let handle: OrbPickerHandle | null = null;
    let controlHandle: OrbWebGpuControlHandle | null = null;
    let snapshotHandle: OrbSnapshotHandle | null = null;

    const publishStatus = (next: OrbWebGpuCanvasStatus) => {
      if (!cancelled) setStatus(next);
    };

    const init = async () => {
      publishStatus({ kind: "initializing" });
      try {
        const gpu = await requireOrbWebGpu(canvas);
        if (cancelled) {
          gpu.device.destroy();
          return;
        }
        gpu.device.addEventListener("uncapturederror", (event) => {
          console.error("[OrbWebGPU] uncaptured error", event.error);
        });
        gpu.device.lost.then((info) => {
          if (cancelled) return;
          if (handle) {
            useOrbPickerStore.getState().clearHandleIfMatches(handle);
          }
          if (controlHandle) {
            useOrbWebGpuRuntimeStore
              .getState()
              .clearHandleIfMatches(controlHandle);
          }
          if (snapshotHandle) {
            useOrbSnapshotStore.getState().clearHandleIfMatches(snapshotHandle);
          }
          runtimeRef.current?.destroy();
          runtimeRef.current = null;
          setRuntime(null);
          publishStatus({
            kind: "device-lost",
            message: info.message || info.reason,
          });
        });

        const nextRuntime = await createOrbWebGpuRuntime(canvas, gpu);
        if (cancelled) {
          nextRuntime.destroy();
          gpu.device.destroy();
          return;
        }

        runtimeRef.current = nextRuntime;
        setRuntime(nextRuntime);
        handle = {
          pickAsync: (clientX, clientY) =>
            runtimeRef.current?.pickAsync(clientX, clientY) ??
            Promise.resolve(-1),
          pickRectAsync: (rect, options) =>
            runtimeRef.current?.pickRectAsync(rect, options) ??
            Promise.resolve([]),
        };
        controlHandle = {
          applyTwist: (deltaRadians) =>
            runtimeRef.current?.applyTwist(deltaRadians),
          nudgeRotation: (deltaRadians) =>
            runtimeRef.current?.nudgeRotation(deltaRadians),
          applyPitch: (deltaRadians) =>
            runtimeRef.current?.applyPitch(deltaRadians),
          nudgePitch: (deltaRadians) =>
            runtimeRef.current?.nudgePitch(deltaRadians),
          applyZoom: (factor) => runtimeRef.current?.applyZoom(factor),
          applyPan: (deltaX, deltaY) =>
            runtimeRef.current?.applyPan(deltaX, deltaY),
          resetView: () => runtimeRef.current?.resetView(),
        };
        snapshotHandle = {
          captureSnapshot: () => {
            void captureOrbWebGpuSnapshot(runtimeRef.current);
          },
        };
        useOrbPickerStore.getState().setHandle(handle);
        useOrbWebGpuRuntimeStore.getState().setHandle(controlHandle);
        useOrbSnapshotStore.getState().setHandle(snapshotHandle);
        nextRuntime.start();
        publishStatus({ kind: "running", profile: gpu.profile });
      } catch (error) {
        if (error instanceof OrbWebGpuUnavailableError) {
          publishStatus({ kind: "unsupported", reason: error.reason });
          return;
        }
        console.error("[OrbWebGPU] runtime initialization failed", error);
        publishStatus({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to initialize the WebGPU orb runtime.",
        });
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (handle) {
        useOrbPickerStore.getState().clearHandleIfMatches(handle);
      }
      if (controlHandle) {
        useOrbWebGpuRuntimeStore
          .getState()
          .clearHandleIfMatches(controlHandle);
      }
      if (snapshotHandle) {
        useOrbSnapshotStore.getState().clearHandleIfMatches(snapshotHandle);
      }
      runtimeRef.current?.destroy();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!runtime) {
      particleArraysRef.current = null;
      setParticleArraysCount(0);
      return;
    }

    // Seed the typed arrays once. Any chunks already in the store
    // (e.g. on remount after a route swap that kept the global Zustand
    // state) are folded into this one full upload — every later chunk
    // is a partial GPU write of just its slice.
    const arrays = seedOrbWebGpuParticleArrays(resolvedParticleCount);
    particleArraysRef.current = arrays;
    const initialChunks = useOrbGeometryMutationStore.getState().chunks;
    for (const chunk of initialChunks) {
      applyOrbWebGpuChunkInPlace(arrays, chunk);
    }
    runtime.uploadParticles(arrays);
    setParticleArraysCount(arrays.count);
    let processedChunks = initialChunks.length;

    // Subscribe directly to the mutation store rather than reading
    // chunks via a React selector — chunk arrivals stream every ~2k
    // particles, so the React-render path would otherwise re-render
    // the whole canvas component (and re-build a 16k×4 typed array)
    // per stream batch.
    const unsubscribe = useOrbGeometryMutationStore.subscribe((state) => {
      const arraysNow = particleArraysRef.current;
      if (!arraysNow) return;
      while (processedChunks < state.chunks.length) {
        const chunk = state.chunks[processedChunks]!;
        processedChunks += 1;
        const range = applyOrbWebGpuChunkInPlace(arraysNow, chunk);
        if (range) runtime.uploadParticleRange(arraysNow, range);
      }
    });

    return () => {
      unsubscribe();
      particleArraysRef.current = null;
    };
  }, [runtime, resolvedParticleCount]);

  useEffect(() => {
    if (!runtime) return;
    runtime.uploadFlags(flagArray);
  }, [flagArray, runtime]);

  useEffect(() => {
    runtime?.setMotionSettings(motionSettings);
  }, [motionSettings, runtime]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      />
      {status.kind === "unsupported" ||
      status.kind === "device-lost" ||
      status.kind === "error" ? (
        <OrbWebGpuStatusOverlay status={status} />
      ) : null}
    </>
  );
}

async function captureOrbWebGpuSnapshot(
  runtime: OrbWebGpuRuntime | null,
): Promise<void> {
  const blob = await runtime?.captureSnapshot();
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `solemd-orb-${new Date().toISOString().replaceAll(":", "-")}.png`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function OrbWebGpuStatusOverlay({
  status,
}: {
  status:
    | { kind: "unsupported"; reason: OrbWebGpuUnavailableReason }
    | { kind: "device-lost"; message: string }
    | { kind: "error"; message: string };
}) {
  const message =
    status.kind === "unsupported"
      ? `WebGPU unavailable: ${status.reason}`
      : status.kind === "device-lost"
        ? `WebGPU device lost: ${status.message}`
        : `WebGPU error: ${status.message}`;

  return (
    <div
      role="status"
      className="pointer-events-none fixed left-1/2 top-5 z-30 -translate-x-1/2 rounded-full px-3 py-2 text-xs font-medium"
      style={{
        backgroundColor: "var(--graph-panel-bg)",
        boxShadow: "var(--graph-panel-shadow)",
        color: "var(--graph-panel-text)",
      }}
    >
      {message}
    </div>
  );
}
