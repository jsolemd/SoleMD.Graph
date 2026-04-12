/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import { useRef } from "react";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import { DotToc, type DotTocEntry } from "../DotToc";

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

  return (
    <MantineProvider>
      <div className="z-30">
        <div ref={scrollRef}>
          {entries.map((entry) => (
            <h2 key={entry.id} id={entry.id}>
              {entry.title}
            </h2>
          ))}
        </div>
        <DotToc entries={entries} scrollRef={scrollRef} />
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
  it("keeps visited dots opaque after the progress line passes through them", async () => {
    render(<Harness />);

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
      expect(getDot("Green")).toHaveStyle({ opacity: "1", width: "20px", height: "20px" });
      expect(getDot("Pink")).toHaveStyle({ opacity: "1", width: "9px", height: "9px" });
    });
  });
});
