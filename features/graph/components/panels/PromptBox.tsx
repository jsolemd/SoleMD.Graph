"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ScrollArea, Text, Tooltip } from "@mantine/core";
import { useViewportSize } from "@mantine/hooks";
import {
  motion,
  animate,
  useDragControls,
  useMotionValue,
} from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  Type,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import { selectBottomClearance, selectLeftClearance, selectRightClearance } from "@/features/graph/stores/dashboard-store";
import { getModeConfig } from "@/features/graph/lib/modes";
import { MODE_EXAMPLES, pickRandom } from "@/features/graph/lib/mode-examples";
import { responsive, smooth, bouncy } from "@/lib/motion";
import type { GraphBundle, GraphMode } from "@/features/graph/types";
import { useTypewriter } from "@/features/graph/hooks/use-typewriter";
import { fetchGraphRagQuery, type GraphRagQueryResponsePayload } from "@/features/graph/lib/detail-service";
import { ModeToggleBar } from "../chrome/ModeToggleBar";
import { CreateEditor, type CreateEditorHandle } from "./CreateEditor";

// ── Prompt layout constants ──────────────────────────────────────────
const BOTTOM_BASE = 32;
const VIEWPORT_MARGIN = 8;
/** Top clearance for write panel — below Wordmark icon row when panels visible. */
const WRITE_TOP_CLEARANCE = 96;
/** Top clearance for write panel — no panel icons. */
const WRITE_TOP_BASE = 56;
/** Maximum card width in any mode. */
const MAX_CARD_W = 560;
/** Minimum card width in create mode (CSS clamp lower bound). */
const MIN_CARD_W_CREATE = 530;
/** Viewport ratio for normal-mode width (90vw cap). */
const VW_RATIO = 0.9;
/** Floor width when side panels squeeze available space. */
const MIN_AVAILABLE_W = 300;
/** Horizontal gap between card edges and panel edges. */
const PANEL_GAP = 48;
/** Collapsed pill height target. */
const PILL_H = 48;
/** Collapsed pill left-edge offset from viewport left. */
const PILL_LEFT = 12;

/** Compute card width for normal mode, respecting panel clearance. */
function cardWidth(vw: number, leftCl: number, rightCl: number): number {
  if (leftCl > 0 || rightCl > 0) {
    const avail = Math.max(MIN_AVAILABLE_W, vw - leftCl - rightCl - PANEL_GAP);
    return Math.round(Math.min(MAX_CARD_W, vw * VW_RATIO, avail));
  }
  return Math.round(Math.min(MAX_CARD_W, vw * VW_RATIO));
}

// ── Shared icon button ───────────────────────────────────────────────
interface PromptIconBtnProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  size?: "sm" | "md";
  active?: boolean;
  disabled?: boolean;
  "aria-pressed"?: boolean;
}

function PromptIconBtn({
  icon: Icon,
  label,
  onClick,
  size = "sm",
  active,
  disabled,
  "aria-pressed": ariaPressed,
}: PromptIconBtnProps) {
  const md = size === "md";
  return (
    <Tooltip label={label} position="top" withArrow>
      <motion.button
        whileHover={{ scale: md ? 1.08 : 1.12 }}
        whileTap={{ scale: md ? 0.92 : 0.9 }}
        transition={bouncy}
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center justify-center rounded-full flex-shrink-0 ${md ? "h-9 w-9" : "h-7 w-7"}`}
        style={{
          backgroundColor: active ? "var(--mode-accent-subtle)" : "transparent",
          color: active ? "var(--mode-accent)" : "var(--graph-prompt-inactive)",
          border: "none",
        }}
        aria-label={label}
        aria-pressed={ariaPressed}
      >
        <Icon size={md ? 18 : 15} />
      </motion.button>
    </Tooltip>
  );
}

export function PromptBox({ bundle }: { bundle: GraphBundle }) {
  const mode = useGraphStore((s) => s.mode);
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const writeContent = useDashboardStore((s) => s.writeContent);
  const setWriteContent = useDashboardStore((s) => s.setWriteContent);
  const panelsVisible = useDashboardStore((s) => s.panelsVisible);
  const promptMinimized = useDashboardStore((s) => s.promptMinimized);
  const promptMaximized = useDashboardStore((s) => s.promptMaximized);
  const setPromptMinimized = useDashboardStore((s) => s.setPromptMinimized);
  const setPromptMaximized = useDashboardStore((s) => s.setPromptMaximized);
  const bottomClearance = useDashboardStore(selectBottomClearance);
  const leftClearance = useDashboardStore(selectLeftClearance);
  const rightClearance = useDashboardStore(selectRightClearance);
  const activeMode = getModeConfig(mode);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-pick on mode change
  const examples = useMemo(() => [...pickRandom(MODE_EXAMPLES[mode], 2), `${activeMode.label} with the knowledge graph...`], [mode]);
  const { text: typewriterText, isLast: typewriterIsLast } = useTypewriter(examples);
  const [hasInput, setHasInput] = useState(false);
  const [promptValue, setPromptValue] = useState("");
  const [ragResponse, setRagResponse] = useState<GraphRagQueryResponsePayload | null>(null);
  const [ragError, setRagError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOffset, setIsOffset] = useState(false);
  const [showFormattingTools, setShowFormattingTools] = useState(false);
  const { width: vw, height: vh } = useViewportSize();
  const editorRef = useRef<CreateEditorHandle>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const userDragX = useRef(0);
  const userDragY = useRef(0);
  const autoTargetXRef = useRef(0);
  const dragControls = useDragControls();
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const isCreate = mode === "create";
  const isAsk = mode === "ask";
  const isCollapsed = promptMinimized;
  const activePromptValue = isCreate ? writeContent : promptValue;

  // Animated card height for full-height modes.
  const cardHeight = useMotionValue(0);
  const [heightOverride, setHeightOverride] = useState(false);

  // isFullHeightMode = logical mode (stable during FLIP animations).
  // isFullHeight    = mode + animation override (toggles with heightOverride).
  const isFullHeightMode = isCreate || promptMaximized;
  const isFullHeight = isFullHeightMode || heightOverride;

  const selectedScopeLabel = selectedNode
    ? selectedNode.nodeKind === "paper"
      ? "paper"
      : selectedNode.nodeKind === "chunk"
        ? "chunk"
        : selectedNode.nodeKind === "term"
          ? "term"
          : selectedNode.nodeKind === "alias"
            ? "alias"
            : selectedNode.nodeKind === "relation_assertion"
              ? "relation"
              : "node"
    : null;

  // Panel bottom edges (from viewport top) — reported by PanelShell's ResizeObserver.
  // Normal-mode avoidance also checks actual horizontal overlap and only moves
  // the minimum distance needed.
  const leftPanelBottom = useDashboardStore((s) => s.panelBottomY.left);
  const rightPanelBottom = useDashboardStore((s) => s.panelBottomY.right);

  const targetY = Math.min(0, BOTTOM_BASE - bottomClearance);

  // Unified positioning — clear precedence: write > collapsed > obstacle avoidance.
  // One effect eliminates competing animations on dragX/dragY.
  const posAnim = useRef<{ x?: ReturnType<typeof animate>; y?: ReturnType<typeof animate>; h?: ReturnType<typeof animate> }>({});
  const fullHeightEnteredRef = useRef(false);
  /** Prevents effect re-runs from calling h?.stop() during active height animations. */
  const heightAnimatingRef = useRef(false);
  /** Generation counter — invalidates stale .then() callbacks when a new height animation starts. */
  const heightGenRef = useRef(0);
  /** Non-null = a FLIP measurement is pending; value is the "from" height. */
  const pendingFlipRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const prevPosMode = useRef<"create" | "maximized" | "collapsed" | "normal">("normal");

  /** Start a guarded height animation. Prevents effect re-runs from stopping it. */
  const startHeightAnim = useCallback((target: number, onDone?: () => void) => {
    const gen = ++heightGenRef.current;
    heightAnimatingRef.current = true;
    posAnim.current.h = animate(cardHeight, target, smooth);
    posAnim.current.h.then(() => {
      if (gen !== heightGenRef.current) return; // stale — newer animation took over
      heightAnimatingRef.current = false;
      onDone?.();
    });
  }, [cardHeight]);

  useEffect(() => {
    // Skip until first paint (viewport not yet measured)
    if (vw === 0) return;

    posAnim.current.x?.stop();
    posAnim.current.y?.stop();
    // Don't stop h animation if one is actively running (guarded by startHeightAnim)
    if (!heightAnimatingRef.current) posAnim.current.h?.stop();

    const posMode = isCollapsed ? "collapsed" : isCreate ? "create" : promptMaximized ? "maximized" : "normal";
    const modeChanged = prevPosMode.current !== posMode;
    prevPosMode.current = posMode;
    if (posMode === "create" || posMode === "maximized") {
      // Full-height modes — always respect panel clearance (they span the viewport).
      const targetX = posMode === "create"
        ? 24 + leftClearance + Math.min(MAX_CARD_W, Math.max(MIN_CARD_W_CREATE, vw * 0.5)) / 2 - vw / 2
        : (leftClearance - rightClearance) / 2;
      const topClearance = panelsVisible ? WRITE_TOP_CLEARANCE : WRITE_TOP_BASE;
      const targetH = vh - topClearance - Math.max(bottomClearance, 24);

      // Bump generation to invalidate any stale .then() callbacks
      heightGenRef.current++;
      heightAnimatingRef.current = false;

      if (!fullHeightEnteredRef.current) {
        cardHeight.set(cardRef.current?.offsetHeight ?? 60);
        setHeightOverride(true);
        fullHeightEnteredRef.current = true;
      }
      autoTargetXRef.current = targetX;
      posAnim.current.x = animate(dragX, targetX, smooth);
      posAnim.current.y = animate(dragY, targetY, smooth);
      posAnim.current.h = animate(cardHeight, targetH, smooth);
      userDragY.current = targetY;
    } else {
      // Always clear pending FLIP when leaving full-height mode — prevents stale refs
      pendingFlipRef.current = null;

      // Exit full-height — release height override
      if (fullHeightEnteredRef.current) {
        if (posMode === "collapsed") {
          // Collapsed pill: animate height to small target.
          startHeightAnim(PILL_H, () => {
            if (!mountedRef.current) return;
            setHeightOverride(false);
            fullHeightEnteredRef.current = false;
          });
        } else {
          // Normal mode: FLIP trigger — snapshot current height, release override.
          // useLayoutEffect will measure auto height and start the animation.
          pendingFlipRef.current = cardHeight.get();
          setHeightOverride(false);
        }
      }

      if (posMode === "collapsed") {
        // Collapsed pill: left edge at PILL_LEFT.
        // Card uses translateX(0) in this mode, so dragX directly places the left edge.
        const targetX = PILL_LEFT - vw / 2;
        autoTargetXRef.current = targetX;
        if (modeChanged) { userDragX.current = targetX; userDragY.current = targetY; }
        posAnim.current.x = animate(dragX, userDragX.current || targetX, smooth);
        posAnim.current.y = animate(dragY, Math.min(userDragY.current, targetY), smooth);
      } else {
        // Normal: treat side panels as obstacle rectangles and move only the
        // minimum distance needed to keep the prompt clear while staying as
        // close to center as possible.
        const cardW = cardWidth(vw, leftClearance, rightClearance);
        const cardH = cardRef.current?.offsetHeight ?? 100;
        const promptTop = vh - BOTTOM_BASE - cardH + targetY;
        const centeredLeft = vw / 2 - cardW / 2;
        const centeredRight = centeredLeft + cardW;
        let minX = VIEWPORT_MARGIN - centeredLeft;
        let maxX = (vw - VIEWPORT_MARGIN) - centeredRight;

        if (leftClearance > 0 && leftPanelBottom > promptTop && centeredLeft < leftClearance) {
          minX = leftClearance - centeredLeft;
        }
        if (rightClearance > 0 && rightPanelBottom > promptTop && centeredRight > vw - rightClearance) {
          maxX = (vw - rightClearance) - centeredRight;
        }

        const targetX = minX <= maxX
          ? Math.max(minX, Math.min(0, maxX))
          : Math.max(Math.min(0, minX), maxX);

        if (modeChanged) { userDragX.current = 0; userDragY.current = 0; }
        if (autoTargetXRef.current !== targetX) {
          userDragX.current = 0;
          setIsOffset(userDragY.current !== 0);
        }
        autoTargetXRef.current = targetX;
        // Respect user drag offset; obstacle avoidance clamps Y upward only
        posAnim.current.x = animate(dragX, userDragX.current || targetX, smooth);
        const target = Math.min(userDragY.current, targetY);
        posAnim.current.y = animate(dragY, target, smooth);
      }
    }

    return () => {
      posAnim.current.x?.stop();
      posAnim.current.y?.stop();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (!heightAnimatingRef.current) posAnim.current.h?.stop();
    };
  }, [isCreate, isCollapsed, promptMaximized, panelsVisible, bottomClearance, leftClearance, rightClearance, leftPanelBottom, rightPanelBottom, targetY, vw, vh, dragX, dragY, cardHeight, startHeightAnim]);

  // FLIP measurement — fires after DOM mutation but before paint.
  // When pendingFlipRef is set, the card just re-rendered with height: auto.
  // We measure offsetHeight, restore the override, and animate to the measured height.
  useLayoutEffect(() => {
    const fromH = pendingFlipRef.current;
    if (fromH === null) return;
    pendingFlipRef.current = null;

    const toH = cardRef.current?.offsetHeight ?? fromH;
    cardHeight.set(fromH);
    setHeightOverride(true);

    startHeightAnim(toH, () => {
      if (!mountedRef.current) return;
      setHeightOverride(false);
      fullHeightEnteredRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and motion values are stable
  }, [heightOverride]);

  const handleModeChange = useCallback((newMode: GraphMode) => {
    editorRef.current?.flush();
    // Clear stale animation state from previous transitions
    pendingFlipRef.current = null;
    fullHeightEnteredRef.current = false;
    heightAnimatingRef.current = false;
    setPromptMaximized(false);
    setPromptMinimized(getModeConfig(newMode).layout.promptCollapsed);
    setRagError(null);
    if (newMode !== "ask") {
      setRagResponse(null);
    }
    // Sync hasInput to the destination mode's content
    if (newMode === "create") {
      setHasInput(writeContent.length > 0);
    } else {
      setHasInput(promptValue.length > 0);
    }
    setTimeout(() => editorRef.current?.focus(), 100);
  }, [writeContent, promptValue, setPromptMinimized, setPromptMaximized]);

  const handleSubmit = useCallback(() => {
    const query = (editorRef.current?.getText() ?? activePromptValue).trim();
    if (!query || !isAsk) {
      return;
    }

    setIsSubmitting(true);
    fetchGraphRagQuery({
      bundle,
      query,
      selectedNode,
      k: 6,
      rerankTopn: 18,
      useLexical: true,
      generateAnswer: true,
    })
      .then((response) => {
        setRagResponse(response);
        setRagError(null);
      })
      .catch((error) => {
        setRagResponse(null);
        setRagError(error instanceof Error ? error.message : "Failed to query the graph");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }, [activePromptValue, bundle, isAsk, selectedNode]);

  const handlePillClick = useCallback(() => {
    if (isDragging.current) return;
    // Clear any stale animation state from previous transitions
    pendingFlipRef.current = null;
    fullHeightEnteredRef.current = false;
    heightAnimatingRef.current = false;
    setHeightOverride(false);
    setPromptMinimized(false);
    setTimeout(() => editorRef.current?.focus(), 100);
  }, [setPromptMinimized]);

  const handlePillKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handlePillClick();
      }
    },
    [handlePillClick],
  );

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      dragControls.start(e);
    },
    [dragControls],
  );

  // Normal-mode width — constrain when panels are present (keeps card compact).
  const normalCardWidth = cardWidth(vw, leftClearance, rightClearance);
  const normalWidth = vw === 0 ? `min(${MAX_CARD_W}px, ${VW_RATIO * 100}vw)` : `${normalCardWidth}px`;

  return (
    /* Positioning anchor — fixed at bottom-center; write-mode repositions via dragX/dragY.
       pointer-events: none on the wrapper + drag layer so their layout boxes (which extend
       far beyond the visible card due to CSS transforms) don't block the canvas. */
    <div
      className="fixed z-50 left-1/2"
      style={{ bottom: BOTTOM_BASE, pointerEvents: "none" }}
    >
      {/* Drag layer */}
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        style={{ x: dragX, y: dragY }}
        onDragStart={() => {
          posAnim.current.x?.stop();
          posAnim.current.y?.stop();
          isDragging.current = true;
          document.body.style.cursor = "grabbing";
        }}
        onDragEnd={() => {
          document.body.style.cursor = "";
          // Clamp so the full prompt box stays within the viewport
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const boxW = cardRef.current
            ? cardRef.current.offsetWidth
            : cardWidth(vw, 0, 0);
          const boxH = cardRef.current
            ? cardRef.current.offsetHeight
            : 120;
          const curX = dragX.get();
          const curY = dragY.get();
          // Pill uses transform:none (left-aligned), others use translateX(-50%) (centered)
          const minX = isCollapsed
            ? VIEWPORT_MARGIN - vw / 2
            : -(vw / 2 - boxW / 2 - VIEWPORT_MARGIN);
          const maxX = isCollapsed
            ? vw / 2 - boxW - VIEWPORT_MARGIN
            : vw / 2 - boxW / 2 - VIEWPORT_MARGIN;
          // Box bottom is at BOTTOM_BASE - dragY (dragY negative = up)
          const maxUp = -(vh - BOTTOM_BASE - boxH - VIEWPORT_MARGIN);
          const safeX = Math.max(minX, Math.min(maxX, curX));
          const safeY = Math.max(maxUp, Math.min(0, curY));
          if (curX !== safeX) animate(dragX, safeX, responsive);
          if (curY !== safeY) animate(dragY, safeY, responsive);
          userDragX.current = safeX;
          userDragY.current = safeY;
          setIsOffset(safeX !== 0 || safeY !== 0);
          setTimeout(() => {
            isDragging.current = false;
          }, 0);
        }}
      >
        {/* Card */}
        <motion.div
          ref={cardRef}
          className="rounded-3xl flex flex-col"
          style={{
            width: isCollapsed
              ? undefined
              : isCreate
                ? `clamp(${MIN_CARD_W_CREATE}px, 50vw, ${MAX_CARD_W}px)`
                : normalWidth,
            transform: isCollapsed ? "none" : "translateX(-50%)",
            position: "relative",
            pointerEvents: "auto",
            padding: isCollapsed ? "8px 12px" : "12px 12px 8px",
            backgroundColor: "var(--graph-prompt-bg)",
            border: "1px solid var(--graph-prompt-border)",
            boxShadow: "var(--graph-prompt-shadow)",
            height: heightOverride ? cardHeight : "auto",
            overflow: heightOverride ? "hidden" : "visible",
            cursor: "grab",
            touchAction: "none",
            transition: "width 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          onPointerDown={startDrag}
          {...(isCollapsed
            ? {
                onClick: handlePillClick,
                role: "button" as const,
                tabIndex: 0,
                onKeyDown: handlePillKeyDown,
                "aria-label": "Expand prompt box",
              }
            : {})}
        >
          {/* Textarea — CSS grid row transition for smooth height animation */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            aria-hidden={isCollapsed}
            style={{
              display: "grid",
              gridTemplateRows: isCollapsed ? "0fr" : "1fr",
              opacity: isCollapsed ? 0 : 1,
              flex: isFullHeight ? 1 : undefined,
              minHeight: isFullHeight ? 0 : undefined,
              cursor: "default",
              transition:
                "grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease",
            }}
          >
            <div style={{ overflow: "hidden", minHeight: 0, height: isFullHeight ? "100%" : undefined }}>
              <CreateEditor
                ref={editorRef}
                content={activePromptValue}
                onContentChange={(markdown) => {
                  if (isCreate) {
                    setWriteContent(markdown);
                    return;
                  }
                  setPromptValue(markdown);
                }}
                onEmptyChange={(empty) => setHasInput(!empty)}
                onSubmit={isAsk ? handleSubmit : undefined}
                ariaLabel={`${activeMode.label} prompt`}
                debounceMs={isCreate ? 300 : 0}
                compact={!isFullHeightMode}
                showToolbar={showFormattingTools}
                placeholder={!hasInput ? (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                      padding: "0.25rem 0.5rem",
                      fontSize: "10pt",
                      lineHeight: 1.5,
                      overflow: "hidden",
                      color: "var(--graph-prompt-placeholder)",
                      zIndex: 1,
                    }}
                  >
                    {typewriterIsLast ? (
                      <span>
                        <span style={{ color: "var(--mode-accent)", opacity: 0.7 }}>
                          {typewriterText.slice(0, activeMode.label.length)}
                        </span>
                        {typewriterText.slice(activeMode.label.length)}
                      </span>
                    ) : (
                      typewriterText
                    )}
                  </div>
                ) : undefined}
              />
            </div>
          </div>

          {/* Actions row */}
          <div
            className="flex items-center"
            style={{
              userSelect: "none",
              cursor: "default",
              justifyContent: isCollapsed ? "center" : "space-between",
              paddingTop: isCollapsed ? 0 : 6,
            }}
          >
              {/* Mode toggles — stop propagation so clicks don't trigger pill expand or drag */}
              <div
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <ModeToggleBar
                  compact={isCollapsed}
                  onModeChange={handleModeChange}
                />
              </div>

              {/* Submit + collapse buttons — no exit animation, textarea handles the transition */}
              {!isCollapsed && (
                <div
                  className="flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {/* Size chevrons — grouped tightly */}
                  <div className="flex items-center -space-x-1">
                    {!isFullHeightMode && (
                      <PromptIconBtn icon={ChevronUp} label="Expand" onClick={() => setPromptMaximized(true)} />
                    )}
                    <PromptIconBtn
                      icon={ChevronDown}
                      label={promptMaximized ? "Shrink" : "Collapse"}
                      onClick={() => promptMaximized ? setPromptMaximized(false) : setPromptMinimized(true)}
                    />
                  </div>

                  {/* Formatting toggle — outside chevron group so it doesn't shift */}
                  <PromptIconBtn
                    icon={Type}
                    label={showFormattingTools ? "Hide formatting tools" : "Show formatting tools"}
                    onClick={() => setShowFormattingTools((c) => !c)}
                    active={showFormattingTools}
                    aria-pressed={showFormattingTools}
                  />

                  {/* Submit — handleSubmit guards against non-ask modes internally */}
                  <PromptIconBtn
                    icon={ArrowUp}
                    label="Submit prompt"
                    onClick={handleSubmit}
                    size="md"
                    active
                    disabled={!activePromptValue.trim() || isSubmitting}
                  />
                </div>
              )}
          </div>

          {!isCollapsed && isAsk && (ragResponse || ragError || isSubmitting) && (
            <div
              style={{
                marginTop: 8,
                borderTop: "1px solid var(--graph-panel-border)",
                paddingTop: 10,
              }}
            >
              {selectedNode && (
                <Text size="xs" style={{ color: "var(--graph-prompt-placeholder)" }}>
                  Scoped to {selectedScopeLabel}: {selectedNode.displayLabel || selectedNode.citekey || selectedNode.paperTitle || selectedNode.id}
                </Text>
              )}
              {isSubmitting && (
                <Text mt={6} size="sm" style={{ color: "var(--graph-prompt-placeholder)" }}>
                  Querying graph evidence…
                </Text>
              )}
              {ragError && (
                <Text mt={6} size="sm" style={{ color: "var(--graph-prompt-placeholder)" }}>
                  {ragError}
                </Text>
              )}
              {ragResponse && (
                <ScrollArea.Autosize mah={isFullHeightMode ? 320 : 220} mt={6} type="auto">
                  {ragResponse.answer && (
                    <Text size="sm" style={{ color: "var(--graph-prompt-text)", whiteSpace: "pre-wrap" }}>
                      {ragResponse.answer}
                    </Text>
                  )}
                  {!ragResponse.answer && ragResponse.results.length === 0 && (
                    <Text size="sm" style={{ color: "var(--graph-prompt-placeholder)" }}>
                      No matching evidence was found for this query.
                    </Text>
                  )}
                  {ragResponse.results.length > 0 && (
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {ragResponse.results.slice(0, 3).map((result) => (
                        <div
                          key={result.chunk_id}
                          className="rounded-xl px-3 py-2"
                          style={{
                            backgroundColor: "var(--mode-accent-subtle)",
                            border: "1px solid var(--mode-accent-border)",
                          }}
                        >
                          <Text size="xs" fw={600} style={{ color: "var(--graph-prompt-text)" }}>
                            {[result.citekey || result.paper_title || result.paper_id, result.section, result.page != null ? `p. ${result.page}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                          <Text mt={4} size="sm" style={{ color: "var(--graph-prompt-text)" }}>
                            {result.text}
                          </Text>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea.Autosize>
              )}
            </div>
          )}

          {/* Drag grip / recenter — always visible, widens when offset */}
          <div
              onClick={(e) => {
                e.stopPropagation();
                if (!isOffset) return;
                animate(dragX, autoTargetXRef.current, responsive);
                animate(dragY, targetY, responsive);
                userDragX.current = 0;
                userDragY.current = 0;
                setIsOffset(false);
              }}
              style={{
                position: "absolute",
                bottom: isCollapsed ? -6 : 0,
                left: "50%",
                transform: "translateX(-50%)",
                padding: "12px 8px",
                cursor: isOffset ? "pointer" : "default",
              }}
            >
              <motion.div
                style={{
                  height: 2,
                  borderRadius: 1,
                  backgroundColor: "var(--graph-prompt-divider)",
                }}
                initial={false}
                animate={{
                  width: isOffset ? 32 : 20,
                  opacity: isOffset ? 0.7 : 0.4,
                }}
                transition={{ duration: 0.2 }}
              />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
