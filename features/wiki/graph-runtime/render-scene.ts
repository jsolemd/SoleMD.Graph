import { Application, Container, Graphics, Text as PixiText, TextStyle, Circle } from "pixi.js"
import type { SimNode, SimLink, NodeRenderData, LinkRenderData } from "./types"
import { computeLinkCounts, nodeRadius } from "./types"
import { resolveNodeColorKey, type WikiGraphPalette } from "./theme"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LABEL_FONT_SIZE = 10
const LABEL_MAX_CHARS = 24
const PAGE_LABEL_PRIORITY = 1000
const ENTITY_LABEL_BONUS = 120
const TYPE_LABEL_BONUS = 40
const LINK_LABEL_WEIGHT = 24

// ---------------------------------------------------------------------------
// Scene containers
// ---------------------------------------------------------------------------

export interface WikiGraphScene {
  app: Application
  linkContainer: Container
  nodeContainer: Container
  labelContainer: Container
  nodeRenderData: NodeRenderData[]
  linkRenderData: LinkRenderData[]
  width: number
  height: number
  /** Current zoom scale — updated by zoom handler, read by hover label logic */
  zoomScale: number
  pendingWidth: number | null
  pendingHeight: number | null
  resizeCommitTimeout: number | null
  hoveredNodeId: string | null
  /** Current legend/search highlight — hover logic reads this to compute rest alpha. */
  highlightNodeIds: Set<string> | undefined
  labelsDirty: boolean
  lastLabelLayoutAt: number
}

// ---------------------------------------------------------------------------
// Create scene
// ---------------------------------------------------------------------------

export async function createScene(
  container: HTMLElement,
  _palette: WikiGraphPalette,
): Promise<WikiGraphScene> {
  const width = container.clientWidth
  const height = container.clientHeight

  const app = new Application()
  await app.init({
    width,
    height,
    backgroundAlpha: 0,
    antialias: true,
    autoStart: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  })

  const canvas = app.canvas as HTMLCanvasElement
  canvas.style.position = "absolute"
  canvas.style.top = "0"
  canvas.style.left = "0"
  container.appendChild(canvas)

  const linkContainer = new Container({ zIndex: 1 })
  const nodeContainer = new Container({ zIndex: 2 })
  const labelContainer = new Container({ zIndex: 3 })

  app.stage.addChild(linkContainer, nodeContainer, labelContainer)

  return {
    app,
    linkContainer,
    nodeContainer,
    labelContainer,
    nodeRenderData: [],
    linkRenderData: [],
    width,
    height,
    zoomScale: 1,
    pendingWidth: null,
    pendingHeight: null,
    resizeCommitTimeout: null,
    hoveredNodeId: null,
    highlightNodeIds: undefined,
    labelsDirty: true,
    lastLabelLayoutAt: 0,
  }
}

// ---------------------------------------------------------------------------
// Build node + link render data (Quartz pattern)
// ---------------------------------------------------------------------------

export function buildRenderData(
  scene: WikiGraphScene,
  nodes: SimNode[],
  links: SimLink[],
  palette: WikiGraphPalette,
): void {
  // Clear existing
  for (const n of scene.nodeRenderData) {
    n.gfx.destroy()
    n.label.destroy()
  }
  for (const l of scene.linkRenderData) l.gfx.destroy()
  scene.nodeRenderData.length = 0
  scene.linkRenderData.length = 0

  const linkCounts = computeLinkCounts(nodes, links)

  const labelStyle = new TextStyle({
    fontSize: LABEL_FONT_SIZE,
    fill: palette.labelColor,
    fontFamily: "system-ui, sans-serif",
  })

  // Nodes
  for (const node of nodes) {
    const count = linkCounts.get(node.id) ?? 0
    const r = nodeRadius(node, count)
    const colorKey = resolveNodeColorKey(node)
    const fill = palette.node[colorKey]

    const gfx = new Graphics({
      interactive: true,
      eventMode: "static",
      label: node.id,
      hitArea: new Circle(0, 0, Math.max(r, 8)),
      cursor: "pointer",
    })
    gfx.circle(0, 0, r).fill({ color: fill })
    gfx.position.set(node.x ?? 0, node.y ?? 0)
    scene.nodeContainer.addChild(gfx)

    // Label
    const truncated =
      node.label.length > LABEL_MAX_CHARS
        ? node.label.slice(0, LABEL_MAX_CHARS) + "…"
        : node.label
    const label = new PixiText({
      text: truncated,
      style: labelStyle,
      interactive: false,
      eventMode: "none",
      alpha: 0,
      anchor: { x: 0.5, y: -0.8 },
      resolution: window.devicePixelRatio * 2,
    })
    label.position.set(node.x ?? 0, node.y ?? 0)
    scene.labelContainer.addChild(label)

    scene.nodeRenderData.push({
      simulationData: node,
      gfx,
      label,
      labelBaseWidth: label.width,
      labelBaseHeight: label.height,
      labelPriority:
        (node.kind === "page" ? PAGE_LABEL_PRIORITY : 0) +
        (node.conceptId ? ENTITY_LABEL_BONUS : 0) +
        (node.entityType ? TYPE_LABEL_BONUS : 0) +
        count * LINK_LABEL_WEIGHT,
      color: fill.toString(16),
      alpha: 1,
      active: false,
      radius: r,
    })
  }

  scene.labelsDirty = true

  // Links
  for (const link of links) {
    const gfx = new Graphics({ interactive: false, eventMode: "none" })
    scene.linkContainer.addChild(gfx)

    scene.linkRenderData.push({
      simulationData: link,
      gfx,
      color: palette.linkColor,
      alpha: palette.linkAlpha,
      active: false,
    })
  }
}

// ---------------------------------------------------------------------------
// Update positions (called every rAF frame)
// ---------------------------------------------------------------------------

export function updatePositions(scene: WikiGraphScene): void {
  const { width, height } = scene

  // Update links
  for (const l of scene.linkRenderData) {
    const s = l.simulationData.source as unknown as SimNode
    const t = l.simulationData.target as unknown as SimNode
    if (s?.x == null || s?.y == null || t?.x == null || t?.y == null) continue

    l.gfx.clear()
    l.gfx
      .moveTo(s.x + width / 2, s.y + height / 2)
      .lineTo(t.x + width / 2, t.y + height / 2)
      .stroke({ color: l.color, alpha: l.alpha, width: 1 })
  }

  // Update nodes + labels
  for (const n of scene.nodeRenderData) {
    const { x, y } = n.simulationData
    if (x == null || y == null) continue
    n.gfx.position.set(x + width / 2, y + height / 2)
    n.label.position.set(x + width / 2, y + height / 2)
  }
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

const RESIZE_SETTLE_MS = 100

/**
 * Defer both the logical scene size and the Pixi renderer resize until the
 * panel resize settles. Updating the scene center on every intermediate drag
 * sample makes the graph jump horizontally while the panel edge moves.
 *
 * Callers can pass `onCommit` to run after the final settled resize —
 * rapid repeat calls drop the intermediate callbacks (clearTimeout), so
 * `onCommit` fires exactly once per settle window.
 */
export function resizeScene(
  scene: WikiGraphScene,
  width: number,
  height: number,
  onCommit?: () => void,
): void {
  scene.pendingWidth = width
  scene.pendingHeight = height

  if (scene.resizeCommitTimeout !== null) {
    clearTimeout(scene.resizeCommitTimeout)
  }

  scene.resizeCommitTimeout = window.setTimeout(() => {
    const nextWidth = scene.pendingWidth
    const nextHeight = scene.pendingHeight
    scene.resizeCommitTimeout = null

    if (nextWidth == null || nextHeight == null) {
      return
    }

    scene.pendingWidth = null
    scene.pendingHeight = null
    scene.width = nextWidth
    scene.height = nextHeight

    if (scene.app.renderer) {
      scene.app.renderer.resize(nextWidth, nextHeight)
    }
    scene.labelsDirty = true
    onCommit?.()
  }, RESIZE_SETTLE_MS)
}

// ---------------------------------------------------------------------------
// Destroy
// ---------------------------------------------------------------------------

export function destroyScene(scene: WikiGraphScene): void {
  if (scene.resizeCommitTimeout !== null) {
    clearTimeout(scene.resizeCommitTimeout)
    scene.resizeCommitTimeout = null
  }
  // Don't destroy textures — Pixi caches font/bitmap textures globally across
  // Application instances. Destroying them here would corrupt any other live
  // WikiGraph canvas sharing the same TextStyle cache.
  scene.app.destroy(true, { children: true, texture: false })
}
