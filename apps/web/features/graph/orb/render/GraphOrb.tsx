"use client";

/**
 * <GraphOrb> — R3F scene graph for the orb-dev sandbox.
 *
 * Scope: mount a rotatable point cloud; GPU-ID pick on hover + click; emit
 * the picked paper_id upstream so `<OrbDevSurface>` can mirror it into the
 * shared store. No sim. No edges. No d3-force.
 *
 * Disposal contract (see R4 kickoff in
 * docs/future/graph-orb-implementation-handoff.md):
 *   - On unmount, release: BufferGeometry, both ShaderMaterials, picking
 *     render target, CameraControls listeners (drei owns the DOM
 *     listeners; we dispose the controls to drop document-level handlers).
 *   - webglcontextlost:     preventDefault, freeze state, mark lost
 *   - webglcontextrestored: re-upload attribute buffers (still valid in
 *     CPU memory since we hold the typed arrays), re-build pick target
 *   - hard teardown via `renderer.forceContextLoss()` when the parent
 *     wants the GPU reclaimed before React unmount completes.
 */

import { CameraControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type MutableRefObject,
} from "react";
import * as THREE from "three";

import { createOrbPicker, PICK_NO_HIT, type OrbPicker } from "./picking";
import {
  createRotationController,
  type RotationController,
} from "./rotation-controller";
import {
  createOrbShaderMaterials,
  type OrbShaderHandles,
} from "./shaders";
import type { OrbPointBuffers } from "./point-buffers";

export interface GraphOrbHandle {
  dispose: () => void;
  resumeRotation: () => void;
  pointerMove: (ev: { clientX: number; clientY: number }) => void;
  pointerLeave: () => void;
  click: (ev: { clientX: number; clientY: number; detail: number }) => void;
}

export interface GraphOrbProps {
  buffers: OrbPointBuffers | null;
  reducedMotion?: boolean;
  onHover?: (paperId: string | null) => void;
  onPick?: (paperId: string | null) => void;
  /** Exposed so the parent Surface can orchestrate explicit teardown. */
  handleRef?: MutableRefObject<GraphOrbHandle | null>;
}

const HOVER_MIN_INTERVAL_MS = 50; // rAF-pegged hover throttle floor

export function GraphOrb({
  buffers,
  reducedMotion = false,
  onHover,
  onPick,
  handleRef,
}: GraphOrbProps) {
  const { gl, camera, scene, invalidate, size } = useThree();

  // --- long-lived GPU objects; created once per buffer identity -------
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const shadersRef = useRef<OrbShaderHandles | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const pickerRef = useRef<OrbPicker | null>(null);
  const rotationRef = useRef<RotationController | null>(null);
  const controlsRef = useRef<CameraControls | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const selectedIndexRef = useRef<number>(PICK_NO_HIT);
  const lastHoverAtRef = useRef<number>(0);

  // Clean up stale scene nodes if buffers identity changes.
  useEffect(() => {
    if (!buffers) return;

    const geometry = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(buffers.positions, 3);
    positionAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positionAttr);

    const colorAttr = new THREE.BufferAttribute(buffers.colors, 3);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aColor", colorAttr);

    const selectionAttr = new THREE.BufferAttribute(buffers.selection, 1);
    selectionAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aSelection", selectionAttr);

    const indexAttr = new THREE.BufferAttribute(buffers.indices, 1);
    indexAttr.setUsage(THREE.StaticDrawUsage);
    geometry.setAttribute("aIndex", indexAttr);

    // Explicit draw range — guarantees we render only the actual point count
    // even if the underlying typed arrays are oversized in a future rewrite.
    geometry.setDrawRange(0, buffers.count);
    geometry.computeBoundingSphere();

    const shaders = createOrbShaderMaterials({
      pointSize: 12.0,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      alpha: 0.88,
    });

    const points = new THREE.Points(geometry, shaders.displayMaterial);
    // Orb sits at the world origin; the parent group rotates around Y.
    points.position.set(0, 0, 0);
    points.frustumCulled = false; // the sphere is tight; avoid pop-out

    geometryRef.current = geometry;
    shadersRef.current = shaders;
    pointsRef.current = points;

    const group = groupRef.current;
    if (group) {
      group.add(points);
    }

    invalidate();

    return () => {
      if (group) {
        group.remove(points);
      }
      geometry.dispose();
      shaders.displayMaterial.dispose();
      shaders.pickingMaterial.dispose();
      geometryRef.current = null;
      shadersRef.current = null;
      pointsRef.current = null;
    };
  }, [buffers, invalidate]);

  // --- picker / rotation controller, one-per-mount --------------------
  useEffect(() => {
    pickerRef.current = createOrbPicker();
    return () => {
      pickerRef.current?.dispose();
      pickerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!groupRef.current) return;
    const controller = createRotationController(groupRef.current, {
      initialReducedMotion: reducedMotion,
    });
    rotationRef.current = controller;
    return () => {
      controller.dispose();
      rotationRef.current = null;
    };
  }, [reducedMotion]);

  // Pick target tracks display canvas; DPR capped inside the picker.
  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    picker.setSize(size.width, size.height, dpr);
  }, [size.width, size.height]);

  // --- WebGL context loss recovery -----------------------------------
  useEffect(() => {
    const canvas = gl.domElement;

    const handleLost = (event: Event) => {
      event.preventDefault();
      // Freeze rotation; the frameloop="demand" guarantees no rAF churn.
      rotationRef.current?.pauseForSelection();
    };

    const handleRestored = () => {
      // Buffers + typed arrays survive in CPU memory; re-mark dirty and
      // rebuild the pick target. The ShaderMaterials recompile lazily on
      // first render because Three.js keeps their source code on the
      // JS side.
      const geom = geometryRef.current;
      if (geom) {
        const pos = geom.getAttribute("position") as THREE.BufferAttribute;
        const col = geom.getAttribute("aColor") as THREE.BufferAttribute;
        const sel = geom.getAttribute("aSelection") as THREE.BufferAttribute;
        pos.needsUpdate = true;
        col.needsUpdate = true;
        sel.needsUpdate = true;
      }
      const picker = pickerRef.current;
      if (picker) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        picker.setSize(size.width, size.height, dpr);
      }
      invalidate();
    };

    canvas.addEventListener("webglcontextlost", handleLost, false);
    canvas.addEventListener("webglcontextrestored", handleRestored, false);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleLost);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
    };
  }, [gl, invalidate, size.width, size.height]);

  // --- rotation tick ---------------------------------------------------
  useFrame((_state, delta) => {
    rotationRef.current?.tick(delta);
  });

  // --- hover / click plumbing (decoupled from React event shape) ------
  interface PointerHit {
    clientX: number;
    clientY: number;
  }
  interface ClickHit extends PointerHit {
    /** mouse detail count — 2 or more signals a double-click. */
    detail: number;
  }

  const handlePointerMove = useCallback(
    (ev: PointerHit) => {
      if (!buffers || !pointsRef.current || !pickerRef.current) return;
      if (!shadersRef.current) return;

      const now = performance.now();
      if (now - lastHoverAtRef.current < HOVER_MIN_INTERVAL_MS) return;
      lastHoverAtRef.current = now;

      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();

      void pickerRef.current
        .pickAsync({
          renderer: gl,
          scene,
          camera,
          pickingMaterial: shadersRef.current.pickingMaterial,
          points: pointsRef.current,
          clientX: ev.clientX,
          clientY: ev.clientY,
          canvasRect: rect,
        })
        .then((idx) => {
          if (idx === PICK_NO_HIT) {
            onHover?.(null);
            return;
          }
          const paperId = buffers.indexToPaperId.get(idx) ?? null;
          onHover?.(paperId);
        })
        .catch(() => {
          onHover?.(null);
        });
    },
    [buffers, camera, gl, onHover, scene],
  );

  const handlePointerLeave = useCallback(() => {
    onHover?.(null);
  }, [onHover]);

  const handleClick = useCallback(
    (ev: ClickHit) => {
      if (!buffers || !pointsRef.current || !pickerRef.current) return;
      if (!shadersRef.current) return;

      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();

      const idx = pickerRef.current.pickSync({
        renderer: gl,
        scene,
        camera,
        pickingMaterial: shadersRef.current.pickingMaterial,
        points: pointsRef.current,
        clientX: ev.clientX,
        clientY: ev.clientY,
        canvasRect: rect,
      });

      if (idx === PICK_NO_HIT) {
        // Empty-space click dismisses focus; double-click resumes rotation.
        if (ev.detail >= 2) {
          rotationRef.current?.resume();
        }
        onPick?.(null);
        selectedIndexRef.current = PICK_NO_HIT;
        updateSelectionAttribute(geometryRef.current, selectedIndexRef.current);
        invalidate();
        return;
      }

      const paperId = buffers.indexToPaperId.get(idx) ?? null;
      onPick?.(paperId);
      selectedIndexRef.current = idx;
      rotationRef.current?.pauseForSelection();
      updateSelectionAttribute(geometryRef.current, idx);
      invalidate();
    },
    [buffers, camera, gl, invalidate, onPick, scene],
  );

  // Camera-controls drag handlers — drei's <CameraControls> forwards the
  // underlying yomotsu controls via ref.current. We hook start/end to feed
  // the rotation state machine.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const onStart = () => rotationRef.current?.beginDrag();
    const onEnd = () => rotationRef.current?.endDrag();

    controls.addEventListener("controlstart", onStart);
    controls.addEventListener("controlend", onEnd);
    return () => {
      controls.removeEventListener("controlstart", onStart);
      controls.removeEventListener("controlend", onEnd);
    };
  }, []);

  // Disposal + pointer-bridge handle for the parent surface.
  useImperativeHandle(
    handleRef,
    () => ({
      dispose: () => {
        controlsRef.current?.dispose();
        pickerRef.current?.dispose();
        rotationRef.current?.dispose();
        const geom = geometryRef.current;
        const shaders = shadersRef.current;
        if (geom) geom.dispose();
        if (shaders) {
          shaders.displayMaterial.dispose();
          shaders.pickingMaterial.dispose();
        }
        // Force context loss so the GPU buffer pool is reclaimed immediately
        // instead of waiting for the next GC cycle.
        try {
          gl.forceContextLoss();
        } catch {
          // Safari sometimes throws on forceContextLoss during navigation;
          // we've already disposed the owned resources above.
        }
      },
      resumeRotation: () => rotationRef.current?.resume(),
      pointerMove: handlePointerMove,
      pointerLeave: handlePointerLeave,
      click: handleClick,
    }),
    [gl, handleClick, handlePointerLeave, handlePointerMove],
  );

  // Reduced-motion updates propagate into the rotation controller.
  useEffect(() => {
    rotationRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  return (
    <group ref={groupRef}>
      {/* CameraControls captures pointer drag for orbit. Enable/disable
          wheel zoom with the defaults; dampingFactor keeps the feel close
          to the final orb. */}
      <CameraControls
        ref={controlsRef}
        minDistance={1.5}
        maxDistance={12}
        smoothTime={0.15}
      />
    </group>
  );
}

/**
 * Toggles the `aSelection` attribute using a single-range update.
 * Uses Three.js r169+ `addUpdateRange` — never the legacy singular
 * `updateRange = {...}` form (CI asserts this).
 */
function updateSelectionAttribute(
  geometry: THREE.BufferGeometry | null,
  selectedIndex: number,
): void {
  if (!geometry) return;
  const attr = geometry.getAttribute("aSelection") as
    | THREE.BufferAttribute
    | undefined;
  if (!attr) return;

  const array = attr.array as Float32Array;
  // Clear-only path: reset all to 0, then mark the selected one. The whole
  // buffer re-uploads because we mutated every slot — explicit
  // clearUpdateRanges + addUpdateRange(0, length) makes that intent
  // machine-checkable.
  for (let i = 0; i < array.length; i += 1) array[i] = 0;
  if (selectedIndex >= 0 && selectedIndex < array.length) {
    array[selectedIndex] = 1;
  }

  attr.clearUpdateRanges();
  attr.addUpdateRange(0, array.length);
  attr.needsUpdate = true;
}
