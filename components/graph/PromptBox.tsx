"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea, Text, Textarea, Tooltip } from "@mantine/core";
import { useViewportSize } from "@mantine/hooks";
import {
  motion,
  animate,
  useDragControls,
  useMotionValue,
} from "framer-motion";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useGraphStore, useDashboardStore } from "@/lib/graph/stores";
import { selectBottomClearance, selectLeftClearance, selectRightClearance } from "@/lib/graph/stores/dashboard-store";
import { getModeConfig } from "@/lib/graph/modes";
import { MODE_EXAMPLES, pickRandom } from "@/lib/graph/mode-examples";
import { responsive, smooth, bouncy } from "@/lib/motion";
import type { GraphBundle, GraphMode } from "@/lib/graph/types";
import { useTypewriter } from "@/lib/graph/hooks/use-typewriter";
import { fetchGraphRagQuery, type GraphRagQueryResponsePayload } from "@/lib/graph/detail-service";
import { ModeToggleBar } from "./ModeToggleBar";

// Prompt positioning constants
const BOTTOM_BASE = 32;
const VIEWPORT_MARGIN = 8;
/** Top clearance for write panel — below Wordmark icon row when panels visible. */
const WRITE_TOP_CLEARANCE = 96;
/** Top clearance for write panel — no panel icons. */
const WRITE_TOP_BASE = 56;

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
  const { width: vw, height: vh } = useViewportSize();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // heightOverride keeps full-height layout active during the shrink animation,
  // preventing content from reflowing before the card finishes resizing.
  const isFullHeight = isCreate || promptMaximized || heightOverride;

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
  const prevPosMode = useRef<"create" | "maximized" | "collapsed" | "normal">("normal");

  useEffect(() => {
    // Skip until first paint (viewport not yet measured)
    if (vw === 0) return;

    posAnim.current.x?.stop();
    posAnim.current.y?.stop();
    posAnim.current.h?.stop();

    const posMode = isCollapsed ? "collapsed" : isCreate ? "create" : promptMaximized ? "maximized" : "normal";
    const modeChanged = prevPosMode.current !== posMode;
    prevPosMode.current = posMode;

    if (posMode === "create" || posMode === "maximized") {
      // Full-height modes — always respect panel clearance (they span the viewport).
      const targetX = posMode === "create"
        ? 24 + leftClearance + Math.min(560, vw * 0.45) / 2 - vw / 2
        : (leftClearance - rightClearance) / 2;
      const topClearance = panelsVisible ? WRITE_TOP_CLEARANCE : WRITE_TOP_BASE;
      const targetH = vh - topClearance - Math.max(bottomClearance, 24);

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
      // Exit full-height — animate height down before releasing override
      if (fullHeightEnteredRef.current) {
        const shrinkTarget = posMode === "collapsed" ? 48 : 80;
        posAnim.current.h = animate(cardHeight, shrinkTarget, smooth);
        posAnim.current.h.then(() => {
          setHeightOverride(false);
          fullHeightEnteredRef.current = false;
        });
      }

      if (posMode === "collapsed") {
        // Collapsed pill: left edge at 12px.
        // Card uses translateX(0) in this mode, so dragX directly places the left edge.
        const targetX = 12 - vw / 2;
        autoTargetXRef.current = targetX;
        if (modeChanged) { userDragX.current = targetX; userDragY.current = targetY; }
        posAnim.current.x = animate(dragX, userDragX.current || targetX, smooth);
        posAnim.current.y = animate(dragY, Math.min(userDragY.current, targetY), smooth);
      } else {
        // Normal: treat side panels as obstacle rectangles and move only the
        // minimum distance needed to keep the prompt clear while staying as
        // close to center as possible.
        const cardW = leftClearance > 0 || rightClearance > 0
          ? Math.min(640, vw * 0.9, Math.max(300, vw - leftClearance - rightClearance - 48))
          : Math.min(640, vw * 0.9);
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
          autoTargetXRef.current = targetX;
          setIsOffset(userDragY.current !== 0);
        } else {
          autoTargetXRef.current = targetX;
        }
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
      posAnim.current.h?.stop();
    };
  }, [isCreate, isCollapsed, promptMaximized, panelsVisible, bottomClearance, leftClearance, rightClearance, leftPanelBottom, rightPanelBottom, targetY, vw, vh, dragX, dragY, cardHeight]);

  const handleModeChange = useCallback((newMode: GraphMode) => {
    setPromptMaximized(false);
    setPromptMinimized(getModeConfig(newMode).layout.promptCollapsed);
    setRagError(null);
    if (newMode !== "ask") {
      setRagResponse(null);
    }
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, [setPromptMinimized, setPromptMaximized]);

  const handleSubmit = useCallback(() => {
    const query = activePromptValue.trim();
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
    setPromptMinimized(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
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

  // Normal-mode width — always constrain when panels are present (keeps card compact).
  // Position shifting is handled separately in the effect via overlap gating.
  const availableWidth = Math.max(300, vw - leftClearance - rightClearance - 48);
  const normalCardWidth = leftClearance > 0 || rightClearance > 0
    ? Math.min(640, vw * 0.9, availableWidth)
    : Math.min(640, vw * 0.9);
  const normalWidth = vw === 0 ? "min(640px, 90vw)" : `${normalCardWidth}px`;

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
            : Math.min(640, vw * 0.9);
          const boxH = cardRef.current
            ? cardRef.current.offsetHeight
            : 120;
          const margin = 8;
          const curX = dragX.get();
          const curY = dragY.get();
          // Pill uses transform:none (left-aligned), others use translateX(-50%) (centered)
          const minX = isCollapsed
            ? margin - vw / 2
            : -(vw / 2 - boxW / 2 - margin);
          const maxX = isCollapsed
            ? vw / 2 - boxW - margin
            : vw / 2 - boxW / 2 - margin;
          // Box bottom is at BOTTOM_BASE - dragY (dragY negative = up)
          const maxUp = -(vh - BOTTOM_BASE - boxH - margin);
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
                ? "min(560px, 45vw)"
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
            style={{
              display: "grid",
              gridTemplateRows: isCollapsed ? "0fr" : "1fr",
              opacity: isCollapsed ? 0 : 1,
              flex: isFullHeight ? 1 : undefined,
              minHeight: isFullHeight ? 0 : undefined,
              transition:
                "grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease",
            }}
          >
            <div style={{ overflow: "hidden", minHeight: 0, position: "relative", height: isFullHeight ? "100%" : undefined }}>
              {/* Placeholder overlay — supports colored mode word */}
              {!hasInput && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.9375rem",
                    lineHeight: 1.5,
                    overflow: "hidden",
                    color: "var(--graph-prompt-placeholder)",
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
              )}
              <Textarea
                ref={textareaRef}
                value={activePromptValue}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setHasInput(val.length > 0);
                  if (isCreate) {
                    setWriteContent(val);
                  } else {
                    setPromptValue(val);
                  }
                }}
                autosize={!isFullHeight}
                minRows={isFullHeight ? undefined : 1}
                maxRows={isFullHeight ? undefined : 4}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    handleSubmit();
                  }
                }}
                styles={{
                  root: { width: "100%", flex: isFullHeight ? 1 : undefined },
                  wrapper: { height: isFullHeight ? "100%" : undefined },
                  input: {
                    backgroundColor: "transparent",
                    border: "none",
                    color: "var(--graph-prompt-text)",
                    fontSize: "0.9375rem",
                    padding: "0.25rem 0.5rem",
                    lineHeight: 1.5,
                    height: isFullHeight ? "100%" : undefined,
                    resize: "none",
                  },
                }}
                aria-label={`${activeMode.label} prompt`}
              />
            </div>
          </div>

          {/* Actions row */}
          <div
            className="flex items-center"
            style={{
              userSelect: "none",
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
                    {!isFullHeight && (
                      <Tooltip label="Expand" position="top" withArrow>
                        <motion.button
                          whileHover={{ scale: 1.12 }}
                          whileTap={{ scale: 0.9 }}
                          transition={bouncy}
                          onClick={() => setPromptMaximized(true)}
                          className="flex h-6 w-6 items-center justify-center rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: "transparent",
                            color: "var(--graph-prompt-inactive)",
                            border: "none",
                          }}
                          aria-label="Expand prompt"
                        >
                          <ChevronUp size={14} />
                        </motion.button>
                      </Tooltip>
                    )}
                    <Tooltip label={promptMaximized ? "Shrink" : "Collapse"} position="top" withArrow>
                      <motion.button
                        whileHover={{ scale: 1.12 }}
                        whileTap={{ scale: 0.9 }}
                        transition={bouncy}
                        onClick={() => promptMaximized ? setPromptMaximized(false) : setPromptMinimized(true)}
                        className="flex h-6 w-6 items-center justify-center rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: "transparent",
                          color: "var(--graph-prompt-inactive)",
                          border: "none",
                        }}
                        aria-label={promptMaximized ? "Shrink prompt" : "Collapse prompt"}
                      >
                        <ChevronDown size={14} />
                      </motion.button>
                    </Tooltip>
                  </div>

                  {/* Submit */}
                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    transition={bouncy}
                    onClick={handleSubmit}
                    className="flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: "var(--mode-accent-subtle)",
                      color: "var(--mode-accent)",
                      border: "none",
                    }}
                    aria-label="Submit prompt"
                    disabled={!activePromptValue.trim() || isSubmitting}
                  >
                    <ArrowUp size={16} />
                  </motion.button>
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
                  Scoped to {selectedNode.nodeKind === "paper" ? "paper" : "chunk"}: {selectedNode.citekey || selectedNode.paperTitle || selectedNode.id}
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
                <ScrollArea.Autosize mah={isFullHeight ? 320 : 220} mt={6} type="auto">
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
                padding: "4px 8px",
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
