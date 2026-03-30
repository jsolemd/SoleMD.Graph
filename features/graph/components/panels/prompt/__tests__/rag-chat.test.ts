import type { GraphRagQueryResponsePayload } from "@/features/graph/types";
import {
  extractLatestEvidenceResponse,
  extractLatestUserText,
  getLatestAssistantText,
  type GraphAskChatMessage,
} from "@/features/graph/lib/rag-chat";

function createResponse(query: string): GraphRagQueryResponsePayload {
  return {
    query,
    graph_signals: [],
    results: [],
    evidence_bundles: [],
    retrieval_channels: [],
    meta: {
      request_id: `req:${query}`,
      generated_at: "2026-03-28T00:00:00Z",
      duration_ms: 1,
      cache_control: "no-store",
      retrieval_version: "test",
    },
    release: {
      graph_release_id: "bundle-checksum",
      graph_run_id: "run-id",
      bundle_checksum: "bundle-checksum",
      graph_name: "cosmograph",
      layer_key: "paper",
      node_kind: "paper",
      is_current: true,
    },
    selected_layer_key: null,
    selected_node_id: null,
    selected_graph_paper_ref: null,
    selected_paper_id: null,
    selection_graph_paper_refs: [],
    selected_cluster_id: null,
    scope_mode: "global",
    answer: `Answer for ${query}`,
    answer_model: "test-model",
    answer_graph_paper_refs: [],
    grounded_answer: null,
  };
}

describe("rag-chat helpers", () => {
  it("extracts the latest user text from UI chat messages", () => {
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "earlier question" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "earlier answer" }],
      },
      {
        id: "user-2",
        role: "user",
        parts: [{ type: "text", text: "latest question" }],
      },
    ] as GraphAskChatMessage[];

    expect(extractLatestUserText(messages)).toBe("latest question");
  });

  it("extracts the latest streamed assistant text and evidence payload", () => {
    const response = createResponse("latest question");
    const messages = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "text", text: "Answer for latest question" },
          {
            type: "data-evidence-response",
            data: { client_request_id: 1, response },
          },
        ],
      },
    ] as GraphAskChatMessage[];

    expect(getLatestAssistantText(messages)).toBe("Answer for latest question");
    expect(extractLatestEvidenceResponse(messages)).toEqual(response);
  });
});
