"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotionConfig as useReducedMotion } from "framer-motion";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });
import { Button, Text } from "@mantine/core";
import { Home } from "lucide-react";
import { canvasReveal } from "@/lib/motion";
import { recolorLottie, resolveAccentColor } from "@/features/animations/lottie/recolor-lottie";

type LottieJson = Record<string, unknown>;

let cached: Promise<LottieJson | null> | null = null;
function fetchNotFoundJson() {
  if (!cached) {
    cached = fetch("/animations/_assets/lottie/not-found.json")
      .then((r) => r.json() as Promise<LottieJson>)
      .catch(() => null);
  }
  return cached;
}

function NotFoundAnimation() {
  const reduced = useReducedMotion();
  const [raw, setRaw] = useState<LottieJson | null>(null);
  const [accent, setAccent] = useState<
    [number, number, number, number] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    fetchNotFoundJson().then((d) => {
      if (!cancelled && d) setRaw(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => setAccent(resolveAccentColor()));
  }, []);

  const recolored = useMemo(() => {
    if (!raw || !accent) return null;
    return recolorLottie(raw, accent);
  }, [raw, accent]);

  if (!recolored || reduced) {
    return (
      <Text
        className="text-7xl font-bold select-none"
        style={{ color: "var(--mode-accent)", opacity: 0.25 }}
      >
        404
      </Text>
    );
  }

  return (
    <Lottie
      animationData={recolored}
      loop
      autoplay
      style={{ width: "min(320px, 80vw)", height: "auto" }}
    />
  );
}

export default function NotFound() {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ backgroundColor: "var(--background)" }}
    >
      <motion.div
        className="flex max-w-md flex-col items-center gap-6 text-center"
        {...canvasReveal}
      >
        <NotFoundAnimation />

        <div className="flex flex-col gap-2">
          <Text
            className="text-xl font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Page not found
          </Text>
          <Text
            size="sm"
            style={{ color: "var(--text-secondary)" }}
          >
            The page you are looking for does not exist or has been moved.
          </Text>
        </div>

        <Button
          component="a"
          href="/"
          leftSection={<Home size={14} />}
          variant="filled"
          radius="xl"
          styles={{
            root: {
              backgroundColor: "var(--mode-accent)",
              color: "white",
            },
          }}
        >
          Go home
        </Button>
      </motion.div>
    </div>
  );
}
