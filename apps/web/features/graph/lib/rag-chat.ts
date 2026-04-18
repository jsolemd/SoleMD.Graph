import { isTextUIPart, type UIMessage } from "ai";
import type {
  GraphRagErrorResponsePayload,
  GraphRagQueryRequestPayload,
  GraphRagQueryResponsePayload,
} from "@solemd/api-client/shared/graph-rag";

export const GRAPH_ASK_ENGINE_ERROR_DATA_PART = "data-engine-error";
export const GRAPH_ASK_EVIDENCE_RESPONSE_DATA_PART = "data-evidence-response";

export type GraphRagQueryInput = GraphRagQueryRequestPayload;

export interface GraphAskChatRequestBody
  extends Omit<GraphRagQueryInput, "query"> {
  client_request_id: number;
}

export interface GraphAskChatEvidencePayload {
  client_request_id: number;
  response: GraphRagQueryResponsePayload;
}

export interface GraphAskChatErrorPayload extends GraphRagErrorResponsePayload {
  client_request_id: number;
}

export type GraphAskChatMessage = UIMessage<
  never,
  {
    "engine-error": GraphAskChatErrorPayload;
    "evidence-response": GraphAskChatEvidencePayload;
  }
>;

export function getChatMessageText(
  message: Pick<GraphAskChatMessage, "parts"> | null | undefined,
): string {
  if (!message) {
    return "";
  }

  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
}

export function getLatestAssistantText(
  messages: GraphAskChatMessage[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") {
      continue;
    }

    const text = getChatMessageText(message).trim();
    if (text) {
      return text;
    }
  }

  return null;
}

export function extractLatestUserText(messages: GraphAskChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    const text = getChatMessageText(message).trim();
    if (text) {
      return text;
    }
  }

  return "";
}

export function extractLatestEvidenceResponse(
  messages: GraphAskChatMessage[],
): GraphRagQueryResponsePayload | null {
  return extractLatestEvidencePayload(messages)?.response ?? null;
}

export function extractLatestEvidencePayload(
  messages: GraphAskChatMessage[],
): GraphAskChatEvidencePayload | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.role !== "assistant") {
      continue;
    }

    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (part.type === GRAPH_ASK_EVIDENCE_RESPONSE_DATA_PART) {
        return part.data;
      }
    }
  }

  return null;
}

export function extractLatestEngineError(
  messages: GraphAskChatMessage[],
): GraphAskChatErrorPayload | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.role !== "assistant") {
      continue;
    }

    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (part.type === GRAPH_ASK_ENGINE_ERROR_DATA_PART) {
        return part.data;
      }
    }
  }

  return null;
}
