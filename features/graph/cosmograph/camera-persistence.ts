export interface CameraSnapshot {
  zoomLevel: number;
  transformX: number;
  transformY: number;
}

export const DEFAULT_INITIAL_CAMERA: CameraSnapshot = {
  zoomLevel: 0.671760424251925,
  transformX: -511.4044472888161,
  transformY: -249.35116815181198,
};

const STORAGE_KEY = "solemd:camera";

export interface CameraState extends CameraSnapshot {
  savedAt: number;
}

const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export function saveCameraState(camera: CameraSnapshot): void {
  try {
    const state: CameraState = {
      ...camera,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable (SSR, private browsing quota)
  }
}

export function loadCameraState(): CameraState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const state: CameraState = JSON.parse(raw);
    if (Date.now() - state.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (
      typeof state.zoomLevel !== "number" ||
      !isFinite(state.zoomLevel) ||
      typeof state.transformX !== "number" ||
      !isFinite(state.transformX) ||
      typeof state.transformY !== "number" ||
      !isFinite(state.transformY)
    ) {
      return null;
    }

    return state;
  } catch {
    return null;
  }
}

export function clearCameraState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}
