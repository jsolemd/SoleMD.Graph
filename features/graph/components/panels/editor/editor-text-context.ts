import type { Editor } from "@/features/graph/tiptap";
import type { EntityTextScope } from "@/features/graph/components/entities/entity-text-runtime";

export function readEditorTextContext(editor: Editor): EntityTextScope | null {
  const paragraphText = editor.state.selection.$from.parent.textContent;
  if (!paragraphText.trim()) {
    const editorText = editor.getText().trim();
    if (!editorText) {
      return null;
    }

    return {
      text: editorText,
      textFrom: 1,
      cursorOffset: editorText.length,
    };
  }

  return {
    text: paragraphText,
    textFrom: editor.state.selection.$from.start(),
    cursorOffset: editor.state.selection.$from.parentOffset,
  };
}
