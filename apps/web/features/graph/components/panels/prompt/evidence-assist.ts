import type { Editor } from "@/features/graph/tiptap";
import {
  type PromptInteractionCommandList,
  type PromptInteractionCommand,
  type PromptInteractionProvider,
  type PromptInteractionRequest,
  type PromptInteractionTrigger,
} from "../editor/prompt-interactions";
import { selectTextContextWindow } from "./text-context-window";

export type EvidenceAssistIntent = "support" | "refute" | "both";
export const EVIDENCE_ASSIST_PROVIDER_ID = "evidence-assist";

export interface EvidenceAssistRequest extends PromptInteractionRequest {
  providerId: typeof EVIDENCE_ASSIST_PROVIDER_ID;
  commandId: EvidenceAssistIntent;
  queryText: string;
  previewText: string;
  paragraphText: string;
}

export const EVIDENCE_ASSIST_COMMANDS: PromptInteractionCommandList<EvidenceAssistCommand> = [
  {
    id: "support",
    label: "Support",
    description: "Find studies that support the current claim.",
  },
  {
    id: "refute",
    label: "Refute",
    description: "Find studies that challenge the current claim.",
  },
];

export const EVIDENCE_ASSIST_TRIGGERS: readonly PromptInteractionTrigger[] = [
  {
    pattern: "/evidence",
    action: "menu",
    label: "/evidence",
    description: "Open evidence assist with support/refute options.",
    defaultCommandId: "support",
  },
] as const;

export interface EvidenceAssistCommand extends PromptInteractionCommand {
  id: EvidenceAssistIntent;
}

export function selectEvidenceAssistExcerpt({
  paragraphText,
  cursorOffset,
  maxSentences = 3,
  maxChars = 600,
}: {
  paragraphText: string;
  cursorOffset: number;
  maxSentences?: number;
  maxChars?: number;
}): string {
  return selectTextContextWindow({
    paragraphText,
    cursorOffset,
    maxSentences,
    maxChars,
  });
}

export function extractEvidenceAssistRequestFromEditor(
  editor: Editor,
  intent: EvidenceAssistIntent,
): EvidenceAssistRequest | null {
  const parentText = editor.state.selection.$from.parent.textContent.trim();
  const paragraphText = parentText || editor.getText().trim();
  if (!paragraphText) {
    return null;
  }

  const cursorOffset = parentText
    ? editor.state.selection.$from.parentOffset
    : paragraphText.length;
  const queryText = selectEvidenceAssistExcerpt({
    paragraphText,
    cursorOffset,
  });
  if (!queryText) {
    return null;
  }

  return {
    providerId: EVIDENCE_ASSIST_PROVIDER_ID,
    commandId: intent,
    queryText,
    previewText: buildPreviewText(queryText),
    paragraphText,
  };
}

export const EVIDENCE_ASSIST_PROVIDER: PromptInteractionProvider<EvidenceAssistRequest> =
  {
    id: EVIDENCE_ASSIST_PROVIDER_ID,
    commands: EVIDENCE_ASSIST_COMMANDS,
    triggers: EVIDENCE_ASSIST_TRIGGERS,
    buildRequest(editor, commandId) {
      if (!isEvidenceAssistIntent(commandId)) {
        return null;
      }

      return extractEvidenceAssistRequestFromEditor(editor, commandId);
    },
  };

function buildPreviewText(text: string, maxChars = 160): string {
  const normalizedText = text.trim();
  if (normalizedText.length <= maxChars) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, maxChars - 1).trimEnd()}…`;
}

function isEvidenceAssistIntent(value: string): value is EvidenceAssistIntent {
  return value === "support" || value === "refute" || value === "both";
}

export function isEvidenceAssistRequest(
  request: PromptInteractionRequest,
): request is EvidenceAssistRequest {
  return request.providerId === EVIDENCE_ASSIST_PROVIDER_ID &&
    isEvidenceAssistIntent(request.commandId);
}
