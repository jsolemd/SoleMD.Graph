"use client";

export interface PromptAvoidRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PromptPlacementInput {
  vw: number;
  vh: number;
  cardW: number;
  cardH: number;
  baseX: number;
  baseY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  bottomBase: number;
  avoidRects?: PromptAvoidRect[];
  gap?: number;
}

interface PromptCandidate {
  x: number;
  y: number;
}

const DEFAULT_GAP = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeRect(rect: PromptAvoidRect): PromptAvoidRect | null {
  if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) {
    return null;
  }
  if (rect.right <= rect.left || rect.bottom <= rect.top) {
    return null;
  }
  return rect;
}

function getPromptRect({
  vw,
  vh,
  cardW,
  cardH,
  x,
  y,
  bottomBase,
}: {
  vw: number;
  vh: number;
  cardW: number;
  cardH: number;
  x: number;
  y: number;
  bottomBase: number;
}): PromptAvoidRect {
  const left = vw / 2 - cardW / 2 + x;
  const top = vh - bottomBase - cardH + y;

  return {
    left,
    top,
    right: left + cardW,
    bottom: top + cardH,
  };
}

function rectsOverlap(a: PromptAvoidRect, b: PromptAvoidRect, gap: number): boolean {
  return (
    a.left < b.right + gap &&
    a.right > b.left - gap &&
    a.top < b.bottom + gap &&
    a.bottom > b.top - gap
  );
}

function getOverlapArea(a: PromptAvoidRect, b: PromptAvoidRect, gap: number): number {
  const left = Math.max(a.left, b.left - gap);
  const right = Math.min(a.right, b.right + gap);
  const top = Math.max(a.top, b.top - gap);
  const bottom = Math.min(a.bottom, b.bottom + gap);

  if (right <= left || bottom <= top) {
    return 0;
  }

  return (right - left) * (bottom - top);
}

export function resolvePromptAutoPosition({
  vw,
  vh,
  cardW,
  cardH,
  baseX,
  baseY,
  minX,
  maxX,
  minY,
  maxY,
  bottomBase,
  avoidRects = [],
  gap = DEFAULT_GAP,
}: PromptPlacementInput): PromptCandidate {
  const validRects = avoidRects
    .map(normalizeRect)
    .filter((rect): rect is PromptAvoidRect => rect !== null);

  const initial: PromptCandidate = {
    x: clamp(baseX, minX, maxX),
    y: clamp(baseY, minY, maxY),
  };

  if (validRects.length === 0) {
    return initial;
  }

  const initialRect = getPromptRect({
    vw,
    vh,
    cardW,
    cardH,
    x: initial.x,
    y: initial.y,
    bottomBase,
  });

  if (!validRects.some((rect) => rectsOverlap(initialRect, rect, gap))) {
    return initial;
  }

  const baseLeft = vw / 2 - cardW / 2;
  const baseTop = vh - bottomBase - cardH;
  const seen = new Set<string>();
  const candidates: PromptCandidate[] = [];
  const pushCandidate = (x: number, y: number) => {
    const next: PromptCandidate = {
      x: clamp(x, minX, maxX),
      y: clamp(y, minY, maxY),
    };
    const key = `${Math.round(next.x)}:${Math.round(next.y)}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push(next);
  };

  pushCandidate(initial.x, initial.y);

  for (const rect of validRects) {
    const aboveY = rect.top - gap - cardH - baseTop;
    const belowY = rect.bottom + gap - baseTop;
    const leftX = rect.left - gap - cardW - baseLeft;
    const rightX = rect.right + gap - baseLeft;

    pushCandidate(initial.x, aboveY);
    pushCandidate(leftX, initial.y);
    pushCandidate(rightX, initial.y);
    pushCandidate(leftX, aboveY);
    pushCandidate(rightX, aboveY);
    pushCandidate(initial.x, belowY);
  }

  const scoreCandidate = (candidate: PromptCandidate) => {
    const candidateRect = getPromptRect({
      vw,
      vh,
      cardW,
      cardH,
      x: candidate.x,
      y: candidate.y,
      bottomBase,
    });
    const overlapArea = validRects.reduce(
      (total, rect) => total + getOverlapArea(candidateRect, rect, gap),
      0,
    );
    const dx = Math.abs(candidate.x - initial.x);
    const dy = Math.abs(candidate.y - initial.y);
    const overlaps = overlapArea > 0;

    return {
      candidate,
      overlapArea,
      overlaps,
      movementCost: dx * 1.35 + dy,
    };
  };

  const ranked = candidates
    .map(scoreCandidate)
    .sort((a, b) => {
      if (a.overlaps !== b.overlaps) {
        return a.overlaps ? 1 : -1;
      }
      if (a.overlapArea !== b.overlapArea) {
        return a.overlapArea - b.overlapArea;
      }
      return a.movementCost - b.movementCost;
    });

  return ranked[0]?.candidate ?? initial;
}

export function unionPromptAvoidRects(rects: PromptAvoidRect[]): PromptAvoidRect | null {
  const validRects = rects
    .map(normalizeRect)
    .filter((rect): rect is PromptAvoidRect => rect !== null);

  if (validRects.length === 0) {
    return null;
  }

  return {
    left: Math.min(...validRects.map((rect) => rect.left)),
    top: Math.min(...validRects.map((rect) => rect.top)),
    right: Math.max(...validRects.map((rect) => rect.right)),
    bottom: Math.max(...validRects.map((rect) => rect.bottom)),
  };
}
