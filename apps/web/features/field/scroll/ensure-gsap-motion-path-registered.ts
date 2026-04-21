import { gsap } from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

let motionPathRegistered = false;

export function ensureGsapMotionPathRegistered() {
  if (motionPathRegistered) return;
  if (typeof window === "undefined") return;
  gsap.registerPlugin(MotionPathPlugin);
  motionPathRegistered = true;
}
