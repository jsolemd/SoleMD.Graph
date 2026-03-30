/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { GraphPointRecord, GraphRagQueryResponsePayload } from "@/features/graph/types";
import { RagResponsePanel } from "../RagResponsePanel";

jest.mock("@mantine/core", () => {
  const actual = jest.requireActual("@mantine/core");

  return {
    ...actual,
    ScrollArea: {
      ...actual.ScrollArea,
      Autosize: ({ children }: { children: unknown }) => <div>{children}</div>,
    },
  };
});

function createGroundedResponse(): GraphRagQueryResponsePayload {
  return {
    query: "Does melatonin help delirium?",
    graph_signals: [],
    results: [],
    evidence_bundles: [],
    retrieval_channels: [],
    meta: {
      request_id: "req:test",
      generated_at: "2026-03-30T00:00:00Z",
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
    answer: "Fallback answer",
    answer_model: "baseline-extractive-v1",
    answer_graph_paper_refs: ["corpus:12345"],
    grounded_answer: {
      segments: [
        {
          segment_ordinal: 0,
          text: "Melatonin was associated with lower delirium incidence.",
          citation_anchor_ids: ["anchor:1"],
        },
      ],
      inline_citations: [
        {
          anchor_id: "anchor:1",
          label: "[1]",
          cited_span_ids: ["span:12345:b0:s0"],
          cited_corpus_ids: [12345],
          short_evidence_label: "Melatonin reduced delirium incidence.",
        },
      ],
      cited_spans: [
        {
          packet_id: "span:12345:b0:s0",
          corpus_id: 12345,
          canonical_section_ordinal: 1,
          canonical_block_ordinal: 0,
          canonical_sentence_ordinal: 0,
          section_role: "results",
          block_kind: "narrative_paragraph",
          span_origin: "primary_text",
          alignment_status: "exact",
          alignment_confidence: 1,
          text: "Melatonin reduced delirium incidence.",
          quote_text: "Melatonin reduced delirium incidence.",
          source_citation_keys: ["b1"],
          source_reference_keys: ["b1"],
          entity_mentions: [
            {
              entity_type: "Chemical",
              text: "Melatonin",
              concept_namespace: "mesh",
              concept_id: "D008550",
              source_identifier: "MESH:D008550",
            },
          ],
        },
      ],
      answer_linked_corpus_ids: [12345],
    },
  };
}

describe("RagResponsePanel", () => {
  it("renders structured grounded answer segments and cited evidence packets", () => {
    render(
      <MantineProvider>
        <RagResponsePanel
          ragResponse={createGroundedResponse()}
          streamedAnswer={null}
          ragError={null}
          ragSession={{
            origin: "ask",
            evidenceIntent: null,
            queryPreview: null,
          }}
          ragGraphAvailability={null}
          isSubmitting={false}
          isFullHeightMode={false}
          selectedNode={null as GraphPointRecord | null}
          selectedScopeLabel={null}
          onDismiss={() => {}}
        />
      </MantineProvider>,
    );

    expect(
      screen.getByText("Melatonin was associated with lower delirium incidence."),
    ).toBeTruthy();
    expect(screen.getByText("[1]")).toBeTruthy();
    expect(screen.getByText("Grounded evidence")).toBeTruthy();
    expect(screen.getAllByText("Melatonin").length).toBeGreaterThan(0);
  });
});
