"use client";

import { useEffect } from "react";
import { moduleAssetPath } from "@/features/wiki/module-runtime/asset-paths";
import { usePrefersReducedMotion } from "@/features/wiki/module-runtime/motion";

interface ModelViewerStageProps {
  src: string;
  alt: string;
  caption?: string;
  cameraOrbit?: string;
  className?: string;
}

export function ModelViewerStage({
  src,
  alt,
  caption,
  cameraOrbit = "0deg 75deg 105%",
  className,
}: ModelViewerStageProps) {
  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  const reduced = usePrefersReducedMotion();

  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-xl aspect-video">
        {/* @ts-expect-error — model-viewer is a web component, not in JSX intrinsics */}
        <model-viewer
          src={moduleAssetPath("models", src)}
          alt={alt}
          camera-controls
          camera-orbit={cameraOrbit}
          auto-rotate={reduced ? undefined : true}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      {caption && (
        <figcaption
          className="mt-2 text-center text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
