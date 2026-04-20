"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { ActionIcon, Tooltip, useComputedColorScheme } from "@mantine/core";
import { useReducedMotionConfig as useReducedMotion } from "framer-motion";
import { Play } from "lucide-react";
import type { LottieRefCurrentProps } from "lottie-react";
import graphPlayAnimation from "@/features/animations/_assets/lottie/ambient-field-graph-play.json";
import { LottiePulseLoader } from "@/features/animations/lottie/LottiePulseLoader";
import {
  recolorLottie,
  resolveCssColor,
  type LottieRgba,
} from "@/features/animations/lottie/recolor-lottie";
import {
  chromeFlushSurfaceStyle,
  graphControlBtnStyles,
} from "@/features/graph/components/panels/PanelShell";
import { fieldLoopClock } from "@/features/ambient-field";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

type WarmupActionPhase = "loading" | "ready-playing" | "ready-idle";

const READY_LABEL = "Enter Graph";
const LOADING_LABEL = "Graph Loading";
const GRAPH_ICON_FALLBACK: LottieRgba = [0.102, 0.106, 0.118, 0.68];
const LOTTIE_VISUAL_SIZE = "calc(var(--icon-size) * 0.82)";
const MAX_SYNC_ATTEMPTS = 60;
const PLAY_PLAYBACK_SPEED = 0.82;

const iconActionStyle: CSSProperties = {
  ...chromeFlushSurfaceStyle,
  position: "relative",
};

const visualHostStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const visualLayerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  transition: "opacity 160ms ease-out",
};

export function AmbientFieldGraphWarmupAction({
  graphReady,
  onOpenGraph,
}: {
  graphReady: boolean;
  onOpenGraph: () => void;
}) {
  const reduced = useReducedMotion();
  const computedColorScheme = useComputedColorScheme("light");
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);
  const [iconColor, setIconColor] = useState<LottieRgba | null>(null);
  const [phase, setPhase] = useState<WarmupActionPhase>(
    graphReady ? "ready-playing" : "loading",
  );

  useEffect(() => {
    const disposer = fieldLoopClock.subscribe("graph-warmup-color", 60, () => {
      setIconColor(resolveCssColor("--graph-icon-color", GRAPH_ICON_FALLBACK));
      disposer();
    });
    return disposer;
  }, [computedColorScheme]);

  const playAnimationData = useMemo(() => {
    if (!iconColor) return null;
    return recolorLottie(graphPlayAnimation, iconColor);
  }, [iconColor]);

  useEffect(() => {
    setPhase(graphReady ? "ready-playing" : "loading");
  }, [graphReady]);

  useEffect(() => {
    if (!graphReady || reduced || !playAnimationData || phase !== "ready-playing") {
      return;
    }

    let attempt = 0;
    const disposer = fieldLoopClock.subscribe("graph-warmup-playback", 60, () => {
      const animationItem = lottieRef.current?.animationItem;
      if (!animationItem) {
        if (attempt >= MAX_SYNC_ATTEMPTS) disposer();
        attempt += 1;
        return;
      }
      animationItem.stop();
      animationItem.goToAndStop(0, true);
      animationItem.setSpeed(PLAY_PLAYBACK_SPEED);
      animationItem.play();
      disposer();
    });
    return disposer;
  }, [graphReady, phase, playAnimationData, reduced]);

  useEffect(() => {
    if (!graphReady || reduced || !playAnimationData || phase !== "ready-idle") {
      return;
    }

    let attempt = 0;
    const disposer = fieldLoopClock.subscribe("graph-warmup-idle", 60, () => {
      const animationItem = lottieRef.current?.animationItem;
      if (!animationItem) {
        if (attempt >= MAX_SYNC_ATTEMPTS) disposer();
        attempt += 1;
        return;
      }
      animationItem.stop();
      animationItem.goToAndStop(Math.max(animationItem.totalFrames - 1, 0), true);
      disposer();
    });
    return disposer;
  }, [graphReady, phase, playAnimationData, reduced]);

  const canRenderPlayVisual = !reduced && playAnimationData != null;
  const showReadyVisual = graphReady && (reduced || canRenderPlayVisual);
  const tooltipLabel = graphReady ? READY_LABEL : LOADING_LABEL;
  const iconOpacity = iconColor?.[3] ?? GRAPH_ICON_FALLBACK[3];

  return (
    <Tooltip label={tooltipLabel} position="bottom" withArrow>
      <ActionIcon
        type="button"
        onClick={graphReady ? onOpenGraph : undefined}
        variant="transparent"
        size="lg"
        radius="xl"
        className="graph-icon-btn"
        styles={graphControlBtnStyles}
        aria-label={tooltipLabel}
        aria-disabled={!graphReady}
        tabIndex={graphReady ? 0 : -1}
        style={{
          ...iconActionStyle,
          cursor: graphReady ? "pointer" : "default",
        }}
      >
        <span aria-hidden="true" style={visualHostStyle}>
          <span
            aria-hidden="true"
            style={{
              ...visualLayerStyle,
              opacity: showReadyVisual ? 0 : 1,
            }}
          >
            <LottiePulseLoader
              size={LOTTIE_VISUAL_SIZE}
              colorVar="--graph-icon-color"
              fallbackColor={GRAPH_ICON_FALLBACK}
            />
          </span>

          {reduced ? (
            <span
              aria-hidden="true"
              style={{
                ...visualLayerStyle,
                opacity: showReadyVisual ? 1 : 0,
              }}
            >
              <Play />
            </span>
          ) : null}

          {canRenderPlayVisual ? (
            <span
              aria-hidden="true"
              style={{
                ...visualLayerStyle,
                opacity: showReadyVisual ? 1 : 0,
              }}
            >
              <Lottie
                lottieRef={lottieRef}
                animationData={playAnimationData}
                loop={false}
                autoplay={false}
                onComplete={() => {
                  setPhase("ready-idle");
                }}
                style={{
                  width: LOTTIE_VISUAL_SIZE,
                  height: LOTTIE_VISUAL_SIZE,
                  opacity: iconOpacity,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              />
            </span>
          ) : null}
        </span>

        {!graphReady ? (
          <span
            role="status"
            aria-live="polite"
            className="sr-only"
          >
            {LOADING_LABEL}
          </span>
        ) : null}
      </ActionIcon>
    </Tooltip>
  );
}
