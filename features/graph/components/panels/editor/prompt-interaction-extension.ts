"use client";

import type { MutableRefObject, RefObject } from "react";
import {
  Extension,
  Plugin,
  type Editor,
} from "@/features/graph/tiptap";
import {
  getPromptInteractionDefaultCommandIndex,
  resolvePromptInteractionTriggerMatch,
  type PromptInteractionProvider,
  type PromptInteractionRequest,
} from "./prompt-interactions";

export interface PromptInteractionMenuState {
  provider: PromptInteractionProvider<PromptInteractionRequest>;
  x: number;
  y: number;
  selectedIndex: number;
}

export function createPromptInteractionExtension({
  editorRef,
  editorFrameRef,
  onPromptInteractionRef,
  promptInteractionProvidersRef,
  activePromptInteractionProviderRef,
  setPromptInteractionMenu,
  submitPromptInteractionCommand,
}: {
  editorRef: MutableRefObject<Editor | null>;
  editorFrameRef: RefObject<HTMLDivElement | null>;
  onPromptInteractionRef: MutableRefObject<
    ((request: PromptInteractionRequest) => void) | undefined
  >;
  promptInteractionProvidersRef: MutableRefObject<
    | readonly PromptInteractionProvider<PromptInteractionRequest>[]
    | undefined
  >;
  activePromptInteractionProviderRef: MutableRefObject<
    PromptInteractionProvider<PromptInteractionRequest> | null
  >;
  setPromptInteractionMenu: (menu: PromptInteractionMenuState | null) => void;
  submitPromptInteractionCommand: (
    commandId: string,
    providerOverride?: PromptInteractionProvider<PromptInteractionRequest>,
  ) => void;
}) {
  return Extension.create({
    name: "promptInteractionTrigger",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handleTextInput: (_view, from, _to, text) => {
              const providers = promptInteractionProvidersRef.current ?? [];
              if (!onPromptInteractionRef.current || providers.length === 0) {
                return false;
              }

              const currentEditor = editorRef.current;
              if (!currentEditor) {
                return false;
              }

              const textBeforeCursor =
                currentEditor.state.selection.$from.parent.textContent.slice(
                  0,
                  currentEditor.state.selection.$from.parentOffset,
                );
              const triggerMatch = resolvePromptInteractionTriggerMatch({
                providers,
                textBeforeCursor,
                insertedText: text,
              });
              if (!triggerMatch) {
                return false;
              }

              const anchorPos = Math.max(1, from - triggerMatch.deletePrefixChars);
              if (triggerMatch.deletePrefixChars > 0) {
                currentEditor
                  .chain()
                  .focus()
                  .deleteRange({
                    from: Math.max(0, from - triggerMatch.deletePrefixChars),
                    to: from,
                  })
                  .run();
              }

              if (triggerMatch.trigger.action === "submit") {
                submitPromptInteractionCommand(
                  triggerMatch.trigger.defaultCommandId,
                  triggerMatch.provider,
                );
                return true;
              }

              if (
                !editorFrameRef.current ||
                triggerMatch.provider.commands.length === 0
              ) {
                return false;
              }

              const cursorCoordinates = currentEditor.view.coordsAtPos(anchorPos);
              const frameBounds = editorFrameRef.current.getBoundingClientRect();

              activePromptInteractionProviderRef.current = triggerMatch.provider;
              setPromptInteractionMenu({
                provider: triggerMatch.provider,
                x: cursorCoordinates.left - frameBounds.left,
                y: cursorCoordinates.bottom - frameBounds.top + 8,
                selectedIndex: getPromptInteractionDefaultCommandIndex(
                  triggerMatch.provider,
                  triggerMatch.trigger.defaultCommandId,
                ),
              });
              return true;
            },
          },
        }),
      ];
    },
  });
}
