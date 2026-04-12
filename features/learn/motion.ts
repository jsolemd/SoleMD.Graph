export {
  crisp,
  smooth,
  responsive,
  bouncy,
  canvasReveal,
  nodePopIn,
  dataReveal,
  heroScrollReveal,
} from "@/lib/motion";

import { crisp, smooth } from "@/lib/motion";
import type { Transition, Variants } from "framer-motion";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const sectionReveal: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { y: smooth, opacity: { duration: 0.15, ease: "easeOut" } },
  },
};

export const sectionRevealReduced: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2, ease: "easeOut" },
  },
};

export const sceneHandoff: Variants = {
  enter: { opacity: 0, x: 40 },
  center: {
    opacity: 1,
    x: 0,
    transition: { x: crisp, opacity: { duration: 0.12, ease: "easeOut" } },
  },
  exit: {
    opacity: 0,
    x: -40,
    transition: { x: crisp, opacity: { duration: 0.08, ease: "easeIn" } },
  },
};

export const sceneHandoffReduced: Variants = {
  enter: { opacity: 0 },
  center: {
    opacity: 1,
    transition: { duration: 0.15, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.1, ease: "easeIn" },
  },
};

export const staggerChildren: Transition = {
  staggerChildren: 0.06,
};

export const cardReveal: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      scale: crisp,
      opacity: { duration: 0.12, ease: "easeOut" },
    },
  },
};

export const cardRevealReduced: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.15, ease: "easeOut" },
  },
};
