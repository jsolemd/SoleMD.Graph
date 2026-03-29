"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useViewportSize } from "@mantine/hooks";
import {
  motion,
  animate,
} from "framer-motion";
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
import { responsive } from "@/lib/motion";
import type { GraphBundle, GraphBundleQueries, GraphMode } from "@/features/graph/types";
import { useTypewriter } from "@/features/graph/hooks/use-typewriter";
import { ModeToggleBar } from "../chrome/ModeToggleBar";
import { CreateEditor, type CreateEditorHandle } from "./CreateEditor";
import {
  BOTTOM_BASE,
  VIEWPORT_MARGIN,
  MAX_CARD_W,
  MIN_CARD_W_CREATE,
  VW_RATIO,
  SCOPE_LABELS,
  cardWidth,
} from "./prompt/constants";
import { PromptIconBtn } from "./prompt/PromptIconBtn";
import { usePromptPosition } from "./prompt/use-prompt-position";
import { RagResponsePanel } from "./prompt/RagResponsePanel";
import { useRagQuery } from "./prompt/use-rag-query";

export function PromptBox({
  bundle,
  queries,
}: {
  bundle: GraphBundle
  queries: GraphBundleQueries | null
}) {
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
  const [showFormattingTools, setShowFormattingTools] = useState(false);
  const { width: vw } = useViewportSize();
  const editorRef = useRef<CreateEditorHandle>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isCreate = mode === "create";
  const isAsk = mode === "ask";
  const isCollapsed = promptMinimized;
  const activePromptValue = isCreate ? writeContent : promptValue;

  const {
    ragResponse,
    streamedAskAnswer,
    ragError,
    ragSession,
    isSubmitting,
    handleSubmit,
    runEvidenceAssistQuery,
    clearRag,
  } = useRagQuery({
    bundle,
    queries,
    isAsk,
    selectedNode,
    getPromptText: useCallback(() => editorRef.current?.getText() ?? activePromptValue, [activePromptValue]),
  });

  const leftPanelBottom = useDashboardStore((s) => s.panelBottomY.left);
  const rightPanelBottom = useDashboardStore((s) => s.panelBottomY.right);

  const {
    isDragging,
    userDragX,
    userDragY,
    autoTargetXRef,
    dragControls,
    dragX,
    dragY,
    cardHeight,
    heightOverride,
    setHeightOverride,
    isFullHeightMode,
    isFullHeight,
    isOffset,
    setIsOffset,
    targetY,
    pendingFlipRef,
    fullHeightEnteredRef,
    heightAnimatingRef,
  } = usePromptPosition({
    isCreate,
    isCollapsed,
    promptMaximized,
    panelsVisible,
    bottomClearance,
    leftClearance,
    rightClearance,
    leftPanelBottom,
    rightPanelBottom,
    vw,
    vh: useViewportSize().height,
    cardRef,
  });

  const selectedScopeLabel = selectedNode
    ? (SCOPE_LABELS[selectedNode.nodeKind] ?? "node")
    : null;

  const handleModeChange = useCallback((newMode: GraphMode) => {
    editorRef.current?.flush();
    // Clear stale animation state from previous transitions
    pendingFlipRef.current = null;
    fullHeightEnteredRef.current = false;
    heightAnimatingRef.current = false;
    setPromptMaximized(false);
    setPromptMinimized(getModeConfig(newMode).layout.promptCollapsed);
    clearRag();
    // Sync hasInput to the destination mode's content
    if (newMode === "create") {
      setHasInput(writeContent.length > 0);
    } else {
      setHasInput(promptValue.length > 0);
    }
    setTimeout(() => editorRef.current?.focus(), 100);
  }, [writeContent, promptValue, clearRag, setPromptMinimized, setPromptMaximized, pendingFlipRef, fullHeightEnteredRef, heightAnimatingRef]);

  const handlePillClick = useCallback(() => {
    if (isDragging.current) return;
    // Clear any stale animation state from previous transitions
    pendingFlipRef.current = null;
    fullHeightEnteredRef.current = false;
    heightAnimatingRef.current = false;
    setHeightOverride(false);
    setPromptMinimized(false);
    setTimeout(() => editorRef.current?.focus(), 100);
  }, [setPromptMinimized, isDragging, pendingFlipRef, fullHeightEnteredRef, heightAnimatingRef, setHeightOverride]);

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
          isDragging.current = true;
          document.body.style.cursor = "grabbing";
        }}
        onDragEnd={() => {
          document.body.style.cursor = "";
          // Clamp so the full prompt box stays within the viewport
          const viewportW = window.innerWidth;
          const vh = window.innerHeight;
          const boxW = cardRef.current
            ? cardRef.current.offsetWidth
            : cardWidth(viewportW, 0, 0);
          const boxH = cardRef.current
            ? cardRef.current.offsetHeight
            : 120;
          const curX = dragX.get();
          const curY = dragY.get();
          // Pill uses transform:none (left-aligned), others use translateX(-50%) (centered)
          const minX = isCollapsed
            ? VIEWPORT_MARGIN - viewportW / 2
            : -(viewportW / 2 - boxW / 2 - VIEWPORT_MARGIN);
          const maxX = isCollapsed
            ? viewportW / 2 - boxW - VIEWPORT_MARGIN
            : viewportW / 2 - boxW / 2 - VIEWPORT_MARGIN;
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
          {!isCollapsed && (ragResponse || ragError || isSubmitting) && (
            <div
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                bottom: "calc(100% + 12px)",
                left: "50%",
                transform: "translateX(-50%)",
                width: `min(${isCreate ? 520 : 460}px, calc(100vw - 32px))`,
                maxWidth: "100%",
                zIndex: 2,
                pointerEvents: "auto",
              }}
            >
              <RagResponsePanel
                ragResponse={ragResponse}
                streamedAnswer={streamedAskAnswer}
                ragError={ragError}
                ragSession={ragSession}
                isSubmitting={isSubmitting}
                isFullHeightMode={isFullHeightMode}
                selectedNode={selectedNode}
                selectedScopeLabel={selectedScopeLabel}
                onDismiss={() => clearRag()}
              />
            </div>
          )}

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
                onEvidenceAssistIntent={isCreate ? runEvidenceAssistQuery : undefined}
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
                    disabled={!isAsk || !activePromptValue.trim() || isSubmitting}
                  />
                </div>
              )}
          </div>

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
