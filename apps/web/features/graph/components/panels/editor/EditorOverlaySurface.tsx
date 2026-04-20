"use client";

import type { KeyboardEvent, RefObject } from "react";
import type { PromptInteractionMenuState } from "./prompt-interaction-extension";
import type { ReferenceMentionMenuState } from "./reference-mention-extension";
import { PopoverSurface } from "@/features/graph/components/panels/PanelShell";

interface EditorOverlaySurfaceProps {
  promptInteractionMenuRef: RefObject<HTMLDivElement | null>;
  promptInteractionMenu: PromptInteractionMenuState | null;
  referenceMentionMenu: ReferenceMentionMenuState | null;
  handlePromptInteractionMenuHover: (index: number) => void;
  handlePromptInteractionMenuKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
  ) => void;
  submitPromptInteractionCommand: (commandId: string) => void;
}

export function EditorOverlaySurface({
  promptInteractionMenuRef,
  promptInteractionMenu,
  referenceMentionMenu,
  handlePromptInteractionMenuHover,
  handlePromptInteractionMenuKeyDown,
  submitPromptInteractionCommand,
}: EditorOverlaySurfaceProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 12,
      }}
    >
      {promptInteractionMenu && (
        <PopoverSurface
          ref={promptInteractionMenuRef}
          tabIndex={-1}
          onKeyDown={handlePromptInteractionMenuKeyDown}
          className="rounded-2xl px-2 py-2"
          style={floatingMenuStyle(promptInteractionMenu.x, promptInteractionMenu.y)}
          minWidth={240}
          maxWidth={280}
        >
          <div style={{ display: "grid", gap: 4 }}>
            {promptInteractionMenu.provider.commands.map((command, index) => {
              const isActive = index === promptInteractionMenu.selectedIndex;
              return (
                <button
                  key={`${promptInteractionMenu.provider.id}:${command.id}`}
                  type="button"
                  className="rounded-xl px-3 py-2 text-left"
                  onMouseEnter={() => handlePromptInteractionMenuHover(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    submitPromptInteractionCommand(command.id);
                  }}
                  style={floatingMenuItemStyle(isActive)}
                >
                  <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    {command.label}
                  </div>
                  <div style={floatingMenuDescriptionStyle}>
                    {command.description}
                  </div>
                </button>
              );
            })}
          </div>
        </PopoverSurface>
      )}

      {referenceMentionMenu && (
        <PopoverSurface
          className="rounded-2xl px-2 py-2"
          style={floatingMenuStyle(referenceMentionMenu.x, referenceMentionMenu.y)}
          minWidth={300}
          maxWidth={360}
        >
          {referenceMentionMenu.items.length === 0 ? (
            <div className="rounded-xl px-3 py-2" style={floatingMenuEmptyStateStyle}>
              No supporting papers found for this sentence yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              {referenceMentionMenu.items.map((item, index) => {
                const isActive = index === referenceMentionMenu.selectedIndex;
                return (
                  <button
                    key={`${item.corpusId}:${item.graphPaperRef}`}
                    type="button"
                    className="rounded-xl px-3 py-2 text-left"
                    onMouseEnter={() => referenceMentionMenu.setSelectedIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      referenceMentionMenu.selectIndex(index);
                    }}
                    style={floatingMenuItemStyle(isActive)}
                  >
                    <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {item.title}
                    </div>
                    <div style={floatingMenuDescriptionStyle}>
                      {[item.journalName, item.year].filter(Boolean).join(" · ") || "Supporting paper"}
                    </div>
                    {item.snippet && (
                      <div style={floatingMenuSnippetStyle}>
                        {item.snippet}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </PopoverSurface>
      )}
    </div>
  );
}

function floatingMenuStyle(x: number, y: number) {
  return {
    position: "absolute" as const,
    top: y,
    left: x,
    zIndex: 1,
    pointerEvents: "auto" as const,
  };
}

function floatingMenuItemStyle(isActive: boolean) {
  return {
    backgroundColor: isActive ? "var(--mode-accent-subtle)" : "transparent",
    border: "1px solid var(--mode-accent)",
    color: "var(--graph-prompt-text)",
  };
}

const floatingMenuDescriptionStyle = {
  fontSize: "0.72rem",
  lineHeight: 1.4,
  color: "var(--graph-prompt-placeholder)",
};

const floatingMenuSnippetStyle = {
  marginTop: 6,
  fontSize: "0.74rem",
  lineHeight: 1.45,
  color: "var(--graph-prompt-text)",
};

const floatingMenuEmptyStateStyle = {
  border: "1px solid var(--mode-accent)",
  color: "var(--graph-prompt-placeholder)",
  fontSize: "0.74rem",
  lineHeight: 1.45,
};
