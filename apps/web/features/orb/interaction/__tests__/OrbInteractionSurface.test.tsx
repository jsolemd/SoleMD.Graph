/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react";

import {
  OrbInteractionContext,
  type OrbInteractionBridge,
} from "../orb-interaction-context";
import { OrbInteractionSurface } from "../OrbInteractionSurface";

function renderSurface(props: {
  onClick?: (clientX: number, clientY: number) => void;
  onDoubleTap?: () => void;
  onHoverMove?: (clientX: number, clientY: number) => void;
  onHoverClear?: () => void;
}) {
  const registerSurface = jest.fn();
  const bridge: OrbInteractionBridge = {
    surfaceElement: null,
    registerSurface,
  };
  const onClick = props.onClick ?? jest.fn();
  const view = render(
    <OrbInteractionContext.Provider value={bridge}>
      <OrbInteractionSurface
        onClick={onClick}
        onDoubleTap={props.onDoubleTap}
        onHoverMove={props.onHoverMove}
        onHoverClear={props.onHoverClear}
      />
    </OrbInteractionContext.Provider>,
  );
  const surface = view.container.firstElementChild as HTMLDivElement;
  return { ...view, onClick, registerSurface, surface };
}

function dispatchPointer(
  target: HTMLElement,
  type: string,
  init: {
    button?: number;
    buttons?: number;
    clientX?: number;
    clientY?: number;
    pointerType?: string;
  } = {},
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    buttons: { value: init.buttons ?? 0 },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    pointerType: { value: init.pointerType ?? "mouse" },
  });
  fireEvent(target, event);
}

describe("OrbInteractionSurface", () => {
  afterEach(() => {
    cleanup();
  });

  it("fires a click for an under-threshold primary-button tap", () => {
    const onClick = jest.fn();
    const { surface } = renderSurface({ onClick });

    dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerType: "mouse",
    });
    dispatchPointer(surface, "pointerup", {
      button: 0,
      clientX: 102,
      clientY: 101,
      pointerType: "mouse",
    });

    expect(onClick).toHaveBeenCalledWith(102, 101);
  });

  it("does not fire a click for primary-button drag", () => {
    const onClick = jest.fn();
    const { surface } = renderSurface({ onClick });

    dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerType: "mouse",
    });
    dispatchPointer(surface, "pointerup", {
      button: 0,
      clientX: 120,
      clientY: 100,
      pointerType: "mouse",
    });

    expect(onClick).not.toHaveBeenCalled();
  });

  it("leaves right and middle buttons to camera controls", () => {
    const onClick = jest.fn();
    const { surface } = renderSurface({ onClick });

    for (const button of [1, 2]) {
      dispatchPointer(surface, "pointerdown", {
        button,
        clientX: 100,
        clientY: 100,
        pointerType: "mouse",
      });
      dispatchPointer(surface, "pointerup", {
        button,
        clientX: 100,
        clientY: 100,
        pointerType: "mouse",
      });
    }

    expect(onClick).not.toHaveBeenCalled();
  });

  it("runs hover only for idle mouse movement", () => {
    const onHoverMove = jest.fn();
    const { surface } = renderSurface({ onHoverMove });

    dispatchPointer(surface, "pointermove", {
      buttons: 0,
      clientX: 25,
      clientY: 30,
      pointerType: "mouse",
    });
    dispatchPointer(surface, "pointermove", {
      buttons: 1,
      clientX: 35,
      clientY: 40,
      pointerType: "mouse",
    });
    dispatchPointer(surface, "pointermove", {
      buttons: 0,
      clientX: 45,
      clientY: 50,
      pointerType: "touch",
    });

    expect(onHoverMove).toHaveBeenCalledTimes(1);
    expect(onHoverMove).toHaveBeenCalledWith(25, 30);
  });

  it("clears hover on pointer out", () => {
    const onHoverClear = jest.fn();
    const { surface } = renderSurface({ onHoverClear });

    dispatchPointer(surface, "pointerout");

    expect(onHoverClear).toHaveBeenCalledTimes(1);
  });

  it("fires onDoubleTap on a second touch tap within window — additive to onClick", () => {
    const onDoubleTap = jest.fn();
    const { surface, onClick } = renderSurface({ onDoubleTap });

    const tap = (x: number, y: number) => {
      dispatchPointer(surface, "pointerdown", {
        button: 0,
        clientX: x,
        clientY: y,
        pointerType: "touch",
      });
      dispatchPointer(surface, "pointerup", {
        button: 0,
        clientX: x,
        clientY: y,
        pointerType: "touch",
      });
    };

    tap(100, 100);
    tap(108, 102);

    expect(onClick).toHaveBeenCalledTimes(2);
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onDoubleTap on a mouse double-click (desktop has Space)", () => {
    const onDoubleTap = jest.fn();
    const { surface, onClick } = renderSurface({ onDoubleTap });

    const tap = (x: number, y: number) => {
      dispatchPointer(surface, "pointerdown", {
        button: 0,
        clientX: x,
        clientY: y,
        pointerType: "mouse",
      });
      dispatchPointer(surface, "pointerup", {
        button: 0,
        clientX: x,
        clientY: y,
        pointerType: "mouse",
      });
    };

    tap(100, 100);
    tap(101, 100);

    expect(onClick).toHaveBeenCalledTimes(2);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it("does NOT fire onDoubleTap when the second tap is too far away", () => {
    const onDoubleTap = jest.fn();
    const { surface } = renderSurface({ onDoubleTap });

    const tap = (x: number, y: number) => {
      dispatchPointer(surface, "pointerdown", {
        button: 0,
        clientX: x,
        clientY: y,
        pointerType: "touch",
      });
      dispatchPointer(surface, "pointerup", {
        button: 0,
        clientX: x,
        clientY: y,
        pointerType: "touch",
      });
    };

    tap(100, 100);
    tap(180, 100); // 80px away — outside DOUBLE_TAP_RADIUS_PX (30)

    expect(onDoubleTap).not.toHaveBeenCalled();
  });
});
