"use client";
/**
 * model-viewer wrapper template.
 *
 * Drop-in for rotating 3D molecules or scientific models. Brand defaults
 * (exposure, environment image, camera orbit) are set here; consumers
 * pass a `src` pointing at a .glb under /animations/_assets/glb/.
 */
import { useEffect } from "react";

interface Props {
  src: string;
  alt: string;
  className?: string;
}

export function ModelViewerWrapper({ src, alt, className }: Props) {
  useEffect(() => {
    // Lazy-register the web component once per session.
    void import("@google/model-viewer");
  }, []);

  return (
    <div
      className={
        className ??
        "h-[400px] w-full overflow-hidden rounded-[1rem] bg-[var(--surface)] shadow-[var(--shadow-md)]"
      }
    >
      {/* @ts-expect-error — web component not typed in React 19 */}
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
