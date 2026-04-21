/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import type { FieldController } from "../../controller/FieldController";
import { createFieldSceneState } from "../../scene/visual-presets";
import { createFieldSceneStore } from "../../scroll/field-scene-store";
import {
  FixedStageManagerProvider,
  useFixedStageManager,
} from "../FixedStageManager";

const prewarmFieldPointSources = jest.fn();
const bindFieldControllers = jest.fn(() => () => {});

jest.mock("../../asset/point-source-registry", () => ({
  prewarmFieldPointSources: (...args: unknown[]) =>
    prewarmFieldPointSources(...args),
}));

jest.mock("../../scroll/field-scroll-driver", () => ({
  bindFieldControllers: (...args: unknown[]) =>
    bindFieldControllers(...args),
}));

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createController(
  whenReady: () => Promise<void>,
): FieldController {
  return { whenReady } as unknown as FieldController;
}

function StageProbe({
  controllers,
  onReady,
}: {
  controllers: readonly [string, FieldController][];
  onReady: () => void;
}) {
  const { ready, registerController } = useFixedStageManager();

  useEffect(() => {
    controllers.forEach(([id, controller]) => {
      registerController(id as never, controller);
    });
  }, [controllers, registerController]);

  useEffect(() => {
    if (ready) onReady();
  }, [onReady, ready]);

  return <div data-testid="stage-ready">{ready ? "ready" : "pending"}</div>;
}

const manifest = [
  { sectionId: "section-story-1", stageItemId: "blob", presetId: "blob" },
  { sectionId: "section-story-2", stageItemId: "stream", presetId: "stream" },
] as const;

describe("FixedStageManagerProvider preload gate", () => {
  beforeEach(() => {
    prewarmFieldPointSources.mockReset();
    bindFieldControllers.mockReset();
    bindFieldControllers.mockReturnValue(() => {});
  });

  it("waits for an async prewarm before flipping ready, even after controllers resolve", async () => {
    const prewarm = createDeferred();
    const blobReady = createDeferred();
    const streamReady = createDeferred();
    prewarmFieldPointSources.mockImplementation(() => prewarm.promise);
    const onReady = jest.fn();
    const sceneStateRef = { current: createFieldSceneState() };
    const sceneStore = createFieldSceneStore(sceneStateRef.current);

    render(
      <FixedStageManagerProvider
        isMobile={false}
        manifest={manifest}
        reducedMotion={false}
        sceneStore={sceneStore}
        sceneStateRef={sceneStateRef}
      >
        <StageProbe
          controllers={[
            ["blob", createController(() => blobReady.promise)],
            ["stream", createController(() => streamReady.promise)],
          ]}
          onReady={onReady}
        />
      </FixedStageManagerProvider>,
    );

    expect(screen.getByTestId("stage-ready")).toHaveTextContent("pending");

    await act(async () => {
      blobReady.resolve();
      streamReady.resolve();
      await Promise.resolve();
    });

    // controllers resolved but prewarm still pending — gate must hold
    expect(screen.getByTestId("stage-ready")).toHaveTextContent("pending");
    expect(onReady).not.toHaveBeenCalled();
    expect(bindFieldControllers).not.toHaveBeenCalled();

    await act(async () => {
      prewarm.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("stage-ready")).toHaveTextContent("ready");
    });
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(bindFieldControllers).toHaveBeenCalledTimes(1);
  });

  it("keeps ready=false and logs when a controller whenReady rejects", async () => {
    const blobReady = createDeferred();
    const streamReady = createDeferred();
    const onReady = jest.fn();
    const sceneStateRef = { current: createFieldSceneState() };
    const sceneStore = createFieldSceneStore(sceneStateRef.current);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    render(
      <FixedStageManagerProvider
        isMobile={false}
        manifest={manifest}
        reducedMotion={false}
        sceneStore={sceneStore}
        sceneStateRef={sceneStateRef}
      >
        <StageProbe
          controllers={[
            ["blob", createController(() => blobReady.promise)],
            ["stream", createController(() => streamReady.promise)],
          ]}
          onReady={onReady}
        />
      </FixedStageManagerProvider>,
    );

    await act(async () => {
      blobReady.resolve();
      streamReady.reject(new Error("stream-boom"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("stage-ready")).toHaveTextContent("pending");
    expect(onReady).not.toHaveBeenCalled();
    expect(bindFieldControllers).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "[FixedStageManager] readiness gate rejected",
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("flips ready exactly once after the last gate promise resolves", async () => {
    const prewarm = createDeferred();
    const blobReady = createDeferred();
    const streamReady = createDeferred();
    prewarmFieldPointSources.mockImplementation(() => prewarm.promise);
    const onReady = jest.fn();
    const sceneStateRef = { current: createFieldSceneState() };
    const sceneStore = createFieldSceneStore(sceneStateRef.current);

    render(
      <FixedStageManagerProvider
        isMobile={false}
        manifest={manifest}
        reducedMotion={false}
        sceneStore={sceneStore}
        sceneStateRef={sceneStateRef}
      >
        <StageProbe
          controllers={[
            ["blob", createController(() => blobReady.promise)],
            ["stream", createController(() => streamReady.promise)],
          ]}
          onReady={onReady}
        />
      </FixedStageManagerProvider>,
    );

    await act(async () => {
      prewarm.resolve();
      await Promise.resolve();
    });
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      blobReady.resolve();
      await Promise.resolve();
    });
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      streamReady.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  });
});
