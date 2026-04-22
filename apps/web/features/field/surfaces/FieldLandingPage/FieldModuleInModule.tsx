"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import { Vector3, type Camera } from "three";
import type { BlobController } from "../../controller/BlobController";
import type { FieldSceneState } from "../../scene/visual-presets";
import { projectPointSourceVertex } from "../../overlay/field-anchor-projector";
import { useFieldSceneStore } from "../../scroll/field-scene-store";
import { getFieldChapterProgress } from "../../scroll/scene-selectors";
import {
  LIT_PARTICLE_INDEX_BY_SYMBOL,
} from "./field-lit-particle-indices";
import { sequenceInfoNineSteps } from "./field-landing-content";

// FieldModuleInModule owns the stage-level DOM cards for Sequence's info-9
// embedded mini-module. It sits at z-6 (sibling of FieldHotspotPool) and
// pins a teaching card beside the currently-active step's focus-entity
// particle. The card tracks the live projected position of that particle
// as the blob rotates + wrapperScale breathes, mirroring the mechanism
// hotspot cards already use in Story 1 (see FieldHotspotPool + the
// projectPointSourceVertex pipe in BlobController.projectHotspots).
//
// Sub-progress thirds (< 0.33 → 1, < 0.66 → 2, < 1.0 → 3) are the same
// boundaries landing-blob-chapter authors against, so the discrete
// focus-index swap lines up with the chapter timeline's continuous
// scale / clusterEmergence / focusActive tweens.
//
// Mount contract: rendered once inside FieldLandingShellContent's stage
// div. Parent threads a frame-by-frame `onFrame({camera, viewportW,
// viewportH, pixelRatio})` into this component's imperative handle. We
// do not re-enter React's render path on every frame — card positioning
// is imperative transform writes.

const CARD_WIDTH_PX = 320;
const CARD_OFFSET_PX = 24;
const MOBILE_HIDE_BELOW_PX = 768;
const STEP_COUNT = sequenceInfoNineSteps.length;

const INFO_NINE_BEAT_ID = "info-9";
const SEQUENCE_SECTION_ID = "section-sequence";

export interface FieldModuleInModuleHandle {
  onFrame(ctx: {
    camera: Camera | null;
    viewportWidth: number;
    viewportHeight: number;
    pixelRatio: number;
  }): void;
}

interface FieldModuleInModuleProps {
  blobControllerRef: MutableRefObject<BlobController | null>;
  sceneStateRef: MutableRefObject<FieldSceneState>;
}

// Derive the info-9 sub-progress [0..1+] from the beat DOM node using the
// same pivot math FieldStoryProgress uses per beat (StoryProgress:93-112).
// Returns > 1 when the reader has scrolled past the beat entirely.
function readInfoNineProgress(): number {
  if (typeof window === "undefined") return 0;
  const beatNode = document.getElementById(INFO_NINE_BEAT_ID);
  if (!beatNode) return 0;
  const rect = beatNode.getBoundingClientRect();
  const sectionHeight = Math.max(rect.height, 1);
  const pivotY = window.innerHeight / 2;
  if (rect.top >= pivotY) return 0;
  return Math.abs(rect.top - pivotY) / sectionHeight;
}

function deriveStepFromProgress(subProgress: number): 0 | 1 | 2 | 3 {
  if (subProgress <= 0) return 0;
  if (subProgress >= 1) return 0;
  if (subProgress < 0.33) return 1;
  if (subProgress < 0.66) return 2;
  return 3;
}

export const FieldModuleInModule = forwardRef<
  FieldModuleInModuleHandle,
  FieldModuleInModuleProps
>(function FieldModuleInModule(
  { blobControllerRef, sceneStateRef },
  ref,
) {
  const sceneStore = useFieldSceneStore();
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const activeStepRef = useRef<0 | 1 | 2 | 3>(0);
  const scratchVector = useMemo(() => new Vector3(), []);
  // Cache the last successful projection per step so the card holds at
  // the last visible position when the focus particle rotates to the far
  // side of the blob (at idle spin 0.06 rad/sec one full revolution takes
  // ~104s, but a particle can still cycle out-of-viewport mid-step). The
  // alternative — culling the card on far-side — would flicker the
  // teaching content through every rotation pass, which breaks the
  // "card stays visible while I read this step" contract.
  const lastProjectedRef = useRef<
    Array<{ x: number; y: number } | null>
  >(sequenceInfoNineSteps.map(() => null));

  // Write sceneState.sequenceFocusStep + notify the scene store when the
  // step index changes. Reads sequence chapter progress so a step is only
  // "active" while the Sequence chapter is actually live; past info-9 or
  // before the sequence chapter starts we snap back to 0 so BlobController
  // falls through to the info-8 fallback or no focus at all.
  const updateStep = useCallback((): 0 | 1 | 2 | 3 => {
    const sceneState = sceneStateRef.current;
    if (!sceneState) return 0;
    if (!sceneState.motionEnabled) return 0;

    const sequenceProgress = getFieldChapterProgress(
      sceneState,
      SEQUENCE_SECTION_ID,
    );
    // Sequence not yet in view or long past → no card.
    if (sequenceProgress <= 0.001 || sequenceProgress >= 0.999) return 0;

    const subProgress = readInfoNineProgress();
    const nextStep = deriveStepFromProgress(subProgress);

    if (sceneState.sequenceFocusStep !== nextStep) {
      sceneState.sequenceFocusStep = nextStep;
      sceneStore.notify();
    }
    return nextStep;
  }, [sceneStateRef, sceneStore]);

  // Imperative per-frame card positioning. Called by the shell's
  // fieldLoopClock subscription, which has the R3F camera in scope.
  useImperativeHandle(
    ref,
    () => ({
      onFrame({ camera, pixelRatio, viewportHeight, viewportWidth }) {
        const step = updateStep();
        activeStepRef.current = step;

        const cards = cardRefs.current;
        if (cards.length === 0) return;

        // Respect small viewports — cards don't relayout for mobile in A1.
        const cssWidth = viewportWidth / Math.max(pixelRatio, 1);
        const hideForMobile = cssWidth < MOBILE_HIDE_BELOW_PX;

        // Cull all cards when inactive / reduced motion / mobile.
        if (step === 0 || hideForMobile || !camera) {
          for (const card of cards) {
            if (!card) continue;
            card.style.opacity = "0";
            card.style.transform = "translate3d(-9999px, -9999px, 0)";
          }
          return;
        }

        const controller = blobControllerRef.current;
        const blobModel = controller?.model ?? null;
        const pointSource = controller?.pointSource ?? null;
        if (!controller || !blobModel || !pointSource) {
          for (const card of cards) {
            if (!card) continue;
            card.style.opacity = "0";
            card.style.transform = "translate3d(-9999px, -9999px, 0)";
          }
          return;
        }

        // Pre-warm projection for every step index, not just the active
        // one. Three vertex transforms per frame is negligible against
        // the 16k-vertex shader pass; the win is that when the reader
        // first lands on a step whose focus particle is currently on the
        // back side of the blob, we can still place the card using the
        // most recent successful projection from earlier frames.
        for (let i = 0; i < sequenceInfoNineSteps.length; i += 1) {
          const spec = sequenceInfoNineSteps[i];
          if (!spec) continue;
          const candidateIdx = LIT_PARTICLE_INDEX_BY_SYMBOL[spec.focusEntityId];
          if (typeof candidateIdx !== "number") continue;
          const proj = projectPointSourceVertex({
            blobModel,
            camera,
            candidateIndex: candidateIdx,
            height: viewportHeight,
            pixelRatio,
            respectLocalFrontFace: false,
            source: pointSource,
            vector: scratchVector,
            width: viewportWidth,
          });
          if (proj) {
            lastProjectedRef.current[i] = { x: proj.x, y: proj.y };
          }
        }

        const stepIndex = step - 1;
        const stepSpec = sequenceInfoNineSteps[stepIndex];
        if (!stepSpec) return;

        const renderProjection = lastProjectedRef.current[stepIndex];

        for (let index = 0; index < cards.length; index += 1) {
          const card = cards[index];
          if (!card) continue;
          const isActive = index === stepIndex;
          if (!isActive) {
            card.style.opacity = "0";
            card.style.transform = "translate3d(-9999px, -9999px, 0)";
            continue;
          }

          if (!renderProjection) {
            // Active step's focus particle has never projected this
            // session — keep the card hidden until the first frame the
            // vertex is on the visible hemisphere.
            card.style.opacity = "0";
            card.style.transform = "translate3d(-9999px, -9999px, 0)";
            continue;
          }

          // Prefer right-of-particle placement; flip to left when the
          // 320px card would overflow the viewport right edge.
          const placeLeft =
            renderProjection.x + CARD_OFFSET_PX + CARD_WIDTH_PX >
            cssWidth - 16;
          const x = placeLeft
            ? renderProjection.x - CARD_OFFSET_PX - CARD_WIDTH_PX
            : renderProjection.x + CARD_OFFSET_PX;
          const y = renderProjection.y - 18;

          card.style.opacity = "1";
          card.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
        }
      },
    }),
    [blobControllerRef, scratchVector, updateStep],
  );

  // When unmounted (or the reader leaves the Sequence chapter entirely),
  // zero the scene state's sequenceFocusStep so BlobController lets the
  // info-8 fallback / no-focus path take over cleanly. Capture the
  // FieldSceneState reference once so the cleanup doesn't chase a ref
  // that React may have mutated by unmount time.
  useEffect(() => {
    const sceneState = sceneStateRef.current;
    const store = sceneStore;
    return () => {
      if (!sceneState) return;
      if (sceneState.sequenceFocusStep !== 0) {
        sceneState.sequenceFocusStep = 0;
        store.notify();
      }
    };
  }, [sceneStateRef, sceneStore]);

  const cardBaseStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: `${CARD_WIDTH_PX}px`,
    opacity: 0,
    transform: "translate3d(-9999px, -9999px, 0)",
    transition: "opacity 250ms ease-out",
    pointerEvents: "none",
    willChange: "transform, opacity",
    backgroundColor:
      "color-mix(in srgb, var(--graph-bg) 92%, var(--graph-panel-text) 0%)",
    color: "var(--graph-panel-text)",
    // Soft rim-light + drop halo (no hairline outline per
    // feedback_no_hairline_outlines.md). Twin shadow layers: outer halo
    // gives elevation; inner highlight implies the top-edge rim without a
    // visible 1px border stroke.
    boxShadow: [
      "0 18px 48px -16px rgba(0, 0, 0, 0.65)",
      "0 2px 12px rgba(0, 0, 0, 0.42)",
      "inset 0 1px 0 color-mix(in srgb, var(--graph-panel-text) 6%, transparent)",
    ].join(", "),
  };

  return (
    <div
      aria-hidden={activeStepRef.current === 0 ? "true" : undefined}
      className="pointer-events-none absolute inset-0"
    >
      {sequenceInfoNineSteps.map((stepSpec, index) => {
        const stepNumber = index + 1;
        return (
          <div
            key={stepSpec.focusEntityId + "-" + stepNumber}
            ref={(node) => {
              cardRefs.current[index] = node;
            }}
            id={`info-9-step-${stepNumber}`}
            role="region"
            aria-label={stepSpec.heading}
            aria-hidden={activeStepRef.current !== stepNumber}
            className="rounded-lg p-5"
            style={cardBaseStyle}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--graph-panel-text-dim)]">
              Step {String(stepNumber).padStart(2, "0")}
            </p>
            <h3 className="mt-2 text-[18px] font-medium leading-[1.2] tracking-[-0.01em]">
              {stepSpec.heading}
            </h3>
            <p className="mt-3 text-[14px] leading-6 text-[var(--graph-panel-text-dim)]">
              {stepSpec.body}
            </p>
          </div>
        );
      })}
    </div>
  );
});

// Count is exposed for parity tests that want to assert pool size.
export const FIELD_MODULE_IN_MODULE_STEP_COUNT = STEP_COUNT;
