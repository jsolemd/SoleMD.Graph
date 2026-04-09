"use client";

import {
  type Dispatch,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Extension,
  Markdown,
  Plugin,
  StarterKit,
  useEditor,
  useEditorState,
  type Editor,
} from "@/features/graph/tiptap";
import { EMPTY_TOOLBAR_STATE } from "./EditorToolbar";
import {
  EVIDENCE_ASSIST_COMMANDS,
  extractEvidenceAssistRequestFromEditor,
  getEvidenceAssistDefaultCommandIndex,
  resolveEvidenceAssistTriggerMatch,
  type EvidenceAssistRequest,
} from "../prompt/evidence-assist";

export interface CreateEditorControllerProps {
  content: string;
  onContentChange: (md: string) => void;
  onEmptyChange: (empty: boolean) => void;
  onSubmit?: () => void;
  onEvidenceAssistIntent?: (request: EvidenceAssistRequest) => void;
  ariaLabel: string;
  debounceMs?: number;
  showToolbar?: boolean;
}

export interface CreateEditorControllerState {
  editor: Editor | null;
  toolbarState: typeof EMPTY_TOOLBAR_STATE;
  sourceMode: boolean;
  setSourceMode: Dispatch<SetStateAction<boolean>>;
  sourceText: string;
  editorFrameRef: RefObject<HTMLDivElement | null>;
  evidenceAssistMenuRef: RefObject<HTMLDivElement | null>;
  evidenceAssistMenu: {
    x: number;
    y: number;
    selectedIndex: number;
  } | null;
  closeEvidenceAssistMenu: () => void;
  handleEvidenceAssistMenuHover: (index: number) => void;
  handleEvidenceAssistMenuKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
  ) => void;
  handleSourceTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  submitEvidenceAssistIntent: (intent: EvidenceAssistRequest["intent"]) => void;
  flush: () => string;
  getText: () => string;
}

export function useCreateEditorController({
  content,
  onContentChange,
  onEmptyChange,
  onSubmit,
  onEvidenceAssistIntent,
  ariaLabel,
  debounceMs = 300,
  showToolbar = false,
}: CreateEditorControllerProps): CreateEditorControllerState {
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

  const editorRef = useRef<Editor | null>(null);
  const editorFrameRef = useRef<HTMLDivElement | null>(null);
  const evidenceAssistMenuRef = useRef<HTMLDivElement | null>(null);

  const [sourceMode, setSourceMode] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [evidenceAssistMenu, setEvidenceAssistMenu] = useState<{
    x: number;
    y: number;
    selectedIndex: number;
  } | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getMarkdown = useCallback((ed: Editor | null) => {
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
    (ed: Editor) => {
      if (debounceMs <= 0) {
        onContentChangeRef.current(getMarkdown(ed));
        return;
      }

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

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

  const submitEvidenceAssistIntent = useCallback(
    (intent: EvidenceAssistRequest["intent"]) => {
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
    },
    [closeEvidenceAssistMenu],
  );

  const handleEvidenceAssistMenuHover = useCallback((index: number) => {
    setEvidenceAssistMenu((current) =>
      current ? { ...current, selectedIndex: index } : current,
    );
  }, []);

  const handleEvidenceAssistMenuKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
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
        setEvidenceAssistMenu((current) =>
          current
            ? {
                ...current,
                selectedIndex:
                  (current.selectedIndex + 1) % EVIDENCE_ASSIST_COMMANDS.length,
              }
            : current,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setEvidenceAssistMenu((current) =>
          current
            ? {
                ...current,
                selectedIndex:
                  (current.selectedIndex - 1 + EVIDENCE_ASSIST_COMMANDS.length) %
                  EVIDENCE_ASSIST_COMMANDS.length,
              }
            : current,
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        submitEvidenceAssistIntent(
          EVIDENCE_ASSIST_COMMANDS[evidenceAssistMenu.selectedIndex].intent,
        );
      }
    },
    [closeEvidenceAssistMenu, evidenceAssistMenu, submitEvidenceAssistIntent],
  );

  const handleSourceTextChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      setSourceText(nextValue);
      onEmptyChangeRef.current(nextValue.trim().length === 0);
      onContentChangeRef.current(nextValue);
    },
    [],
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

                  if (!editorFrameRef.current) {
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

                  const cursorCoordinates = currentEditor.view.coordsAtPos(anchorPos);
                  const frameBounds = editorFrameRef.current.getBoundingClientRect();

                  setEvidenceAssistMenu({
                    x: cursorCoordinates.left - frameBounds.left,
                    y: cursorCoordinates.bottom - frameBounds.top + 8,
                    selectedIndex: getEvidenceAssistDefaultCommandIndex(
                      triggerMatch.trigger.defaultIntent,
                    ),
                  });
                  return true;
                },
              },
            }),
          ];
        },
      }),
    ],
    [submitEvidenceAssistIntent],
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

  const lastSyncedContent = useRef(content);
  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }

    if (content === lastSyncedContent.current) {
      return;
    }

    const currentMd = editor.getMarkdown();
    if (currentMd === content) {
      lastSyncedContent.current = content;
      return;
    }

    lastSyncedContent.current = content;
    editor.commands.setContent(content, { contentType: "markdown" });
    onEmptyChangeRef.current(editor.isEmpty);
  }, [content, editor]);

  useEffect(() => {
    if (!showToolbar && sourceMode) {
      setSourceMode(false);
    }
  }, [showToolbar, sourceMode]);

  const prevSourceMode = useRef(sourceMode);
  useEffect(() => {
    if (sourceMode === prevSourceMode.current) {
      return;
    }

    prevSourceMode.current = sourceMode;

    const currentEditor = editorRef.current;
    if (!currentEditor || currentEditor.isDestroyed) {
      return;
    }

    if (sourceMode) {
      setSourceText(currentEditor.getMarkdown());
      return;
    }

    const json = currentEditor.storage.markdown.manager.parse(sourceText);
    currentEditor.commands.setContent(json);
    onEmptyChangeRef.current(currentEditor.isEmpty);
    debouncedSync(currentEditor);
  }, [debouncedSync, sourceMode, sourceText]);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  return {
    editor,
    toolbarState,
    sourceMode,
    setSourceMode,
    sourceText,
    editorFrameRef,
    evidenceAssistMenuRef,
    evidenceAssistMenu,
    closeEvidenceAssistMenu,
    handleEvidenceAssistMenuHover,
    handleEvidenceAssistMenuKeyDown,
    handleSourceTextChange,
    submitEvidenceAssistIntent,
    flush,
    getText,
  };
}
