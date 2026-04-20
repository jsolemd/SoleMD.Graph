/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import { useRef } from "react";
import type { ModuleSection } from "@/features/wiki/module-runtime/types";
import { dotTocPastelColorSequence } from "@/lib/pastel-tokens";
import {
  PanelEdgeToc,
  entriesFromHeadings,
  entriesFromModuleSections,
  type PanelEdgeTocEntry,
} from "../PanelEdgeToc";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
});

const entries: PanelEdgeTocEntry[] = [
  { id: "intro", title: "Intro", color: "var(--color-soft-blue)" },
  { id: "yellow", title: "Yellow", color: "var(--color-golden-yellow)" },
  { id: "green", title: "Green", color: "var(--color-fresh-green)" },
  { id: "pink", title: "Pink", color: "var(--color-soft-pink)" },
];

function Harness() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  return (
    <MantineProvider>
      <div
        data-panel-shell="desktop"
        data-testid="panel-shell"
        style={{
          // PanelEdgeToc reads borderTopRightRadius/borderBottomRightRadius
          // via getComputedStyle to cap the first/last segment's extension.
          // Real panels render with ~12–16px radius; using a concrete value
          // here exercises the cap rather than leaving it at 0.
          borderTopRightRadius: "16px",
          borderBottomRightRadius: "16px",
        }}
      >
        <div ref={anchorRef} data-testid="anchor-container" />
        <div ref={scrollRef} data-testid="scroll-container">
          {entries.map((entry) => (
            <h2 key={entry.id} id={entry.id}>
              {entry.title}
            </h2>
          ))}
        </div>
        <PanelEdgeToc entries={entries} scrollRef={scrollRef} anchorRef={anchorRef} />
      </div>
    </MantineProvider>
  );
}

function getSegmentButton(title: string): HTMLButtonElement {
  return screen.getByRole("button", { name: `Jump to ${title}` }) as HTMLButtonElement;
}

describe("PanelEdgeToc", () => {
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  const headingTopById: Record<string, number> = {
    intro: 80,
    yellow: 380,
    green: 680,
    pink: 980,
  };

  beforeEach(() => {
    jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect() {
      const element = this as HTMLElement;
      const testId = element.getAttribute("data-testid");

      if (testId === "panel-shell") {
        return DOMRect.fromRect({ x: 0, y: 0, width: 360, height: 500 });
      }

      if (testId === "anchor-container") {
        return DOMRect.fromRect({ x: 0, y: 20, width: 320, height: 320 });
      }

      if (testId === "scroll-container") {
        return DOMRect.fromRect({ x: 0, y: 40, width: 320, height: 400 });
      }

      if (element.tagName === "H2" && element.id in headingTopById) {
        const scrollContainer = element.closest("[data-testid='scroll-container']") as HTMLDivElement | null;
        const scrollTop = scrollContainer?.scrollTop ?? 0;
        return DOMRect.fromRect({
          x: 0,
          y: 40 + headingTopById[element.id] - scrollTop,
          width: 280,
          height: 24,
        });
      }

      return originalGetBoundingClientRect.call(element);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps the active segment aligned with scroll progress as the rail crosses a section boundary", async () => {
    render(<Harness />);

    const scrollContainer = screen.getByTestId("scroll-container");
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 1200 });

    await waitFor(() => {
      expect(getSegmentButton("Intro")).toBeInTheDocument();
    });

    act(() => {
      scrollContainer.scrollTop = 650;
      scrollContainer.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(getSegmentButton("Green")).toHaveAttribute("data-active", "true");
      expect(screen.getByTestId("panel-edge-toc-progress")).toHaveStyle({
        height: "25%",
        backgroundColor: "var(--color-fresh-green)",
      });
    });

    expect(getSegmentButton("Intro")).not.toHaveAttribute("data-active");
    expect(getSegmentButton("Yellow")).not.toHaveAttribute("data-active");
    expect(getSegmentButton("Pink")).not.toHaveAttribute("data-active");
  });

  it("anchors the rail flush to the panel's right edge against the provided scroll viewport rect", async () => {
    render(<Harness />);

    const scrollContainer = screen.getByTestId("scroll-container");
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 1200 });

    await waitFor(() => {
      const nav = screen.getByRole("navigation", { name: "Section navigation" });
      expect(nav).toHaveStyle({ top: "20px", height: "320px", right: "0px" });
    });
  });

  it("updates the within-section progress fill as scroll advances through the active section", async () => {
    render(<Harness />);

    const scrollContainer = screen.getByTestId("scroll-container");
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 1200 });

    await waitFor(() => {
      expect(screen.getByTestId("panel-edge-toc-progress")).toHaveStyle({ height: "0%" });
    });

    act(() => {
      scrollContainer.scrollTop = 150;
      scrollContainer.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("panel-edge-toc-progress")).toHaveStyle({ height: "50%" });
    });
  });

  it("keeps the last section active when scrolled past every heading instead of snapping to section 0", async () => {
    render(<Harness />);

    const scrollContainer = screen.getByTestId("scroll-container");
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 1200 });

    await waitFor(() => {
      expect(getSegmentButton("Intro")).toBeInTheDocument();
    });

    act(() => {
      scrollContainer.scrollTop = 800;
      scrollContainer.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(getSegmentButton("Pink")).toHaveAttribute("data-active", "true");
    });

    expect(getSegmentButton("Intro")).not.toHaveAttribute("data-active");
  });

  it("gives every section an equal rail segment so pages with uneven content still read as a clear TOC", async () => {
    render(<Harness />);

    const scrollContainer = screen.getByTestId("scroll-container");
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 1200 });

    // Heading offsets are 80 / 380 / 680 / 980 — wildly different section
    // content lengths. Every segment should still get flexGrow: 1 so the
    // rail represents the TOC as navigation, not as a content mini-map.
    await waitFor(() => {
      for (const entry of entries) {
        expect(getSegmentButton(entry.title)).toHaveStyle({ flexGrow: "1" });
      }
    });
  });

  it("stretches the first segment only into the panel's rounded corner, not across the header", async () => {
    render(<Harness />);

    const scrollContainer = screen.getByTestId("scroll-container");
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 1200 });

    // Panel top = 0, anchorTop = 20 → headerGap = 20px. Panel radius = 16px.
    // The first segment's wrapper extends up by the capped amount — the
    // rounded-corner depth (16px), not the full headerGap (20px). The cap
    // keeps the segment out of the header zone where pin/close sit; without
    // it the segment would overlay those icons at right:0 and eat clicks.
    await waitFor(() => {
      const firstButton = getSegmentButton("Intro");
      const wrapper = firstButton.querySelector<HTMLSpanElement>(":scope > span");
      expect(wrapper).not.toBeNull();
      expect(wrapper).toHaveStyle({ top: "-16px" });
    });

    // A middle segment never extends — its wrapper stays at top: 0.
    const middleWrapper = getSegmentButton("Yellow").querySelector<HTMLSpanElement>(":scope > span");
    expect(middleWrapper).toHaveStyle({ top: "0px" });
  });

  it("stretches the last segment only into the panel's rounded corner, not across the footer", async () => {
    render(<Harness />);

    const scrollContainer = screen.getByTestId("scroll-container");
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 1200 });

    // Panel height = 500, anchorTop = 20, anchorHeight = 320 → footerGap = 160.
    // Panel radius = 16; the extension caps at -16px so the rail terminates
    // at the rounded corner instead of covering the full footer gap.
    await waitFor(() => {
      const lastButton = getSegmentButton("Pink");
      const wrapper = lastButton.querySelector<HTMLSpanElement>(":scope > span");
      expect(wrapper).not.toBeNull();
      expect(wrapper).toHaveStyle({ bottom: "-16px" });
    });
  });

  it("paints the within-section progress fill with the active section's own color, not the mode accent", async () => {
    render(<Harness />);

    const scrollContainer = screen.getByTestId("scroll-container");
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 1200 });

    // By default the first section is active (no intersection events yet).
    // Its progress fill should use the section's own colour token so the
    // filled portion reads as that section's colour lighting up.
    await waitFor(() => {
      const progress = screen.getByTestId("panel-edge-toc-progress");
      expect(progress).toHaveStyle({ backgroundColor: "var(--color-soft-blue)" });
    });
  });

  it("assigns the centralized pastel rainbow to module TOC sections before reusing a color", () => {
    const sections: ModuleSection[] = [
      { id: "intro", title: "Intro" },
      { id: "overview", title: "Overview" },
      { id: "a", title: "A", accent: "soft-blue" },
      { id: "b", title: "B", accent: "golden-yellow" },
      { id: "c", title: "C", accent: "fresh-green" },
      { id: "d", title: "D", accent: "muted-indigo" },
      { id: "e", title: "E", accent: "soft-pink" },
      { id: "f", title: "F", accent: "muted-indigo" },
      { id: "g", title: "G", accent: "warm-coral" },
      { id: "h", title: "H", accent: "soft-lavender" },
    ];

    const built = entriesFromModuleSections(sections);

    expect(built.map((entry) => entry.color)).toEqual(
      dotTocPastelColorSequence.slice(0, sections.length),
    );
    expect(new Set(built.map((entry) => entry.color)).size).toBe(sections.length);
  });

  it("assigns heading entries from the same centralized pastel rainbow", () => {
    const container = document.createElement("div");

    for (let i = 0; i < 12; i += 1) {
      const heading = document.createElement("h2");
      heading.id = `heading-${i}`;
      heading.textContent = `Heading ${i}`;
      container.appendChild(heading);
    }

    const built = entriesFromHeadings(container);

    expect(built.map((entry) => entry.color)).toEqual(
      dotTocPastelColorSequence.slice(0, 12),
    );
  });
});
