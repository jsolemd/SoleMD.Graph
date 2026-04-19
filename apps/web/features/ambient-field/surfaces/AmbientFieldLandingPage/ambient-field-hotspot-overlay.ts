import type { AmbientFieldHotspotFrame } from "../../renderer/FieldScene";

export interface AmbientFieldBlobHotspot {
  badges: string[];
  cardLeft?: string;
  cardTop?: string;
  id: string;
  title: string;
}

export interface AmbientFieldFocusSeatRect {
  height: number;
  left: number;
  top: number;
}

export interface AmbientFieldFocusMotionState {
  arcDirection: 1 | -1;
  enteredAtSeconds: number;
  entryX: number;
  entryY: number;
}

export interface AmbientFieldFocusPresentation {
  pointOpacity: number;
  pointScale: number;
  pointX: number;
  pointY: number;
  seatOpacity: number;
  seatScale: number;
  seatTranslateY: number;
  state: AmbientFieldFocusMotionState;
}

export const ambientFieldBlobHotspots: readonly AmbientFieldBlobHotspot[] = [
  {
    cardLeft: "28px",
    cardTop: "-18px",
    id: "papers",
    title: "Paper subset enters focus",
    badges: ["Selected", "High confidence"],
  },
  {
    cardLeft: "28px",
    cardTop: "-18px",
    id: "entities",
    title: "Entity-rich paper neighborhood",
    badges: ["Gene", "Chemical"],
  },
  {
    cardLeft: "28px",
    cardTop: "-18px",
    id: "relations",
    title: "Relation bridge becomes visible",
    badges: ["Linking", "Synthesis-ready"],
  },
  ...Array.from({ length: 37 }, (_, index) => ({
    id: `dot-${index + 4}`,
    title: "",
    badges: [],
  })),
] as const;

export const ambientFieldFocusedPaperSeat = {
  badge: "Journal article",
  eyebrow: "Selected paper",
  summary:
    "Beat 3 should lock one paper into focus before the richer metadata surface takes over.",
  title: "Focused paper enters inspection",
} as const;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(min: number, max: number, value: number) {
  if (max <= min) return value >= max ? 1 : 0;
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function quadraticBezier(
  start: number,
  control: number,
  end: number,
  progress: number,
) {
  const inverse = 1 - progress;
  return (
    inverse * inverse * start +
    2 * inverse * progress * control +
    progress * progress * end
  );
}

export function resolveAmbientFieldFocusPresentation({
  frame,
  nowSeconds,
  previousState,
  seatRect,
}: {
  frame: AmbientFieldHotspotFrame;
  nowSeconds: number;
  previousState: AmbientFieldFocusMotionState | null;
  seatRect: AmbientFieldFocusSeatRect;
}): AmbientFieldFocusPresentation {
  const state =
    previousState ??
    ({
      arcDirection: frame.y <= seatRect.top ? 1 : -1,
      enteredAtSeconds: nowSeconds,
      entryX: frame.x,
      entryY: frame.y,
    } satisfies AmbientFieldFocusMotionState);
  const elapsed = Math.max(0, nowSeconds - state.enteredAtSeconds);
  const approachTimeProgress = smoothstep(0, 0.86, elapsed);
  const scrollProgress = smoothstep(0.06, 0.74, frame.focusProgress);
  const settle = Math.min(approachTimeProgress, scrollProgress);
  const hoverBlend = smoothstep(0.58, 0.92, frame.focusProgress);
  const seatReveal = smoothstep(0.24, 0.78, frame.focusProgress);
  const seatDismiss = smoothstep(0.12, 0.88, frame.focusDismissProgress);
  const exitBlend = smoothstep(0.16, 0.94, frame.focusDismissProgress);
  const seatEdgeX = seatRect.left - 24;
  const seatEdgeY = seatRect.top + seatRect.height * 0.32;
  const controlX = lerp(state.entryX, seatEdgeX, 0.52) - 38;
  const controlY =
    lerp(state.entryY, seatEdgeY, 0.38) - 34 * state.arcDirection;
  const approachX = quadraticBezier(state.entryX, controlX, seatEdgeX, settle);
  const approachY = quadraticBezier(state.entryY, controlY, seatEdgeY, settle);
  const hoverPhase = nowSeconds * 0.82;
  const holdX = seatEdgeX + Math.cos(hoverPhase) * 4;
  const holdY = seatEdgeY + Math.sin(hoverPhase) * 6;
  const backgroundX = seatEdgeX + 172;
  const backgroundY = seatEdgeY - 124;
  const settledX = lerp(approachX, holdX, hoverBlend);
  const settledY = lerp(approachY, holdY, hoverBlend);
  const settledScale = lerp(frame.scale, 1.16, settle) + hoverBlend * 0.02;
  const pointX = lerp(settledX, backgroundX, exitBlend);
  const pointY = lerp(settledY, backgroundY, exitBlend);
  const pointScale = lerp(settledScale, frame.scale * 0.72, exitBlend);
  const pointOpacity = frame.opacity * lerp(1, 0.4, exitBlend);
  const seatOpacity = frame.opacity * seatReveal * (1 - seatDismiss);

  return {
    pointOpacity,
    pointScale,
    pointX,
    pointY,
    seatOpacity,
    seatScale: lerp(0.96, 1, seatReveal) * lerp(1, 0.98, seatDismiss),
    seatTranslateY: lerp(18, 0, seatReveal) + seatDismiss * 14,
    state,
  };
}
