"use client";

import {
  Decoration,
  DecorationSet,
  Extension,
  Plugin,
  PluginKey,
  type Editor,
  type EditorView,
} from "@/features/graph/tiptap";
import type { GraphEntityRef } from "@/features/graph/types/entity-service";

export interface EntityHighlight {
  id: string;
  from: number;
  to: number;
  matchedText: string;
  entity: GraphEntityRef;
  paperCount: number;
}

export interface EntityHighlightHoverState {
  highlight: EntityHighlight;
  x: number;
  y: number;
}

interface EntityHighlightPluginState {
  decorations: DecorationSet;
  highlightsById: Map<string, EntityHighlight>;
}

export const ENTITY_HIGHLIGHT_PLUGIN_KEY =
  new PluginKey<EntityHighlightPluginState>("entityHighlight");

export function createEntityHighlightExtension({
  setEntityHighlightHover,
}: {
  setEntityHighlightHover: (hover: EntityHighlightHoverState | null) => void;
}) {
  return Extension.create({
    name: "entityHighlight",
    addProseMirrorPlugins() {
      return [
        new Plugin<EntityHighlightPluginState>({
          key: ENTITY_HIGHLIGHT_PLUGIN_KEY,
          state: {
            init: (_, state) => buildEntityHighlightState(state.doc, []),
            apply: (transaction, value, _oldState, newState) => {
              const nextHighlights = transaction.getMeta(
                ENTITY_HIGHLIGHT_PLUGIN_KEY,
              ) as readonly EntityHighlight[] | undefined;
              if (nextHighlights) {
                return buildEntityHighlightState(newState.doc, nextHighlights);
              }

              if (transaction.docChanged) {
                return {
                  decorations: value.decorations.map(
                    transaction.mapping,
                    transaction.doc,
                  ),
                  highlightsById: value.highlightsById,
                };
              }

              return value;
            },
          },
          props: {
            decorations(state) {
              return ENTITY_HIGHLIGHT_PLUGIN_KEY.getState(state)?.decorations ??
                DecorationSet.empty;
            },
            handleDOMEvents: {
              mouseover: (view, event) => {
                syncEntityHighlightHover({
                  view,
                  event,
                  setEntityHighlightHover,
                });
                return false;
              },
              mousemove: (view, event) => {
                syncEntityHighlightHover({
                  view,
                  event,
                  setEntityHighlightHover,
                });
                return false;
              },
              mouseleave: () => {
                setEntityHighlightHover(null);
                return false;
              },
            },
          },
          view() {
            return {
              destroy() {
                setEntityHighlightHover(null);
              },
            };
          },
        }),
      ];
    },
  });
}

export function setEntityHighlights(
  editor: Editor,
  highlights: readonly EntityHighlight[],
) {
  editor.view.dispatch(
    editor.state.tr.setMeta(ENTITY_HIGHLIGHT_PLUGIN_KEY, highlights),
  );
}

export function clearEntityHighlights(editor: Editor) {
  setEntityHighlights(editor, []);
}

export function readEntityHighlightState(editor: Editor) {
  return ENTITY_HIGHLIGHT_PLUGIN_KEY.getState(editor.state) ??
    buildEntityHighlightState(editor.state.doc, []);
}

function buildEntityHighlightState(
  doc: Editor["state"]["doc"],
  highlights: readonly EntityHighlight[],
): EntityHighlightPluginState {
  const validHighlights = highlights.filter((highlight) =>
    highlight.id.trim().length > 0 &&
    highlight.from >= 0 &&
    highlight.to > highlight.from &&
    highlight.to <= doc.content.size,
  );

  const decorations = DecorationSet.create(
    doc,
    validHighlights.map((highlight) =>
      Decoration.inline(
        highlight.from,
        highlight.to,
        {
          class: "tiptap-entity-highlight",
          "data-entity-highlight-id": highlight.id,
          "data-entity-type": highlight.entity.entityType.toLowerCase(),
        },
        { entityHighlight: highlight },
      ),
    ),
  );

  return {
    decorations,
    highlightsById: new Map(
      validHighlights.map((highlight) => [highlight.id, highlight]),
    ),
  };
}

function syncEntityHighlightHover({
  view,
  event,
  setEntityHighlightHover,
}: {
  view: EditorView;
  event: MouseEvent;
  setEntityHighlightHover: (hover: EntityHighlightHoverState | null) => void;
}) {
  const target = resolveEntityHighlightElement(event.target);
  if (!target) {
    setEntityHighlightHover(null);
    return;
  }

  const highlightId = target.getAttribute("data-entity-highlight-id");
  if (!highlightId) {
    setEntityHighlightHover(null);
    return;
  }

  const pluginState = ENTITY_HIGHLIGHT_PLUGIN_KEY.getState(view.state);
  const highlight = pluginState?.highlightsById.get(highlightId);
  if (!highlight) {
    setEntityHighlightHover(null);
    return;
  }

  const targetBounds = target.getBoundingClientRect();
  setEntityHighlightHover({
    highlight,
    x: targetBounds.left,
    y: targetBounds.top,
  });
}

export function resolveEntityHighlightElement(target: EventTarget | null) {
  const node = target instanceof Node ? target : null;
  const element =
    node instanceof HTMLElement
      ? node
      : node?.parentElement ?? null;
  return element?.closest<HTMLElement>("[data-entity-highlight-id]") ?? null;
}
