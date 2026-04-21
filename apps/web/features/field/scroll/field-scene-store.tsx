"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FieldSceneState } from "../scene/visual-presets";

type Listener = () => void;

export interface FieldSceneStore {
  subscribe(listener: Listener): () => void;
  notify(): void;
  getCurrentState(): FieldSceneState | null;
  setCurrentState(sceneState: FieldSceneState | null): void;
}

export function createFieldSceneStore(
  initialState: FieldSceneState | null = null,
): FieldSceneStore {
  let currentFieldSceneState = initialState;
  const listeners = new Set<Listener>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify() {
      for (const listener of listeners) listener();
    },
    getCurrentState() {
      return currentFieldSceneState;
    },
    setCurrentState(sceneState) {
      currentFieldSceneState = sceneState;
    },
  };
}

const FieldSceneStoreContext = createContext<FieldSceneStore | null>(null);

export function FieldSceneStoreProvider({
  children,
  store,
}: {
  children: ReactNode;
  store: FieldSceneStore;
}) {
  return (
    <FieldSceneStoreContext.Provider value={store}>
      {children}
    </FieldSceneStoreContext.Provider>
  );
}

export function useFieldSceneStore(): FieldSceneStore {
  const context = useContext(FieldSceneStoreContext);
  if (!context) {
    throw new Error(
      "useFieldSceneStore must be used within FieldSceneStoreProvider",
    );
  }
  return context;
}
