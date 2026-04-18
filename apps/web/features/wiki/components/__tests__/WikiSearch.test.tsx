/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";

// Mock wiki client
const mockSearchWikiPagesClient = jest.fn().mockResolvedValue({ hits: [], total: 0 });
jest.mock("@solemd/api-client/client/wiki-client", () => ({
  searchWikiPagesClient: (...args: unknown[]) => mockSearchWikiPagesClient(...args),
}));

// Mock framer-motion
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...rest}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock("@/features/animations/lottie/SearchToggleLottie", () => ({
  SearchToggleLottie: ({ mode }: { mode: string }) => (
    <span data-testid={`search-toggle-${mode}`} />
  ),
}));

import { WikiSearch } from "../WikiSearch";

function renderSearch(onNavigate = jest.fn()) {
  return {
    onNavigate,
    ...render(
      <MantineProvider>
        <WikiSearch onNavigate={onNavigate} />
      </MantineProvider>,
    ),
  };
}

describe("WikiSearch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders search icon button in closed state", () => {
    renderSearch();
    expect(screen.getByLabelText("Search wiki")).toBeInTheDocument();
  });

  it("opens input on icon click", () => {
    renderSearch();
    fireEvent.click(screen.getByLabelText("Search wiki"));
    expect(screen.getByLabelText("Search wiki pages")).toBeInTheDocument();
  });

  it("calls searchWikiPages after debounce", async () => {
    mockSearchWikiPagesClient.mockResolvedValue({
      hits: [{ slug: "entities/test", title: "Test Page", headline: "A test", rank: 1, entity_type: null, family_key: null, tags: [] }],
      total: 1,
    });

    renderSearch();
    fireEvent.click(screen.getByLabelText("Search wiki"));
    fireEvent.change(screen.getByLabelText("Search wiki pages"), {
      target: { value: "test query" },
    });

    act(() => { jest.advanceTimersByTime(350); });

    await waitFor(() => {
      expect(mockSearchWikiPagesClient).toHaveBeenCalledWith("test query", 20, expect.any(Object));
    });
  });

  it("clicking a result navigates and closes", async () => {
    const onNavigate = jest.fn();
    mockSearchWikiPagesClient.mockResolvedValue({
      hits: [{ slug: "entities/test", title: "Test Page", headline: "", rank: 1, entity_type: null, family_key: null, tags: [] }],
      total: 1,
    });

    render(
      <MantineProvider>
        <WikiSearch onNavigate={onNavigate} />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByLabelText("Search wiki"));
    fireEvent.change(screen.getByLabelText("Search wiki pages"), {
      target: { value: "test" },
    });
    act(() => { jest.advanceTimersByTime(350); });

    await waitFor(() => {
      expect(screen.getByText("Test Page")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Test Page"));
    expect(onNavigate).toHaveBeenCalledWith("entities/test");
  });
});
