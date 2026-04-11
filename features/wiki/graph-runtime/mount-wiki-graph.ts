import type { MountWikiGraphOptions } from "./types"
import { buildSimulation } from "./build-simulation"
import {
  createScene,
  buildRenderData,
  updatePositions,
  destroyScene,
  resizeScene,
} from "./render-scene"
import { wireZoom, wireNodeInteractions, updateTweens } from "./interactions"
import { resolvePalette, invalidatePalette } from "./theme"
import { applyLabelVisibility } from "./label-visibility"
import { getCachedPositions, setCachedPositions } from "./layout-cache"

// ---------------------------------------------------------------------------
// Mount entrypoint — creates Pixi app, wires simulation + interactions
// Returns a cleanup function
// ---------------------------------------------------------------------------

export async function mountWikiGraph(
  options: MountWikiGraphOptions,
): Promise<() => void> {
  const { container, nodes, links, signature, intents } = options

  if (nodes.length === 0) {
    return () => {}
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

  // Wire zoom + node interactions
  wireZoom(scene)
  const cleanupInteractions = wireNodeInteractions(
    scene,
    simulation,
    intents,
    palette,
  )

  // Cache positions when simulation settles
  simulation.on("end", () => {
    const positions = new Map<string, { x: number; y: number }>()
    for (const node of nodes) {
      if (node.x != null && node.y != null) {
        positions.set(node.id, { x: node.x, y: node.y })
      }
    }
    setCachedPositions(signature, positions)
  })

  // rAF animation loop (Quartz pattern — needed for tweens to update every frame)
  let destroyed = false
  const LABEL_LAYOUT_FRAME_MS = 90
  function animate(time: number) {
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
    requestAnimationFrame(animate)
  }
  requestAnimationFrame(animate)

  // Resize observer — rAF-throttled to avoid flashing during panel drag
  let resizeRaf = 0
  const resizeObserver = new ResizeObserver((entries) => {
    cancelAnimationFrame(resizeRaf)
    resizeRaf = requestAnimationFrame(() => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect
        if (w > 0 && h > 0) {
          resizeScene(scene, w, h)
        }
      }
    })
  })
  resizeObserver.observe(container)

  // Theme change observer
  const themeObserver = new MutationObserver(() => {
    invalidatePalette()
    const newPalette = resolvePalette(container)
    buildRenderData(scene, nodes, links, newPalette)
    scene.labelsDirty = true
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-mantine-color-scheme"],
  })

  // Cleanup
  return () => {
    if (destroyed) return
    destroyed = true
    simulation.stop()
    cleanupInteractions()
    cancelAnimationFrame(resizeRaf)
    resizeObserver.disconnect()
    themeObserver.disconnect()
    destroyScene(scene)
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
