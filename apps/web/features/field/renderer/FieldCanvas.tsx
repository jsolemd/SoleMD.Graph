"use client";

import { useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { FieldScene } from "./FieldScene";
import { FrameloopInvalidator } from "./FrameloopInvalidator";
import { useAdaptiveFrameloop } from "./use-adaptive-frameloop";
import type { FieldController } from "../controller/FieldController";
import type {
  FieldSceneState,
  FieldStageItemId,
} from "../scene/visual-presets";

interface FieldCanvasProps {
  activeIds?: readonly FieldStageItemId[];
  sceneStateRef: MutableRefObject<FieldSceneState>;
  reducedMotion?: boolean;
  stageReady?: boolean;
  onControllerReady?: (
    id: FieldStageItemId,
    controller: FieldController,
  ) => void;
  className?: string;
  style?: CSSProperties;
}

export function FieldCanvas({
  activeIds,
  sceneStateRef,
  reducedMotion = false,
  stageReady = true,
  onControllerReady,
  className,
  style,
}: FieldCanvasProps) {
  const [densityScale, setDensityScale] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameloop = useAdaptiveFrameloop({ reducedMotion, containerRef });

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={[
        "pointer-events-none absolute inset-0 z-0 [&_canvas]:h-full [&_canvas]:w-full",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ touchAction: "pan-y", overscrollBehavior: "none", ...style }}
    >
      <Canvas
        frameloop={frameloop}
        camera={{ position: [0, 0, 400], fov: 45, near: 80, far: 10000 }}
        dpr={[1, 1.75]}
        style={{ width: "100%", height: "100%" }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        performance={{ min: 0.65, debounce: 400 }}
        fallback={null}
      >
        {/* Static dpr={[1, 1.75]} is the Maze mobile perf contract
            (.claude/skills/module/references/maze-mobile-performance-contract.md).
            densityScale scales point count, not DPR — AdaptiveDpr would
            compete with both the static range and the PerformanceMonitor
            density ladder. Keep DPR static; let density respond to perf. */}
        <PerformanceMonitor
          onFallback={() => setDensityScale(0.72)}
          onDecline={() => setDensityScale((current) => Math.max(0.72, current - 0.12))}
          onIncline={() => setDensityScale((current) => Math.min(1, current + 0.06))}
        />
        <FrameloopInvalidator active={frameloop === "demand"} />
        <FieldScene
          activeIds={activeIds}
          sceneStateRef={sceneStateRef}
          densityScale={reducedMotion ? Math.min(densityScale, 0.84) : densityScale}
          stageReady={stageReady}
          onControllerReady={onControllerReady}
        />
      </Canvas>
    </div>
  );
}
