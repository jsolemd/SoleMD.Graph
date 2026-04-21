"use client";
/**
 * SoleMD brand mark — the Noto brain exhibited as a Cosmograph.
 *
 * Node positions come from sampling every sub-path of Google's Noto Emoji
 * U+1F9E0 glyph (SIL OFL 1.1): the silhouette, the sulci, the cerebellum
 * shadows, the individual gyri detail strokes — all 14 paths. Each path
 * contributes points proportional to its arc length, so the resulting
 * cloud traces the actual anatomy Noto drew rather than an outline-only
 * abstraction. k-NN then wires the cloud into a planar mesh, and k-means
 * assigns the SoleMD entity-accent palette by spatial region so the
 * brain reads as colored clusters the way the wiki Cosmograph does.
 *
 * No force simulation: the points are anatomical truth; moving them would
 * blur the shape. A single collective breath pulses the whole SVG.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

// All sub-paths of the Noto Emoji U+1F9E0 glyph, verbatim from
// googlefonts/noto-emoji. Paths are ordered from largest (main body)
// to smallest (detail strokes). SIL OFL 1.1.
const NOTO_BRAIN_PATHS: readonly string[] = [
  // Main cerebral body
  "M118,53.3c0,0-0.25-8.1-4.6-15.27c-3.75-6.18-9.1-6.81-9.1-6.81s-1.06-3.89-4.78-6.87s-11.37-5.47-11.37-5.47c-15.32-6.9-24.87-1.25-24.87-1.25s-22.72-5.4-40.91,10.03c0,0-9.18,4.32-12.93,12.48c-2.07,4.52-1.18,11.89-1.18,11.89c-6.37,7.4-4.62,19.12,2.53,24.99c3.41,2.79,7.62,4.64,12.01,5.11c1.72,0.18,2.59-0.23,3.31,1.52c1.06,2.58,1.89,5.23,4.02,7.08c2.17,1.88,4.7,3.34,7.39,4.34c5.22,1.93,11.12,2.14,16.39,0.25c1.75-0.63,7.36-0.69,7.36-0.69s2.97,2.45,13.51,2.06s14.99-4.94,17.4-5.79c1.85-0.65,4.12-2.08,6.14-1.71c1.15,0.21,2.18,0.8,3.23,1.3c2.94,1.41,6.24,2.18,9.48,1.88c12.25-1.13,13.54-15.24,12.33-24.94C122.14,57.64,118,53.3,118,53.3z",
  // Cerebellum underside shadow
  "M61.53,89.7c0,0,1.87,7.96,12.23,13.88c6.53,3.73,20.26,7.6,27.27,2.42c7.98-5.9,9.7-11.74,10.08-13.89c0.38-2.15-0.76-8.08-0.76-8.08l-13.13-4.67c0,0-21.71,5.3-22.09,5.3C74.76,84.67,61.53,89.7,61.53,89.7z",
  // Cerebellum shadow deepest — the ridged cerebellar detail
  "M110.39,94.67c0.29-0.75,0.47-1.39,0.6-1.92c-2.32-0.62-5.01-1.62-7.45-2.66c0.2-0.09,0.4-0.18,0.59-0.28c1.2-0.61,2.38-1.32,3.23-2.36c0.92-1.12,1.34-2.57,1.29-4.02l-11.43-4.07c0,0-21.71,5.3-22.09,5.3c-0.38,0-13.6,5.03-13.61,5.04c-0.17,0.06,1.23,3,1.32,3.15c1.27,2.37,4.19,5.67,6.19,7.46c0,0-0.92-2.12,0.82-2.91c0.77-0.35,1.7-0.18,2.49,0.13c1.98,0.79,4.46,3.83,10.66,7.09c4.21,2.22,8.54,3.92,9.94,3.86c1.87-0.08,5.26-0.99,5.26-0.99s-4.32-0.41-11.26-3.64c-2.1-0.98-9.87-4.8-10.61-6.93c-0.21-0.6-0.96-1.66,0.4-2.26c2.08-0.93,7.75,3.96,12.62,6.2c5.8,2.66,12.12,4.79,12.12,4.79c0.68-0.52,1.32-1.04,1.92-1.56c-3.23-0.83-6.39-1.97-9.44-3.3c-3.04-1.32-6.02-3.03-8.77-4.91c-1.75-1.2-2.96-3.22-1.08-3.48c3.08-0.43,7.06,2.5,11.05,4.57c3.6,1.87,7.92,2.73,11.97,3.24c0.52-0.65,1.37-1.89,1.37-1.89s-1.53-0.26-6.05-1.26c-1.98-0.44-3.9-1.01-5.66-2c-0.46-0.26-2.07-1.91,0.13-2.67s4.29,0.75,7.61,1.52C107.85,94.7,110.36,94.74,110.39,94.67z",
  // Left side / temporal shadow
  "M27.52,72.45c-0.25,0.57-2.75,6.03-4.85,6.91c-3.63,1.53-9.25-2.11-11.4-3.11c-0.42-0.2-0.7,0.3-0.7,0.3c-0.35,0.45,0.56,1.38,1.02,1.71c1.78,1.28,6.05,4.18,9.22,4.97c4.09,1.02,7.16,0,7.16,0s1.12-8.19,1.21-8.56s0-3.63,0-3.63L27.52,72.45z",
  // Detail group: gyri strokes, highlights, feature paths
  "M63.25,95.56c0,0-2.06-0.32-5.22-0.27c-3.16,0.05-7.61,0.96-7.61,0.96s3.14-1.43,4.54-2.68c1.4-1.26,1.68-4.32,1.45-6.14c-0.24-1.86-0.87-2.8-5.63-3.79l14.26-0.79C60.26,86.03,59.39,92.58,63.25,95.56z",
  "M106.42,65.47c-2.48,0.33-4.89-0.14-7.03-1.41c-0.93-0.56-1.03-1.88-0.21-2.59c0.55-0.47,1.34-0.5,1.95-0.1c3.46,2.27,6.98,0.78,8.86-0.39c4.8-2.99,7.18-8.29,6.86-13.85c0.96,1.7,1.66,3.58,1.83,5.52c0.43,4.71-2.96,8.38-6.75,10.75C110.12,64.54,108.25,65.23,106.42,65.47z",
  "M117.14,70.16c-1.08,0-2.25-0.23-3.36-0.91c-1.14-0.7-1.78-1.64-2.35-2.8c-0.47-0.95-1.13-1.54-2.34-1.45c-0.85,0.07-1.67,0.55-2.52,0.43c1.13-2,2.94-3.6,5.07-4.47c0.98-0.4,2.08-0.65,3.08-0.34c0.11,0.7-0.36,1.35-0.63,2.01c-0.47,1.17-0.28,2.57,0.48,3.57c0.52,0.68,1.51,1.41,2.42,1.35c0.6-0.04,1.02-0.55,1.61-0.6c1.83-0.13,2.29,2.55,0.49,2.97C118.51,70.06,117.85,70.16,117.14,70.16z",
  "M99.54,33.08c-0.73,0.09-1.47,0.01-1.85-0.63c-0.49-0.83-0.08-1.87,0.83-2.19c2.51-0.88,5.33-0.72,7.78,0.26c2.14,0.86,3.43,2.32,4.28,3.31c0.85,0.99,1.43,2.95,1.43,2.95C109.88,34.93,108.67,32.02,99.54,33.08z",
  "M89.96,31.15c-2.16-0.09-0.06,0-0.08,0c-3.42,0-7.51-1.18-8.06-5.08c-0.99-7.1,9.49-4.34,13.33-3.81c0,0-3.03-3.11-7-3.38c-1.85-0.12-3.76-0.07-5.56,0.41c-1.98,0.53-2.98,2.02-4.78,2.76c-1.36,0.55-2.91,0.34-4.31-0.08c-1.29-0.39-5.48-2.64-5.6,0.16c-0.03,0.77,0.52,1.43,1.27,1.54c3.04,0.43,7.24,1.79,8.8,4.69c0.72,1.33,0.89,2.94,0.47,4.39c-0.2,0.71-0.49,1.62,0.1,2.07c0.45,0.35,1.14,0.12,1.55-0.28c0.41-0.4,0.67-0.94,1.08-1.34c1.28-1.26,2.44-0.36,3.8,0.12c1.57,0.56,3.23,0.83,4.9,0.83c0.04,0-2.93-0.29,0.11,0C93.01,34.43,92.11,31.24,89.96,31.15z",
  "M41.89,27.89c-1.66-1.5-2.45-7.34,2.32-10.35c0,0-2.6,0.09-4.77,1.79c-1.85,1.45-2.22,3.96-1.78,6.61c0.11,0.68-0.42,1.3-1.11,1.26c-2.48-0.13-4.95,0.32-7.08,1.3c-0.81,0.38-1.09,1.4-0.61,2.16l0,0c0.41,0.64,1.22,0.86,1.91,0.54c2.39-1.1,5.87-1.69,8.66-0.99c2.83,0.71,4.82,1.53,7.04,5.38c0.38,0.65,1.2,0.88,1.82,0.46h0c0.48-0.33,0.68-0.95,0.48-1.49C46.87,29.32,44.13,29.91,41.89,27.89z",
  "M48.08,45.9c-0.24-0.82-1.08-1.27-1.87-1.03c-2.4,0.72-5.87,0.51-7.42-1.05c-2.07-4.79-3.64-5.64-6.15-6.49c-1-0.34-2,0.52-1.9,1.56v0c0.06,0.59,0.45,1.09,1.02,1.26c1.78,0.53,3.57,2.92,4.49,5.36c0.84,2.21,0.94,5.12-0.96,7.2c-0.49,0.54-0.59,1.32-0.16,1.91l0.02,0.03c0.55,0.76,1.65,0.82,2.29,0.13c0.68-0.74,1.39-1.7,1.69-2.67c0.31-1.03,0.22-1.95,1.11-2.77c0.99-0.92,1.93-0.73,3.12-0.73c1.22,0,2.53-0.44,3.68-0.85C47.82,47.51,48.32,46.68,48.08,45.9z",
  "M17.42,59.46c-0.34,0-0.67-0.01-1.02-0.04c-4.63-0.4-7.06-3.73-8.16-7.38s-0.17-7.62-0.17-7.62c1.4,10.8,7.03,11.87,8.59,12.01c2.95,0.26,5.77-1.02,6.54-2.97c1.22-3.08-2.52-6.1-4.35-7.97c-1.21-1.24-1.66-3.35-1.34-5.02c0.16-0.86,0.54-1.7,1.25-2.25c0.7-0.54,2.46-1.03,2.22,0.51c-0.07,0.48-0.38,0.88-0.57,1.32c-1.37,3.12,3.5,6.01,4.83,8.32c1.09,1.87,1.57,4.13,0.75,6.19C24.83,57.5,21.32,59.46,17.42,59.46z",
  "M105.56,73.1c-2.07-0.25-4.2-0.1-6.16,0.64c-1.66,0.63-2.9,1.9-4.81,1.48c-1.14-0.25-2.15-0.98-2.86-1.91c-1.5-1.95-1.3-4-0.74-6.22c0.56-2.2,0.5-4.75-0.49-6.82c-0.26-0.55-0.7-1.04-1.27-1.24c-0.58-0.2-1.29-0.03-1.63,0.48c-0.34,0.52-0.21,1.21-0.09,1.82c0.39,1.87,0.89,3.89,0.33,5.72c-0.53,1.74-1.26,3.3-2.51,4.64c-2.37,2.55-5.81,3.72-8.78,2.97c-2.19-0.55-3.96-2.08-5.15-4.42c-0.42-1.83-0.86-4.21-3.13-4.47c-0.46-0.05-0.96,0.02-1.31,0.31c-0.35,0.3-0.51,0.78-0.51,1.24c0,1.15,1.1,2.01,1.3,3.14c0.63,3.46-1.67,7.42-5.16,9.34c-2.7,1.49-10.11,2.33-16.75-3.24c-0.28-0.24-0.28-0.7-0.55-0.95c-0.18-0.16-0.41-0.26-0.64-0.3c-0.99-0.19-2.02,0.75-1.93,1.75c0.08,0.91,0.83,1.61,1.5,2.23c1.74,1.62,0.96,2.27,0.66,3.14c-0.07,0.22-0.2,0.42-0.22,0.65c-0.06,0.64,0.92,0.43,1.56,0.38c0.64-0.05,1.22-0.4,1.84-0.58c0.78-0.22,4.35,1.09,5.05,1.24c2.03,0.44,2.73,0.64,4.48,0.64c2.19,0,4.05,1.13,5.65-0.37c2.28-2.13,4.05-3.52,6.07-4.21c1-0.34,2.2-0.51,3.04,0.14c0.6,0.46,0.87,1.23,1.08,1.95c0.43,1.48,0.75,2.99,1.38,4.4c0.63,1.4,1.63,2.71,3.03,3.34c0.44,0.2,0.94,0.33,1.42,0.22s0.9-0.52,0.91-1c0.01-0.33-0.16-0.63-0.34-0.9c-0.69-1.1-1.51-2.12-2.12-3.26c-0.61-1.14-1.01-2.47-0.76-3.74c0.46-2.35,3.18-3.01,5.13-3.6c1.87-0.57,3.74-1.64,5.75-1.53c1.26,0.07,3.93,1.54,4.73,2.52c0.16,0.2,0.23,0.45,0.27,0.71c0.34,2.11-1.21,4.01-2.68,5.55c-0.26,0.27-0.53,0.68-0.31,0.99c0.08,0.11,0.2,0.17,0.32,0.21c1.06,0.41,2.3,0.05,3.2-0.64c1.98-1.5,2.67-4.07,4.36-5.85c1.39-1.45,3.26-2.4,5.15-3.02c6.76-2.22,7.11,3.1,8.32,6.08s3,0.92,3.02,0.1C114.28,78.96,111.79,73.84,105.56,73.1z",
  "M42.25,88.89L42.25,88.89c-1.03-0.06-1.71-1.13-1.29-2.08c0.67-1.52,1.93-3.03,3.56-4.19c2.48-1.76,4.96-2.08,7.45-1.37l0.51,2.54c-1.61-0.46-4.49,0.05-6.22,1.28c-1.25,0.89-2.11,1.98-2.53,2.89C43.46,88.55,42.89,88.93,42.25,88.89z",
  // Deep central sulcus / temporal lobe accent
  "M107.01,42.8c-0.19-1.27-1.18-2.45-2.46-2.49c-0.63-0.02-1.33,0.31-1.5,0.92c-0.08,0.27-0.04,0.57-0.03,0.85c0.08,2.08-1.59,4.09-3.65,4.38c-2.33,0.33-4.05-1.11-5.81-2.31c-1.68-1.14-3.78-1.91-5.72-2.46c-5.17-1.45-9.62-0.48-13.01,3.79c-1.26,1.59-2.46,3.33-4.23,4.31c-2.78,1.54-8.65,1.65-10.38-1.37c-2.27-3.95-2.35-16.09,4.93-14.71c2.25,0.43,3.92,2.38,4.08,3.83c0.1,0.92-0.47,1.72-1.2,2.34c-0.56,0.48-0.68,1.29-0.3,1.91c0.48,0.79,1.56,0.96,2.26,0.37c2.05-1.76,2.37-3.61,2.22-4.95c-0.47-4.27-5.28-6.68-9.1-6.79c-0.84-0.03-1.81-0.3-2.13-1.09c-0.14-0.34-0.12-0.71-0.15-1.07c-0.2-2.55-2.81-5.32-4.85-6.64c-0.75-0.49-1.76-0.17-2.15,0.63c-0.33,0.69-0.07,1.5,0.57,1.92c1.94,1.28,3.12,3.14,3.51,5.54c0.44,2.76-0.16,5.58-1.32,8.09c-0.58,1.26-1.29,2.48-2.12,3.6c-0.71,0.97-1.72,1.62-2.18,2.78c-0.05,0.13-0.1,0.27-0.06,0.4c0.07,0.25,0.38,0.32,0.64,0.33c0.74,0.03,1.48-0.13,2.14-0.44c-0.38,1.47,0.6,2.9,1.41,4.18c0.81,1.28,1.46,3.02,0.54,4.23c-0.04,0.05-0.09,0.1-0.13,0.16c-1.97,0.83-3.87,1.96-5.35,3.52c-2.55,2.7-4.44,5.13-8.17,6.33c-3.3,1.07-6.97,0.94-10.18-0.35c-0.62-0.25-1.25-0.54-1.92-0.52c-0.67,0.02-1.38,0.49-1.4,1.16c-0.01,0.34,0.16,0.65,0.31,0.96c1.7,3.45-1.42,5.69-2.75,8.69c-1.25,2.8-1.89,5.87-1.89,8.94c0,3.35,1.15,5.79,5.3,10.05c1.88,1.92,4.34,3.06,6.41,3.73c0.65,0.21,1.06-0.68,0.48-1.05c-4.27-2.72-4.94-5.13-6.24-7.61c-3.12-5.97,0.29-15.07,6.16-19.69c2.27-1.78,5.49-1.64,8.23-0.7c2.94,1.01,4.68,3.17,6.89,5.18c0.6,0.55,1.37,1.14,2.14,0.9c0.7-0.21,1.05-1.04,0.97-1.76c-0.08-0.72-0.49-1.36-0.88-1.97c-0.43-0.67-0.86-1.34-1.3-2.01c-0.57-0.88-1.16-1.8-1.34-2.84c-0.2-1.13,0.8-5.04,10.3-7.46c1.61-0.41,3.25-0.23,4.87,0.23c2.18,0.62,3.74,2.22,5.57,3.47c0.51,0.35,1.07,0.72,1.69,0.74c0.78,0.03,1.54-0.56,1.7-1.33c0.22-1.06-0.58-2.01-1.11-2.95c-1.76-3.1,0.29-7.24,2.88-9.22c2.32-1.76,5.37-2.41,8.26-2.11c4.4,0.45,8.74,3.39,9.75,7.69c0.23,0.97,0.51,2.22,1.5,2.35c1.1,0.15,1.69-1.32,1.58-2.43s-0.47-2.36,0.22-3.24c0.32-0.4,0.8-0.63,1.27-0.84c1.35-0.59,2.76-1.08,3.97-1.93c1.21-0.84,2.22-2.13,2.31-3.6C107.05,43.2,107.04,43,107.01,42.8z",
];

const CLUSTER_COLORS: readonly string[] = [
  "var(--color-warm-coral)",
  "var(--color-fresh-green)",
  "var(--color-soft-pink)",
  "var(--color-golden-yellow)",
  "var(--color-soft-blue)",
  "var(--color-soft-lavender)",
];

// Noto paths that belong to the cerebellum region — lightly boosted in
// the sampling budget so the cerebellum reads as its own lobe rather
// than a couple of stray points tangent to the main body.
const CEREBELLUM_PATH_INDICES: ReadonlySet<number> = new Set([1, 2]);

type Point = { x: number; y: number };
type Node = { id: string; x: number; y: number; cluster: number };
type Edge = { a: Node; b: Node };

interface Layout {
  nodes: Node[];
  edges: Edge[];
  degree: Map<string, number>;
}

const TOTAL_NODES = 140;
const KNN_K = 3;
const MAX_EDGE_LENGTH = 17;
const MIN_DIST = 3.0;
const CLUSTER_K = CLUSTER_COLORS.length;

function samplePathAt(path: SVGPathElement, total: number, count: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < count; i++) {
    const p = path.getPointAtLength((i / count) * total);
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

function sampleAllNotoPaths(totalNodes: number): Point[] {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 128 128");
  svg.style.position = "absolute";
  svg.style.visibility = "hidden";
  svg.style.pointerEvents = "none";
  svg.style.left = "-9999px";
  document.body.appendChild(svg);

  const paths = NOTO_BRAIN_PATHS.map((d) => {
    const el = document.createElementNS(svgNS, "path") as SVGPathElement;
    el.setAttribute("d", d);
    svg.appendChild(el);
    return { el, len: el.getTotalLength() };
  });

  // Distribute sample counts proportional to length, with a minimum of 4
  // samples per path so small detail strokes still contribute a cluster.
  const totalLen = paths.reduce((s, p) => s + p.len, 0);
  const budget = totalNodes - paths.length * 4;
  const counts = paths.map((p) => 4 + Math.round((p.len / totalLen) * budget));

  // Lightly boost cerebellum paths so the lower lobe reads as its own
  // region instead of a few stray points tangent to the main body.
  for (const idx of CEREBELLUM_PATH_INDICES) {
    counts[idx] = Math.max(counts[idx], 16);
  }

  const raw: Point[] = [];
  paths.forEach(({ el, len }, i) => {
    const isCerebellum = CEREBELLUM_PATH_INDICES.has(i);
    for (const pt of samplePathAt(el, len, counts[i])) {
      // Nudge cerebellum points slightly down-right so the lobe hangs
      // a hair below the temporal lobe of the main body instead of
      // fusing into it. Just enough to read as a transition.
      if (isCerebellum) {
        raw.push({ x: pt.x + 1.2, y: pt.y + 2.4 });
      } else {
        raw.push(pt);
      }
    }
  });
  document.body.removeChild(svg);

  // Poisson-style dedupe: drop points within MIN_DIST of an earlier one.
  const out: Point[] = [];
  for (const p of raw) {
    let tooClose = false;
    for (const q of out) {
      if (Math.hypot(q.x - p.x, q.y - p.y) < MIN_DIST) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) out.push(p);
  }
  return out;
}

function buildKnnEdges(nodes: Node[], k: number, maxLen: number): Edge[] {
  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const ni = nodes[i];
    const neighbors = nodes
      .map((n, j) => ({ j, d: Math.hypot(n.x - ni.x, n.y - ni.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(1, k + 1);
    for (const { j, d } of neighbors) {
      if (d > maxLen) continue;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: nodes[i], b: nodes[j] });
    }
  }
  return edges;
}

// Deterministic k-means++ on 2D positions.
function clusterNodes(nodes: Node[], k: number): number[] {
  const n = nodes.length;
  if (n === 0) return [];
  const xs = nodes.map((d) => d.x);
  const ys = nodes.map((d) => d.y);

  const centroidIdx: number[] = [];
  let firstIdx = 0;
  let minX = Infinity;
  for (let i = 0; i < n; i++) {
    if (xs[i] < minX) {
      minX = xs[i];
      firstIdx = i;
    }
  }
  centroidIdx.push(firstIdx);
  while (centroidIdx.length < k) {
    let bestI = 0;
    let bestD = -1;
    for (let i = 0; i < n; i++) {
      let minD = Infinity;
      for (const c of centroidIdx) {
        const d = Math.hypot(xs[i] - xs[c], ys[i] - ys[c]);
        if (d < minD) minD = d;
      }
      if (minD > bestD) {
        bestD = minD;
        bestI = i;
      }
    }
    centroidIdx.push(bestI);
  }

  const cx = centroidIdx.map((i) => xs[i]);
  const cy = centroidIdx.map((i) => ys[i]);
  const assign = new Array<number>(n).fill(0);

  for (let iter = 0; iter < 14; iter++) {
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (xs[i] - cx[c]) ** 2 + (ys[i] - cy[c]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[i] = best;
    }
    const sumX = new Array<number>(k).fill(0);
    const sumY = new Array<number>(k).fill(0);
    const cnt = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      sumX[assign[i]] += xs[i];
      sumY[assign[i]] += ys[i];
      cnt[assign[i]] += 1;
    }
    for (let c = 0; c < k; c++) {
      if (cnt[c] > 0) {
        cx[c] = sumX[c] / cnt[c];
        cy[c] = sumY[c] / cnt[c];
      }
    }
  }
  return assign;
}

function buildLayout(): Layout | null {
  if (typeof document === "undefined") return null;
  const pts = sampleAllNotoPaths(TOTAL_NODES);
  if (pts.length === 0) return null;

  const nodes: Node[] = pts.map((p, i) => ({
    id: String(i),
    x: p.x,
    y: p.y,
    cluster: 0,
  }));

  const assign = clusterNodes(nodes, CLUSTER_K);
  nodes.forEach((n, i) => {
    n.cluster = assign[i];
  });

  const edges = buildKnnEdges(nodes, KNN_K, MAX_EDGE_LENGTH);

  const degree = new Map<string, number>();
  for (const n of nodes) degree.set(n.id, 0);
  for (const { a, b } of edges) {
    degree.set(a.id, (degree.get(a.id) ?? 0) + 1);
    degree.set(b.id, (degree.get(b.id) ?? 0) + 1);
  }

  return { nodes, edges, degree };
}

function radiusFor(deg: number): number {
  return 1.0 + Math.min(1.3, deg * 0.18);
}

export default function SoleMDLogo({
  size = 128,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const rawId = useId();
  const uid = rawId.replace(/:/g, "-");
  const [layout, setLayout] = useState<Layout | null>(null);

  useEffect(() => {
    setLayout(buildLayout());
  }, []);

  const haloDefs = useMemo(
    () =>
      CLUSTER_COLORS.map((color, k) => (
        <radialGradient
          key={`halo-${k}`}
          id={`solemd-halo-${uid}-${k}`}
          cx="50%"
          cy="50%"
          r="50%"
        >
          <stop offset="0%" stopColor={color} stopOpacity={0.95} />
          <stop offset="45%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      )),
    [uid],
  );

  return (
    <motion.svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="SoleMD"
      className={className}
      initial={{ scale: 0.96, opacity: 0 }}
      animate={
        reduced
          ? { scale: 1, opacity: 1 }
          : { scale: [1, 1.035, 1], opacity: 1 }
      }
      transition={
        reduced
          ? { duration: 0.3, ease: "easeOut" }
          : {
              scale: { duration: 3.0, ease: "easeInOut", repeat: Infinity },
              opacity: { duration: 0.4, ease: "easeOut" },
            }
      }
      style={{ transformOrigin: "center" }}
    >
      <defs>{haloDefs}</defs>

      {layout && (
        <>
          <g
            stroke="var(--text-secondary)"
            strokeOpacity={0.5}
            strokeWidth={0.45}
            strokeLinecap="round"
            fill="none"
          >
            {layout.edges.map((e, k) => (
              <line
                key={`e-${k}`}
                x1={e.a.x}
                y1={e.a.y}
                x2={e.b.x}
                y2={e.b.y}
              />
            ))}
          </g>

          {layout.nodes.map((n) => (
            <circle
              key={`halo-${n.id}`}
              cx={n.x}
              cy={n.y}
              r={3.8}
              fill={`url(#solemd-halo-${uid}-${n.cluster})`}
            />
          ))}

          {layout.nodes.map((n) => (
            <circle
              key={`core-${n.id}`}
              cx={n.x}
              cy={n.y}
              r={radiusFor(layout.degree.get(n.id) ?? 0)}
              fill={CLUSTER_COLORS[n.cluster]}
            />
          ))}
        </>
      )}
    </motion.svg>
  );
}
