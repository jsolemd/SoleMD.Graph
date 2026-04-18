import { select } from "d3-selection";
import { zoom as d3zoom, type D3ZoomEvent } from "d3-zoom";
import type { Simulation } from "d3-force";
import { Group as TweenGroup, Tween } from "@tweenjs/tween.js";
import type { SimNode, SimLink, WikiGraphIntents } from "./types";
import type { WikiGraphScene } from "./render-scene";
import type { WikiGraphPalette } from "./theme";
import { computeFitTransform } from "./fit-view";
import {
  endWikiGraphDragInteraction,
  startWikiGraphDragInteraction,
  sustainWikiGraphDragInteraction,
} from "./simulation-controls";
import {
  exceededTapTravel,
  LONG_PRESS_MAX_TRAVEL_PX,
  LONG_PRESS_MS,
  type PanLatch,
  tapHitRadiusFor,
} from "@/features/graph/lib/pointer-gesture";

// ---------------------------------------------------------------------------
// Tween manager — mirrors Quartz's per-channel tween groups
// ---------------------------------------------------------------------------

type TweenEntry = { update: (t: number) => void; stop: () => void };
const tweens = new Map<string, TweenEntry>();

function setTween(key: string, group: TweenGroup) {
  tweens.get(key)?.stop();
  group.getAll().forEach((tw) => tw.start());
  tweens.set(key, {
    update: group.update.bind(group),
    stop() {
      group.getAll().forEach((tw) => tw.stop());
    },
  });
}

export function updateTweens(time: number): void {
  tweens.forEach((t) => t.update(time));
}

export function clearTweens(): void {
  tweens.forEach((t) => t.stop());
  tweens.clear();
}

// ---------------------------------------------------------------------------
// Hover focus — dim non-neighbors (Quartz pattern)
// ---------------------------------------------------------------------------

function updateHoverInfo(
  scene: WikiGraphScene,
  newHoveredId: string | null,
): void {
  if (newHoveredId === null) {
    for (const n of scene.nodeRenderData) n.active = false;
    for (const l of scene.linkRenderData) l.active = false;
  } else {
    const neighbours = new Set<string>();
    for (const l of scene.linkRenderData) {
      const src =
        (l.simulationData.source as unknown as SimNode).id ??
        l.simulationData.sourceId;
      const tgt =
        (l.simulationData.target as unknown as SimNode).id ??
        l.simulationData.targetId;
      const connected = src === newHoveredId || tgt === newHoveredId;
      if (connected) {
        neighbours.add(src);
        neighbours.add(tgt);
      }
      l.active = connected;
    }
    for (const n of scene.nodeRenderData) {
      n.active = neighbours.has(n.simulationData.id);
    }
  }
}

function renderHoverNodes(scene: WikiGraphScene, hoveredId: string | null) {
  const hl = scene.highlightNodeIds;
  const group = new TweenGroup();
  for (const n of scene.nodeRenderData) {
    // Rest alpha respects legend/search highlight
    const restAlpha = hl ? (hl.has(n.simulationData.id) ? 1 : 0.15) : 1;
    const targetAlpha = hoveredId !== null ? (n.active ? 1 : Math.min(0.2, restAlpha)) : restAlpha;
    group.add(new Tween(n.gfx, group).to({ alpha: targetAlpha }, 200));
  }
  setTween("hover", group);
}

function renderHoverLinks(
  scene: WikiGraphScene,
  hoveredId: string | null,
  palette: WikiGraphPalette,
) {
  const hl = scene.highlightNodeIds;
  const group = new TweenGroup();
  for (const l of scene.linkRenderData) {
    const srcId = (l.simulationData.source as unknown as SimNode).id ?? l.simulationData.sourceId;
    const tgtId = (l.simulationData.target as unknown as SimNode).id ?? l.simulationData.targetId;
    // Rest alpha respects legend/search highlight
    const restAlpha = hl
      ? (hl.has(srcId) && hl.has(tgtId) ? 0.6 : 0.05)
      : palette.linkAlpha;
    const targetAlpha =
      hoveredId !== null ? (l.active ? 0.8 : 0.05) : restAlpha;
    group.add(new Tween(l, group).to({ alpha: targetAlpha }, 200));
  }
  setTween("link", group);
}

// ---------------------------------------------------------------------------
// Zoom + pan with label coupling
// ---------------------------------------------------------------------------

/** Camera control exposed by {@link wireZoom}. The mount layer owns
 *  autofit policy (when to fit, when to stand down); this object hides
 *  the d3-zoom plumbing and the programmatic/user distinction that
 *  Quartz's graph view bakes into its `scale` initial-transform pattern. */
export interface WikiGraphZoomControl {
  /** Has the user panned or zoomed since mount? Once true, stays true. */
  hasUserMoved: () => boolean;
  /** Fit current node extents into the container. No-op if the user has
   *  already moved the camera, if the container is empty, or if no node
   *  has coordinates yet (simulation hasn't ticked). */
  fitToExtents: (nodes: ReadonlyArray<SimNode>, padding?: number) => void;
}

export function wireZoom(scene: WikiGraphScene, panLatch?: PanLatch): WikiGraphZoomControl {
  const canvas = scene.app.canvas as HTMLCanvasElement;
  const selection = select(canvas);
  let userMoved = false;
  let programmatic = false;

  const zoomBehavior = d3zoom<HTMLCanvasElement, unknown>()
    .scaleExtent([0.25, 4])
    .on("start", () => {
      if (programmatic) return;
      panLatch?.setPanning(true);
    })
    .on("zoom", (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
      const { x, y, k } = event.transform;
      scene.app.stage.position.set(x, y);
      scene.app.stage.scale.set(k);
      scene.zoomScale = k;
      scene.labelsDirty = true;
      if (programmatic) return;
      userMoved = true;
      // Mark a real pan only when the transform actually changes — d3-zoom's
      // `start` fires for every touchstart including pure taps, which would
      // otherwise be misread as pans and suppress selection intent.
      panLatch?.markPanned();
    })
    .on("end", () => {
      if (programmatic) return;
      panLatch?.setPanning(false);
    });

  selection.call(zoomBehavior);

  return {
    hasUserMoved: () => userMoved,
    fitToExtents(nodes, padding) {
      if (userMoved) return;
      const transform = computeFitTransform(nodes, scene.width, scene.height, padding);
      if (!transform) return;
      programmatic = true;
      try {
        zoomBehavior.transform(selection, transform);
      } finally {
        programmatic = false;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Node interactions (hover + click + drag)
// ---------------------------------------------------------------------------

export function wireNodeInteractions(
  scene: WikiGraphScene,
  simulation: Simulation<SimNode, SimLink>,
  intents: WikiGraphIntents,
  palette: WikiGraphPalette,
  panLatch?: PanLatch,
): () => void {
  let hoveredNodeId: string | null = null;
  let draggedNode: SimNode | null = null;
  let didDrag = false;
  let pressStart: { x: number; y: number } | null = null;
  let pressedNodeId: string | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  // True once a long-press has fired its intent, so the subsequent
  // pointerup no-ops instead of double-committing as a tap.
  let longPressConsumed = false;

  function cancelLongPress() {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  const canvas = scene.app.canvas as HTMLCanvasElement;
  const nodes = scene.nodeRenderData.map((n) => n.simulationData);

  function screenToStage(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const stage = scene.app.stage;
    return {
      sx: (clientX - rect.left - stage.position.x) / stage.scale.x,
      sy: (clientY - rect.top - stage.position.y) / stage.scale.y,
    };
  }

  function hitTest(
    clientX: number,
    clientY: number,
    pointerType: string = "mouse",
  ): SimNode | null {
    const { sx, sy } = screenToStage(clientX, clientY);
    const stageRadius = tapHitRadiusFor(pointerType) / scene.app.stage.scale.x;
    let closest: SimNode | null = null;
    let closestDist = stageRadius * stageRadius;
    for (const node of nodes) {
      if (node.x == null || node.y == null) continue;
      const dx = node.x + scene.width / 2 - sx;
      const dy = node.y + scene.height / 2 - sy;
      const distSq = dx * dx + dy * dy;
      if (distSq < closestDist) {
        closestDist = distSq;
        closest = node;
      }
    }
    return closest;
  }

  function applyHoverState(newId: string | null) {
    hoveredNodeId = newId;
    scene.hoveredNodeId = newId;
    scene.labelsDirty = true;
    canvas.style.cursor = newId ? "pointer" : "default";
    updateHoverInfo(scene, hoveredNodeId);
    renderHoverNodes(scene, hoveredNodeId);
    renderHoverLinks(scene, hoveredNodeId, palette);
  }

  function handlePointerMove(e: PointerEvent) {
    // Cancel a pending long-press once the pointer drifts beyond a
    // permissive jitter floor — TAP_MAX_TRAVEL_PX is too tight for a
    // 400ms finger hold, where micro-movement routinely exceeds 6px.
    if (pressStart) {
      const dx = e.clientX - pressStart.x;
      const dy = e.clientY - pressStart.y;
      if (
        dx * dx + dy * dy >
        LONG_PRESS_MAX_TRAVEL_PX * LONG_PRESS_MAX_TRAVEL_PX
      ) {
        cancelLongPress();
      }
    }

    if (draggedNode) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const { sx, sy } = screenToStage(e.clientX, e.clientY);
      draggedNode.fx = sx - scene.width / 2;
      draggedNode.fy = sy - scene.height / 2;
      // Only treat it as a drag once travel exceeds tap-jitter — otherwise
      // a finger held on a node for long-press trips didDrag via sub-pixel
      // reported movement and cancels the long-press before it fires.
      if (
        !didDrag &&
        pressStart &&
        exceededTapTravel({
          startX: pressStart.x,
          startY: pressStart.y,
          endX: e.clientX,
          endY: e.clientY,
        })
      ) {
        didDrag = true;
      }
      canvas.style.cursor = "grabbing";
      sustainWikiGraphDragInteraction(simulation);
      return;
    }

    // While d3-zoom is panning/zooming the canvas, freeze hover-driven
    // highlights so the user's "selected" (lit-up neighbors) state survives
    // the gesture. Hover was already a touch-unfriendly surrogate; letting
    // pointermove re-run hitTest mid-pan flickers the highlight off.
    if (panLatch?.isPanning()) {
      return;
    }

    const node = hitTest(e.clientX, e.clientY, e.pointerType);
    const newId = node?.id ?? null;
    if (newId !== hoveredNodeId) {
      applyHoverState(newId);
    }
  }

  function handlePointerDown(e: PointerEvent) {
    const node = hitTest(e.clientX, e.clientY, e.pointerType);
    if (!node) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    draggedNode = node;
    didDrag = false;
    pressStart = { x: e.clientX, y: e.clientY };
    pressedNodeId = node.id;
    longPressConsumed = false;
    node.fx = node.x;
    node.fy = node.y;
    canvas.style.cursor = "grabbing";
    startWikiGraphDragInteraction(simulation);
    canvas.setPointerCapture(e.pointerId);

    // Long-press commit: after LONG_PRESS_MS with no drag and no release,
    // treat as an explicit "open page" intent so the user can pan around
    // without accidentally navigating on every graze.
    if (node.kind === "page" && node.slug) {
      const targetSlug = node.slug;
      cancelLongPress();
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (didDrag || !pressedNodeId || pressedNodeId !== node.id) return;
        longPressConsumed = true;
        intents.onOpenPage(targetSlug);
      }, LONG_PRESS_MS);
    }
  }

  function releaseDraggedNode(e?: PointerEvent) {
    if (draggedNode) {
      draggedNode.fx = null;
      draggedNode.fy = null;
      if (e && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      draggedNode = null;
      endWikiGraphDragInteraction(simulation);
    }
  }

  /**
   * Re-evaluate hover based on where the pointer ended. A plain tap on a
   * node lights it up; tapping empty canvas clears any sticky highlight.
   * Skipped when the gesture was a pan — otherwise the post-pan release
   * would clear the user's selection every time.
   */
  function syncHoverAfterRelease(e?: PointerEvent) {
    const hovered = e ? hitTest(e.clientX, e.clientY, e.pointerType) : null;
    applyHoverState(hovered?.id ?? null);
  }

  /**
   * Fires node intents (open page / focus paper / select entity) when the
   * gesture was a tap on the same node pressed at pointerdown.
   *
   * Uses pointerup rather than the browser `click` event because
   * `preventDefault()` on pointerdown suppresses the synthesized `click` on
   * touch devices. pointerup is the single reliable tap contract across
   * mouse and touch.
   */
  function firePointerUpIntents(e: PointerEvent) {
    if (longPressConsumed) return;
    if (!pressedNodeId || !pressStart) return;
    if (didDrag) return;
    if (
      exceededTapTravel({
        startX: pressStart.x,
        startY: pressStart.y,
        endX: e.clientX,
        endY: e.clientY,
      })
    ) {
      return;
    }
    const released = hitTest(e.clientX, e.clientY, e.pointerType);
    if (!released || released.id !== pressedNodeId) return;

    if (released.kind === "page" && released.slug) {
      // Touch: tap selects only (hover lights up via syncHoverAfterRelease).
      // Long-press (LONG_PRESS_MS) commits the navigation. Mouse click has no
      // long-press equivalent, so it navigates immediately per the desktop
      // click contract.
      if (e.pointerType !== "touch") {
        intents.onOpenPage(released.slug);
      }
    } else if (released.kind === "paper" && released.paperId) {
      intents.onFocusPaper?.(released.paperId);
      intents.onFlashPapers?.([released.paperId]);
    }
    if (released.conceptId) {
      intents.onSelectEntity?.(released.conceptId);
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (draggedNode) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    cancelLongPress();
    const wasPan = panLatch?.consumeJustPan() ?? false;
    if (!wasPan) {
      firePointerUpIntents(e);
    }
    releaseDraggedNode(e);
    if (!wasPan) {
      syncHoverAfterRelease(e);
    }
    pressStart = null;
    pressedNodeId = null;
    longPressConsumed = false;
  }

  function handlePointerCancel(e: PointerEvent) {
    if (draggedNode) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    cancelLongPress();
    const wasPan = panLatch?.consumeJustPan() ?? false;
    releaseDraggedNode(e);
    if (!wasPan) {
      syncHoverAfterRelease(e);
    }
    didDrag = false;
    pressStart = null;
    pressedNodeId = null;
    longPressConsumed = false;
  }

  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerCancel);

  return () => {
    cancelLongPress();
    canvas.removeEventListener("pointermove", handlePointerMove);
    canvas.removeEventListener("pointerdown", handlePointerDown);
    canvas.removeEventListener("pointerup", handlePointerUp);
    canvas.removeEventListener("pointercancel", handlePointerCancel);
    clearTweens();
  };
}
