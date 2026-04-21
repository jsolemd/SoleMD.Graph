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

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createController(
  whenReady: () => Promise<void>,
): FieldController {
  return {
    whenReady,
  } as unknown as FieldController;
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
    if (ready) {
      onReady();
    }
  }, [onReady, ready]);

  return <div data-testid="stage-ready">{ready ? "ready" : "pending"}</div>;
}

describe("FixedStageManagerProvider", () => {
  beforeEach(() => {
    prewarmFieldPointSources.mockReset();
    bindFieldControllers.mockReset();
    bindFieldControllers.mockReturnValue(() => {});
  });

  it("holds stage readiness until prewarm and every controller whenReady resolve", async () => {
    const blobReady = createDeferred();
    const streamReady = createDeferred();
    const onReady = jest.fn();
    const sceneStateRef = {
      current: createFieldSceneState(),
    };
    const sceneStore = createFieldSceneStore(sceneStateRef.current);

    render(
      <FixedStageManagerProvider
        isMobile={false}
        manifest={[
          {
            sectionId: "section-story-1",
            stageItemId: "blob",
            presetId: "blob",
          },
          {
            sectionId: "section-story-2",
            stageItemId: "stream",
            presetId: "stream",
          },
        ]}
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
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      blobReady.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("stage-ready")).toHaveTextContent("pending");
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      streamReady.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("stage-ready")).toHaveTextContent("ready");
    });

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(prewarmFieldPointSources).toHaveBeenCalledWith({
      densityScale: 1,
      ids: ["blob", "stream"],
      isMobile: false,
    });
    expect(bindFieldControllers).toHaveBeenCalledTimes(1);
  });
});
