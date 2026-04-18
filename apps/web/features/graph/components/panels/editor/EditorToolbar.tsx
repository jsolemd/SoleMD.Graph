"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
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
import type { Editor } from "@/features/graph/tiptap";

type ToolbarButtonProps = {
  icon: ReactNode;
  title: string;
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export const EMPTY_TOOLBAR_STATE = {
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

export function EditorToolbar({
  editor,
  toolbarState,
  sourceMode,
  setSourceMode,
  ariaLabel,
}: {
  editor: Editor;
  toolbarState: typeof EMPTY_TOOLBAR_STATE;
  sourceMode: boolean;
  setSourceMode: React.Dispatch<React.SetStateAction<boolean>>;
  ariaLabel: string;
}) {
  return (
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
  );
}
