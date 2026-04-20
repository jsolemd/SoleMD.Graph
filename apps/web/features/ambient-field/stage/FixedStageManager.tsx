"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { FieldController } from "../controller/FieldController";
import {
  prewarmAmbientFieldPointSources,
} from "../asset/point-source-registry";
import type {
  AmbientFieldSceneState,
  AmbientFieldStageItemId,
} from "../scene/visual-presets";
import { bindAmbientFieldControllers } from "../scroll/ambient-field-scroll-driver";
import type { FieldSectionManifestEntry } from "../surfaces/AmbientFieldLandingPage/ambient-field-landing-content";

interface FixedStageManagerContextValue {
  ready: boolean;
  registerController: (
    id: AmbientFieldStageItemId,
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
  sceneStateRef: MutableRefObject<AmbientFieldSceneState>;
}

export function FixedStageManagerProvider({
  children,
  isMobile,
  manifest,
  reducedMotion,
  sceneStateRef,
}: FixedStageManagerProviderProps) {
  const controllersRef = useRef<
    Partial<Record<AmbientFieldStageItemId, FieldController>>
  >({});
  const [ready, setReady] = useState(false);
  const [controllerEpoch, setControllerEpoch] = useState(0);
  const requiredControllerIds = useMemo(
    () =>
      Array.from(
        new Set(manifest.map((entry) => entry.controllerSlug)),
      ) as AmbientFieldStageItemId[],
    [manifest],
  );

  const registerController = (
    id: AmbientFieldStageItemId,
    controller: FieldController,
  ) => {
    if (controllersRef.current[id] === controller) return;
    controllersRef.current[id] = controller;
    setControllerEpoch((current) => current + 1);
  };

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
        prewarmAmbientFieldPointSources({
          densityScale: 1,
          ids: requiredControllerIds,
          isMobile,
        }),
      );
      await Promise.all(
        requiredControllerIds.map((id) => controllers[id]!.whenReady()),
      );
      if (cancelled) return;

      disposeBindings = bindAmbientFieldControllers({
        controllers: controllers as Record<
          AmbientFieldStageItemId,
          FieldController
        >,
        heroAnchorId: "section-welcome",
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
