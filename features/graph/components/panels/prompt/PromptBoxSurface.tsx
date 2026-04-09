"use client";

import { type ReactNode } from "react";
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
import { RagResponsePanel } from "./RagResponsePanel";
import {
  BOTTOM_BASE,
  MAX_CARD_W,
  MIN_CARD_W_CREATE,
} from "./constants";
import type { PromptBoxControllerState } from "./use-prompt-box-controller";

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
  selectedNode,
  selectedScopeLabel,
  ragResponse,
  streamedAskAnswer,
  ragError,
  ragSession,
  ragGraphAvailability,
  isSubmitting,
  handleSubmit,
  promptInteractionProviders,
  handlePromptInteraction,
  clearRag,
  handlePromptContentChange,
  handlePromptEmptyChange,
  handleToggleFormattingTools,
  handleToggleSelectionScope,
  stepPromptUp,
  stepPromptDown,
  handlePillClick,
  handlePillKeyDown,
  handleDragStart,
  handleDragEnd,
  handleRecenter,
  editorRef,
  cardRef,
  dragControls,
  dragX,
  dragY,
  cardHeight,
  heightOverride,
  isFullHeightMode,
  isOffset,
  normalWidth,
  placeholder,
}: PromptBoxSurfaceProps) {
  return (
    <div
      className="fixed z-50 left-1/2"
      style={{ bottom: BOTTOM_BASE, pointerEvents: "none" }}
    >
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        style={{ x: dragX, y: dragY }}
        onDragStart={() => {
          document.body.style.cursor = "grabbing";
        }}
        onDragEnd={() => {
          document.body.style.cursor = "";
          handleDragEnd();
        }}
      >
        <motion.div
          ref={cardRef}
          className="rounded-3xl flex flex-col"
          style={{
            width: isCollapsed
              ? undefined
              : isCreateMaximized
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
            cursor: isFullHeightMode ? "default" : "grab",
            touchAction: "none",
            transition: "width 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          onPointerDown={handleDragStart}
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
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
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
                ragGraphAvailability={ragGraphAvailability}
                isSubmitting={isSubmitting}
                isFullHeightMode={isFullHeightMode}
                selectedNode={selectedNode}
                selectedScopeLabel={selectedScopeLabel}
                onDismiss={() => clearRag()}
              />
            </div>
          )}

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
            <div style={{ overflow: "hidden", minHeight: 0, height: isFullHeightMode ? "100%" : undefined }}>
              <CreateEditor
                ref={editorRef}
                content={activePromptValue}
                onContentChange={handlePromptContentChange}
                onEmptyChange={handlePromptEmptyChange}
                onSubmit={isAsk ? handleSubmit : undefined}
                onPromptInteraction={isCreate ? handlePromptInteraction : undefined}
                promptInteractionProviders={isCreate ? promptInteractionProviders : undefined}
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
              paddingTop: isCollapsed ? 0 : 6,
            }}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <ModeToggleBar compact={isCollapsed} />
            </div>

            {!isCollapsed && (
              <div
                className="flex items-center gap-2"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
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
                  active
                  disabled={!isAsk || !hasInput || isSubmitting}
                />
              </div>
            )}
          </div>

          <div
            onClick={(event) => {
              event.stopPropagation();
              handleRecenter();
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
