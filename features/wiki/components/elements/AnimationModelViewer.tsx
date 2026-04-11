"use client";

import { useEffect } from "react";

interface Props {
  src: string;
  alt: string;
}

export function AnimationModelViewer({ src, alt }: Props) {
  useEffect(() => {
    void import("@google/model-viewer");
  }, []);

  return (
    <div className="h-[400px] w-full">
      {/* @ts-expect-error — web component is not typed in React 19 */}
      <model-viewer
        src={src}
        alt={alt}
        auto-rotate
        auto-rotate-delay="500"
        camera-controls
        environment-image="neutral"
        exposure="0.85"
        shadow-intensity="0.6"
        style={{
          width: "100%",
          height: "100%",
          background: "var(--surface)",
          "--poster-color": "transparent",
        } as React.CSSProperties}
      />
    </div>
  );
}
