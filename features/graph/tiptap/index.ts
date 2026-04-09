// Adapter boundary — all Tiptap/ProseMirror imports are contained here.
// Consumers import from this barrel; never from @tiptap/* directly.

export { Extension } from "@tiptap/core";
export { Markdown } from "@tiptap/markdown";
export { Plugin } from "@tiptap/pm/state";
export { default as StarterKit } from "@tiptap/starter-kit";
export { EditorContent, useEditor, useEditorState } from "@tiptap/react";
export type { Editor } from "@tiptap/react";
