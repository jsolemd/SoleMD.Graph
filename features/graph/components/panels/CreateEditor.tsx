"use client";

import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence } from "framer-motion";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Extension } from "@tiptap/core";
import { EMPTY_TOOLBAR_STATE, EditorToolbar } from "./editor/EditorToolbar";

export interface CreateEditorHandle {
  focus: () => void;
  flush: () => string;
  getText: () => string;
}

interface CreateEditorProps {
  content: string;
  onContentChange: (md: string) => void;
  onEmptyChange: (empty: boolean) => void;
  onSubmit?: () => void;
  ariaLabel: string;
  debounceMs?: number;
  compact?: boolean;
  showToolbar?: boolean;
  placeholder?: ReactNode;
}

export const CreateEditor = forwardRef<CreateEditorHandle, CreateEditorProps>(
  function CreateEditor(
    {
      content,
      onContentChange,
      onEmptyChange,
      onSubmit,
      ariaLabel,
      debounceMs = 300,
      compact = false,
      showToolbar = false,
      placeholder,
    },
    ref,
  ) {
    // Stable refs so extensions/callbacks don't trigger editor rebuild
    const onSubmitRef = useRef(onSubmit);
    onSubmitRef.current = onSubmit;
    const onEmptyChangeRef = useRef(onEmptyChange);
    onEmptyChangeRef.current = onEmptyChange;
    const onContentChangeRef = useRef(onContentChange);
    onContentChangeRef.current = onContentChange;
    const contentRef = useRef(content);
    contentRef.current = content;

    const editorRef = useRef<ReturnType<typeof useEditor>>(null);

    // Debounced markdown writeback
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const getMarkdown = useCallback((ed: ReturnType<typeof useEditor> | null) => {
      if (!ed) {
        return contentRef.current;
      }
      return ed.getMarkdown();
    }, []);
    const getText = useCallback(() => {
      if (!editorRef.current) {
        return contentRef.current;
      }
      return editorRef.current.getText();
    }, []);

    const flush = useCallback(() => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      const markdown = getMarkdown(editorRef.current);
      onContentChangeRef.current(markdown);
      return markdown;
    }, [getMarkdown]);

    const debouncedSync = useCallback(
      (ed: ReturnType<typeof useEditor>) => {
        if (!ed) return;
        if (debounceMs <= 0) {
          onContentChangeRef.current(getMarkdown(ed));
          return;
        }
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          debounceTimer.current = null;
          onContentChangeRef.current(getMarkdown(ed));
        }, debounceMs);
      },
      [debounceMs, getMarkdown],
    );

    const extensions = useMemo(
      () => [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        Markdown,
        Extension.create({
          name: "submitShortcut",
          addKeyboardShortcuts() {
            return {
              "Mod-Enter": () => {
                if (onSubmitRef.current) {
                  onSubmitRef.current();
                  return true;
                }
                return false;
              },
            };
          },
        }),
      ],
      [],
    );

    const editor = useEditor({
      extensions,
      content,
      contentType: "markdown",
      immediatelyRender: false,
      injectCSS: false,
      editorProps: {
        attributes: {
          "aria-label": ariaLabel,
          role: "textbox",
        },
      },
      onCreate: ({ editor: ed }) => {
        onEmptyChangeRef.current(ed.isEmpty);
      },
      onUpdate: ({ editor: ed }) => {
        onEmptyChangeRef.current(ed.isEmpty);
        debouncedSync(ed);
      },
    });

    const toolbarState = useEditorState({
      editor,
      selector: ({ editor: currentEditor }) => ({
        isParagraph: currentEditor?.isActive("paragraph") ?? false,
        isHeading1: currentEditor?.isActive("heading", { level: 1 }) ?? false,
        isHeading2: currentEditor?.isActive("heading", { level: 2 }) ?? false,
        isHeading3: currentEditor?.isActive("heading", { level: 3 }) ?? false,
        isBold: currentEditor?.isActive("bold") ?? false,
        canBold: currentEditor?.can().chain().focus().toggleBold().run() ?? false,
        isItalic: currentEditor?.isActive("italic") ?? false,
        canItalic: currentEditor?.can().chain().focus().toggleItalic().run() ?? false,
        isStrike: currentEditor?.isActive("strike") ?? false,
        canStrike: currentEditor?.can().chain().focus().toggleStrike().run() ?? false,
        isBulletList: currentEditor?.isActive("bulletList") ?? false,
        canBulletList:
          currentEditor?.can().chain().focus().toggleBulletList().run() ?? false,
        isOrderedList: currentEditor?.isActive("orderedList") ?? false,
        canOrderedList:
          currentEditor?.can().chain().focus().toggleOrderedList().run() ?? false,
        isBlockquote: currentEditor?.isActive("blockquote") ?? false,
        canBlockquote:
          currentEditor?.can().chain().focus().toggleBlockquote().run() ?? false,
        isCode: currentEditor?.isActive("code") ?? false,
        canCode: currentEditor?.can().chain().focus().toggleCode().run() ?? false,
        isCodeBlock: currentEditor?.isActive("codeBlock") ?? false,
        canCodeBlock:
          currentEditor?.can().chain().focus().toggleCodeBlock().run() ?? false,
        canHorizontalRule:
          currentEditor?.can().chain().focus().setHorizontalRule().run() ?? false,
        canUndo: currentEditor?.can().chain().focus().undo().run() ?? false,
        canRedo: currentEditor?.can().chain().focus().redo().run() ?? false,
      }),
    }) ?? EMPTY_TOOLBAR_STATE;

    editorRef.current = editor;

    // Source mode — toggle between rich text and raw markdown
    const [sourceMode, setSourceMode] = useState(false);
    const [sourceText, setSourceText] = useState("");
    const prevSourceMode = useRef(sourceMode);
    useEffect(() => {
      if (sourceMode === prevSourceMode.current) return;
      prevSourceMode.current = sourceMode;
      if (sourceMode && editor && !editor.isDestroyed) {
        // Entering source mode: snapshot editor markdown
        setSourceText(editor.getMarkdown());
      } else if (!sourceMode && editor && !editor.isDestroyed) {
        // Leaving source mode: parse raw markdown back into editor
        const json = editor.storage.markdown.manager.parse(sourceText);
        editor.commands.setContent(json);
        onEmptyChangeRef.current(editor.isEmpty);
        debouncedSync(editor);
      }
    }, [sourceMode, editor, sourceText, debouncedSync]);

    // Exit source mode when toolbar hides
    useEffect(() => {
      if (!showToolbar && sourceMode) setSourceMode(false);
    }, [showToolbar, sourceMode]);

    // Inward sync guard — only re-sync if external content truly differs
    const lastSyncedContent = useRef(content);
    useEffect(() => {
      if (!editor || editor.isDestroyed) return;
      if (content === lastSyncedContent.current) return;
      const currentMd = editor.getMarkdown();
      if (currentMd === content) {
        lastSyncedContent.current = content;
        return;
      }
      lastSyncedContent.current = content;
      editor.commands.setContent(content, { contentType: "markdown" });
      onEmptyChangeRef.current(editor.isEmpty);
    }, [content, editor]);

    // Flush on unmount
    useEffect(() => {
      return () => {
        flush();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Imperative handle
    useImperativeHandle(
      ref,
      () => ({
        focus: () => editor?.commands.focus(),
        flush,
        getText,
      }),
      [editor, flush, getText],
    );

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
        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {placeholder}
          {sourceMode ? (
            <textarea
              className="tiptap-source"
              value={sourceText}
              onChange={(e) => {
                const val = e.target.value;
                setSourceText(val);
                onEmptyChangeRef.current(val.trim().length === 0);
                onContentChangeRef.current(val);
              }}
              aria-label={`${ariaLabel} (markdown source)`}
              spellCheck={false}
            />
          ) : (
            <EditorContent editor={editor} className="tiptap-create__content" />
          )}
        </div>
      </div>
    );
  },
);
