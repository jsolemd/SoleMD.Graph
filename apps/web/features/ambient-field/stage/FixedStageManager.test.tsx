import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import type { FieldController } from "../controller/FieldController";
import { createAmbientFieldSceneState } from "../scene/visual-presets";
import {
  FixedStageManagerProvider,
  useFixedStageManager,
} from "./FixedStageManager";

const prewarmAmbientFieldPointSources = jest.fn();
const bindAmbientFieldControllers = jest.fn(() => () => {});

jest.mock("../asset/point-source-registry", () => ({
  prewarmAmbientFieldPointSources: (...args: unknown[]) =>
    prewarmAmbientFieldPointSources(...args),
}));

jest.mock("../scroll/ambient-field-scroll-driver", () => ({
  bindAmbientFieldControllers: (...args: unknown[]) =>
    bindAmbientFieldControllers(...args),
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
    prewarmAmbientFieldPointSources.mockReset();
    bindAmbientFieldControllers.mockReset();
    bindAmbientFieldControllers.mockReturnValue(() => {});
  });

  it("holds stage readiness until prewarm and every controller whenReady resolve", async () => {
    const blobReady = createDeferred();
    const streamReady = createDeferred();
    const onReady = jest.fn();
    const sceneStateRef = {
      current: createAmbientFieldSceneState(),
    };

    render(
      <FixedStageManagerProvider
        isMobile={false}
        manifest={[
          {
            anchorId: "section-story-1",
            controllerSlug: "blob",
            gfxPreset: "blob",
          },
          {
            anchorId: "section-graph",
            controllerSlug: "stream",
            gfxPreset: "stream",
          },
        ]}
        reducedMotion={false}
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
    expect(prewarmAmbientFieldPointSources).toHaveBeenCalledWith({
      densityScale: 1,
      ids: ["blob", "stream"],
      isMobile: false,
    });
    expect(bindAmbientFieldControllers).toHaveBeenCalledTimes(1);
  });
});
