/**
 * @jest-environment jsdom
 */
import {
  clearCameraState,
  loadCameraState,
  saveCameraState,
} from "../camera-persistence";

const mockStorage: Record<string, string> = {};

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  jest.spyOn(Storage.prototype, "getItem").mockImplementation((k) => mockStorage[k] ?? null);
  jest.spyOn(Storage.prototype, "setItem").mockImplementation((k, v) => { mockStorage[k] = v; });
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation((k) => { delete mockStorage[k]; });
});

afterEach(() => jest.restoreAllMocks());

describe("camera-persistence", () => {
  it("round-trips a camera snapshot through sessionStorage", () => {
    saveCameraState({ zoomLevel: 2.5, transformX: 10, transformY: -4 });
    const loaded = loadCameraState();
    expect(loaded).not.toBeNull();
    expect(loaded!.zoomLevel).toBe(2.5);
    expect(loaded!.transformX).toBe(10);
    expect(loaded!.transformY).toBe(-4);
  });

  it("returns null when nothing is saved", () => {
    expect(loadCameraState()).toBeNull();
  });

  it("expires after MAX_AGE_MS", () => {
    saveCameraState({ zoomLevel: 1.8, transformX: 1, transformY: 2 });
    const raw = JSON.parse(mockStorage["solemd:camera"]);
    raw.savedAt = Date.now() - 31 * 60 * 1000;
    mockStorage["solemd:camera"] = JSON.stringify(raw);
    expect(loadCameraState()).toBeNull();
  });

  it("clears saved state", () => {
    saveCameraState({ zoomLevel: 3.0, transformX: 5, transformY: 7 });
    clearCameraState();
    expect(loadCameraState()).toBeNull();
  });

  it("rejects non-finite zoom values", () => {
    saveCameraState({ zoomLevel: NaN, transformX: 0, transformY: 0 });
    expect(loadCameraState()).toBeNull();
  });

  it("rejects incomplete legacy zoom-only payloads", () => {
    mockStorage["solemd:camera"] = JSON.stringify({
      zoomLevel: 1.2,
      savedAt: Date.now(),
    });
    expect(loadCameraState()).toBeNull();
  });
});
