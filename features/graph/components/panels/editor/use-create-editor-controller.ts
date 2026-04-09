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
  StarterKit,
  useEditor,
  useEditorState,
  type Editor,
} from "@/features/graph/tiptap";
import { EMPTY_TOOLBAR_STATE } from "./EditorToolbar";
import {
  type PromptInteractionRequest,
  type PromptInteractionProvider,
} from "./prompt-interactions";
import {
  createPromptInteractionExtension,
  type PromptInteractionMenuState,
} from "./prompt-interaction-extension";

export interface CreateEditorControllerProps {
  content: string;
  onContentChange: (md: string) => void;
  onEmptyChange: (empty: boolean) => void;
  onSubmit?: () => void;
  onPromptInteraction?: (request: PromptInteractionRequest) => void;
  promptInteractionProviders?: readonly PromptInteractionProvider<PromptInteractionRequest>[];
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
  promptInteractionMenuRef: RefObject<HTMLDivElement | null>;
  promptInteractionMenu: PromptInteractionMenuState | null;
  closePromptInteractionMenu: () => void;
  handlePromptInteractionMenuHover: (index: number) => void;
  handlePromptInteractionMenuKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
  ) => void;
  handleSourceTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  submitPromptInteractionCommand: (commandId: string) => void;
  flush: () => string;
  getText: () => string;
}

export function useCreateEditorController({
  content,
  onContentChange,
  onEmptyChange,
  onSubmit,
  onPromptInteraction,
  promptInteractionProviders,
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
  const onPromptInteractionRef = useRef(onPromptInteraction);
  onPromptInteractionRef.current = onPromptInteraction;
  const promptInteractionProvidersRef = useRef(promptInteractionProviders);
  promptInteractionProvidersRef.current = promptInteractionProviders;
  const contentRef = useRef(content);
  contentRef.current = content;

  const editorRef = useRef<Editor | null>(null);
  const editorFrameRef = useRef<HTMLDivElement | null>(null);
  const promptInteractionMenuRef = useRef<HTMLDivElement | null>(null);
  const activePromptInteractionProviderRef =
    useRef<PromptInteractionProvider<PromptInteractionRequest> | null>(null);

  const [sourceMode, setSourceMode] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [promptInteractionMenu, setPromptInteractionMenu] =
    useState<PromptInteractionMenuState | null>(null);

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

  const closePromptInteractionMenu = useCallback(() => {
    activePromptInteractionProviderRef.current = null;
    setPromptInteractionMenu(null);
  }, []);

  const submitPromptInteractionCommand = useCallback(
    (
      commandId: string,
      providerOverride?: PromptInteractionProvider<PromptInteractionRequest>,
    ) => {
      const ed = editorRef.current;
      const onPromptInteraction = onPromptInteractionRef.current;
      const provider =
        providerOverride ?? activePromptInteractionProviderRef.current;

      closePromptInteractionMenu();
      if (!ed || !onPromptInteraction || !provider || provider.commands.length === 0) {
        return;
      }

      const request = provider.buildRequest(ed, commandId);
      ed.commands.focus();
      if (!request) {
        return;
      }

      onPromptInteraction(request);
    },
    [closePromptInteractionMenu],
  );

  const handlePromptInteractionMenuHover = useCallback((index: number) => {
    setPromptInteractionMenu((current) =>
      current ? { ...current, selectedIndex: index } : current,
    );
  }, []);

  const handlePromptInteractionMenuKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!promptInteractionMenu) {
        return;
      }

      if (promptInteractionMenu.provider.commands.length === 0) {
        closePromptInteractionMenu();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closePromptInteractionMenu();
        editorRef.current?.commands.focus();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setPromptInteractionMenu((current) =>
          current
            ? {
                ...current,
                selectedIndex:
                  (current.selectedIndex + 1) % current.provider.commands.length,
              }
            : current,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setPromptInteractionMenu((current) =>
          current
            ? {
                ...current,
                selectedIndex:
                  (current.selectedIndex - 1 + current.provider.commands.length) %
                  current.provider.commands.length,
              }
            : current,
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        submitPromptInteractionCommand(
          promptInteractionMenu.provider.commands[promptInteractionMenu.selectedIndex].id,
        );
      }
    },
    [closePromptInteractionMenu, promptInteractionMenu, submitPromptInteractionCommand],
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
      createPromptInteractionExtension({
        editorRef,
        editorFrameRef,
        onPromptInteractionRef,
        promptInteractionProvidersRef,
        activePromptInteractionProviderRef,
        setPromptInteractionMenu,
        submitPromptInteractionCommand,
      }),
    ],
    [submitPromptInteractionCommand],
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
    if (sourceMode && promptInteractionMenu) {
      closePromptInteractionMenu();
    }
  }, [closePromptInteractionMenu, promptInteractionMenu, sourceMode]);

  useEffect(() => {
    if (!promptInteractionMenuRef.current) {
      return;
    }

    promptInteractionMenuRef.current.focus();
  }, [promptInteractionMenu]);

  useEffect(() => {
    if (!promptInteractionMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!promptInteractionMenuRef.current?.contains(event.target as Node)) {
        closePromptInteractionMenu();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [closePromptInteractionMenu, promptInteractionMenu]);

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
    promptInteractionMenuRef,
    promptInteractionMenu,
    closePromptInteractionMenu,
    handlePromptInteractionMenuHover,
    handlePromptInteractionMenuKeyDown,
    handleSourceTextChange,
    submitPromptInteractionCommand,
    flush,
    getText,
  };
}
