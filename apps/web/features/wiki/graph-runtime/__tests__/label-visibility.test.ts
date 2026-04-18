/**
 * @jest-environment jsdom
 */

import {
  resolveLabelBudgets,
  resolveLabelScale,
  selectVisibleLabelIds,
  type LabelVisibilityCandidate,
} from "../label-visibility"

function candidate(overrides: Partial<LabelVisibilityCandidate>): LabelVisibilityCandidate {
  return {
    id: "node",
    kind: "page",
    priority: 1,
    x: 100,
    y: 100,
    width: 80,
    height: 18,
    highlighted: false,
    ...overrides,
  }
}

describe("label visibility policy", () => {
  it("suppresses paper labels until higher zoom", () => {
    expect(resolveLabelBudgets(1.6, 200)).toEqual({ page: 13, paper: 0 })
    expect(resolveLabelBudgets(3.4, 200)).toEqual({ page: 47, paper: 16 })
  })

  it("prefers page labels before paper labels within budget", () => {
    const visible = selectVisibleLabelIds(
      [
        candidate({ id: "paper-a", kind: "paper", priority: 500 }),
        candidate({ id: "page-a", kind: "page", priority: 1000, x: 260 }),
        candidate({ id: "page-b", kind: "page", priority: 900, x: 420 }),
      ],
      { page: 2, paper: 0 },
    )

    expect(visible).toEqual(new Set(["page-a", "page-b"]))
  })

  it("keeps highlighted nodes visible even when budget is exhausted", () => {
    const visible = selectVisibleLabelIds(
      [
        candidate({ id: "hovered", highlighted: true }),
        candidate({ id: "page-a", kind: "page", priority: 1000, x: 240 }),
      ],
      { page: 0, paper: 0 },
    )

    expect(visible).toEqual(new Set(["hovered"]))
  })

  it("drops overlapping lower-priority labels", () => {
    const visible = selectVisibleLabelIds(
      [
        candidate({ id: "page-a", priority: 1000, x: 200 }),
        candidate({ id: "page-b", priority: 900, x: 220 }),
        candidate({ id: "page-c", priority: 800, x: 420 }),
      ],
      { page: 3, paper: 0 },
    )

    expect(visible).toEqual(new Set(["page-a", "page-c"]))
  })

  it("dampens label growth at higher zoom", () => {
    expect(resolveLabelScale(1)).toBe(1)
    expect(resolveLabelScale(4)).toBe(0.5)
  })
})
