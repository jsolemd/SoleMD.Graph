"use client";

import { Group, Text } from "@mantine/core";
import type { GraphPaperDetail, PaperDocument } from "@/features/graph/types";
import {
  panelAccentCardClassName,
  panelAccentCardStyle,
} from "@/features/graph/components/panels/PanelShell";
import {
  InlineStats,
  ExtLink,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "../ui";
import { getPreferredPaperPreview } from "../helpers";

function buildPaperLinks(paper: GraphPaperDetail | null) {
  if (!paper) return { doi: null, pmc: null, pubmed: null };
  return {
    doi: paper.doi ? `https://doi.org/${paper.doi}` : null,
    pmc: paper.pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${paper.pmcid}/` : null,
    pubmed: paper.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/` : null,
  };
}

export function PaperDocumentSection({
  nodeDisplayPreview,
  paper,
  paperDocument,
  loading,
  error,
}: {
  nodeDisplayPreview: string | null;
  paper: { abstract?: string | null } | null;
  paperDocument: PaperDocument | null;
  loading: boolean;
  error: string | null;
}) {
  const preview = getPreferredPaperPreview({
    abstract: paper?.abstract ?? null,
    displayPreview: paperDocument?.displayPreview ?? null,
    nodeDisplayPreview,
  });

  return (
    <div>
      <Text size="xs" fw={600} mb={4} style={sectionLabelStyle}>
        Preview
      </Text>
      {error ? (
        <Text style={panelTextDimStyle}>{error}</Text>
      ) : preview.text ? (
        <>
          <div
            className={`${panelAccentCardClassName} mb-2`}
            style={panelAccentCardStyle}
          >
            <Text style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}>{preview.text}</Text>
          </div>
          {preview.source === "display" && paperDocument?.wasTruncated && (
            <Text mt={6} style={panelTextDimStyle}>
              Preview text is truncated for the graph bundle.
            </Text>
          )}
          {loading && preview.source !== "display" && (
            <Text mt={6} style={panelTextDimStyle}>
              Loading fuller document preview…
            </Text>
          )}
        </>
      ) : loading ? (
        <Text style={panelTextDimStyle}>Loading paper document…</Text>
      ) : paperDocument || paper ? (
        <Text style={panelTextDimStyle}>No preview text available in the bundle.</Text>
      ) : (
        <Text style={panelTextDimStyle}>No document content available in the bundle.</Text>
      )}
    </div>
  );
}

export function PaperSection({
  paper,
}: {
  paper: GraphPaperDetail | null;
}) {
  if (!paper) return null;

  const links = buildPaperLinks(paper);
  const authorNames = paper.authors?.map((author) => author.name) ?? [];

  return (
    <div>
      <Text size="xs" fw={600} mb={6} style={sectionLabelStyle}>
        At a glance
      </Text>
      <Text style={panelTextStyle}>
        {authorNames.length ? authorNames.join(", ") : "Authors unavailable"}
      </Text>
      <Group gap="sm" mt={6}>
        <ExtLink href={links.doi} label="DOI" />
        <ExtLink href={links.pubmed} label="PubMed" />
        <ExtLink href={links.pmc} label="PMC" />
      </Group>
      <div className="mt-2">
        <InlineStats
          items={[
            { label: "chunks", value: paper.chunkCount },
            { label: "refs", value: paper.referenceCount },
            { label: "pages", value: paper.pageCount },
            { label: "figs", value: paper.figureCount },
            { label: "tables", value: paper.tableCount },
          ]}
        />
      </div>
    </div>
  );
}
