"use client";

import { type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { EditorContent } from "@/features/graph/tiptap";
import { EditorToolbar } from "./EditorToolbar";
import { EditorOverlaySurface } from "./EditorOverlaySurface";
import type { CreateEditorControllerState } from "./use-create-editor-controller";

interface CreateEditorSurfaceProps extends CreateEditorControllerState {
  ariaLabel: string;
  compact: boolean;
  showToolbar: boolean;
  placeholder?: ReactNode;
}

export function CreateEditorSurface({
  editor,
  toolbarState,
  sourceMode,
  setSourceMode,
  sourceText,
  editorFrameRef,
  promptInteractionMenuRef,
  promptInteractionMenu,
  referenceMentionMenu,
  handlePromptInteractionMenuHover,
  handlePromptInteractionMenuKeyDown,
  handleSourceTextChange,
  submitPromptInteractionCommand,
  ariaLabel,
  compact,
  showToolbar,
  placeholder,
}: CreateEditorSurfaceProps) {
  return (
    <div className={compact ? "tiptap-create tiptap-create--compact" : "tiptap-create"}>
      <AnimatePresence initial={false}>
        {showToolbar && editor && (
          <EditorToolbar
            editor={editor}
            toolbarState={toolbarState}
            sourceMode={sourceMode}
            setSourceMode={setSourceMode}
            ariaLabel={ariaLabel}
          />
        )}
      </AnimatePresence>
      <div
        ref={editorFrameRef}
        style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        {placeholder}
        <EditorOverlaySurface
          promptInteractionMenuRef={promptInteractionMenuRef}
          promptInteractionMenu={promptInteractionMenu}
          referenceMentionMenu={referenceMentionMenu}
          handlePromptInteractionMenuHover={handlePromptInteractionMenuHover}
          handlePromptInteractionMenuKeyDown={handlePromptInteractionMenuKeyDown}
          submitPromptInteractionCommand={submitPromptInteractionCommand}
        />
        {sourceMode ? (
          <textarea
            className="tiptap-source thin-scrollbar"
            style={{ "--scrollbar-thumb": "var(--graph-prompt-divider)" } as React.CSSProperties}
            value={sourceText}
            onChange={handleSourceTextChange}
            aria-label={`${ariaLabel} (markdown source)`}
            spellCheck={false}
          />
        ) : (
          <EditorContent editor={editor} className="tiptap-create__content" />
        )}
      </div>
    </div>
  );
}
