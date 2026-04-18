"use client";

import type { MutableRefObject, RefObject } from "react";
import {
  Mention,
  PluginKey,
  exitSuggestion,
  mergeAttributes,
  type Editor,
  type Range,
  type SuggestionProps,
} from "@/features/graph/tiptap";

const MENU_OFFSET_Y = 8;

export const REFERENCE_MENTION_PLUGIN_KEY = new PluginKey("referenceMention");

export interface ReferenceMentionItem {
  corpusId: number;
  graphPaperRef: string;
  paperId: string | null;
  title: string;
  year: number | null;
  journalName: string | null;
  snippet: string | null;
  score: number;
}

interface ReferenceMentionNodeAttrs {
  id: string;
  label?: string;
  mentionSuggestionChar?: string;
}

export interface ReferenceMentionSource {
  getItems: (args: {
    query: string;
    editor: Editor;
  }) => Promise<readonly ReferenceMentionItem[]>;
}

export interface ReferenceMentionMenuState {
  query: string;
  items: readonly ReferenceMentionItem[];
  x: number;
  y: number;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  selectIndex: (index: number) => void;
}

export function createReferenceMentionExtension({
  editorFrameRef,
  referenceMentionSourceRef,
  setReferenceMentionMenu,
}: {
  editorFrameRef: RefObject<HTMLDivElement | null>;
  referenceMentionSourceRef: MutableRefObject<ReferenceMentionSource | undefined>;
  setReferenceMentionMenu: (menu: ReferenceMentionMenuState | null) => void;
}) {
  return Mention.configure({
    HTMLAttributes: {
      class: "tiptap-reference-mention",
    },
    deleteTriggerWithBackspace: false,
    renderText({ node }) {
      return `@[${node.attrs.id ?? ""}]`;
    },
    renderHTML({ options, node }) {
      return [
        "span",
        mergeAttributes(options.HTMLAttributes, {
          "data-reference-mention-id": node.attrs.id ?? "",
        }),
        `@${node.attrs.label ?? node.attrs.id ?? ""}`,
      ];
    },
    suggestion: {
      pluginKey: REFERENCE_MENTION_PLUGIN_KEY,
      char: "@",
      allowSpaces: false,
      items: async ({ query, editor }) => {
        const source = referenceMentionSourceRef.current;
        if (!source) {
          return [];
        }

        const items = await source.getItems({ query, editor });
        return Array.from(items);
      },
      command: ({ editor, range, props }) => {
        const item = readReferenceMentionItem(props);
        if (!item) {
          return;
        }

        insertReferenceMention(editor, range, item);
      },
      render: () => {
        let latestProps:
          | SuggestionProps<ReferenceMentionItem, ReferenceMentionNodeAttrs>
          | null = null;
        let selectedIndex = 0;

        const syncMenu = (
          props: SuggestionProps<
            ReferenceMentionItem,
            ReferenceMentionNodeAttrs
          >,
        ) => {
          latestProps = props;
          selectedIndex = clampIndex(selectedIndex, props.items.length);
          const frameElement = editorFrameRef.current;
          const clientRect = props.clientRect?.();
          if (!frameElement || !clientRect) {
            setReferenceMentionMenu(null);
            return;
          }

          const frameBounds = frameElement.getBoundingClientRect();
          setReferenceMentionMenu({
            query: props.query,
            items: props.items as ReferenceMentionItem[],
            x: clientRect.left - frameBounds.left,
            y: clientRect.bottom - frameBounds.top + MENU_OFFSET_Y,
            selectedIndex,
            setSelectedIndex(index) {
              if (!latestProps) {
                return;
              }

              selectedIndex = clampIndex(index, latestProps.items.length);
              syncMenu(latestProps);
            },
            selectIndex(index) {
              if (!latestProps || latestProps.items.length === 0) {
                return;
              }

              selectedIndex = clampIndex(index, latestProps.items.length);
              insertReferenceMention(
                latestProps.editor,
                latestProps.range,
                latestProps.items[selectedIndex]!,
              );
              setReferenceMentionMenu(null);
            },
          });
        };

        return {
          onStart(props) {
            selectedIndex = 0;
            syncMenu(props);
          },
          onUpdate(props) {
            if (props.query !== latestProps?.query) {
              selectedIndex = 0;
            }
            syncMenu(props);
          },
          onExit() {
            latestProps = null;
            setReferenceMentionMenu(null);
          },
          onKeyDown({ event, view }) {
            if (!latestProps) {
              return false;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              exitSuggestion(view, REFERENCE_MENTION_PLUGIN_KEY);
              setReferenceMentionMenu(null);
              return true;
            }

            if (latestProps.items.length === 0) {
              return false;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              selectedIndex = clampIndex(
                selectedIndex + 1,
                latestProps.items.length,
              );
              syncMenu(latestProps);
              return true;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              selectedIndex = clampIndex(
                selectedIndex - 1,
                latestProps.items.length,
              );
              syncMenu(latestProps);
              return true;
            }

            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              insertReferenceMention(
                latestProps.editor,
                latestProps.range,
                latestProps.items[selectedIndex]!,
              );
              setReferenceMentionMenu(null);
              return true;
            }

            return false;
          },
        };
      },
    },
  });
}

function insertReferenceMention(
  editor: Editor,
  range: Range,
  item: ReferenceMentionItem,
) {
  editor
    .chain()
    .focus()
    .insertContentAt(range, {
      type: "mention",
      attrs: {
        id: String(item.corpusId),
        label: item.title,
        mentionSuggestionChar: "@",
      },
    })
    .insertContent(" ")
    .run();
}

function readReferenceMentionItem(value: unknown): ReferenceMentionItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ReferenceMentionItem>;
  if (
    typeof candidate.corpusId !== "number" ||
    typeof candidate.graphPaperRef !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.score !== "number"
  ) {
    return null;
  }

  return {
    corpusId: candidate.corpusId,
    graphPaperRef: candidate.graphPaperRef,
    paperId: typeof candidate.paperId === "string" ? candidate.paperId : null,
    title: candidate.title,
    year: typeof candidate.year === "number" ? candidate.year : null,
    journalName:
      typeof candidate.journalName === "string" ? candidate.journalName : null,
    snippet: typeof candidate.snippet === "string" ? candidate.snippet : null,
    score: candidate.score,
  };
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  if (index < 0) {
    return length - 1;
  }

  if (index >= length) {
    return 0;
  }

  return index;
}
