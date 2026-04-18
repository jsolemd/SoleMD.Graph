"use client";

import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type MotionValue } from "framer-motion";
import { useViewportSize } from "@mantine/hooks";
import { useGraphInstance } from "@/features/graph/cosmograph";
import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import {
  selectBottomObstacles,
  selectBottomClearance,
} from "@/features/graph/stores/dashboard-store";
import { getModeConfig } from "@/features/graph/lib/modes";
import { MODE_EXAMPLES, pickRandom } from "@/features/graph/lib/mode-examples";
import type {
  GraphBundle,
  GraphBundleQueries,
  GraphEntityOverlayRef,
  GraphPointRecord,
} from "@/features/graph/types";
import { useTypewriter } from "@/features/graph/hooks/use-typewriter";
import { getSelectionScopeToggleLabel, isSelectionScopeAvailable, isSelectionScopeEnabled } from "./selection-scope";
import { useFocusedAvoidanceRects } from "./use-focused-avoidance-rects";
import { usePromptPosition } from "./use-prompt-position";
import { useRagQuery } from "./use-rag-query";
import { useReferenceMentionSource } from "./use-reference-mention-source";
import {
  EVIDENCE_ASSIST_PROVIDER,
  isEvidenceAssistRequest,
} from "./evidence-assist";
import type { PromptInteractionRequest } from "../editor/prompt-interactions";
import type { ReferenceMentionSource } from "../editor/reference-mention-extension";
import {
  createPromptInteractionHandler,
  dispatchPromptInteraction,
  getPromptInteractionProviders,
} from "./prompt-interaction-runtime";
import { useEntityOverlaySync } from "@/features/graph/components/entities/use-entity-overlay-sync";
import { densityCssPx } from "@/lib/density";
import {
  VW_RATIO,
  cardWidth,
} from "./constants";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import { getEntityWikiSlug } from "@/features/wiki/lib/entity-wiki-route";
import type { GraphEntityRef } from "@/features/graph/types/entity-service";
import { useShellVariantContext } from "@/features/graph/components/shell/ShellVariantContext";
import { resolveMobileBottomStack } from "@/features/graph/components/shell/use-mobile-bottom-stack";

export interface PromptBoxControllerProps {
  bundle: GraphBundle;
  queries: GraphBundleQueries | null;
}

export interface PromptBoxControllerState {
  mode: "ask" | "create" | string;
  activeMode: ReturnType<typeof getModeConfig>;
  isCreate: boolean;
  isAsk: boolean;
  isCollapsed: boolean;
  isMaximized: boolean;
  isCreateMaximized: boolean;
  activePromptValue: string;
  hasInput: boolean;
  showFormattingTools: boolean;
  selectionScopeAvailable: boolean;
  selectionOnlyEnabled: boolean;
  selectionScopeToggleLabel: string;
  selectedNode: GraphPointRecord | null;
  typewriterText: string;
  typewriterIsLast: boolean;
  isSubmitting: boolean;
  handleSubmit: ReturnType<typeof useRagQuery>["handleSubmit"];
  promptInteractionProviders: ReturnType<typeof getPromptInteractionProviders>;
  referenceMentionSource: ReferenceMentionSource;
  handlePromptInteraction: (request: PromptInteractionRequest) => void;
  handleShowEntityOnGraph: (entityRef: GraphEntityOverlayRef) => void;
  handleOpenEntityInWiki: (entity: GraphEntityRef) => void;
  clearRag: ReturnType<typeof useRagQuery>["clearRag"];
  handlePromptContentChange: (markdown: string) => void;
  handlePromptEmptyChange: (empty: boolean) => void;
  handleToggleFormattingTools: () => void;
  handleToggleSelectionScope: () => void;
  stepPromptUp: () => void;
  stepPromptDown: () => void;
  handlePillClick: () => void;
  handlePillKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  editorRef: RefObject<{ focus: () => void; flush: () => string; getText: () => string } | null>;
  cardRef: RefObject<HTMLDivElement | null>;
  dragX: ReturnType<typeof usePromptPosition>["dragX"];
  dragY: ReturnType<typeof usePromptPosition>["dragY"];
  cardHeight: MotionValue<number>;
  heightOverride: boolean;
  isFullHeightMode: boolean;
  normalWidth: string;
}

export function usePromptBoxController({
  bundle,
  queries,
}: PromptBoxControllerProps): PromptBoxControllerState {
  const shellVariant = useShellVariantContext();
  const mode = useGraphStore((s) => s.mode);
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const focusedPointIndex = useGraphStore((s) => s.focusedPointIndex);
  const focusedPointRevision = useGraphStore((s) => s.focusedPointRevision);
  const cameraSettledRevision = useGraphStore((s) => s.cameraSettledRevision);
  const writeContent = useDashboardStore((s) => s.writeContent);
  const setWriteContent = useDashboardStore((s) => s.setWriteContent);
  const panelsVisible = useDashboardStore((s) => s.panelsVisible);
  const promptMode = useDashboardStore((s) => s.promptMode);
  const stepPromptDown = useDashboardStore((s) => s.stepPromptDown);
  const stepPromptUp = useDashboardStore((s) => s.stepPromptUp);
  const expandPrompt = useDashboardStore((s) => s.expandPrompt);
  const selectedPointCount = useDashboardStore((s) => s.selectedPointCount);
  const setSelectedPointCount = useDashboardStore((s) => s.setSelectedPointCount);
  const activeSelectionSourceId = useDashboardStore((s) => s.activeSelectionSourceId);
  const setActiveSelectionSourceId = useDashboardStore((s) => s.setActiveSelectionSourceId);
  const openPanel = useDashboardStore((s) => s.openPanel);
  const openOnlyPanel = useDashboardStore((s) => s.openOnlyPanel);
  const setPanelsVisible = useDashboardStore((s) => s.setPanelsVisible);
  const currentPointScopeSql = useDashboardStore((s) => s.currentPointScopeSql);
  const bottomObstacles = useDashboardStore(selectBottomObstacles);
  const desktopBottomClearance = useDashboardStore(selectBottomClearance);
  const activeMode = getModeConfig(mode);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-pick on mode change
  const examples = useMemo(() => [...pickRandom(MODE_EXAMPLES[mode], 2), `${activeMode.label} with the knowledge graph...`], [mode]);
  const [hasInput, setHasInput] = useState(false);
  const { text: typewriterText, isLast: typewriterIsLast } = useTypewriter(examples, {
    enabled: !hasInput && promptMode !== "collapsed",
  });
  const askPromptValueRef = useRef("");
  const [showFormattingTools, setShowFormattingTools] = useState(false);
  const [selectionScopeManuallyDisabled, setSelectionScopeManuallyDisabled] = useState(false);
  const { width: vw, height: vh } = useViewportSize();
  const editorRef = useRef<{ focus: () => void; flush: () => string; getText: () => string } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cosmograph = useGraphInstance();
  const isCreate = mode === "create";
  const isAsk = mode === "ask";
  const isCollapsed = promptMode === "collapsed";
  const isMaximized = promptMode === "maximized";
  const isCreateMaximized = isCreate && isMaximized;
  const bottomClearance = shellVariant === "mobile"
    ? resolveMobileBottomStack(bottomObstacles).bottomClearance
    : desktopBottomClearance;
  const activePromptValue = isCreate ? writeContent : askPromptValueRef.current;
  const selectionScopeAvailable = isSelectionScopeAvailable({
    hasQueries: Boolean(queries),
    currentPointScopeSql,
    selectedPointCount,
    hasSelectedNode: Boolean(selectedNode),
    activeSelectionSourceId,
  });
  const selectionOnlyEnabled = isSelectionScopeEnabled({
    available: selectionScopeAvailable,
    manuallyDisabled: selectionScopeManuallyDisabled,
  });
  const referenceMentionSource = useReferenceMentionSource({
    bundle,
    queries,
    selectedNode,
    currentPointScopeSql,
    selectionScopeEnabled: selectionOnlyEnabled,
  });

  const {
    syncEntityOverlayRefs,
    clearEntityOverlaySelection,
  } = useEntityOverlaySync({
    bundle,
    queries,
    setSelectedPointCount,
    setActiveSelectionSourceId,
    activeSelectionSourceId,
  });

  const handleShowEntityOnGraph = useCallback(
    (entityRef: GraphEntityOverlayRef) => {
      syncEntityOverlayRefs([entityRef]);
    },
    [syncEntityOverlayRefs],
  );

  const handleOpenEntityInWiki = useCallback(
    (entity: GraphEntityRef) => {
      setPanelsVisible(true);
      if (shellVariant === "mobile") {
        openOnlyPanel("wiki");
      } else {
        openPanel("wiki");
      }
      useWikiStore.getState().navigateToPage(getEntityWikiSlug(entity));
    },
    [openOnlyPanel, openPanel, setPanelsVisible, shellVariant],
  );

  const {
    isSubmitting,
    handleSubmit: submitRagQuery,
    runEvidenceAssistQuery,
    clearRag,
  } = useRagQuery({
    bundle,
    queries,
    isAsk,
    selectedNode,
    currentPointScopeSql,
    selectionScopeEnabled: selectionOnlyEnabled,
    activeSelectionSourceId,
    setSelectedPointCount,
    setActiveSelectionSourceId,
    getPromptText: useCallback(
      () =>
        editorRef.current?.getText() ??
        (isCreate ? writeContent : askPromptValueRef.current),
      [isCreate, writeContent],
    ),
  });

  const focusedLabelText =
    selectedNode?.displayLabel ??
    selectedNode?.paperTitle ??
    selectedNode?.clusterLabel ??
    null;
  const avoidRects = useFocusedAvoidanceRects({
    enabled: Boolean(cosmograph) && focusedPointIndex != null && !isCollapsed && !isMaximized,
    focusedPointIndex,
    focusSessionRevision: focusedPointRevision,
    cameraSettledRevision,
    labelText: focusedLabelText,
  });
  const normalCardWidth = cardWidth(vw);

  const {
    dragX,
    dragY,
    cardHeight,
    heightOverride,
    isFullHeightMode,
  } = usePromptPosition({
    isCreate,
    normalCardWidth,
    promptMode,
    panelsVisible,
    bottomClearance,
    avoidRects,
    vw,
    vh,
    cardRef,
  });

  const selectionScopeToggleLabel = getSelectionScopeToggleLabel({
    hasQueries: Boolean(queries),
    currentPointScopeSql,
    selectedPointCount,
    hasSelectedNode: Boolean(selectedNode),
    activeSelectionSourceId,
  });

  useEffect(() => {
    if (!selectionScopeAvailable) {
      setSelectionScopeManuallyDisabled(false);
    }
  }, [selectionScopeAvailable]);

  const previousModeRef = useRef(mode);

  useEffect(() => {
    if (previousModeRef.current === mode) {
      return;
    }

    previousModeRef.current = mode;
    editorRef.current?.flush();
    clearRag();
    setHasInput(
      mode === "create"
        ? writeContent.length > 0
        : askPromptValueRef.current.length > 0,
    );

    const focusHandle = globalThis.setTimeout(() => {
      editorRef.current?.focus();
    }, 100);

    return () => {
      globalThis.clearTimeout(focusHandle);
    };
  }, [mode, writeContent, clearRag]);

  const handlePillClick = useCallback(() => {
    expandPrompt();
    setTimeout(() => editorRef.current?.focus(), 100);
  }, [expandPrompt]);

  const handlePillKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handlePillClick();
      }
    },
    [handlePillClick],
  );

  const handlePromptContentChange = useCallback(
    (markdown: string) => {
      if (isCreate) {
        setWriteContent(markdown);
        return;
      }

      askPromptValueRef.current = markdown;
    },
    [isCreate, setWriteContent],
  );

  const handlePromptEmptyChange = useCallback((empty: boolean) => {
    setHasInput(!empty);
  }, []);

  const handleToggleFormattingTools = useCallback(() => {
    setShowFormattingTools((current) => !current);
  }, []);

  const handleToggleSelectionScope = useCallback(() => {
    if (!selectionScopeAvailable) {
      return;
    }

    setSelectionScopeManuallyDisabled((current) => !current);
  }, [selectionScopeAvailable]);

  const promptInteractionHandlers = useMemo(
    () =>
      [
        createPromptInteractionHandler({
          provider: EVIDENCE_ASSIST_PROVIDER,
          matches: isEvidenceAssistRequest,
          handle: runEvidenceAssistQuery,
        }),
      ] as const,
    [runEvidenceAssistQuery],
  );

  const promptInteractionProviders = useMemo(
    () => getPromptInteractionProviders(promptInteractionHandlers),
    [promptInteractionHandlers],
  );

  const handlePromptInteraction = useCallback(
    (request: PromptInteractionRequest) => {
      void dispatchPromptInteraction(promptInteractionHandlers, request);
    },
    [promptInteractionHandlers],
  );

  const handleSubmit = useCallback(() => {
    clearEntityOverlaySelection();
    submitRagQuery();
  }, [clearEntityOverlaySelection, submitRagQuery]);

  const normalWidth = vw === 0
    ? `min(${densityCssPx(560)}, ${VW_RATIO * 100}vw)`
    : `${normalCardWidth}px`;

  return {
    mode,
    activeMode,
    isCreate,
    isAsk,
    isCollapsed,
    isMaximized,
    isCreateMaximized,
    activePromptValue,
    hasInput,
    showFormattingTools,
    selectionScopeAvailable,
    selectionOnlyEnabled,
    selectionScopeToggleLabel,
    selectedNode,
    typewriterText,
    typewriterIsLast,
    isSubmitting,
    handleSubmit,
    promptInteractionProviders,
    referenceMentionSource,
    handlePromptInteraction,
    handleShowEntityOnGraph,
    handleOpenEntityInWiki,
    clearRag,
    handlePromptContentChange,
    handlePromptEmptyChange,
    handleToggleFormattingTools,
    handleToggleSelectionScope,
    stepPromptUp,
    stepPromptDown,
    handlePillClick,
    handlePillKeyDown,
    editorRef,
    cardRef,
    dragX,
    dragY,
    cardHeight,
    heightOverride,
    isFullHeightMode,
    normalWidth,
  };
}
