"use client";
/**
 * Lottie icon wrapper — plays a LottieFiles JSON via lottie-react.
 *
 * Use for: pre-built vector animations from LottieFiles, the Icons8
 * animated set, or anything After Effects → Bodymovin. Light/dark
 * variants are selected via Mantine's color scheme.
 */
import { useMemo } from "react";
import Lottie from "lottie-react";
import { useMantineColorScheme } from "@mantine/core";

interface Props {
  /** Light-mode JSON import */
  light: object;
  /** Dark-mode JSON import (optional — falls back to light) */
  dark?: object;
  loop?: boolean;
  className?: string;
}

export function IconLottieWrapper({ light, dark, loop = true, className }: Props) {
  const { colorScheme } = useMantineColorScheme();
  const data = useMemo(
    () => (colorScheme === "dark" && dark ? dark : light),
    [colorScheme, dark, light],
  );
  return <Lottie animationData={data} loop={loop} className={className} />;
}
