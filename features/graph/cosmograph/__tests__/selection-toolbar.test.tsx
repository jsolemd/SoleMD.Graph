/**
 * @jest-environment jsdom
 */
import { createRef, act } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

/* ── Cosmograph mocks ─────────────────────────────────────────── */

const mockPointsSelection = { reset: jest.fn() };
const mockLinksSelection = { reset: jest.fn() };

const mockCosmograph = {
  pointsSelection: mockPointsSelection,
  linksSelection: mockLinksSelection,
};

jest.mock("@cosmograph/react", () => ({
  useCosmograph: () => ({ cosmograph: mockCosmograph }),
  CosmographButtonRectangularSelection: (props: Record<string, unknown>) => (
    <button data-testid="rect-btn" id="cosmo-rect" style={props.style as React.CSSProperties}>
      rect
    </button>
  ),
  CosmographButtonPolygonalSelection: (props: Record<string, unknown>) => (
    <button data-testid="poly-btn" id="cosmo-poly" style={props.style as React.CSSProperties}>
      poly
    </button>
  ),
}));

/* ── Dashboard store mock ─────────────────────────────────────── */

type Listener = (state: Record<string, unknown>, prev: Record<string, unknown>) => void;
let storeListener: Listener | null = null;

jest.mock("../../stores", () => ({
  useDashboardStore: Object.assign(jest.fn(), {
    subscribe: (fn: Listener) => {
      storeListener = fn;
      return () => { storeListener = null; };
    },
  }),
}));

import {
  SelectionToolbar,
  type SelectionToolbarHandle,
} from "../widgets/SelectionToolbar";

beforeEach(() => {
  jest.clearAllMocks();
  storeListener = null;
});

/* ── Helpers ──────────────────────────────────────────────────── */

function renderToolbar(overrides: Partial<React.ComponentProps<typeof SelectionToolbar>> = {}) {
  const ref = createRef<SelectionToolbarHandle>();
  const props = {
    isLocked: false,
    activeSourceId: null,
    hasSelection: false,
    onActivate: jest.fn(),
    onClear: jest.fn(),
    ...overrides,
  };
  const result = render(<SelectionToolbar ref={ref} {...props} />);
  return { ref, props, ...result };
}

/* ── Tests ────────────────────────────────────────────────────── */

describe("SelectionToolbar", () => {
  it("renders both selection buttons", () => {
    renderToolbar();
    expect(screen.getByTestId("rect-btn")).toBeInTheDocument();
    expect(screen.getByTestId("poly-btn")).toBeInTheDocument();
  });

  it("discovers button IDs from rendered children", () => {
    // Mock buttons render with id attributes, so useCosmographButtonId
    // should pick up "cosmo-rect" and "cosmo-poly" via querySelector("[id]")
    const { props } = renderToolbar({
      hasSelection: true,
      activeSourceId: "cosmo-rect",
    });

    // The rect wrapper should have aria-pressed=true since activeSourceId matches
    const rectWrapper = screen.getByTestId("rect-btn").parentElement!;
    expect(rectWrapper).toHaveAttribute("aria-pressed", "true");

    // Poly wrapper should not be pressed
    const polyWrapper = screen.getByTestId("poly-btn").parentElement!;
    expect(polyWrapper).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onActivate('rect') when rect button wrapper is clicked", () => {
    const { props } = renderToolbar();
    const rectWrapper = screen.getByTestId("rect-btn").parentElement!;
    fireEvent.click(rectWrapper);
    expect(props.onActivate).toHaveBeenCalledWith("rect");
  });

  it("fires onActivate('poly') when poly button wrapper is clicked", () => {
    const { props } = renderToolbar();
    const polyWrapper = screen.getByTestId("poly-btn").parentElement!;
    fireEvent.click(polyWrapper);
    expect(props.onActivate).toHaveBeenCalledWith("poly");
  });

  it("sets aria-pressed after clicking a tool button", () => {
    renderToolbar();
    const rectWrapper = screen.getByTestId("rect-btn").parentElement!;

    // Initially not pressed
    expect(rectWrapper).toHaveAttribute("aria-pressed", "false");

    // Click to activate
    fireEvent.click(rectWrapper);
    expect(rectWrapper).toHaveAttribute("aria-pressed", "true");
  });

  it("clearSelections via ref resets cosmograph and calls onClear", () => {
    const { ref, props } = renderToolbar();

    act(() => {
      ref.current!.clearSelections();
    });

    expect(mockPointsSelection.reset).toHaveBeenCalled();
    expect(mockLinksSelection.reset).toHaveBeenCalled();
    expect(props.onClear).toHaveBeenCalled();
  });

  it("does not fire onActivate when locked", () => {
    const { props } = renderToolbar({ isLocked: true });
    const rectWrapper = screen.getByTestId("rect-btn").parentElement!;
    fireEvent.click(rectWrapper);
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it("dims buttons and disables pointer events when locked", () => {
    renderToolbar({ isLocked: true });
    const rectWrapper = screen.getByTestId("rect-btn").parentElement!;
    expect(rectWrapper).toHaveAttribute("aria-disabled", "true");
    expect(rectWrapper.style.opacity).toBe("0.35");
    expect(rectWrapper.style.pointerEvents).toBe("none");
  });

  it("clears activatedToolId on Escape", () => {
    renderToolbar();
    const rectWrapper = screen.getByTestId("rect-btn").parentElement!;

    // Activate rect
    fireEvent.click(rectWrapper);
    expect(rectWrapper).toHaveAttribute("aria-pressed", "true");

    // Press Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(rectWrapper).toHaveAttribute("aria-pressed", "false");
  });

  it("clears activatedToolId when store selection disappears", () => {
    renderToolbar();
    const rectWrapper = screen.getByTestId("rect-btn").parentElement!;

    // Activate rect
    fireEvent.click(rectWrapper);
    expect(rectWrapper).toHaveAttribute("aria-pressed", "true");

    // Simulate store transition: had selection -> no selection
    act(() => {
      storeListener?.(
        { selectedPointCount: 0, selectionLocked: false },
        { selectedPointCount: 2, selectionLocked: false },
      );
    });

    expect(rectWrapper).toHaveAttribute("aria-pressed", "false");
  });

  it("clears activatedToolId when selection becomes locked", () => {
    renderToolbar();
    const rectWrapper = screen.getByTestId("rect-btn").parentElement!;

    fireEvent.click(rectWrapper);
    expect(rectWrapper).toHaveAttribute("aria-pressed", "true");

    // Simulate store transition: unlocked -> locked
    act(() => {
      storeListener?.(
        { selectedPointCount: 1, selectionLocked: true },
        { selectedPointCount: 1, selectionLocked: false },
      );
    });

    expect(rectWrapper).toHaveAttribute("aria-pressed", "false");
  });
});
