"use client";

import { type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { EditorContent } from "@/features/graph/tiptap";
import { EditorToolbar } from "./EditorToolbar";
import type { CreateEditorControllerState } from "./use-create-editor-controller";
import {
  EVIDENCE_ASSIST_COMMANDS,
} from "../prompt/evidence-assist";

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
  evidenceAssistMenuRef,
  evidenceAssistMenu,
  handleEvidenceAssistMenuHover,
  handleEvidenceAssistMenuKeyDown,
  handleSourceTextChange,
  submitEvidenceAssistIntent,
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
        {evidenceAssistMenu && (
          <div
            ref={evidenceAssistMenuRef}
            tabIndex={-1}
            onKeyDown={handleEvidenceAssistMenuKeyDown}
            className="rounded-2xl px-2 py-2"
            style={{
              position: "absolute",
              top: evidenceAssistMenu.y,
              left: evidenceAssistMenu.x,
              minWidth: 240,
              maxWidth: 280,
              zIndex: 5,
              backgroundColor: "var(--graph-prompt-bg)",
              border: "1px solid var(--graph-prompt-border)",
              boxShadow: "var(--graph-prompt-shadow)",
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              {EVIDENCE_ASSIST_COMMANDS.map((command, index) => {
                const isActive = index === evidenceAssistMenu.selectedIndex;
                return (
                  <button
                    key={command.intent}
                    type="button"
                    className="rounded-xl px-3 py-2 text-left"
                    onMouseEnter={() => handleEvidenceAssistMenuHover(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      submitEvidenceAssistIntent(command.intent);
                    }}
                    style={{
                      backgroundColor: isActive ? "var(--mode-accent-subtle)" : "transparent",
                      border: "1px solid var(--mode-accent-border)",
                      color: "var(--graph-prompt-text)",
                    }}
                  >
                    <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      {command.label}
                    </div>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        lineHeight: 1.4,
                        color: "var(--graph-prompt-placeholder)",
                      }}
                    >
                      {command.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
