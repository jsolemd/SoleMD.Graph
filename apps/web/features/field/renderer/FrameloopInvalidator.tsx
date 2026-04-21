"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

interface FrameloopInvalidatorProps {
  active: boolean;
}

export function FrameloopInvalidator({ active }: FrameloopInvalidatorProps) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;

    const kick = () => invalidate();
    kick();

    window.addEventListener("scroll", kick, { passive: true });
    document.addEventListener("visibilitychange", kick);

    return () => {
      window.removeEventListener("scroll", kick);
      document.removeEventListener("visibilitychange", kick);
    };
  }, [active, invalidate]);

  return null;
}
