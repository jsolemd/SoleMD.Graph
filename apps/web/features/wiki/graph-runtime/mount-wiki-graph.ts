import type { MountWikiGraphOptions, SimNode } from "./types"
import { buildSimulation } from "./build-simulation"
import {
  createScene,
  buildRenderData,
  updatePositions,
  destroyScene,
  resizeScene,
} from "./render-scene"
import { wireZoom, wireNodeInteractions, updateTweens } from "./interactions"
import { createPanLatch } from "@/features/graph/lib/pointer-gesture"
import { resolvePalette, invalidatePalette } from "./theme"
import { applyLabelVisibility } from "./label-visibility"
import { getCachedPositions, setCachedPositions } from "./layout-cache"
import type { WikiGraphScene } from "./render-scene"

// ---------------------------------------------------------------------------
// Highlight applicator — reusable closure over the scene
// ---------------------------------------------------------------------------

function buildHighlightApplicator(scene: WikiGraphScene, defaultLinkAlpha: number) {
  return function applyHighlight(ids: Set<string> | undefined) {
    if (!ids) {
      // Restore full opacity
      for (const n of scene.nodeRenderData) n.gfx.alpha = 1
      for (const l of scene.linkRenderData) l.alpha = defaultLinkAlpha
      return
    }
    for (const n of scene.nodeRenderData) {
      n.gfx.alpha = ids.has(n.simulationData.id) ? 1 : 0.15
    }
    for (const l of scene.linkRenderData) {
      const srcId = (l.simulationData.source as unknown as SimNode).id ?? l.simulationData.sourceId
      const tgtId = (l.simulationData.target as unknown as SimNode).id ?? l.simulationData.targetId
      if (ids.has(srcId) && ids.has(tgtId)) {
        l.alpha = 0.6
      } else {
        l.alpha = 0.05
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Mount result — cleanup + live highlight control
// ---------------------------------------------------------------------------

export interface WikiGraphHandle {
  destroy: () => void
  applyHighlight: (ids: Set<string> | undefined) => void
}

// ---------------------------------------------------------------------------
// Mount entrypoint — creates Pixi app, wires simulation + interactions
// Returns a handle with destroy + highlight control
// ---------------------------------------------------------------------------

export async function mountWikiGraph(
  options: MountWikiGraphOptions,
): Promise<WikiGraphHandle> {
  const { container, nodes, links, signature, intents, highlightNodeIds } = options

  if (nodes.length === 0) {
    return { destroy: () => {}, applyHighlight: () => {} }
  }

  // Restore cached positions if signature matches
  const cached = getCachedPositions(signature)
  if (cached) {
    for (const node of nodes) {
      const pos = cached.get(node.id)
      if (pos) {
        node.x = pos.x
        node.y = pos.y
      }
    }
  }

  const palette = resolvePalette(container)
  const { width, height } = await waitForContainerSize(container)
  const scene = await createScene(container, palette)

  // Build simulation (Quartz: center force at 0,0, offset in render)
  const simulation = buildSimulation(nodes, links, {
    width,
    height,
    centerX: 0,
    centerY: 0,
  })

  // If we have cached positions, start simulation cooled
  if (cached) {
    simulation.alpha(0.05)
  }

  // Build pixi render data (nodes, links, labels)
  buildRenderData(scene, nodes, links, palette)

  // Highlight applicator — reusable for initial + live updates + theme changes
  let currentHighlightIds = highlightNodeIds
  const applyHighlightAlpha = buildHighlightApplicator(scene, palette.linkAlpha)

  function applyHighlight(ids: Set<string> | undefined) {
    scene.highlightNodeIds = ids
    applyHighlightAlpha(ids)
  }

  // Apply initial highlight if present
  applyHighlight(highlightNodeIds)

  // Wire zoom + node interactions. Shared pan latch lets interactions freeze
  // hover-driven highlights while d3-zoom is actively panning, and lets the
  // tap handler branch on "was that a pan?" at pointerup — the same contract
  // Cosmograph uses via `usePanGuard`.
  const panLatch = createPanLatch()
  const zoomControl = wireZoom(scene, panLatch)
  const cleanupInteractions = wireNodeInteractions(
    scene,
    simulation,
    intents,
    palette,
    panLatch,
  )

  /** Autofit the current node extents into the container. The zoom control
   *  no-ops after the first user pan/zoom — see {@link WikiGraphZoomControl}
   *  — so this is safe to call opportunistically on simulation settle and on
   *  every resize commit without clobbering an intentional camera position. */
  const autoFit = () => zoomControl.fitToExtents(nodes)

  // Cache positions when simulation settles, and autofit once the layout has
  // a stable extent — initial mount lands at a pleasant framing without the
  // user reaching for the pan/zoom.
  simulation.on("end", () => {
    const positions = new Map<string, { x: number; y: number }>()
    for (const node of nodes) {
      if (node.x != null && node.y != null) {
        positions.set(node.id, { x: node.x, y: node.y })
      }
    }
    setCachedPositions(signature, positions)
    autoFit()
  })

  // Cached-positions path skips most of the simulation, so the "end" event
  // fires later than feels responsive. Kick an autofit after the first rAF
  // so the cold-cache first paint already lands framed.
  if (cached) {
    requestAnimationFrame(autoFit)
  }

  // rAF animation loop (Quartz pattern — needed for tweens to update every frame)
  let destroyed = false
  // Tracks the pending rAF handle so destroy can cancel the queued frame
  // before it runs. Without this, an in-flight frame can touch a destroyed
  // Pixi graphics tree after destroy() returns, throwing inside Pixi.
  let animateRaf = 0
  // Theme change observer can request a render-data rebuild. Doing that
  // rebuild mid-frame tears down Graphics objects the frame is still
  // using. Instead we set this flag and process it at the end of the
  // frame, after render, while the rAF loop is quiescent.
  let pendingThemeRebuild = false
  const LABEL_LAYOUT_FRAME_MS = 90
  function animate(time: number) {
    animateRaf = 0
    if (destroyed) return
    updatePositions(scene)
    if (scene.labelsDirty || simulation.alpha() > 0.08) {
      if (scene.lastLabelLayoutAt === 0 || time - scene.lastLabelLayoutAt >= LABEL_LAYOUT_FRAME_MS) {
        applyLabelVisibility(scene)
        scene.labelsDirty = false
        scene.lastLabelLayoutAt = time
      }
    }
    updateTweens(time)
    try {
      scene.app.renderer.render(scene.app.stage)
    } catch {
      destroyed = true
      return
    }
    // Process a deferred theme rebuild AFTER render so we never tear down
    // Graphics the same frame is reading from.
    if (pendingThemeRebuild && !destroyed) {
      pendingThemeRebuild = false
      invalidatePalette()
      const newPalette = resolvePalette(container)
      buildRenderData(scene, nodes, links, newPalette)
      applyHighlight(currentHighlightIds)
      scene.labelsDirty = true
    }
    if (destroyed) return
    animateRaf = requestAnimationFrame(animate)
  }
  animateRaf = requestAnimationFrame(animate)

  // Resize observer — rAF-throttled to avoid flashing during panel drag.
  // On commit (after RESIZE_SETTLE_MS), refit the viewport so the graph
  // tracks the panel. The zoom control preserves the current camera once
  // the user has panned/zoomed, so this never fights an explicit placement.
  let resizeRaf = 0
  const resizeObserver = new ResizeObserver((entries) => {
    cancelAnimationFrame(resizeRaf)
    resizeRaf = requestAnimationFrame(() => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect
        if (w > 0 && h > 0) {
          resizeScene(scene, w, h, autoFit)
        }
      }
    })
  })
  resizeObserver.observe(container)

  // Theme change observer — defer the render-data rebuild into the rAF
  // tail so we never destroy Graphics mid-frame. The rebuild runs after
  // the next render completes, immediately before the following frame is
  // requested.
  const themeObserver = new MutationObserver(() => {
    if (destroyed) return
    pendingThemeRebuild = true
    // Ensure a frame is queued so the rebuild is actually drained. If a
    // frame is already queued (animateRaf !== 0) the pending flag will be
    // picked up at its tail.
    if (animateRaf === 0) {
      animateRaf = requestAnimationFrame(animate)
    }
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-mantine-color-scheme"],
  })

  // Cleanup
  return {
    destroy() {
      if (destroyed) return
      destroyed = true
      // Cancel the pending animation frame BEFORE tearing down Pixi so a
      // scheduled frame can never touch a destroyed scene. destroyed=true
      // is also checked at frame start as a belt-and-suspenders guard in
      // case a frame fires between cancel and the rest of teardown.
      if (animateRaf !== 0) {
        cancelAnimationFrame(animateRaf)
        animateRaf = 0
      }
      pendingThemeRebuild = false
      simulation.stop()
      cleanupInteractions()
      cancelAnimationFrame(resizeRaf)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      destroyScene(scene)
    },
    applyHighlight(ids) {
      currentHighlightIds = ids
      applyHighlight(ids)
    },
  }
}

async function waitForContainerSize(
  container: HTMLElement,
): Promise<{ width: number; height: number }> {
  const width = container.clientWidth
  const height = container.clientHeight
  if (width > 0 && height > 0) {
    return { width, height }
  }

  return new Promise((resolve) => {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextWidth = entry.contentRect.width
        const nextHeight = entry.contentRect.height
        if (nextWidth > 0 && nextHeight > 0) {
          ro.disconnect()
          resolve({ width: nextWidth, height: nextHeight })
          return
        }
      }
    })
    ro.observe(container)
  })
}
