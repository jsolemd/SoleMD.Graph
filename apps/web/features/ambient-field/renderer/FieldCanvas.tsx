"use client";

import { useState, type CSSProperties, type MutableRefObject } from "react";
import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { FieldScene } from "./FieldScene";
import type { FieldController } from "../controller/FieldController";
import type { BlobController } from "../controller/BlobController";
import type {
  AmbientFieldSceneState,
  AmbientFieldStageItemId,
} from "../scene/visual-presets";

interface FieldCanvasProps {
  sceneStateRef: MutableRefObject<AmbientFieldSceneState>;
  reducedMotion?: boolean;
  stageReady?: boolean;
  onControllerReady?: (
    id: AmbientFieldStageItemId,
    controller: FieldController,
  ) => void;
  onBlobControllerReady?: (controller: BlobController) => void;
  className?: string;
  style?: CSSProperties;
}

export function FieldCanvas({
  sceneStateRef,
  reducedMotion = false,
  stageReady = true,
  onControllerReady,
  onBlobControllerReady,
  className,
  style,
}: FieldCanvasProps) {
  const [densityScale, setDensityScale] = useState(1);

  return (
    <div
      aria-hidden="true"
      className={[
        "pointer-events-none absolute inset-0 z-0 [&_canvas]:h-full [&_canvas]:w-full",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <Canvas
        frameloop="always"
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
        <PerformanceMonitor
          onFallback={() => setDensityScale(0.72)}
          onDecline={() => setDensityScale((current) => Math.max(0.72, current - 0.12))}
          onIncline={() => setDensityScale((current) => Math.min(1, current + 0.06))}
        />
        <AdaptiveDpr />
        <FieldScene
          sceneStateRef={sceneStateRef}
          densityScale={reducedMotion ? Math.min(densityScale, 0.84) : densityScale}
          stageReady={stageReady}
          onControllerReady={onControllerReady}
          onBlobControllerReady={onBlobControllerReady}
        />
      </Canvas>
    </div>
  );
}
