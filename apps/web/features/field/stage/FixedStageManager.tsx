"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { FieldController } from "../controller/FieldController";
import {
  prewarmFieldPointSources,
} from "../asset/point-source-registry";
import type {
  FieldSceneState,
  FieldStageItemId,
} from "../scene/visual-presets";
import { bindFieldControllers } from "../scroll/field-scroll-driver";
import type { FieldSectionManifestEntry } from "../surfaces/FieldLandingPage/field-landing-content";

interface FixedStageManagerContextValue {
  ready: boolean;
  registerController: (
    id: FieldStageItemId,
    controller: FieldController,
  ) => void;
}

const FixedStageManagerContext =
  createContext<FixedStageManagerContextValue | null>(null);

export interface FixedStageManagerProviderProps {
  children: ReactNode;
  isMobile: boolean;
  manifest: readonly FieldSectionManifestEntry[];
  reducedMotion: boolean;
  sceneStateRef: MutableRefObject<FieldSceneState>;
}

export function FixedStageManagerProvider({
  children,
  isMobile,
  manifest,
  reducedMotion,
  sceneStateRef,
}: FixedStageManagerProviderProps) {
  const controllersRef = useRef<
    Partial<Record<FieldStageItemId, FieldController>>
  >({});
  const [ready, setReady] = useState(false);
  const [controllerEpoch, setControllerEpoch] = useState(0);
  const requiredControllerIds = useMemo(
    () =>
      Array.from(
        new Set(manifest.map((entry) => entry.stageItemId)),
      ) as FieldStageItemId[],
    [manifest],
  );

  const registerController = useCallback((
    id: FieldStageItemId,
    controller: FieldController,
  ) => {
    if (controllersRef.current[id] === controller) return;
    controllersRef.current[id] = controller;
    setControllerEpoch((current) => current + 1);
  }, []);

  useEffect(() => {
    const controllers = controllersRef.current;
    if (requiredControllerIds.some((id) => !controllers[id])) {
      setReady(false);
      return;
    }

    let cancelled = false;
    let disposeBindings: (() => void) | null = null;
    setReady(false);

    async function boot() {
      await Promise.resolve(
        prewarmFieldPointSources({
          densityScale: 1,
          ids: requiredControllerIds,
          isMobile,
        }),
      );
      await Promise.all(
        requiredControllerIds.map((id) => controllers[id]!.whenReady()),
      );
      if (cancelled) return;

      disposeBindings = bindFieldControllers({
        heroSectionId: "section-hero",
        manifest,
        reducedMotion,
        sceneStateRef,
      });
      setReady(true);
    }

    void boot();

    return () => {
      cancelled = true;
      setReady(false);
      disposeBindings?.();
    };
  }, [controllerEpoch, isMobile, manifest, reducedMotion, requiredControllerIds, sceneStateRef]);

  return (
    <FixedStageManagerContext.Provider
      value={{ ready, registerController }}
    >
      {children}
    </FixedStageManagerContext.Provider>
  );
}

export function useFixedStageManager() {
  const context = useContext(FixedStageManagerContext);
  if (!context) {
    throw new Error("useFixedStageManager must be used within FixedStageManagerProvider");
  }
  return context;
}
