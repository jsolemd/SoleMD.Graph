"use client";

import { useEffect, useState } from "react";
import { Accordion, Badge, Button, Group, Text } from "@mantine/core";
import { Copy, FileText, MessageSquareText, Orbit } from "lucide-react";
import type {
  AuthorGeoRow,
  ChunkNode,
  GeoNode,
  GraphBundleQueries,
  GraphNode,
  GraphPaperDetail,
  PaperDocument,
} from "@/lib/graph/types";
import type { GraphNodeDetailResponsePayload } from "@/lib/graph/detail-service";
import { badgeAccentStyles, badgeOutlineStyles } from "@/components/graph/PanelShell";
import {
  InlineStats,
  ExtLink,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "./ui";
import { getPreferredPaperPreview } from "./helpers";

export function DetailHeader({
  node,
  paper,
}: {
  node: GraphNode;
  paper: GraphPaperDetail | null;
}) {
  const nodeColor = node.color;
  const isGeo = node.nodeKind === "institution";
  const geo = isGeo ? (node as GeoNode) : null;

  const title = isGeo
    ? (geo!.institution ?? "Unknown institution")
    : (paper?.title ?? node.paperTitle);

  const subtitle = isGeo
    ? [geo!.city, geo!.region, geo!.country].filter(Boolean).join(", ")
    : [paper?.journal ?? node.journal, paper?.year ?? node.year, paper?.citekey ?? node.citekey]
        .filter(Boolean)
        .join(" · ");

  return (
    <div>
      <Text fw={600} lh={1.35} style={panelTextStyle}>
        {title}
      </Text>
      {subtitle && (
        <Text mt={4} style={panelTextDimStyle}>
          {subtitle}
        </Text>
      )}
      <Group gap={6} mt={10}>
        <Badge size="xs" styles={badgeAccentStyles}>
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: nodeColor,
              marginRight: 5,
              verticalAlign: "middle",
            }}
          />
          {node.clusterLabel ?? `Cluster ${node.clusterId}`}
        </Badge>
        {node.nodeKind === "chunk" && node.sectionCanonical && (
          <Badge size="xs" variant="outline" styles={badgeOutlineStyles}>
            {node.sectionCanonical}
          </Badge>
        )}
        {node.nodeKind === "chunk" && node.pageNumber != null && (
          <Badge size="xs" variant="outline" styles={badgeOutlineStyles}>
            p. {node.pageNumber}
          </Badge>
        )}
      </Group>
    </div>
  );
}

export function SelectionActionBar({
  onCopyNote,
  onAsk,
  onOpenGraphPaper,
  openGraphPaperLabel,
  pdfUrl,
  copyLabel,
}: {
  onCopyNote: () => void;
  onAsk: () => void;
  onOpenGraphPaper?: (() => void) | null;
  openGraphPaperLabel?: string;
  pdfUrl?: string | null;
  copyLabel: string;
}) {
  return (
    <Group gap="xs" wrap="wrap">
      <Button
        size="compact-sm"
        variant="light"
        leftSection={<Copy size={14} />}
        onClick={onCopyNote}
      >
        {copyLabel}
      </Button>
      <Button
        size="compact-sm"
        variant="light"
        leftSection={<MessageSquareText size={14} />}
        onClick={onAsk}
      >
        Ask
      </Button>
      {onOpenGraphPaper && (
        <Button
          size="compact-sm"
          variant="light"
          leftSection={<Orbit size={14} />}
          onClick={onOpenGraphPaper}
        >
          {openGraphPaperLabel ?? "Open in graph"}
        </Button>
      )}
      {pdfUrl && (
        <Button
          size="compact-sm"
          variant="light"
          component="a"
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          leftSection={<FileText size={14} />}
        >
          Open PDF
        </Button>
      )}
    </Group>
  );
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
      <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
        Preview
      </Text>
      {loading ? (
        <Text style={panelTextDimStyle}>Loading paper document…</Text>
      ) : error ? (
        <Text style={panelTextDimStyle}>{error}</Text>
      ) : preview.text ? (
        <>
          <div
            className="rounded-xl px-3 py-3 mb-2"
            style={{
              backgroundColor: "var(--mode-accent-subtle)",
              border: "1px solid var(--mode-accent-border)",
            }}
          >
            <Text style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}>{preview.text}</Text>
          </div>
          {preview.source === "display" && paperDocument?.wasTruncated && (
            <Text mt={6} style={panelTextDimStyle}>
              Preview text is truncated for the graph bundle.
            </Text>
          )}
        </>
      ) : paperDocument || paper ? (
        <Text style={panelTextDimStyle}>No preview text available in the bundle.</Text>
      ) : (
        <Text style={panelTextDimStyle}>No document content available in the bundle.</Text>
      )}
    </div>
  );
}

export function ChunkSection({
  node,
  chunk,
  loading,
  error,
}: {
  node: ChunkNode;
  chunk: {
    chunkText?: string | null;
    tokenCount?: number | null;
    charCount?: number | null;
  } | null;
  loading: boolean;
  error: string | null;
}) {
  const text = chunk?.chunkText ?? node.chunkPreview;

  return (
    <div>
      <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
        Passage
      </Text>
      {loading ? (
        <Text style={panelTextDimStyle}>Querying local bundle…</Text>
      ) : error ? (
        <Text style={panelTextDimStyle}>{error}</Text>
      ) : (
        <>
          <div
            className="rounded-xl px-3 py-3"
            style={{
              backgroundColor: "var(--mode-accent-subtle)",
              border: "1px solid var(--mode-accent-border)",
            }}
          >
            <Text style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}>
              {text ?? "No chunk text available."}
            </Text>
          </div>
          <div className="mt-2">
            <InlineStats
              items={[
                { label: "tokens", value: chunk?.tokenCount ?? node.tokenCount },
                { label: "chars", value: chunk?.charCount ?? node.charCount },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}

function buildPaperLinks(paper: GraphPaperDetail | GraphNodeDetailResponsePayload["paper"] | null) {
  if (!paper) return { doi: null, pmc: null, pubmed: null };
  return {
    doi: paper.doi ? `https://doi.org/${paper.doi}` : null,
    pmc: paper.pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${paper.pmcid}/` : null,
    pubmed: paper.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/` : null,
  };
}

export function InstitutionSection({
  node,
  queries,
}: {
  node: GraphNode;
  queries?: GraphBundleQueries | null;
}) {
  const [authors, setAuthors] = useState<AuthorGeoRow[]>([]);
  const [loadingAuthors, setLoadingAuthors] = useState(false);

  const geo = node.nodeKind === "institution" ? (node as GeoNode) : null;
  const geoId = geo?.id ?? null;

  useEffect(() => {
    if (!geoId || !queries) return;
    let cancelled = false;
    setLoadingAuthors(true);
    queries.getInstitutionAuthors(geoId).then((rows) => {
      if (!cancelled) {
        setAuthors(rows);
        setLoadingAuthors(false);
      }
    }).catch(() => {
      if (!cancelled) setLoadingAuthors(false);
    });
    return () => { cancelled = true; };
  }, [geoId, queries]);

  if (!geo) return null;
  const rorUrl = geo.rorId ? `https://ror.org/${geo.rorId.replace("https://ror.org/", "")}` : null;

  // Group authors by unique name for summary
  const uniqueAuthors = (() => {
    const seen = new Map<string, { name: string; papers: number; orcid: string | null }>();
    for (const a of authors) {
      const key = a.surname ? `${a.surname}|${a.givenName ?? ""}` : a.name ?? "";
      const existing = seen.get(key);
      if (existing) {
        existing.papers++;
      } else {
        seen.set(key, {
          name: a.name ?? `${a.givenName ?? ""} ${a.surname ?? ""}`.trim(),
          papers: 1,
          orcid: a.orcid,
        });
      }
    }
    return [...seen.values()].sort((a, b) => b.papers - a.papers);
  })();

  const uniquePapers = (() => {
    const seen = new Map<string, { citekey: string; title: string; year: number | null }>();
    for (const a of authors) {
      if (!a.citekey) continue;
      if (!seen.has(a.citekey)) {
        seen.set(a.citekey, {
          citekey: a.citekey,
          title: a.paperTitle ?? "Untitled",
          year: a.year,
        });
      }
    }
    return [...seen.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  })();

  return (
    <div>
      <Text size="xs" fw={600} mb={6} style={sectionLabelStyle}>
        Institution
      </Text>
      <Text fw={600} style={panelTextStyle}>
        {geo.institution ?? "Unknown institution"}
      </Text>
      {(geo.city || geo.country) && (
        <Text style={panelTextDimStyle}>
          {[geo.city, geo.region, geo.country].filter(Boolean).join(", ")}
        </Text>
      )}
      {rorUrl && (
        <Group gap="sm" mt={6}>
          <ExtLink href={rorUrl} label="ROR" />
        </Group>
      )}
      <div className="mt-2">
        <InlineStats
          items={[
            { label: "papers", value: geo.paperCount },
            { label: "authors", value: geo.authorCount },
            { label: "from", value: geo.firstYear },
            { label: "to", value: geo.lastYear },
          ]}
        />
      </div>

      {/* Author drill-down */}
      {(uniqueAuthors.length > 0 || uniquePapers.length > 0 || loadingAuthors) && (
        <Accordion variant="default" mt={12} styles={{
          item: { borderBottom: "none" },
          control: { paddingLeft: 0, paddingRight: 0, paddingTop: 4, paddingBottom: 4, backgroundColor: "transparent" },
          label: { fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--graph-panel-text-muted)" },
          chevron: { color: "var(--graph-panel-text-muted)", width: 14, height: 14 },
          content: { paddingLeft: 0, paddingRight: 0, paddingBottom: 8 },
        }}>
          {uniquePapers.length > 0 && (
            <Accordion.Item value="papers">
              <Accordion.Control>
                Papers ({uniquePapers.length})
              </Accordion.Control>
              <Accordion.Panel>
                <div className="flex flex-col gap-1.5">
                  {uniquePapers.map((p) => (
                    <div key={p.citekey}>
                      <Text style={panelTextStyle}>{p.title}</Text>
                      <Text style={panelTextDimStyle}>
                        {p.citekey}{p.year ? ` · ${p.year}` : ""}
                      </Text>
                    </div>
                  ))}
                </div>
              </Accordion.Panel>
            </Accordion.Item>
          )}
          <Accordion.Item value="authors">
            <Accordion.Control>
              Authors{uniqueAuthors.length > 0 ? ` (${uniqueAuthors.length})` : ""}
            </Accordion.Control>
            <Accordion.Panel>
              {loadingAuthors ? (
                <Text style={panelTextDimStyle}>Loading authors...</Text>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {uniqueAuthors.slice(0, 30).map((a, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2">
                      <Text style={panelTextStyle}>{a.name}</Text>
                      <Text style={panelTextDimStyle}>
                        {a.papers} paper{a.papers !== 1 ? "s" : ""}
                      </Text>
                    </div>
                  ))}
                  {uniqueAuthors.length > 30 && (
                    <Text style={panelTextDimStyle}>
                      + {uniqueAuthors.length - 30} more
                    </Text>
                  )}
                </div>
              )}
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}
    </div>
  );
}

export function PaperSection({
  paper,
  servicePaper,
}: {
  paper: GraphPaperDetail | null;
  servicePaper: GraphNodeDetailResponsePayload["paper"] | null;
}) {
  const resolvedPaper = servicePaper ?? paper;
  if (!resolvedPaper) return null;

  const links = buildPaperLinks(resolvedPaper);
  const authorNames = servicePaper?.authors?.length
    ? servicePaper.authors.map((author) => author.name)
    : paper?.authors?.map((author) => author.name) ?? [];

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
            { label: "chunks", value: servicePaper?.chunk_count ?? paper?.chunkCount },
            { label: "refs", value: servicePaper?.reference_count ?? paper?.referenceCount },
            { label: "pages", value: servicePaper?.page_count ?? paper?.pageCount },
            { label: "figs", value: servicePaper?.figure_count ?? paper?.figureCount },
            { label: "tables", value: servicePaper?.table_count ?? paper?.tableCount },
          ]}
        />
      </div>
    </div>
  );
}
