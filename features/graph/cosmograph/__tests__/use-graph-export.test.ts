import { renderHook } from "@testing-library/react";

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
    const mockClick = jest.fn();
    const mockCreateElement = jest.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      click: mockClick,
    } as unknown as HTMLAnchorElement);
    const mockCreateObjectURL = jest.fn().mockReturnValue("blob:url");
    const mockRevokeObjectURL = jest.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    const { result } = renderHook(() => useGraphExport());
    await result.current.exportDataAsCsv("test.csv");

    expect(mockCosmograph.getPointsData).toHaveBeenCalled();
    expect(mockCosmograph.convertCosmographDataToObject).toHaveBeenCalledWith("mock-data");
    expect(mockClick).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:url");

    mockCreateElement.mockRestore();
  });

  it("exportDataAsCsv returns early when no points data", async () => {
    mockCosmograph.getPointsData.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useGraphExport());
    await result.current.exportDataAsCsv();

    expect(mockCosmograph.convertCosmographDataToObject).not.toHaveBeenCalled();
  });
});

describe("useGraphExport (null cosmograph)", () => {
  beforeAll(() => {
    jest.resetModules();
    jest.mock("@cosmograph/react", () => ({
      useCosmograph: () => ({ cosmograph: null }),
    }));
  });

  it("captureScreenshot is a no-op when cosmograph is null", () => {
    const { useGraphExport: useGraphExportNull } = require("../hooks/use-graph-export");
    const { result } = renderHook(() => useGraphExportNull());
    expect(() => result.current.captureScreenshot()).not.toThrow();
  });

  it("exportDataAsCsv returns early when cosmograph is null", async () => {
    const { useGraphExport: useGraphExportNull } = require("../hooks/use-graph-export");
    const { result } = renderHook(() => useGraphExportNull());
    await expect(result.current.exportDataAsCsv()).resolves.toBeUndefined();
  });
});
