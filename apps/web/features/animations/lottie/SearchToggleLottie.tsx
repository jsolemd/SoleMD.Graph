"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useMantineColorScheme } from "@mantine/core";
import { useReducedMotion } from "framer-motion";
import { Search, X } from "lucide-react";
import type { LottieRefCurrentProps } from "lottie-react";
import searchToggleAnimation from "@/features/animations/_assets/lottie/search-toggle.json";
import { recolorLottie, resolveCssColor, type LottieRgba } from "./recolor-lottie";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export type SearchToggleMode = "search" | "close";

const SEARCH_START_FRAME = 0;
const SEARCH_END_FRAME = 48;
const SEARCH_TOGGLE_PLAYBACK_SPEED = 1.12;
const SEARCH_TOGGLE_FALLBACK_COLOR: LottieRgba = [0.78, 0.8, 0.85, 1];
const MAX_SYNC_ATTEMPTS = 60;

function resolveIconFallback(mode: SearchToggleMode, size: number) {
  return mode === "close" ? <X size={size} /> : <Search size={size} />;
}

export function SearchToggleLottie({
  mode,
  size = 12,
  speed = SEARCH_TOGGLE_PLAYBACK_SPEED,
  className,
}: {
  mode: SearchToggleMode;
  size?: number;
  speed?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const { colorScheme } = useMantineColorScheme();
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);
  const previousModeRef = useRef<SearchToggleMode | null>(null);
  const [rgba, setRgba] = useState<LottieRgba | null>(null);
  const playbackSpeed = speed > 0 ? speed : 1;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setRgba(resolveCssColor("--graph-panel-text", SEARCH_TOGGLE_FALLBACK_COLOR));
    });
    return () => cancelAnimationFrame(frame);
  }, [colorScheme]);

  const animationData = useMemo(() => {
    if (!rgba) return null;
    return recolorLottie(searchToggleAnimation, rgba);
  }, [rgba]);

  useEffect(() => {
    if (reduced || !animationData) {
      return;
    }

    let cancelled = false;
    let frame = 0;
    let activeAnimationItem: NonNullable<LottieRefCurrentProps["animationItem"]> | null =
      null;
    let handleComplete: (() => void) | null = null;

    const syncPlayer = (attempt = 0) => {
      if (cancelled) {
        return;
      }

      const player = lottieRef.current;
      const animationItem = player?.animationItem;
      if (!player || !animationItem) {
        if (attempt < MAX_SYNC_ATTEMPTS) {
          frame = requestAnimationFrame(() => syncPlayer(attempt + 1));
        }
        return;
      }

      animationItem.setSpeed(playbackSpeed);
      const targetFrame = mode === "close" ? SEARCH_END_FRAME : SEARCH_START_FRAME;
      const currentMode = previousModeRef.current;
      if (
        currentMode === null ||
        currentMode === mode
      ) {
        animationItem.stop();
        animationItem.goToAndStop(targetFrame, true);
        previousModeRef.current = mode;
        return;
      }

      const fromFrame =
        currentMode === "close" ? SEARCH_END_FRAME : SEARCH_START_FRAME;

      animationItem.stop();
      animationItem.goToAndStop(fromFrame, true);
      activeAnimationItem = animationItem;
      handleComplete = () => {
        animationItem.removeEventListener("complete", handleComplete!);
        if (cancelled) {
          return;
        }
        animationItem.stop();
        animationItem.goToAndStop(targetFrame, true);
      };
      animationItem.addEventListener("complete", handleComplete);
      animationItem.playSegments([fromFrame, targetFrame], true);
      previousModeRef.current = mode;
    };

    frame = requestAnimationFrame(() => syncPlayer());
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (activeAnimationItem && handleComplete) {
        activeAnimationItem.removeEventListener("complete", handleComplete);
      }
    };
  }, [animationData, mode, playbackSpeed, reduced]);

  if (reduced || !animationData) {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{
          display: "inline-flex",
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {resolveIconFallback(mode, size)}
      </span>
    );
  }

  // lottie-react renders an inline SVG; flex-center the wrapper so the SVG
  // sits on the geometric center, not the text baseline.
  return (
    <Lottie
      lottieRef={lottieRef}
      animationData={animationData}
      loop={false}
      autoplay={false}
      className={className}
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    />
  );
}
