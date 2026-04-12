import { select } from "d3-selection";
import { zoom as d3zoom, type D3ZoomEvent } from "d3-zoom";
import type { Simulation } from "d3-force";
import { Group as TweenGroup, Tween } from "@tweenjs/tween.js";
import type { SimNode, SimLink, WikiGraphIntents } from "./types";
import type { WikiGraphScene } from "./render-scene";
import type { WikiGraphPalette } from "./theme";
import {
  endWikiGraphDragInteraction,
  startWikiGraphDragInteraction,
  sustainWikiGraphDragInteraction,
} from "./simulation-controls";

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
  const group = new TweenGroup();
  for (const n of scene.nodeRenderData) {
    const targetAlpha = hoveredId !== null ? (n.active ? 1 : 0.2) : 1;
    group.add(new Tween(n.gfx, group).to({ alpha: targetAlpha }, 200));
  }
  setTween("hover", group);
}

function renderHoverLinks(
  scene: WikiGraphScene,
  hoveredId: string | null,
  palette: WikiGraphPalette,
) {
  const group = new TweenGroup();
  for (const l of scene.linkRenderData) {
    const targetAlpha =
      hoveredId !== null ? (l.active ? 0.8 : 0.05) : palette.linkAlpha;
    group.add(new Tween(l, group).to({ alpha: targetAlpha }, 200));
  }
  setTween("link", group);
}

// ---------------------------------------------------------------------------
// Zoom + pan with label coupling
// ---------------------------------------------------------------------------

export function wireZoom(scene: WikiGraphScene) {
  const canvas = scene.app.canvas as HTMLCanvasElement;

  const zoomBehavior = d3zoom<HTMLCanvasElement, unknown>()
    .scaleExtent([0.25, 4])
    .on("zoom", (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
      const { x, y, k } = event.transform;
      scene.app.stage.position.set(x, y);
      scene.app.stage.scale.set(k);
      scene.zoomScale = k;
      scene.labelsDirty = true;
    });

  select(canvas).call(zoomBehavior);
  return zoomBehavior;
}

// ---------------------------------------------------------------------------
// Node interactions (hover + click + drag)
// ---------------------------------------------------------------------------

export function wireNodeInteractions(
  scene: WikiGraphScene,
  simulation: Simulation<SimNode, SimLink>,
  intents: WikiGraphIntents,
  palette: WikiGraphPalette,
): () => void {
  let hoveredNodeId: string | null = null;
  let draggedNode: SimNode | null = null;
  let didDrag = false;

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

  function hitTest(clientX: number, clientY: number): SimNode | null {
    const { sx, sy } = screenToStage(clientX, clientY);
    const HIT_RADIUS = 12;
    let closest: SimNode | null = null;
    let closestDist = HIT_RADIUS * HIT_RADIUS;
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
    if (draggedNode) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const { sx, sy } = screenToStage(e.clientX, e.clientY);
      draggedNode.fx = sx - scene.width / 2;
      draggedNode.fy = sy - scene.height / 2;
      didDrag = true;
      canvas.style.cursor = "grabbing";
      sustainWikiGraphDragInteraction(simulation);
      return;
    }

    const node = hitTest(e.clientX, e.clientY);
    const newId = node?.id ?? null;
    if (newId !== hoveredNodeId) {
      applyHoverState(newId);
    }
  }

  function handlePointerDown(e: PointerEvent) {
    const node = hitTest(e.clientX, e.clientY);
    if (!node) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    draggedNode = node;
    didDrag = false;
    node.fx = node.x;
    node.fy = node.y;
    canvas.style.cursor = "grabbing";
    startWikiGraphDragInteraction(simulation);
    canvas.setPointerCapture(e.pointerId);
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

    const hovered = e ? hitTest(e.clientX, e.clientY) : null;
    applyHoverState(hovered?.id ?? null);
  }

  function handlePointerUp(e: PointerEvent) {
    if (draggedNode) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    releaseDraggedNode(e);
  }

  function handlePointerCancel(e: PointerEvent) {
    if (draggedNode) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    releaseDraggedNode(e);
    didDrag = false;
  }

  function handleClick(e: MouseEvent) {
    if (didDrag) {
      didDrag = false;
      return;
    }

    const node = hitTest(e.clientX, e.clientY);
    if (!node) return;

    if (node.kind === "page" && node.slug) {
      intents.onOpenPage(node.slug);
    } else if (node.kind === "paper" && node.paperId) {
      intents.onFocusPaper?.(node.paperId);
      intents.onFlashPapers?.([node.paperId]);
    }
    if (node.conceptId) {
      intents.onSelectEntity?.(node.conceptId);
    }
  }

  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerCancel);
  canvas.addEventListener("click", handleClick);

  return () => {
    canvas.removeEventListener("pointermove", handlePointerMove);
    canvas.removeEventListener("pointerdown", handlePointerDown);
    canvas.removeEventListener("pointerup", handlePointerUp);
    canvas.removeEventListener("pointercancel", handlePointerCancel);
    canvas.removeEventListener("click", handleClick);
    clearTweens();
  };
}
