import type { WikiGraphScene } from "./render-scene"

const LABEL_PADDING_X = 10
const LABEL_PADDING_Y = 6
const LABEL_LAYOUT_GAP = 8

export interface LabelVisibilityBudget {
  page: number
  paper: number
}

export interface LabelVisibilityCandidate {
  id: string
  kind: "page" | "paper"
  priority: number
  x: number
  y: number
  width: number
  height: number
  highlighted: boolean
}

interface LabelRect {
  left: number
  right: number
  top: number
  bottom: number
}

export function resolveLabelScale(zoomScale: number): number {
  return 1 / Math.max(1, Math.sqrt(zoomScale))
}

export function resolveLabelBudgets(
  zoomScale: number,
  nodeCount: number,
): LabelVisibilityBudget {
  if (nodeCount <= 12) {
    return { page: nodeCount, paper: nodeCount }
  }

  const densityFactor = Math.min(1.4, Math.max(0.45, 180 / Math.max(nodeCount, 1)))

  let basePage = 0
  let basePaper = 0
  if (zoomScale >= 1.15) {
    basePage = 8
  }
  if (zoomScale >= 1.45) {
    basePage = 14
  }
  if (zoomScale >= 1.85) {
    basePage = 22
  }
  if (zoomScale >= 2.2) {
    basePage = 30
    basePaper = 4
  }
  if (zoomScale >= 2.75) {
    basePage = 40
    basePaper = 10
  }
  if (zoomScale >= 3.35) {
    basePage = 52
    basePaper = 18
  }

  return {
    page: Math.max(0, Math.round(basePage * densityFactor)),
    paper: Math.max(0, Math.round(basePaper * densityFactor)),
  }
}

export function selectVisibleLabelIds(
  candidates: LabelVisibilityCandidate[],
  budget: LabelVisibilityBudget,
): Set<string> {
  const visible = new Set<string>()
  const placed: LabelRect[] = []

  const highlighted = candidates
    .filter((candidate) => candidate.highlighted)
    .sort((a, b) => b.priority - a.priority)

  for (const candidate of highlighted) {
    visible.add(candidate.id)
    placed.push(candidateToRect(candidate))
  }

  let pageRemaining = budget.page
  let paperRemaining = budget.paper

  const ranked = candidates
    .filter((candidate) => !candidate.highlighted)
    .sort((a, b) => b.priority - a.priority)

  for (const candidate of ranked) {
    if (candidate.kind === "page") {
      if (pageRemaining <= 0) {
        continue
      }
    } else if (paperRemaining <= 0) {
      continue
    }

    const rect = candidateToRect(candidate)
    if (placed.some((existing) => rectsOverlap(existing, rect))) {
      continue
    }

    visible.add(candidate.id)
    placed.push(rect)
    if (candidate.kind === "page") {
      pageRemaining -= 1
    } else {
      paperRemaining -= 1
    }
  }

  return visible
}

export function applyLabelVisibility(scene: WikiGraphScene): void {
  const budget = resolveLabelBudgets(scene.zoomScale, scene.nodeRenderData.length)
  const visibleIds = selectVisibleLabelIds(buildLabelCandidates(scene), budget)
  const baseScale = resolveLabelScale(scene.zoomScale)

  for (const node of scene.nodeRenderData) {
    const hovered = scene.hoveredNodeId === node.simulationData.id
    const highlighted = hovered || node.active
    node.label.alpha = visibleIds.has(node.simulationData.id) ? 1 : 0
    node.label.scale.set(highlighted ? baseScale * 1.12 : baseScale)
  }
}

function buildLabelCandidates(scene: WikiGraphScene): LabelVisibilityCandidate[] {
  const stageX = scene.app.stage.position.x
  const stageY = scene.app.stage.position.y
  const zoomScale = scene.app.stage.scale.x || 1
  const labelScale = resolveLabelScale(scene.zoomScale)

  return scene.nodeRenderData.map((node) => ({
    id: node.simulationData.id,
    kind: node.simulationData.kind,
    priority: node.labelPriority,
    x: stageX + node.label.position.x * zoomScale,
    y: stageY + node.label.position.y * zoomScale,
    width: node.labelBaseWidth * labelScale * zoomScale + LABEL_PADDING_X * 2,
    height: node.labelBaseHeight * labelScale * zoomScale + LABEL_PADDING_Y * 2,
    highlighted: scene.hoveredNodeId === node.simulationData.id || node.active,
  }))
}

function candidateToRect(candidate: LabelVisibilityCandidate): LabelRect {
  const halfWidth = candidate.width / 2
  return {
    left: candidate.x - halfWidth,
    right: candidate.x + halfWidth,
    top: candidate.y - candidate.height * 1.05,
    bottom: candidate.y + candidate.height * 0.2,
  }
}

function rectsOverlap(a: LabelRect, b: LabelRect): boolean {
  return !(
    a.right + LABEL_LAYOUT_GAP < b.left ||
    b.right + LABEL_LAYOUT_GAP < a.left ||
    a.bottom + LABEL_LAYOUT_GAP < b.top ||
    b.bottom + LABEL_LAYOUT_GAP < a.top
  )
}
