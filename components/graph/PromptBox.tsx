"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Textarea, Tooltip } from "@mantine/core";
import { useViewportSize } from "@mantine/hooks";
import {
  motion,
  animate,
  AnimatePresence,
  useDragControls,
  useMotionValue,
} from "framer-motion";
import {
  MessageCircle,
  Compass,
  BookOpen,
  PenLine,
  ArrowUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useGraphStore, useDashboardStore } from "@/lib/graph/stores";
import { selectBottomClearance, selectLeftClearance, selectRightClearance } from "@/lib/graph/stores/dashboard-store";
import { MODE_ORDER, getModeConfig } from "@/lib/graph/modes";
import { MODE_EXAMPLES, pickRandom } from "@/lib/graph/mode-examples";
import { responsive, smooth, bouncy, settle, dblHoverHint } from "@/lib/motion";
import type { GraphMode } from "@/lib/graph/types";

// Prompt positioning constants
const BOTTOM_BASE = 32;
/** Top clearance for write panel — below Wordmark icon row when panels visible. */
const WRITE_TOP_CLEARANCE = 96;
/** Top clearance for write panel — no panel icons. */
const WRITE_TOP_BASE = 56;

/** Cycles through texts once with a typewriter type/delete effect, then stops. */
function useTypewriter(
  texts: string[],
  { speed = 45, deleteSpeed = 25, waitTime = 2000, initialDelay = 600 } = {},
) {
  const [display, setDisplay] = useState("");
  const [textIdx, setTextIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState<"delay" | "typing" | "deleting" | "done">("delay");
  const textsRef = useRef(texts);

  // Reset when texts array identity changes (mode switch)
  useEffect(() => {
    textsRef.current = texts;
    setDisplay("");
    setTextIdx(0);
    setCharIdx(0);
    setDone(false);
    setPhase("delay");
  }, [texts]);

  useEffect(() => {
    if (phase === "done") return;
    const current = textsRef.current[textIdx];
    if (!current) return;

    let timeout: ReturnType<typeof setTimeout>;

    switch (phase) {
      case "delay":
        timeout = setTimeout(() => setPhase("typing"), initialDelay);
        break;
      case "typing":
        if (charIdx < current.length) {
          timeout = setTimeout(() => {
            setDisplay(current.slice(0, charIdx + 1));
            setCharIdx((c) => c + 1);
          }, speed);
        } else if (textIdx >= textsRef.current.length - 1) {
          // Last text fully typed — hold it
          setDone(true);
          setPhase("done");
        } else {
          timeout = setTimeout(() => setPhase("deleting"), waitTime);
        }
        break;
      case "deleting":
        if (display.length > 0) {
          timeout = setTimeout(() => {
            setDisplay((d) => d.slice(0, -1));
          }, deleteSpeed);
        } else {
          const nextIdx = textIdx + 1;
          if (nextIdx >= textsRef.current.length) {
            // One full cycle complete
            setDone(true);
            setPhase("done");
          } else {
            setTextIdx(nextIdx);
            setCharIdx(0);
            setPhase("typing");
          }
        }
        break;
    }
    return () => clearTimeout(timeout);
  }, [phase, charIdx, display, textIdx, speed, deleteSpeed, waitTime, initialDelay]);

  const isLast = textIdx >= textsRef.current.length - 1;
  return { text: display, done, isLast };
}

/** Inactive mode icon hover — wiggle to hint "click me". */
const INACTIVE_ICON_HOVER = {
  rotate: [0, -12, 12, -8, 8, 0],
  scale: 1.1,
  transition: { rotate: { duration: 0.5, ease: "easeInOut" as const }, scale: bouncy },
};

/** Icon mapping — keeps presentation separate from mode data. */
const MODE_ICONS: Record<GraphMode, typeof MessageCircle> = {
  ask: MessageCircle,
  explore: Compass,
  learn: BookOpen,
  write: PenLine,
};

/** Gradient divider between mode toggles. */
function ModeDivider() {
  return (
    <div
      className="h-5 w-px mx-1 flex-shrink-0 rounded-full"
      style={{
        background:
          "linear-gradient(to bottom, transparent, var(--graph-prompt-divider), transparent)",
      }}
    />
  );
}

/** Shared mode toggle bar. */
export function ModeToggleBar({
  compact = false,
  onModeChange,
}: {
  compact?: boolean;
  onModeChange?: (mode: GraphMode) => void;
}) {
  const mode = useGraphStore((s) => s.mode);
  const setMode = useGraphStore((s) => s.setMode);
  const togglePromptMinimized = useDashboardStore((s) => s.togglePromptMinimized);
  const lastActiveClickRef = useRef<number>(0);

  const handleClick = useCallback(
    (key: GraphMode) => {
      if (key === mode) {
        const now = Date.now();
        if (now - lastActiveClickRef.current < 400) {
          togglePromptMinimized();
          lastActiveClickRef.current = 0;
          return;
        }
        lastActiveClickRef.current = now;
        return;
      }
      lastActiveClickRef.current = 0;
      setMode(key);
      onModeChange?.(key);
    },
    [mode, setMode, onModeChange, togglePromptMinimized],
  );

  return (
    <div className="flex items-center">
      {MODE_ORDER.map((key, i) => {
        const config = getModeConfig(key);
        const isActive = key === mode;
        const Icon = MODE_ICONS[key];
        return (
          <Fragment key={key}>
            {i > 0 && <ModeDivider />}
            <Tooltip label={config.label} position="top" withArrow>
              <motion.button
                onClick={() => handleClick(key)}
                className="relative flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors duration-200 border h-7"
                style={{
                  backgroundColor: isActive
                    ? "var(--mode-accent-subtle)"
                    : "transparent",
                  borderColor: "transparent",
                  color: isActive
                    ? "var(--mode-accent)"
                    : "var(--graph-prompt-inactive)",
                }}
                whileHover={isActive ? dblHoverHint : undefined}
                aria-pressed={isActive}
                aria-label={`${config.label} mode`}
              >
                <motion.div
                  className="flex items-center justify-center w-4 h-4 flex-shrink-0"
                  animate={{
                    rotate: isActive ? 360 : 0,
                    scale: isActive ? 1.1 : 1,
                  }}
                  whileHover={isActive ? undefined : INACTIVE_ICON_HOVER}
                  transition={settle}
                >
                  <Icon size={14} />
                </motion.div>
                {!compact && (
                  <AnimatePresence mode="wait">
                    {isActive && (
                      <motion.span
                        key={key}
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: "auto", opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        {config.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                )}
              </motion.button>
            </Tooltip>
          </Fragment>
        );
      })}
    </div>
  );
}

export function PromptBox() {
  const mode = useGraphStore((s) => s.mode);
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
  const panelBottomYLeft = useDashboardStore((s) => s.panelBottomY.left);
  const panelBottomYRight = useDashboardStore((s) => s.panelBottomY.right);
  const activeMode = getModeConfig(mode);
  const { layout } = activeMode;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-pick on mode change
  const examples = useMemo(() => [...pickRandom(MODE_EXAMPLES[mode], 2), `${activeMode.label} with the knowledge graph...`], [mode]);
  const { text: typewriterText, done: typewriterDone, isLast: typewriterIsLast } = useTypewriter(examples);
  const [hasInput, setHasInput] = useState(false);
  const [isOffset, setIsOffset] = useState(false);
  const { width: vw, height: vh } = useViewportSize();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const userDragY = useRef(0);
  const dragControls = useDragControls();
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const isWrite = mode === "write";
  const isCollapsed = promptMinimized;

  // Animated card height for full-height modes.
  const cardHeight = useMotionValue(0);
  const [heightOverride, setHeightOverride] = useState(false);

  // heightOverride keeps full-height layout active during the shrink animation,
  // preventing content from reflowing before the card finishes resizing.
  const isFullHeight = isWrite || promptMaximized || heightOverride;

  // Overlap-aware clearance — single source of truth for both the effect and JSX width.
  // Only applies clearance when a panel physically extends into the prompt zone.
  const promptZoneTop = vh - BOTTOM_BASE - 80; // ~prompt height + margin
  const effLeft = (isWrite || panelBottomYLeft > promptZoneTop) ? leftClearance : 0;
  const effRight = panelBottomYRight > promptZoneTop ? rightClearance : 0;
  const targetY = Math.min(0, BOTTOM_BASE - bottomClearance);

  // Unified positioning — clear precedence: write > collapsed > obstacle avoidance.
  // One effect eliminates competing animations on dragX/dragY.
  const posAnim = useRef<{ x?: ReturnType<typeof animate>; y?: ReturnType<typeof animate>; h?: ReturnType<typeof animate> }>({});
  const fullHeightEnteredRef = useRef(false);
  const prevPosMode = useRef<"write" | "maximized" | "collapsed" | "normal">("normal");

  useEffect(() => {
    // Skip until first paint (viewport not yet measured)
    if (vw === 0) return;

    posAnim.current.x?.stop();
    posAnim.current.y?.stop();
    posAnim.current.h?.stop();

    const posMode = isCollapsed ? "collapsed" : isWrite ? "write" : promptMaximized ? "maximized" : "normal";
    const modeChanged = prevPosMode.current !== posMode;
    prevPosMode.current = posMode;

    if (posMode === "write" || posMode === "maximized") {
      // Full-height modes — write is left-aligned, maximized is centered
      const targetX = posMode === "write"
        ? 24 + effLeft + Math.min(560, vw * 0.45) / 2 - vw / 2
        : (effLeft - effRight) / 2;
      const topClearance = panelsVisible ? WRITE_TOP_CLEARANCE : WRITE_TOP_BASE;
      const targetH = vh - topClearance - Math.max(bottomClearance, 24);

      if (!fullHeightEnteredRef.current) {
        cardHeight.set(cardRef.current?.offsetHeight ?? 60);
        setHeightOverride(true);
        fullHeightEnteredRef.current = true;
      }
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
        posAnim.current.x = animate(dragX, targetX, smooth);
        posAnim.current.y = animate(dragY, targetY, smooth);
        userDragY.current = targetY;
      } else {
        // Normal: center in available space between left and right panels.
        const targetX = (effLeft - effRight) / 2;
        posAnim.current.x = animate(dragX, targetX, smooth);
        if (modeChanged) userDragY.current = 0;
        // Obstacle avoidance (Y only)
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
  }, [isWrite, isCollapsed, promptMaximized, panelsVisible, bottomClearance, effLeft, effRight, targetY, vw, vh, dragX, dragY, cardHeight]);

  const handleModeChange = useCallback((newMode: GraphMode) => {
    setPromptMaximized(false);
    setPromptMinimized(getModeConfig(newMode).layout.promptCollapsed);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, [setPromptMinimized, setPromptMaximized]);

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

  // Normal-mode width — constrained by panels on both sides (uses shared effLeft/effRight)
  const availableWidth = Math.max(300, vw - effLeft - effRight - 48);
  const normalWidth = effLeft > 0 || effRight > 0
    ? `min(640px, 90vw, ${availableWidth}px)`
    : "min(640px, 90vw)";

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
              : isWrite
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
                value={isWrite ? writeContent : undefined}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setHasInput(val.length > 0);
                  if (isWrite) setWriteContent(val);
                }}
                onInput={(e) => {
                  if (!isWrite) setHasInput((e.target as HTMLTextAreaElement).value.length > 0);
                }}
                autosize={!isFullHeight}
                minRows={isFullHeight ? undefined : 1}
                maxRows={isFullHeight ? undefined : 4}
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
                    className="flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: "var(--mode-accent-subtle)",
                      color: "var(--mode-accent)",
                      border: "none",
                    }}
                    aria-label="Submit prompt"
                  >
                    <ArrowUp size={16} />
                  </motion.button>
                </div>
              )}
          </div>

          {/* Drag grip / recenter — always visible, widens when offset */}
          <div
              onClick={(e) => {
                e.stopPropagation();
                if (!isOffset) return;
                animate(dragX, (effLeft - effRight) / 2, responsive);
                animate(dragY, targetY, responsive);
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
