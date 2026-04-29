"use client";

import { useEffect, useRef, useState } from "react";

import {
  ORB_DEBUG_KEY,
  ORB_PERF_FLAG,
  getOrbPerfMarks,
} from "../webgpu/orb-webgpu-perf";

/**
 * Flag-gated dev overlay that surfaces the orb runtime's recent
 * `performance.measure` entries (see `orb-webgpu-perf`). Mounts only
 * when `window.__orbPerf === true` or the URL carries `?orbPerf=1`.
 *
 * Zero-cost contract:
 *   - The flag is sampled once on mount; flag-off callers return null
 *     before any other effects, refs, or state allocations land.
 *   - There is no `setInterval` or React subscription to a hot store;
 *     the rolling buffer lives in a `useRef` and React state only
 *     receives the throttled p50/p95 summary at ~10Hz.
 *   - The component renders pointer-events-none and the rAF loop
 *     cancels itself on unmount.
 */

const REFRESH_INTERVAL_MS = 100; // ~10Hz React renders
const ROLLING_FRAMES = 60;

const TRACKED_MEASURES = [
  "orb:pick:total",
  "orb:frame:cpu",
  "orb:weights:tick",
  "orb:rect:reduce",
] as const;

type MeasureName = (typeof TRACKED_MEASURES)[number];

type RollingBuffers = Record<MeasureName, number[]>;

interface MeasureSummary {
  p50: number;
  p95: number;
  samples: number;
}

type SummaryMap = Record<MeasureName, MeasureSummary>;

const EMPTY_SUMMARY: MeasureSummary = { p50: 0, p95: 0, samples: 0 };

function createEmptyBuffers(): RollingBuffers {
  return {
    "orb:pick:total": [],
    "orb:frame:cpu": [],
    "orb:weights:tick": [],
    "orb:rect:reduce": [],
  };
}

function createEmptySummary(): SummaryMap {
  return {
    "orb:pick:total": EMPTY_SUMMARY,
    "orb:frame:cpu": EMPTY_SUMMARY,
    "orb:weights:tick": EMPTY_SUMMARY,
    "orb:rect:reduce": EMPTY_SUMMARY,
  };
}

function isOrbPerfFlagOn(): boolean {
  if (typeof window === "undefined") return false;
  const winFlag = (window as unknown as Record<string, unknown>)[ORB_PERF_FLAG];
  if (winFlag === true) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("orbPerf") === "1";
  } catch {
    return false;
  }
}

function summarize(samples: readonly number[]): MeasureSummary {
  if (samples.length === 0) return EMPTY_SUMMARY;
  const sorted = Array.from(samples).sort((a, b) => a - b);
  const p50 = sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0;
  const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0;
  return { p50, p95, samples: sorted.length };
}

function readPerfMarks(): PerformanceMeasure[] {
  if (typeof window !== "undefined") {
    const debug = (window as unknown as Record<string, unknown>)[ORB_DEBUG_KEY] as
      | { perfMarks?: () => PerformanceMeasure[] }
      | undefined;
    if (debug?.perfMarks) return debug.perfMarks();
  }
  return getOrbPerfMarks();
}

export function OrbPerfOverlay() {
  // Flag is sampled once at mount via lazy state initializer so the
  // re-render path never re-checks `window.location` or the global
  // flag. Toggling the flag at runtime requires a remount — that is
  // the explicit contract for "zero cost when off".
  const [enabled] = useState<boolean>(() => isOrbPerfFlagOn());

  if (!enabled) return null;

  return <OrbPerfOverlayActive />;
}

function OrbPerfOverlayActive() {
  const buffersRef = useRef<RollingBuffers>(createEmptyBuffers());
  const lastSeenIdRef = useRef<string>("");
  const lastFlushRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const [summary, setSummary] = useState<SummaryMap>(() => createEmptySummary());

  useEffect(() => {
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      // Pull the rolling tail of measures and fold any unseen entries
      // into the per-name buffer. We dedupe by `name|startTime` so a
      // single rAF that fires after several frames of measures still
      // captures all of them.
      const marks = readPerfMarks();
      const buffers = buffersRef.current;
      let lastId = lastSeenIdRef.current;
      let advanced = false;
      for (let i = marks.length - 1; i >= 0; i -= 1) {
        const mark = marks[i]!;
        const id = `${mark.name}|${mark.startTime}`;
        if (id === lastSeenIdRef.current) {
          // Stop walking older entries; everything before is already
          // folded into the buffers from prior ticks.
          break;
        }
        const name = mark.name as MeasureName;
        if (TRACKED_MEASURES.includes(name)) {
          const buf = buffers[name];
          buf.push(mark.duration);
          if (buf.length > ROLLING_FRAMES) {
            buf.splice(0, buf.length - ROLLING_FRAMES);
          }
          if (!advanced) {
            lastId = id;
            advanced = true;
          }
        } else if (!advanced) {
          // Even when the latest mark is not tracked, advance the
          // dedupe pointer so we don't re-walk it next tick.
          lastId = id;
          advanced = true;
        }
      }
      if (advanced) lastSeenIdRef.current = lastId;

      if (now - lastFlushRef.current >= REFRESH_INTERVAL_MS) {
        lastFlushRef.current = now;
        setSummary({
          "orb:pick:total": summarize(buffers["orb:pick:total"]),
          "orb:frame:cpu": summarize(buffers["orb:frame:cpu"]),
          "orb:weights:tick": summarize(buffers["orb:weights:tick"]),
          "orb:rect:reduce": summarize(buffers["orb:rect:reduce"]),
        });
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      buffersRef.current = createEmptyBuffers();
      lastSeenIdRef.current = "";
      lastFlushRef.current = 0;
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-3 right-3 z-50 rounded-md px-3 py-2 font-mono text-[12px] leading-tight"
      style={{
        backgroundColor: "rgba(8, 10, 14, 0.78)",
        color: "rgba(220, 226, 235, 0.92)",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.35)",
        minWidth: 180,
      }}
    >
      <div style={{ opacity: 0.6, marginBottom: 2 }}>orb perf · 60f rolling</div>
      {TRACKED_MEASURES.map((name) => {
        const row = summary[name];
        return <OrbPerfRow key={name} name={name} row={row} />;
      })}
    </div>
  );
}

function OrbPerfRow({ name, row }: { name: MeasureName; row: MeasureSummary }) {
  const label = name.replace(/^orb:/, "");
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        columnGap: 8,
      }}
    >
      <span style={{ opacity: 0.85 }}>{label}</span>
      <span>{row.samples > 0 ? row.p50.toFixed(1) : "—"}</span>
      <span style={{ opacity: 0.7 }}>
        {row.samples > 0 ? row.p95.toFixed(1) : "—"}
      </span>
    </div>
  );
}
