// Adapter boundary — all Tiptap/ProseMirror imports are contained here.
// Consumers import from this barrel; never from @tiptap/* directly.

export { Editor as TiptapEditor, Extension, mergeAttributes } from "@tiptap/core";
export type { Range } from "@tiptap/core";
export { default as Mention } from "@tiptap/extension-mention";
export { Markdown } from "@tiptap/markdown";
export {
  Suggestion,
  SuggestionPluginKey,
  exitSuggestion,
  findSuggestionMatch,
} from "@tiptap/suggestion";
export type { SuggestionProps } from "@tiptap/suggestion";
export { Plugin, PluginKey } from "@tiptap/pm/state";
export type { EditorState, Transaction } from "@tiptap/pm/state";
export { Decoration, DecorationSet } from "@tiptap/pm/view";
export type { EditorView } from "@tiptap/pm/view";
export { default as StarterKit } from "@tiptap/starter-kit";
export {
  EditorContent,
  ReactRenderer,
  useEditor,
  useEditorState,
} from "@tiptap/react";
export type { Editor } from "@tiptap/react";
