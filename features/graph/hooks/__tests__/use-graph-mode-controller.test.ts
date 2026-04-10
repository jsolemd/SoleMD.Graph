/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { useGraphModeController } from "../use-graph-mode-controller";

beforeEach(() => {
  useGraphStore.setState({ mode: "ask" });
  useDashboardStore.setState({
    promptMode: "normal",
    lastExpandedPromptMode: "normal",
  });
});

describe("useGraphModeController", () => {
  it("applies mode defaults to the prompt display", () => {
    const { result } = renderHook(() => useGraphModeController());

    act(() => {
      result.current.applyMode("explore");
    });
    expect(useGraphStore.getState().mode).toBe("explore");
    expect(useDashboardStore.getState().promptMode).toBe("collapsed");

    act(() => {
      result.current.applyMode("ask");
    });
    expect(useGraphStore.getState().mode).toBe("ask");
    expect(useDashboardStore.getState().promptMode).toBe("normal");

    act(() => {
      result.current.applyMode("create");
    });
    expect(useGraphStore.getState().mode).toBe("create");
    expect(useDashboardStore.getState().promptMode).toBe("maximized");
  });

  it("steps prompt size down without touching graph mode", () => {
    const { result } = renderHook(() => useGraphModeController());

    act(() => {
      result.current.stepPromptDown();
    });
    expect(useDashboardStore.getState().promptMode).toBe("collapsed");
    expect(useGraphStore.getState().mode).toBe("ask");

    act(() => {
      result.current.stepPromptDown();
    });
    expect(useDashboardStore.getState().promptMode).toBe("collapsed");
    expect(useGraphStore.getState().mode).toBe("ask");
  });

  it("applies graph mode defaults without reusing the old expanded size", () => {
    useDashboardStore.getState().maximizePrompt();
    const { result } = renderHook(() => useGraphModeController());

    act(() => {
      result.current.applyMode("explore");
    });
    expect(useDashboardStore.getState().promptMode).toBe("collapsed");

    act(() => {
      useDashboardStore.getState().expandPrompt();
    });
    expect(useDashboardStore.getState().promptMode).toBe("normal");
  });

  it("steps create mode from maximized to normal before collapsing", () => {
    const { result } = renderHook(() => useGraphModeController());

    act(() => {
      result.current.applyMode("create");
    });
    expect(useDashboardStore.getState().promptMode).toBe("maximized");

    act(() => {
      result.current.stepPromptDown();
    });
    expect(useDashboardStore.getState().promptMode).toBe("normal");
  });

  it("learn mode auto-opens wiki panel and expands it", () => {
    const { result } = renderHook(() => useGraphModeController());

    act(() => {
      result.current.applyMode("learn");
    });
    expect(useGraphStore.getState().mode).toBe("learn");
    expect(useDashboardStore.getState().activePanel).toBe("wiki");
    expect(useDashboardStore.getState().wikiExpanded).toBe(true);
  });

  it("ask mode does not change active panel and collapses wiki", () => {
    useDashboardStore.setState({ activePanel: "config", wikiExpanded: true });
    const { result } = renderHook(() => useGraphModeController());

    act(() => {
      result.current.applyMode("ask");
    });
    expect(useDashboardStore.getState().activePanel).toBe("config");
    expect(useDashboardStore.getState().wikiExpanded).toBe(false);
  });

  it("explore mode does not change active panel and collapses wiki", () => {
    useDashboardStore.setState({ activePanel: "filters", wikiExpanded: true });
    const { result } = renderHook(() => useGraphModeController());

    act(() => {
      result.current.applyMode("explore");
    });
    expect(useDashboardStore.getState().activePanel).toBe("filters");
    expect(useDashboardStore.getState().wikiExpanded).toBe(false);
  });

  it("create mode does not change active panel", () => {
    useDashboardStore.setState({ activePanel: "info" });
    const { result } = renderHook(() => useGraphModeController());

    act(() => {
      result.current.applyMode("create");
    });
    expect(useDashboardStore.getState().activePanel).toBe("info");
  });
});
