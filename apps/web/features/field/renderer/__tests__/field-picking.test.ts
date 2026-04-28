/**
 * @jest-environment jsdom
 */
import * as THREE from "three";

import { createFieldPicker, PICK_NO_HIT } from "../field-picking";
import { createFieldPickingMaterial } from "../field-picking-material";

function createCanvasRect(): DOMRect {
  return {
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function writeIndex(
  buffer: Uint8Array,
  pixel: number,
  index: number,
  depthByte = 255,
): void {
  const offset = pixel * 4;
  buffer[offset] = index & 0xff;
  buffer[offset + 1] = (index >> 8) & 0xff;
  buffer[offset + 2] = (index >> 16) & 0xff;
  buffer[offset + 3] = depthByte;
}

function createRenderer() {
  return {
    getClearAlpha: jest.fn(() => 1),
    getClearColor: jest.fn((color: THREE.Color) => color.set(0xffffff)),
    getRenderTarget: jest.fn(() => null),
    setClearColor: jest.fn(),
    setRenderTarget: jest.fn(),
    clear: jest.fn(),
    render: jest.fn(),
    readRenderTargetPixels: jest.fn(),
    readRenderTargetPixelsAsync: jest.fn(),
  } as unknown as jest.Mocked<THREE.WebGLRenderer>;
}

function createPickContext(renderer: THREE.WebGLRenderer) {
  return {
    renderer,
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    pickingMaterial: new THREE.PointsMaterial(),
    points: new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial(),
    ),
    canvasRect: createCanvasRect(),
  };
}

describe("createFieldPicker", () => {
  it("uses orb-relative depth in the picking shader", () => {
    const material = createFieldPickingMaterial(
      new Proxy(
        {},
        {
          get: () => ({ value: 0 }),
        },
      ) as Parameters<typeof createFieldPickingMaterial>[0],
    );

    expect(material.vertexShader).toContain("float centerDepth");
    expect(material.vertexShader).toContain("vPickDepth = pointDepth - centerDepth");
    expect(material.fragmentShader).toContain(
      "PICK_RELATIVE_DEPTH_HALF_RANGE",
    );
    expect(material.fragmentShader).not.toContain("PICK_DEPTH_RANGE");
  });

  it("reads one sync pixel for click picking", () => {
    const picker = createFieldPicker();
    const renderer = createRenderer();
    picker.setSize(100, 100, 1);
    renderer.readRenderTargetPixels.mockImplementation(
      (_target, _x, _y, _w, _h, buffer) => {
        writeIndex(buffer as Uint8Array, 0, 258);
      },
    );

    const index = picker.pickSync({
      ...createPickContext(renderer),
      clientX: 10,
      clientY: 20,
    });

    expect(index).toBe(258);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.setClearColor).toHaveBeenNthCalledWith(1, 0x000000, 0);
    expect(renderer.setClearColor).toHaveBeenLastCalledWith(
      expect.any(THREE.Color),
      1,
    );
    expect(renderer.readRenderTargetPixels).toHaveBeenCalledWith(
      expect.any(THREE.WebGLRenderTarget),
      10,
      80,
      1,
      1,
      expect.any(Uint8Array),
    );
  });

  it("returns no-hit for transparent pick pixels", () => {
    const picker = createFieldPicker();
    const renderer = createRenderer();
    picker.setSize(100, 100, 1);
    renderer.readRenderTargetPixels.mockImplementation(
      (_target, _x, _y, _w, _h, buffer) => {
        writeIndex(buffer as Uint8Array, 0, 10, 0);
      },
    );

    expect(
      picker.pickSync({
        ...createPickContext(renderer),
        clientX: 10,
        clientY: 20,
      }),
    ).toBe(PICK_NO_HIT);
  });

  it("bulk-reads rectangle picks once and returns unique sorted indices", async () => {
    const picker = createFieldPicker();
    const renderer = createRenderer();
    picker.setSize(100, 100, 2);
    renderer.readRenderTargetPixelsAsync.mockImplementation(
      async (_target, _x, _y, width, height, buffer) => {
        expect(width * height).toBe(18);
        const bytes = buffer as Uint8Array;
        writeIndex(bytes, 0, 258);
        writeIndex(bytes, 1, 3);
        writeIndex(bytes, 2, 258);
        writeIndex(bytes, 3, 99, 0);
        return bytes;
      },
    );

    const indices = await picker.pickRectAsync({
      ...createPickContext(renderer),
      clientRect: { left: 10, top: 20, right: 14, bottom: 22 },
    });

    expect(indices).toEqual([3, 258]);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledWith(
      expect.any(THREE.WebGLRenderTarget),
      15,
      117,
      6,
      3,
      expect.any(Uint8Array),
    );
    expect(renderer.readRenderTargetPixels).not.toHaveBeenCalled();
  });

  it("defaults rectangle picks to the front depth slab", async () => {
    const picker = createFieldPicker();
    const renderer = createRenderer();
    picker.setSize(100, 100, 1);
    renderer.readRenderTargetPixelsAsync.mockImplementation(
      async (_target, _x, _y, _width, _height, buffer) => {
        const bytes = buffer as Uint8Array;
        writeIndex(bytes, 0, 1, 80);
        writeIndex(bytes, 1, 2, 95);
        writeIndex(bytes, 2, 3, 130);
        return bytes;
      },
    );

    const indices = await picker.pickRectAsync({
      ...createPickContext(renderer),
      clientRect: { left: 10, top: 20, right: 13, bottom: 21 },
    });

    expect(indices).toEqual([1, 2]);
  });

  it("keeps every visible depth when rectangle mode is through-volume", async () => {
    const picker = createFieldPicker();
    const renderer = createRenderer();
    picker.setSize(100, 100, 1);
    renderer.readRenderTargetPixelsAsync.mockImplementation(
      async (_target, _x, _y, _width, _height, buffer) => {
        const bytes = buffer as Uint8Array;
        writeIndex(bytes, 0, 1, 80);
        writeIndex(bytes, 1, 2, 95);
        writeIndex(bytes, 2, 3, 130);
        return bytes;
      },
    );

    const indices = await picker.pickRectAsync({
      ...createPickContext(renderer),
      clientRect: { left: 10, top: 20, right: 13, bottom: 21 },
      mode: "through-volume",
    });

    expect(indices).toEqual([1, 2, 3]);
  });

  it("falls back to sync rectangle readback when async readback is unavailable", async () => {
    const picker = createFieldPicker();
    const renderer = createRenderer();
    picker.setSize(100, 100, 1);
    Object.defineProperty(renderer, "readRenderTargetPixelsAsync", {
      value: undefined,
    });
    renderer.readRenderTargetPixels.mockImplementation(
      (_target, _x, _y, _w, _h, buffer) => {
        writeIndex(buffer as Uint8Array, 0, 7);
      },
    );

    const indices = await picker.pickRectAsync({
      ...createPickContext(renderer),
      clientRect: { left: 10, top: 20, right: 11, bottom: 21 },
    });

    expect(indices).toEqual([7]);
    expect(renderer.readRenderTargetPixels).toHaveBeenCalledTimes(1);
  });
});
