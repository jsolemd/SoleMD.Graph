"use client";

import { type ReactNode, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Target,
  Type,
} from "lucide-react";
import { CreateEditor } from "../CreateEditor";
import { ModeToggleBar } from "../../chrome/ModeToggleBar";
import { PromptIconBtn } from "./PromptIconBtn";
import {
  BOTTOM_BASE,
  CREATE_CARD_RATIO,
} from "./constants";
import { promptSurfaceStyle } from "../PanelShell";
import type { PromptBoxControllerState } from "./use-prompt-box-controller";
import { densityCssClamp, densityCssSpace, densityPx } from "@/lib/density";
import { useDashboardStore } from "@/features/graph/stores";
import { useShellVariantContext } from "@/features/graph/components/shell/ShellVariantContext";
import { useMobileBottomStack } from "@/features/graph/components/shell/use-mobile-bottom-stack";

interface PromptBoxSurfaceProps extends PromptBoxControllerState {
  placeholder: ReactNode;
}

export function PromptBoxSurface({
  activeMode,
  isCreate,
  isAsk,
  isCollapsed,
  isMaximized,
  isCreateMaximized,
  activePromptValue,
  hasInput,
  showFormattingTools,
  selectionScopeAvailable,
  selectionOnlyEnabled,
  selectionScopeToggleLabel,
  isSubmitting,
  handleSubmit,
  promptInteractionProviders,
  referenceMentionSource,
  handlePromptInteraction,
  handleShowEntityOnGraph,
  handleOpenEntityInWiki,
  handlePromptContentChange,
  handlePromptEmptyChange,
  handleToggleFormattingTools,
  handleToggleSelectionScope,
  stepPromptUp,
  stepPromptDown,
  handlePillClick,
  handlePillKeyDown,
  editorRef,
  cardRef,
  dragX,
  dragY,
  cardHeight,
  heightOverride,
  isFullHeightMode,
  normalWidth,
  placeholder,
}: PromptBoxSurfaceProps) {
  const shellVariant = useShellVariantContext();
  const isMobile = shellVariant === "mobile";
  const { promptBottom } = useMobileBottomStack();
  const mobileBottomInset = `calc(env(safe-area-inset-bottom, 0px) + ${promptBottom}px)`;
  const setPromptTopY = useDashboardStore((s) => s.setPromptTopY);

  // Publish the prompt card's top Y to the store so docked, unpinned panels
  // can clamp their height against it. Mobile shells ignore docked panel
  // geometry (panels render as full-screen sheets), so we skip reporting
  // there to avoid incidental clamps on desktop state.
  useEffect(() => {
    if (isMobile) {
      setPromptTopY(0);
      return;
    }
    const el = cardRef.current;
    if (!el) return;
    const report = () => {
      setPromptTopY(el.getBoundingClientRect().top);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener("resize", report);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", report);
      setPromptTopY(0);
    };
  }, [cardRef, isMobile, setPromptTopY]);

  return (
    <div
      className={`fixed z-50 ${isMobile ? "inset-x-2" : "left-1/2"}`}
      style={{
        bottom: isMobile ? mobileBottomInset : BOTTOM_BASE,
        pointerEvents: "none",
      }}
    >
      <motion.div
        style={isMobile ? undefined : { x: dragX, y: dragY }}
      >
        <motion.div
          ref={cardRef}
          className="rounded-3xl flex flex-col"
          style={{
            width: isMobile
              ? "100%"
              : isCollapsed
                ? undefined
                : isCreateMaximized
                  ? densityCssClamp(530, `${CREATE_CARD_RATIO * 100}vw`, 560)
                  : normalWidth,
            transform: isMobile || isCollapsed ? "none" : "translateX(-50%)",
            position: "relative",
            pointerEvents: "auto",
            padding: isCollapsed
              ? densityCssSpace(10, isMobile ? 14 : 12)
              : densityCssSpace(12, isMobile ? 14 : 12, 4),
            ...promptSurfaceStyle,
            height: heightOverride ? cardHeight : "auto",
            overflow: heightOverride ? "hidden" : "visible",
            cursor: "default",
            touchAction: isMobile ? "auto" : "none",
            transition: "width 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
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
          <div
            onPointerDown={(event) => event.stopPropagation()}
            aria-hidden={isCollapsed}
            style={{
              display: "grid",
              gridTemplateRows: isCollapsed ? "0fr" : "1fr",
              opacity: isCollapsed ? 0 : 1,
              flex: isFullHeightMode ? 1 : undefined,
              minHeight: isFullHeightMode ? 0 : undefined,
              cursor: "default",
              transition:
                "grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease",
            }}
          >
            <div
              style={{
                overflow: isCollapsed ? "hidden" : "visible",
                minHeight: 0,
                height: isFullHeightMode ? "100%" : undefined,
              }}
            >
              <CreateEditor
                ref={editorRef}
                content={activePromptValue}
                onContentChange={handlePromptContentChange}
                onEmptyChange={handlePromptEmptyChange}
                onSubmit={isAsk ? handleSubmit : undefined}
                onPromptInteraction={isCreate ? handlePromptInteraction : undefined}
                promptInteractionProviders={isCreate ? promptInteractionProviders : undefined}
                referenceMentionSource={referenceMentionSource}
                onShowEntityOnGraph={handleShowEntityOnGraph}
                onOpenEntityInWiki={handleOpenEntityInWiki}
                ariaLabel={`${activeMode.label} prompt`}
                debounceMs={isCreate ? 300 : 0}
                compact={!isFullHeightMode}
                showToolbar={showFormattingTools}
                placeholder={placeholder}
              />
            </div>
          </div>

          <div
            className="flex items-center"
            style={{
              userSelect: "none",
              cursor: "default",
              justifyContent: isCollapsed ? "center" : "space-between",
              paddingTop: isCollapsed ? 0 : densityPx(6),
            }}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <ModeToggleBar compact={isCollapsed && !isMobile} />
            </div>

            {!isCollapsed && (
              <div
                className="flex items-center gap-2"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {/* Expand/Collapse are desktop-only — on mobile the prompt auto-sizes
                    as the user types, and the row needs the width for the submit button. */}
                {!isMobile && (
                  <div className="flex items-center -space-x-1">
                    {!isFullHeightMode && (
                      <PromptIconBtn icon={ChevronUp} label="Expand" onClick={stepPromptUp} />
                    )}
                    <PromptIconBtn
                      icon={ChevronDown}
                      label={isMaximized ? "Shrink" : "Collapse"}
                      onClick={stepPromptDown}
                    />
                  </div>
                )}

                <PromptIconBtn
                  icon={Type}
                  label={showFormattingTools ? "Hide formatting tools" : "Show formatting tools"}
                  onClick={handleToggleFormattingTools}
                  active={showFormattingTools}
                  aria-pressed={showFormattingTools}
                />

                <PromptIconBtn
                  icon={Target}
                  label={selectionScopeToggleLabel}
                  onClick={handleToggleSelectionScope}
                  active={selectionOnlyEnabled}
                  aria-pressed={selectionOnlyEnabled}
                  disabled={!selectionScopeAvailable}
                />

                <PromptIconBtn
                  icon={ArrowUp}
                  label="Submit prompt"
                  onClick={handleSubmit}
                  size="md"
                  variant="primary"
                  disabled={!isAsk || !hasInput || isSubmitting}
                />
              </div>
            )}
          </div>

        </motion.div>
      </motion.div>
    </div>
  );
}
