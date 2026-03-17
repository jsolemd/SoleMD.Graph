"use client";

import { useMemo } from "react";
import { Button, Group, Text } from "@mantine/core";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { safeMin, safeMax } from "@/features/graph/lib/helpers";
import type { AuthorGeoRow, GeoNode } from "@/features/graph/types";
import { InteractiveListItem } from "./InteractiveListItem";
import {
  InlineStats,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "./ui";

export function AuthorDetailSection({
  authorName,
  orcid,
  rows,
  loading,
  geoNodes,
  onBack,
  onSelectInstitution,
}: {
  authorName: string;
  orcid: string | null;
  rows: AuthorGeoRow[];
  loading: boolean;
  geoNodes: GeoNode[];
  onBack: () => void;
  onSelectInstitution: (node: GeoNode) => void;
}) {
  // Unique institutions this author is affiliated with
  const institutions = useMemo(() => {
    const seen = new Map<string, { key: string; name: string; papers: number; geoNode: GeoNode | null }>();
    for (const r of rows) {
      const key = r.institutionKey ?? r.institution ?? "";
      if (!key) continue;
      const existing = seen.get(key);
      if (existing) {
        existing.papers++;
      } else {
        const geoNode = geoNodes.find((n) => n.id === key) ?? null;
        seen.set(key, {
          key,
          name: r.institution ?? "Unknown",
          papers: 1,
          geoNode,
        });
      }
    }
    return [...seen.values()].sort((a, b) => b.papers - a.papers);
  }, [rows, geoNodes]);

  // Unique papers
  const papers = useMemo(() => {
    const seen = new Map<string, { citekey: string; title: string; year: number | null; institution: string | null }>();
    for (const r of rows) {
      if (!r.citekey) continue;
      if (!seen.has(r.citekey)) {
        seen.set(r.citekey, {
          citekey: r.citekey,
          title: r.paperTitle ?? "Untitled",
          year: r.year,
          institution: r.institution,
        });
      }
    }
    return [...seen.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }, [rows]);

  // Year range
  const years = rows.map((r) => r.year).filter((y): y is number => y != null);
  const minYear = years.length ? safeMin(years) : null;
  const maxYear = years.length ? safeMax(years) : null;

  const orcidUrl = orcid ? `https://orcid.org/${orcid}` : null;

  return (
    <div>
      <Button
        size="compact-xs"
        variant="subtle"
        leftSection={<ArrowLeft size={12} />}
        onClick={onBack}
        mb={8}
        style={{ color: "var(--mode-accent)" }}
      >
        Back to institution
      </Button>

      <Text fw={600} lh={1.35} style={panelTextStyle}>
        {authorName}
      </Text>
      {orcidUrl && (
        <Group gap="sm" mt={4}>
          <a
            href={orcidUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1"
            style={{ color: "var(--mode-accent)", fontSize: 11 }}
          >
            ORCID
            <ExternalLink size={11} />
          </a>
        </Group>
      )}

      <div className="mt-2">
        <InlineStats
          items={[
            { label: "papers", value: papers.length },
            { label: "institutions", value: institutions.length },
            { label: "from", value: minYear },
            { label: "to", value: maxYear },
          ]}
        />
      </div>

      {loading && (
        <Text mt={8} style={panelTextDimStyle}>Loading author data…</Text>
      )}

      {/* Institutions */}
      {institutions.length > 0 && (
        <div className="mt-4">
          <Text size="xs" fw={600} mb={6} style={sectionLabelStyle}>
            Institutions
          </Text>
          <div className="flex flex-col gap-1.5">
            {institutions.map((inst) =>
              inst.geoNode ? (
                <InteractiveListItem
                  key={inst.key}
                  onClick={() => onSelectInstitution(inst.geoNode!)}
                >
                  <Text style={panelTextStyle}>{inst.name}</Text>
                  <Text style={panelTextDimStyle}>
                    {inst.papers} paper{inst.papers !== 1 ? "s" : ""}
                  </Text>
                </InteractiveListItem>
              ) : (
                <div
                  key={inst.key}
                  className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1 -mx-2"
                >
                  <Text style={panelTextStyle}>{inst.name}</Text>
                  <Text style={panelTextDimStyle}>
                    {inst.papers} paper{inst.papers !== 1 ? "s" : ""}
                  </Text>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Papers */}
      {papers.length > 0 && (
        <div className="mt-4">
          <Text size="xs" fw={600} mb={6} style={sectionLabelStyle}>
            Papers
          </Text>
          <div className="flex flex-col gap-1.5">
            {papers.map((p) => (
              <div key={p.citekey}>
                <Text style={panelTextStyle}>{p.title}</Text>
                <Text style={panelTextDimStyle}>
                  {p.citekey}{p.year ? ` · ${p.year}` : ""}
                  {p.institution ? ` · ${p.institution}` : ""}
                </Text>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
