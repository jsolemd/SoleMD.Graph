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
import { motion, AnimatePresence } from "framer-motion";
import {
  Bold,
  Braces,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
} from "lucide-react";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Extension } from "@tiptap/core";

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

type ToolbarButtonProps = {
  icon: ReactNode;
  title: string;
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

const EMPTY_TOOLBAR_STATE = {
  isParagraph: false,
  isHeading1: false,
  isHeading2: false,
  isHeading3: false,
  isBold: false,
  canBold: false,
  isItalic: false,
  canItalic: false,
  isStrike: false,
  canStrike: false,
  isBulletList: false,
  canBulletList: false,
  isOrderedList: false,
  canOrderedList: false,
  isBlockquote: false,
  canBlockquote: false,
  isCode: false,
  canCode: false,
  isCodeBlock: false,
  canCodeBlock: false,
  canHorizontalRule: false,
  canUndo: false,
  canRedo: false,
};

function ToolbarButton({
  icon,
  title,
  isActive = false,
  disabled = false,
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={[
        "tiptap-tool",
        isActive ? "is-active" : "",
        disabled ? "is-disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
    >
      {icon}
    </button>
  );
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
            <motion.div
              key="toolbar"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: "hidden", flexShrink: 0 }}
            >
          <div className="tiptap-toolbar" role="toolbar" aria-label={`${ariaLabel} formatting tools`}>
            <div className="tiptap-toolbar-group">
              <ToolbarButton
                icon={<Pilcrow size={15} strokeWidth={1.9} />}
                title="Paragraph"
                isActive={toolbarState.isParagraph}
                onClick={() => editor.chain().focus().setParagraph().run()}
              />
              <ToolbarButton
                icon={<Heading1 size={15} strokeWidth={1.9} />}
                title="Heading 1"
                isActive={toolbarState.isHeading1}
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              />
              <ToolbarButton
                icon={<Heading2 size={15} strokeWidth={1.9} />}
                title="Heading 2"
                isActive={toolbarState.isHeading2}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              />
              <ToolbarButton
                icon={<Heading3 size={15} strokeWidth={1.9} />}
                title="Heading 3"
                isActive={toolbarState.isHeading3}
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              />
            </div>
            <div className="tiptap-toolbar-group">
              <ToolbarButton
                icon={<Bold size={15} strokeWidth={2} />}
                title="Bold"
                isActive={toolbarState.isBold}
                disabled={!toolbarState.canBold}
                onClick={() => editor.chain().focus().toggleBold().run()}
              />
              <ToolbarButton
                icon={<Italic size={15} strokeWidth={2} />}
                title="Italic"
                isActive={toolbarState.isItalic}
                disabled={!toolbarState.canItalic}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              />
              <ToolbarButton
                icon={<Strikethrough size={15} strokeWidth={2} />}
                title="Strike"
                isActive={toolbarState.isStrike}
                disabled={!toolbarState.canStrike}
                onClick={() => editor.chain().focus().toggleStrike().run()}
              />
            </div>
            <div className="tiptap-toolbar-group">
              <ToolbarButton
                icon={<List size={15} strokeWidth={1.9} />}
                title="Bullet list"
                isActive={toolbarState.isBulletList}
                disabled={!toolbarState.canBulletList}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
              />
              <ToolbarButton
                icon={<ListOrdered size={15} strokeWidth={1.9} />}
                title="Ordered list"
                isActive={toolbarState.isOrderedList}
                disabled={!toolbarState.canOrderedList}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
              />
              <ToolbarButton
                icon={<Quote size={15} strokeWidth={1.9} />}
                title="Blockquote"
                isActive={toolbarState.isBlockquote}
                disabled={!toolbarState.canBlockquote}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
              />
            </div>
            <div className="tiptap-toolbar-group">
              <ToolbarButton
                icon={<Code2 size={15} strokeWidth={1.9} />}
                title="Inline code"
                isActive={toolbarState.isCode}
                disabled={!toolbarState.canCode}
                onClick={() => editor.chain().focus().toggleCode().run()}
              />
              <ToolbarButton
                icon={<SquareCode size={15} strokeWidth={1.9} />}
                title="Code block"
                isActive={toolbarState.isCodeBlock}
                disabled={!toolbarState.canCodeBlock}
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              />
              <ToolbarButton
                icon={<Minus size={15} strokeWidth={1.9} />}
                title="Horizontal rule"
                disabled={!toolbarState.canHorizontalRule}
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
              />
            </div>
            <div className="tiptap-toolbar-group">
              <ToolbarButton
                icon={<Undo2 size={15} strokeWidth={1.9} />}
                title="Undo"
                disabled={!toolbarState.canUndo}
                onClick={() => editor.chain().focus().undo().run()}
              />
              <ToolbarButton
                icon={<Redo2 size={15} strokeWidth={1.9} />}
                title="Redo"
                disabled={!toolbarState.canRedo}
                onClick={() => editor.chain().focus().redo().run()}
              />
            </div>
            <div className="tiptap-toolbar-group">
              <ToolbarButton
                icon={<Braces size={15} strokeWidth={1.9} />}
                title={sourceMode ? "Rich text" : "Markdown source"}
                isActive={sourceMode}
                onClick={() => setSourceMode((s) => !s)}
              />
            </div>
          </div>
            </motion.div>
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
