"use client";
/**
 * Animation component registry.
 *
 * Maps manifest `name` → React component for framer/r3f/interactive
 * formats. This replaces dynamic string-based imports because
 * webpack/turbopack cannot statically enumerate arbitrary template
 * literals in `import()` calls — a registry is both simpler and
 * tree-shake friendly.
 *
 * When adding a new animation authored on the SoleMD.Make side:
 *   1. `make graph publish <category>/<name>`
 *   2. Add a `name → component` entry here
 *   3. Commit in SoleMD.Graph
 *
 * r3f/interactive components should be `dynamic(..., { ssr: false })`
 * so three.js stays out of the server bundle.
 */
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { Skeleton } from "@mantine/core";

const fallback = <Skeleton height={280} radius="lg" />;

const SmokePulse = dynamic(() => import("./_smoke/pulse/SmokePulse"), {
  loading: () => fallback,
});

const RotatingCube = dynamic(() => import("./_smoke/rotating-cube/RotatingCube"), {
  ssr: false,
  loading: () => fallback,
});

const ChartReveal = dynamic(() => import("./_smoke/chart-reveal/ChartReveal"), {
  loading: () => fallback,
});

const ScrollFade = dynamic(() => import("./_smoke/scroll-fade/ScrollFade"), {
  loading: () => fallback,
});

const DrawMorph = dynamic(() => import("./_smoke/gsap-draw-morph/DrawMorph"), {
  loading: () => fallback,
});

const ModelViewerDemo = dynamic(() => import("./_smoke/model-viewer-demo/ModelViewerDemo"), {
  ssr: false,
  loading: () => fallback,
});

const LottieDemo = dynamic(() => import("./_smoke/lottie-demo/LottieDemo"), {
  loading: () => fallback,
});

const NotoBrain = dynamic(() => import("./_smoke/noto-brain/NotoBrain"), {
  loading: () => fallback,
});

const TextReveal = dynamic(() => import("./_smoke/text-reveal/TextReveal"), {
  loading: () => fallback,
});

const NodeFocusDemo = dynamic(() => import("./_smoke/node-focus-demo/NodeFocusDemo"), {
  loading: () => fallback,
});

const AnimatedBeamDemo = dynamic(() => import("./_smoke/animated-beam/AnimatedBeamDemo"), {
  loading: () => fallback,
});

const ScrollMechanism = dynamic(() => import("./_smoke/scroll-mechanism/ScrollMechanism"), {
  loading: () => fallback,
});

const BioIconsSmoke = dynamic(() => import("./_smoke/bioicons/BioIconsSmoke"), {
  loading: () => fallback,
});

const LottieFilesSmoke = dynamic(() => import("./_smoke/lottie-files/LottieFilesSmoke"), {
  ssr: false,
  loading: () => fallback,
});

const DopamineD2Binding = dynamic(
  () => import("./biology/dopamine-d2-receptor/DopamineD2Binding"),
  { loading: () => fallback },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ANIMATION_COMPONENTS: Record<string, ComponentType<any>> = {
  "smoke-pulse": SmokePulse,
  "smoke-rotating-cube": RotatingCube,
  "smoke-chart-reveal": ChartReveal,
  "smoke-scroll-fade": ScrollFade,
  "smoke-draw-morph": DrawMorph,
  "smoke-model-viewer": ModelViewerDemo,
  "smoke-twemoji-brain": LottieDemo,
  "smoke-noto-brain": NotoBrain,
  "smoke-text-reveal": TextReveal,
  "smoke-node-focus": NodeFocusDemo,
  "smoke-animated-beam": AnimatedBeamDemo,
  "smoke-scroll-mechanism": ScrollMechanism,
  "smoke-bioicons": BioIconsSmoke,
  "smoke-lottie-files": LottieFilesSmoke,
  "dopamine-d2-binding": DopamineD2Binding,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAnimationComponent(name: string): ComponentType<any> | undefined {
  return ANIMATION_COMPONENTS[name];
}
