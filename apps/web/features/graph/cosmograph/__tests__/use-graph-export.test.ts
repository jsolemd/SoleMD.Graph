/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { swapCosmographMock } from "./test-utils";

const mockCosmograph = {
  captureScreenshot: jest.fn(),
};

jest.mock("@cosmograph/react", () => ({
  useCosmograph: () => ({ cosmograph: mockCosmograph }),
}));

import { useGraphExport } from "../hooks/use-graph-export";

beforeEach(() => jest.clearAllMocks());

describe("useGraphExport", () => {
  it("delegates captureScreenshot to cosmograph with default filename", () => {
    const { result } = renderHook(() => useGraphExport());
    result.current.captureScreenshot();
    expect(mockCosmograph.captureScreenshot).toHaveBeenCalledWith("solemd-graph.png");
  });

  it("delegates captureScreenshot to cosmograph with custom filename", () => {
    const { result } = renderHook(() => useGraphExport());
    result.current.captureScreenshot("custom.png");
    expect(mockCosmograph.captureScreenshot).toHaveBeenCalledWith("custom.png");
  });

});

describe("useGraphExport (null cosmograph)", () => {
  beforeAll(() => swapCosmographMock(null));
  afterAll(() => swapCosmographMock(mockCosmograph));

  it("captureScreenshot is a no-op when cosmograph is null", () => {
    const { result } = renderHook(() => useGraphExport());
    expect(() => result.current.captureScreenshot()).not.toThrow();
  });

});
