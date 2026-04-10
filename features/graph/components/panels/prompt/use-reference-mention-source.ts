import { useMemo, useRef } from "react";
import { fetchGraphRagQuery } from "@/features/graph/lib/detail-service";
import type { GraphBundle, GraphBundleQueries, GraphPointRecord } from "@/features/graph/types";
import type { GraphEvidenceBundle } from "@/features/graph/types/detail-service";
import type { Editor } from "@/features/graph/tiptap";
import { readEditorTextContext } from "../editor/editor-text-context";
import type {
  ReferenceMentionItem,
  ReferenceMentionSource,
} from "../editor/reference-mention-extension";
import {
  getPromptScopeCacheKey,
  resolvePromptScopeRequest,
} from "./prompt-scope-request";
import { selectTextContextWindow } from "./text-context-window";

const REFERENCE_MENTION_K = 6;
const REFERENCE_MENTION_RERANK_TOPN = 18;

interface UseReferenceMentionSourceArgs {
  bundle: GraphBundle;
  queries: GraphBundleQueries | null;
  selectedNode: GraphPointRecord | null;
  currentPointScopeSql: string | null;
  selectionScopeEnabled: boolean;
}

export function useReferenceMentionSource({
  bundle,
  queries,
  selectedNode,
  currentPointScopeSql,
  selectionScopeEnabled,
}: UseReferenceMentionSourceArgs): ReferenceMentionSource {
  const requestCacheRef = useRef<
    Map<string, Promise<readonly ReferenceMentionItem[]>>
  >(new Map());
  const scopeRequestCacheRef = useRef<Map<string, ReturnType<typeof resolvePromptScopeRequest>>>(
    new Map(),
  );

  return useMemo(
    () => ({
      getItems: async ({ query, editor }) => {
        const paragraphText = getEditorParagraphText(editor);
        if (!paragraphText) {
          return [];
        }

        const contextText = getEditorContextText({
          editor,
          paragraphText,
          query,
        });
        if (!contextText) {
          return [];
        }

        const scopeCacheKey = getPromptScopeCacheKey({
          selectionScopeEnabled,
          currentPointScopeSql,
          selectedNode,
        });
        const scopeRequest =
          scopeRequestCacheRef.current.get(scopeCacheKey) ??
          resolvePromptScopeRequest({
            selectionScopeEnabled,
            currentPointScopeSql,
            queries,
            selectedNode,
          });
        scopeRequestCacheRef.current.set(scopeCacheKey, scopeRequest);

        const requestKey = JSON.stringify({
          bundleChecksum: bundle.bundleChecksum ?? bundle.runId ?? "current",
          scopeCacheKey,
          contextText,
          query: query.trim(),
        });
        const cachedRequest = requestCacheRef.current.get(requestKey);
        if (cachedRequest) {
          return cachedRequest;
        }

        const requestPromise = scopeRequest
          .then((scope) =>
            fetchGraphRagQuery({
              bundle,
              query: composeReferenceMentionQuery({
                contextText,
                query,
              }),
              selectedNode,
              selectionGraphPaperRefs: scope.selectionGraphPaperRefs,
              scopeMode: scope.scopeMode,
              evidenceIntent: "support",
              k: REFERENCE_MENTION_K,
              rerankTopn: REFERENCE_MENTION_RERANK_TOPN,
              useLexical: true,
              generateAnswer: false,
            }),
          )
          .then((response) =>
            response.evidence_bundles
              .map(mapEvidenceBundleToMentionItem)
              .filter((item): item is ReferenceMentionItem => item !== null),
          )
          .catch(() => [])
          .then((items) => Object.freeze(items.slice(0, REFERENCE_MENTION_K)));

        requestCacheRef.current.set(requestKey, requestPromise);
        return requestPromise;
      },
    }),
    [
      bundle,
      currentPointScopeSql,
      queries,
      selectedNode,
      selectionScopeEnabled,
    ],
  );
}

function getEditorParagraphText(editor: Editor): string {
  const parentText = readEditorTextContext(editor)?.text.trim();
  if (parentText) {
    return parentText;
  }

  return editor.getText().trim();
}

function getEditorContextText({
  editor,
  paragraphText,
  query,
}: {
  editor: Editor;
  paragraphText: string;
  query: string;
}) {
  const cursorOffset =
    readEditorTextContext(editor)?.cursorOffset ?? paragraphText.length;

  return selectTextContextWindow({
    paragraphText,
    cursorOffset: Math.max(0, cursorOffset - query.length - 1),
    maxSentences: 2,
    maxChars: 420,
  });
}

function composeReferenceMentionQuery({
  contextText,
  query,
}: {
  contextText: string;
  query: string;
}) {
  const normalizedHint = query.trim();
  if (!normalizedHint) {
    return contextText;
  }

  return `${contextText}\nReference hint: ${normalizedHint}`;
}

function mapEvidenceBundleToMentionItem(
  bundle: GraphEvidenceBundle,
): ReferenceMentionItem | null {
  if (!bundle.graph_paper_ref.trim()) {
    return null;
  }

  return {
    corpusId: bundle.corpus_id,
    graphPaperRef: bundle.graph_paper_ref,
    paperId: bundle.paper_id,
    title: bundle.paper.title ?? bundle.graph_paper_ref,
    year: bundle.paper.year,
    journalName: bundle.paper.journal_name,
    snippet: bundle.snippet,
    score: bundle.score,
  };
}
