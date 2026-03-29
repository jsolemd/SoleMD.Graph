/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { swapCosmographMock } from "../test-utils";

const mockCosmograph = {
  captureScreenshot: jest.fn(),
  getPointsData: jest.fn().mockResolvedValue("mock-data"),
  convertCosmographDataToObject: jest.fn().mockReturnValue([
    { id: "1", label: "Node A" },
    { id: "2", label: "Node B" },
  ]),
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

  it("exportDataAsCsv fetches data and triggers download", async () => {
    const mockCreateObjectURL = jest.fn().mockReturnValue("blob:url");
    const mockRevokeObjectURL = jest.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    const { result } = renderHook(() => useGraphExport());
    await result.current.exportDataAsCsv("test.csv");

    expect(mockCosmograph.getPointsData).toHaveBeenCalled();
    expect(mockCosmograph.convertCosmographDataToObject).toHaveBeenCalledWith("mock-data");
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:url");
  });

  it("exportDataAsCsv returns early when no points data", async () => {
    mockCosmograph.getPointsData.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useGraphExport());
    await result.current.exportDataAsCsv();

    expect(mockCosmograph.convertCosmographDataToObject).not.toHaveBeenCalled();
  });
});

describe("useGraphExport (null cosmograph)", () => {
  beforeAll(() => swapCosmographMock(null));
  afterAll(() => swapCosmographMock(mockCosmograph));

  it("captureScreenshot is a no-op when cosmograph is null", () => {
    const { result } = renderHook(() => useGraphExport());
    expect(() => result.current.captureScreenshot()).not.toThrow();
  });

  it("exportDataAsCsv returns early when cosmograph is null", async () => {
    const { result } = renderHook(() => useGraphExport());
    await expect(result.current.exportDataAsCsv()).resolves.toBeUndefined();
  });
});
