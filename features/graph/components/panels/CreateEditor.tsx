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
import { Plugin } from "@tiptap/pm/state";
import { EMPTY_TOOLBAR_STATE, EditorToolbar } from "./editor/EditorToolbar";
import {
  EVIDENCE_ASSIST_COMMANDS,
  extractEvidenceAssistRequestFromEditor,
  getEvidenceAssistDefaultCommandIndex,
  resolveEvidenceAssistTriggerMatch,
  type EvidenceAssistRequest,
  type EvidenceAssistTrigger,
} from "./prompt/evidence-assist";

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
  onEvidenceAssistIntent?: (request: EvidenceAssistRequest) => void;
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
      onEvidenceAssistIntent,
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
    const onEvidenceAssistIntentRef = useRef(onEvidenceAssistIntent);
    onEvidenceAssistIntentRef.current = onEvidenceAssistIntent;
    const contentRef = useRef(content);
    contentRef.current = content;

    const editorRef = useRef<ReturnType<typeof useEditor>>(null);
    const editorFrameRef = useRef<HTMLDivElement | null>(null);
    const evidenceAssistMenuRef = useRef<HTMLDivElement | null>(null);

    const [evidenceAssistMenu, setEvidenceAssistMenu] = useState<{
      x: number;
      y: number;
      selectedIndex: number;
    } | null>(null);

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

    const closeEvidenceAssistMenu = useCallback(() => {
      setEvidenceAssistMenu(null);
    }, []);

    const openEvidenceAssistMenu = useCallback((
      ed: ReturnType<typeof useEditor>,
      from: number,
      trigger: EvidenceAssistTrigger,
      deletePrefixChars = 0,
    ) => {
      if (!ed || !editorFrameRef.current || !onEvidenceAssistIntentRef.current) {
        return;
      }
      const anchorPos = Math.max(1, from - deletePrefixChars);
      if (deletePrefixChars > 0) {
        ed
          .chain()
          .focus()
          .deleteRange({ from: Math.max(0, from - deletePrefixChars), to: from })
          .run();
      }

      const cursorCoordinates = ed.view.coordsAtPos(anchorPos);
      const frameBounds = editorFrameRef.current.getBoundingClientRect();

      setEvidenceAssistMenu({
        x: cursorCoordinates.left - frameBounds.left,
        y: cursorCoordinates.bottom - frameBounds.top + 8,
        selectedIndex: getEvidenceAssistDefaultCommandIndex(trigger.defaultIntent),
      });
    }, []);

    const submitEvidenceAssistIntent = useCallback((intent: EvidenceAssistRequest["intent"]) => {
      const ed = editorRef.current;
      const onEvidenceAssist = onEvidenceAssistIntentRef.current;

      closeEvidenceAssistMenu();
      if (!ed || !onEvidenceAssist) {
        return;
      }

      const request = extractEvidenceAssistRequestFromEditor(ed, intent);
      ed.commands.focus();
      if (!request) {
        return;
      }

      onEvidenceAssist(request);
    }, [closeEvidenceAssistMenu]);

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
        Extension.create({
          name: "evidenceAssistTrigger",
          addProseMirrorPlugins() {
            return [
              new Plugin({
                props: {
                  handleTextInput: (_view, from, _to, text) => {
                    if (!onEvidenceAssistIntentRef.current) {
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
                    const triggerMatch = resolveEvidenceAssistTriggerMatch({
                      textBeforeCursor,
                      insertedText: text,
                    });
                    if (!triggerMatch) {
                      return false;
                    }

                    if (triggerMatch.trigger.action === "intent") {
                      currentEditor
                        .chain()
                        .focus()
                        .deleteRange({
                          from: Math.max(0, from - triggerMatch.deletePrefixChars),
                          to: from,
                        })
                        .run();
                      submitEvidenceAssistIntent(triggerMatch.trigger.defaultIntent);
                      return true;
                    }

                    openEvidenceAssistMenu(
                      currentEditor,
                      from,
                      triggerMatch.trigger,
                      triggerMatch.deletePrefixChars,
                    );
                    return true;
                  },
                },
              }),
            ];
          },
        }),
      ],
      [openEvidenceAssistMenu, submitEvidenceAssistIntent],
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
      editor: showToolbar ? editor : null,
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

    useEffect(() => {
      if (sourceMode && evidenceAssistMenu) {
        closeEvidenceAssistMenu();
      }
    }, [closeEvidenceAssistMenu, evidenceAssistMenu, sourceMode]);

    useEffect(() => {
      if (!evidenceAssistMenuRef.current) {
        return;
      }

      evidenceAssistMenuRef.current.focus();
    }, [evidenceAssistMenu]);

    useEffect(() => {
      if (!evidenceAssistMenu) {
        return;
      }

      const handlePointerDown = (event: PointerEvent) => {
        if (!evidenceAssistMenuRef.current?.contains(event.target as Node)) {
          closeEvidenceAssistMenu();
        }
      };

      window.addEventListener("pointerdown", handlePointerDown);
      return () => {
        window.removeEventListener("pointerdown", handlePointerDown);
      };
    }, [closeEvidenceAssistMenu, evidenceAssistMenu]);

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
        <div
          ref={editorFrameRef}
          style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
        >
          {placeholder}
          {evidenceAssistMenu && (
            <div
              ref={evidenceAssistMenuRef}
              tabIndex={-1}
              onKeyDown={(event) => {
                if (!evidenceAssistMenu) {
                  return;
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  closeEvidenceAssistMenu();
                  editorRef.current?.commands.focus();
                  return;
                }

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setEvidenceAssistMenu((current) => current
                    ? {
                        ...current,
                        selectedIndex:
                          (current.selectedIndex + 1) % EVIDENCE_ASSIST_COMMANDS.length,
                      }
                    : current);
                  return;
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setEvidenceAssistMenu((current) => current
                    ? {
                        ...current,
                        selectedIndex:
                          (current.selectedIndex - 1 + EVIDENCE_ASSIST_COMMANDS.length) %
                          EVIDENCE_ASSIST_COMMANDS.length,
                      }
                    : current);
                  return;
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  submitEvidenceAssistIntent(
                    EVIDENCE_ASSIST_COMMANDS[evidenceAssistMenu.selectedIndex].intent,
                  );
                }
              }}
              className="rounded-2xl px-2 py-2"
              style={{
                position: "absolute",
                top: evidenceAssistMenu.y,
                left: evidenceAssistMenu.x,
                minWidth: 240,
                maxWidth: 280,
                zIndex: 5,
                backgroundColor: "var(--graph-prompt-bg)",
                border: "1px solid var(--graph-prompt-border)",
                boxShadow: "var(--graph-prompt-shadow)",
              }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                {EVIDENCE_ASSIST_COMMANDS.map((command, index) => {
                  const isActive = index === evidenceAssistMenu.selectedIndex;
                  return (
                    <button
                      key={command.intent}
                      type="button"
                      className="rounded-xl px-3 py-2 text-left"
                      onMouseEnter={() => {
                        setEvidenceAssistMenu((current) => current
                          ? { ...current, selectedIndex: index }
                          : current);
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        submitEvidenceAssistIntent(command.intent);
                      }}
                      style={{
                        backgroundColor: isActive ? "var(--mode-accent-subtle)" : "transparent",
                        border: "1px solid var(--mode-accent-border)",
                        color: "var(--graph-prompt-text)",
                      }}
                    >
                      <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                        {command.label}
                      </div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          lineHeight: 1.4,
                          color: "var(--graph-prompt-placeholder)",
                        }}
                      >
                        {command.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
