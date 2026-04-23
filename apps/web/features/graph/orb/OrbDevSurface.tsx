"use client";

/**
 * <OrbDevSurface> — the orb-dev sandbox orchestrator.
 *
 * Responsibilities:
 *   - Share the existing DuckDB session via `useGraphBundle` +
 *     `useGraphWarmup`. Never open a parallel session.
 *   - Mount a frameloop="demand" <Canvas> with <GraphOrb> + drei <Html>
 *     for the hover tooltip.
 *   - Fetch paper titles via the existing `queries.getPaperDocument` API
 *     (same DuckDB path the real panels use).
 *   - Mirror clicks into the shared store (`useDashboardStore`) so when
 *     the orb later promotes into /graph, the selection wiring transfers.
 *
 * What it does NOT do:
 *   - Render edges, run physics, paint a detail panel, change bundle
 *     contract, or touch any file outside the quarantined orb-dev scope.
 */

import { Html } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GraphBundle, PaperDocument } from "@solemd/graph";
import { useGraphBundle } from "@/features/graph/hooks/use-graph-bundle";
import { useGraphWarmup } from "@/features/graph/hooks/use-graph-warmup";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { GraphOrb, type GraphOrbHandle } from "./render/GraphOrb";
import {
  useOrbPointBuffers,
  type OrbPointBuffersState,
} from "./render/point-buffers";

const ORB_DEV_SOURCE_ID = "orb-dev-sandbox";

interface OrbDevSurfaceProps {
  bundle: GraphBundle | null;
  /**
   * Optional path (from env or server) to `release_points_3d.parquet`. When
   * unset, the surface renders mock data. When set but attach fails, the
   * point-buffers hook falls back to mock data and surfaces an error
   * banner.
   */
  fixturePath?: string | null;
}

export function OrbDevSurface({
  bundle,
  fixturePath = null,
}: OrbDevSurfaceProps) {
  const bundleState = useGraphBundle(bundle);
  const warmup = useGraphWarmup(bundle);
  const canvas = bundleState.canvas;
  const queries = bundleState.queries;

  const sessionReady = warmup.graphReady && canvas != null;

  const buffersState: OrbPointBuffersState = useOrbPointBuffers(canvas, {
    fixturePath,
    enabled: sessionReady,
  });

  // Tooltip state + paper-title cache.
  const [hoveredPaperId, setHoveredPaperId] = useState<string | null>(null);
  const [hoveredTitle, setHoveredTitle] = useState<string | null>(null);
  const titleCacheRef = useRef<Map<string, string>>(new Map());

  // Prefers-reduced-motion — orb pauses rotation without remounting.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mql.matches);
    const handler = (ev: MediaQueryListEvent) => setReducedMotion(ev.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Orb disposal handle — route-leave triggers an explicit teardown so
  // GPU memory is released before React unmount completes.
  const orbHandleRef = useRef<GraphOrbHandle | null>(null);
  useEffect(() => {
    const handle = orbHandleRef;
    return () => {
      // Microtask defer so React commit finishes first.
      Promise.resolve().then(() => handle.current?.dispose());
    };
  }, []);

  useEffect(() => {
    const leaveHandler = () => orbHandleRef.current?.dispose();
    window.addEventListener("pagehide", leaveHandler);
    return () => window.removeEventListener("pagehide", leaveHandler);
  }, []);

  const handleHoverPaperId = useCallback(
    (paperId: string | null) => {
      setHoveredPaperId(paperId);
      if (paperId == null) {
        setHoveredTitle(null);
        return;
      }

      const cached = titleCacheRef.current.get(paperId);
      if (cached != null) {
        setHoveredTitle(cached);
        return;
      }
      setHoveredTitle(null);

      // Fully-synthetic mock ids (`mock-paper-*`) never resolve to a real
      // paper_documents row. Everything else — including the sampled
      // base_points branch — goes through the real DuckDB query.
      if (paperId.startsWith("mock-paper-")) {
        titleCacheRef.current.set(paperId, paperId);
        setHoveredTitle(paperId);
        return;
      }

      if (!queries) return;
      queries
        .getPaperDocument(paperId)
        .then((doc: PaperDocument | null) => {
          const title = doc?.title ?? doc?.citekey ?? paperId;
          titleCacheRef.current.set(paperId, title);
          setHoveredTitle(title);
        })
        .catch(() => {
          titleCacheRef.current.set(paperId, paperId);
          setHoveredTitle(paperId);
        });
    },
    [queries],
  );

  const handlePick = useCallback((paperId: string | null) => {
    const setActiveSelectionSourceId =
      useDashboardStore.getState().setActiveSelectionSourceId;
    const selectNode = useGraphStore.getState().selectNode;

    if (paperId == null) {
      setActiveSelectionSourceId(null);
      selectNode(null);
      console.warn("[orb-dev] deselect");
      return;
    }

    // Write through the same store APIs the real orb will use. When the
    // R6 slice adds `focusedPaperId`, the id-write becomes a one-line swap.
    setActiveSelectionSourceId(ORB_DEV_SOURCE_ID);
    selectNode({
      id: paperId,
      index: -1,
    } as Parameters<typeof selectNode>[0]);
    console.warn(`[orb-dev] pick paperId=${paperId}`);
  }, []);

  // --- render --------------------------------------------------------
  const showLoading =
    !sessionReady || buffersState.status === "loading" || bundleState.loading;
  const showError = warmup.status === "unavailable" || bundleState.error != null;

  const bannerText = useMemo(() => {
    if (showError) {
      return "Graph bundle unavailable — orb cannot load real data.";
    }
    const data = buffersState.data;
    if (!data) return null;

    const pointCount = data.count.toLocaleString();
    switch (data.source) {
      case "parquet-fixture":
        return `Real 3D fixture attached (${pointCount} points).`;
      case "sampled-base-points":
        return buffersState.fallbackUsed && buffersState.error
          ? `release_points_3d attach failed (${buffersState.error.message}) — showing ${pointCount} real paper_ids on synthetic xyz.`
          : `Sampled ${pointCount} real paper_ids on synthetic unit-sphere xyz. Hover + click resolve against the live bundle.`;
      case "fully-synthetic":
        return `Fully synthetic (${pointCount} points). Bundle session not available; hover/click resolve against mock ids.`;
    }
  }, [
    buffersState.data,
    buffersState.error,
    buffersState.fallbackUsed,
    showError,
  ]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#05070b",
        color: "#e2e6ef",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <header
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          fontSize: 13,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#90a0b3",
        }}
      >
        orb-dev (sandbox)
      </header>

      {bannerText && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 10,
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            background: "rgba(28, 34, 46, 0.88)",
            color: "#d5deea",
            maxWidth: 360,
          }}
        >
          {bannerText}
        </div>
      )}

      {showLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#90a0b3",
            fontSize: 14,
          }}
        >
          loading…
        </div>
      )}

      {sessionReady && buffersState.data && (
        <Canvas
          frameloop="demand"
          camera={{ position: [0, 0, 4], fov: 45, near: 0.1, far: 100 }}
          dpr={[1, 2]}
          gl={{
            alpha: false,
            antialias: true,
            powerPreference: "high-performance",
            preserveDrawingBuffer: false,
          }}
          onCreated={(ctx) => {
            ctx.gl.setClearColor(0x05070b, 1);
          }}
          style={{ position: "absolute", inset: 0 }}
        >
          <GraphOrbWithBridge
            buffers={buffersState.data}
            reducedMotion={reducedMotion}
            onHover={handleHoverPaperId}
            onPick={handlePick}
            handleRef={orbHandleRef}
          />
          {hoveredPaperId && hoveredTitle && (
            <Html
              fullscreen
              style={{
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 16,
                  bottom: 16,
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "rgba(17, 23, 33, 0.92)",
                  color: "#e2e6ef",
                  fontSize: 12,
                  maxWidth: 420,
                  lineHeight: 1.35,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "#8695a8",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: 2,
                  }}
                >
                  hovered
                </div>
                {hoveredTitle}
              </div>
            </Html>
          )}
        </Canvas>
      )}
    </div>
  );
}

/**
 * Thin R3F-inside wrapper. An invisible spherical backstop catches every
 * pointer position — R3F raycasts through the orb's points (which are
 * GL_POINTS and don't raycast by default) and hits the backstop, giving
 * us clean clientX/Y to feed GraphOrb's picker. CameraControls still
 * captures drag via its own pointerdown listeners.
 */
function GraphOrbWithBridge(props: {
  buffers: OrbPointBuffersState["data"];
  reducedMotion: boolean;
  onHover: (paperId: string | null) => void;
  onPick: (paperId: string | null) => void;
  handleRef: React.MutableRefObject<GraphOrbHandle | null>;
}) {
  const { buffers, reducedMotion, onHover, onPick, handleRef } = props;

  const forwardPointerMove = useCallback(
    (ev: ThreeEvent<PointerEvent>) => {
      handleRef.current?.pointerMove({
        clientX: ev.nativeEvent.clientX,
        clientY: ev.nativeEvent.clientY,
      });
    },
    [handleRef],
  );
  const forwardPointerLeave = useCallback(() => {
    handleRef.current?.pointerLeave();
  }, [handleRef]);
  const forwardClick = useCallback(
    (ev: ThreeEvent<MouseEvent>) => {
      handleRef.current?.click({
        clientX: ev.nativeEvent.clientX,
        clientY: ev.nativeEvent.clientY,
        detail: ev.nativeEvent.detail,
      });
    },
    [handleRef],
  );

  return (
    <>
      <GraphOrb
        buffers={buffers}
        reducedMotion={reducedMotion}
        onHover={onHover}
        onPick={onPick}
        handleRef={handleRef}
      />
      <mesh
        onPointerMove={forwardPointerMove}
        onPointerLeave={forwardPointerLeave}
        onClick={forwardClick}
      >
        {/* Large translucent backstop that wraps the orb silhouette.
            Invisible via opacity=0 but still participates in raycast. */}
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}
