import { gsap } from "gsap";
import type { Group } from "three";

// Maze's mouse parallax wraps the model in a `mouseWrapper` group and
// tweens its rotation from pointer deltas with a 1 s sine.out ease:
// `scripts.pretty.js:43189-43196`.
//   y = e * -5e-4   (per-pixel y rotation)
//   x = t * -3e-4   (per-pixel x rotation)
// The tween runs on `mousemove` so pointer hover produces a subtle live
// parallax over the continuous idle spin.

export interface MouseParallaxOptions {
  rotationPerPixelX?: number;
  rotationPerPixelY?: number;
  duration?: number;
  ease?: string;
}

const DEFAULT_ROTATION_PER_PIXEL_X = -3e-4;
const DEFAULT_ROTATION_PER_PIXEL_Y = -5e-4;
const DEFAULT_DURATION = 1;
const DEFAULT_EASE = "sine.out";

// Attach a mouse-parallax driver to a Three.js Group. Returns a
// cleanup function the caller invokes on unmount.
export function attachMouseParallax(
  group: Group,
  options: MouseParallaxOptions = {},
): () => void {
  if (typeof window === "undefined") return () => {};

  const rpX = options.rotationPerPixelX ?? DEFAULT_ROTATION_PER_PIXEL_X;
  const rpY = options.rotationPerPixelY ?? DEFAULT_ROTATION_PER_PIXEL_Y;
  const duration = options.duration ?? DEFAULT_DURATION;
  const ease = options.ease ?? DEFAULT_EASE;

  const handleMove = (event: MouseEvent) => {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    gsap.to(group.rotation, {
      x: dy * rpX,
      y: dx * rpY,
      duration,
      ease,
      overwrite: "auto",
    });
  };

  window.addEventListener("mousemove", handleMove, { passive: true });

  return () => {
    window.removeEventListener("mousemove", handleMove);
    gsap.killTweensOf(group.rotation);
  };
}
