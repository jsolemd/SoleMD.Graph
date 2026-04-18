/**
 * @jest-environment jsdom
 */
jest.mock("pixi.js", () => ({
  Application: class {},
  Container: class {},
  Graphics: class {},
  Text: class {},
  TextStyle: class {},
  Circle: class {},
}));

import { resizeScene, destroyScene } from "../render-scene";
import type { WikiGraphScene } from "../render-scene";

describe("render-scene resize contract", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function createScene(): WikiGraphScene {
    return {
      app: {
        renderer: { resize: jest.fn() },
        destroy: jest.fn(),
      },
      linkContainer: {} as WikiGraphScene["linkContainer"],
      nodeContainer: {} as WikiGraphScene["nodeContainer"],
      labelContainer: {} as WikiGraphScene["labelContainer"],
      nodeRenderData: [],
      linkRenderData: [],
      width: 320,
      height: 240,
      zoomScale: 1,
      pendingWidth: null,
      pendingHeight: null,
      resizeCommitTimeout: null,
      hoveredNodeId: null,
      labelsDirty: false,
      lastLabelLayoutAt: 0,
    } as unknown as WikiGraphScene;
  }

  it("commits only the final settled size", () => {
    const scene = createScene();
    const resize = scene.app.renderer.resize as jest.Mock;

    resizeScene(scene, 400, 300);
    resizeScene(scene, 520, 360);

    expect(scene.width).toBe(320);
    expect(scene.height).toBe(240);
    expect(resize).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);

    expect(scene.width).toBe(520);
    expect(scene.height).toBe(360);
    expect(resize).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenCalledWith(520, 360);
  });

  it("clears a pending resize on destroy", () => {
    const scene = createScene();
    const resize = scene.app.renderer.resize as jest.Mock;
    const destroy = scene.app.destroy as jest.Mock;

    resizeScene(scene, 480, 320);
    destroyScene(scene);
    jest.advanceTimersByTime(100);

    expect(resize).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });
});
