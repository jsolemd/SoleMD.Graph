/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import { useRef } from "react";
import type { ModuleSection } from "@/features/wiki/module-runtime/types";
import { dotTocPastelColorSequence } from "@/lib/theme/pastel-tokens";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import {
  DotToc,
  entriesFromHeadings,
  entriesFromModuleSections,
  type DotTocEntry,
} from "../DotToc";

const intersectionObservers: IntersectionObserverMock[] = [];

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  callback: IntersectionObserverCallback;
  observed = new Set<Element>();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    intersectionObservers.push(this);
  }

  observe(element: Element) {
    this.observed.add(element);
  }

  unobserve(element: Element) {
    this.observed.delete(element);
  }

  disconnect() {
    this.observed.clear();
  }
}

jest.mock("framer-motion", () => {
  const React = jest.requireActual("react") as typeof import("react");

  function mergeMotionProps<T extends Record<string, unknown>>(props: T) {
    const { animate, children, style } = props;
    const rest = { ...props };
    delete rest.animate;
    delete rest.children;
    delete rest.style;
    delete rest.transition;
    delete rest.whileHover;

    return {
      rest,
      style: { ...(style ?? {}), ...(animate ?? {}) },
      children,
    };
  }

  const MotionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>(function MotionDiv(props, ref) {
    const merged = mergeMotionProps(props);
    return <div ref={ref} {...merged.rest} style={merged.style}>{merged.children}</div>;
  });
  MotionDiv.displayName = "MotionDiv";

  const MotionButton = React.forwardRef<HTMLButtonElement, Record<string, unknown>>(function MotionButton(props, ref) {
    const merged = mergeMotionProps(props);
    return <button ref={ref} {...merged.rest} style={merged.style}>{merged.children}</button>;
  });
  MotionButton.displayName = "MotionButton";

  return {
    motion: {
      div: MotionDiv,
      button: MotionButton,
    },
  };
});

beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  global.IntersectionObserver = IntersectionObserverMock as typeof IntersectionObserver;
});

beforeEach(() => {
  intersectionObservers.length = 0;
  useWikiStore.getState().reset();
  useWikiStore.getState().setTocOpen(true);
});

const entries: DotTocEntry[] = [
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
      <div className="z-30" data-testid="panel-shell">
        <div ref={anchorRef} data-testid="anchor-container" />
        <div ref={scrollRef} data-testid="scroll-container">
          {entries.map((entry) => (
            <h2 key={entry.id} id={entry.id}>
              {entry.title}
            </h2>
          ))}
        </div>
        <DotToc entries={entries} scrollRef={scrollRef} anchorRef={anchorRef} />
      </div>
    </MantineProvider>
  );
}

function makeIntersectionEntry(
  target: Element,
  isIntersecting: boolean,
): IntersectionObserverEntry {
  return {
    boundingClientRect: target.getBoundingClientRect(),
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: isIntersecting ? target.getBoundingClientRect() : DOMRect.fromRect(),
    isIntersecting,
    rootBounds: null,
    target,
    time: 0,
  } as IntersectionObserverEntry;
}

function getDot(title: string): HTMLElement {
  const button = screen.getByRole("button", { name: `Jump to ${title}` });
  const dot = button.firstElementChild;
  if (!(dot instanceof HTMLElement)) {
    throw new Error(`Expected dot child for ${title}`);
  }
  return dot;
}

describe("DotToc", () => {
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

  it("keeps visited dots opaque after the progress line passes through them", async () => {
    render(<Harness />);

    const scrollContainer = screen.getByTestId("scroll-container");
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      value: 1200,
    });

    await waitFor(() => {
      expect(intersectionObservers).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Jump to Intro" })).toBeInTheDocument();
    });

    const observer = intersectionObservers[0];
    const headings = entries.map((entry) => {
      const heading = document.getElementById(entry.id);
      if (!heading) {
        throw new Error(`Missing heading ${entry.id}`);
      }
      return heading;
    });

    act(() => {
      observer.callback(
        [
          makeIntersectionEntry(headings[0], false),
          makeIntersectionEntry(headings[1], false),
          makeIntersectionEntry(headings[2], true),
          makeIntersectionEntry(headings[3], false),
        ],
        observer as unknown as IntersectionObserver,
      );
    });

    await waitFor(() => {
      expect(getDot("Intro")).toHaveStyle({ opacity: "1", width: "9px", height: "9px" });
      expect(getDot("Yellow")).toHaveStyle({ opacity: "1", width: "9px", height: "9px" });
      expect(getDot("Green")).toHaveStyle({ opacity: "1", width: "15px", height: "15px" });
      expect(getDot("Pink")).toHaveStyle({ opacity: "1", width: "9px", height: "9px" });
    });
  });

  it("positions the rail against the provided anchor instead of the scroll body", async () => {
    render(<Harness />);

    const scrollContainer = screen.getByTestId("scroll-container");
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      value: 1200,
    });

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Section navigation" })).toHaveStyle({ top: "180px" });
    });
  });

  it("moves the progress fill continuously while the scroll position advances between headings", async () => {
    render(<Harness />);

    const scrollContainer = screen.getByTestId("scroll-container");
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      value: 1200,
    });

    await waitFor(() => {
      expect(screen.getByTestId("dot-toc-fill")).toHaveStyle({ height: "0px" });
    });

    act(() => {
      scrollContainer.scrollTop = 150;
      scrollContainer.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("dot-toc-fill")).toHaveStyle({ height: "13px" });
    });
  });

  it("returns after toggling the TOC off and back on", async () => {
    render(<Harness />);

    const scrollContainer = screen.getByTestId("scroll-container");
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      value: 1200,
    });

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Section navigation" })).toBeInTheDocument();
    });

    act(() => {
      useWikiStore.getState().setTocOpen(false);
    });

    expect(screen.queryByRole("navigation", { name: "Section navigation" })).not.toBeInTheDocument();

    act(() => {
      useWikiStore.getState().setTocOpen(true);
    });

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Section navigation" })).toBeInTheDocument();
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
