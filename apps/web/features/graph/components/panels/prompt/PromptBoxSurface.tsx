"use client";

import { type ReactNode, useEffect } from "react";
import { motion } from "framer-motion";
import { CreateEditor } from "../CreateEditor";
import { PromptBoxCard } from "./PromptBoxCard";
import {
  BOTTOM_BASE,
  CREATE_CARD_RATIO,
} from "./constants";
import type { PromptBoxControllerState } from "./use-prompt-box-controller";
import { densityCssClamp } from "@/lib/density";
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
        <PromptBoxCard
          cardRef={cardRef}
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
            height: heightOverride ? cardHeight : "auto",
            overflow: heightOverride ? "hidden" : "visible",
            touchAction: isMobile ? "auto" : "none",
            transition: "width 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          isCollapsed={isCollapsed}
          isMobile={isMobile}
          isFullHeightMode={isFullHeightMode}
          isMaximized={isMaximized}
          showFormattingTools={showFormattingTools}
          selectionOnlyEnabled={selectionOnlyEnabled}
          selectionScopeAvailable={selectionScopeAvailable}
          selectionScopeToggleLabel={selectionScopeToggleLabel}
          isSubmitDisabled={!isAsk || !hasInput || isSubmitting}
          onToggleFormattingTools={handleToggleFormattingTools}
          onToggleSelectionScope={handleToggleSelectionScope}
          onStepUp={stepPromptUp}
          onStepDown={stepPromptDown}
          onSubmit={handleSubmit}
          onPillClick={handlePillClick}
          onPillKeyDown={handlePillKeyDown}
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
        </PromptBoxCard>
      </motion.div>
    </div>
  );
}
