import type { AmbientFieldProcessPoint } from "./ambient-field-landing-content";

export interface MeasuredProcessPath {
  points: readonly AmbientFieldProcessPoint[];
  segmentLengths: readonly number[];
  totalLength: number;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function scalePoint(
  point: AmbientFieldProcessPoint,
  width: number,
  height: number,
) {
  return {
    x: point.x * width,
    y: point.y * height,
  };
}

export function createMeasuredProcessPath(
  points: readonly AmbientFieldProcessPoint[],
): MeasuredProcessPath {
  const segmentLengths: number[] = [];
  let totalLength = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]!;
    const to = points[index + 1]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);

    segmentLengths.push(length);
    totalLength += length;
  }

  return {
    points,
    segmentLengths,
    totalLength,
  };
}

export function interpolateMeasuredProcessPath(
  measuredPath: MeasuredProcessPath,
  progress: number,
) {
  const { points, segmentLengths, totalLength } = measuredPath;
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1 || totalLength <= 0) return points[0]!;

  let remaining = clamp01(progress) * totalLength;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index]!;
    if (remaining <= segmentLength || index === segmentLengths.length - 1) {
      const mix = segmentLength > 0 ? remaining / segmentLength : 0;
      const from = points[index]!;
      const to = points[index + 1]!;

      return {
        x: from.x + (to.x - from.x) * mix,
        y: from.y + (to.y - from.y) * mix,
      };
    }

    remaining -= segmentLength;
  }

  return points.at(-1)!;
}

export function buildSmoothProcessPath(
  points: readonly AmbientFieldProcessPoint[],
  width: number,
  height: number,
) {
  const scaledPoints = points.map((point) => scalePoint(point, width, height));
  if (scaledPoints.length === 0) return "";
  if (scaledPoints.length === 1) {
    const point = scaledPoints[0]!;
    return `M ${point.x} ${point.y}`;
  }

  let path = `M ${scaledPoints[0]!.x} ${scaledPoints[0]!.y}`;

  for (let index = 0; index < scaledPoints.length - 1; index += 1) {
    const previous = scaledPoints[Math.max(index - 1, 0)]!;
    const current = scaledPoints[index]!;
    const next = scaledPoints[index + 1]!;
    const future =
      scaledPoints[Math.min(index + 2, scaledPoints.length - 1)]!;

    const cp1x = current.x + (next.x - previous.x) / 6;
    const cp1y = current.y + (next.y - previous.y) / 6;
    const cp2x = next.x - (future.x - current.x) / 6;
    const cp2y = next.y - (future.y - current.y) / 6;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }

  return path;
}
