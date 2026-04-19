"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Text } from "@mantine/core";
import { Home } from "lucide-react";
import type { LottieRgba } from "@/features/animations/lottie/recolor-lottie";
import { recolorLottie } from "@/features/animations/lottie/recolor-lottie";
import { RouteStatusSurface } from "@/app/_components/RouteStatusSurface";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

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

function NotFoundAnimation({ accent }: { accent: LottieRgba }) {
  const [raw, setRaw] = useState<LottieJson | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchNotFoundJson().then((data) => {
      if (!cancelled && data) setRaw(data);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const recolored = useMemo(() => {
    if (!raw) return null;
    return recolorLottie(raw, accent);
  }, [raw, accent]);

  if (!recolored) {
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
      style={{ width: "min(280px, 70vw)", height: "auto" }}
    />
  );
}

export default function NotFound() {
  return (
    <RouteStatusSurface
      title="Page not found"
      description="The page you were trying to open does not exist, moved, or no longer has a public route in this build."
      renderMedia={({ accent }) => <NotFoundAnimation accent={accent} />}
      primaryAction={{
        href: "/",
        label: "Go home",
        icon: <Home size={16} />,
        tone: "primary",
      }}
    />
  );
}
