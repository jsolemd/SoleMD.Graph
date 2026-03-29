"use client";

import { useEffect, useMemo, useState } from "react";
import { Accordion, Group, Text } from "@mantine/core";
import type {
  AuthorGeoRow,
  GeoNode,
  GraphBundleQueries,
  GraphNode,
} from "@/features/graph/types";
import {
  InlineStats,
  ExtLink,
  accordionStyles,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "../ui";

export function InstitutionSection({
  node,
  queries,
  onSelectAuthor,
}: {
  node: GraphNode;
  queries?: GraphBundleQueries | null;
  onSelectAuthor?: (author: { name: string; orcid: string | null }) => void;
}) {
  const [authorRowsByGeoId, setAuthorRowsByGeoId] = useState<{
    geoId: string | null;
    rows: AuthorGeoRow[];
  }>({ geoId: null, rows: [] });

  const geo = node.nodeKind === "institution" ? (node as GeoNode) : null;
  const geoId = geo?.id ?? null;
  const authors = authorRowsByGeoId.geoId === geoId ? authorRowsByGeoId.rows : [];
  const loadingAuthors = Boolean(geoId && queries && authorRowsByGeoId.geoId !== geoId);

  useEffect(() => {
    if (!geoId || !queries) return;
    let cancelled = false;
    queries.getInstitutionAuthors(geoId).then((rows) => {
      if (!cancelled) {
        setAuthorRowsByGeoId({ geoId, rows });
      }
    }).catch(() => {
      if (!cancelled) {
        setAuthorRowsByGeoId({ geoId, rows: [] });
      }
    });
    return () => { cancelled = true; };
  }, [geoId, queries]);

  if (!geo) return null;
  const rorUrl = geo.rorId ? `https://ror.org/${geo.rorId.replace("https://ror.org/", "")}` : null;

  // Group authors by unique name for summary
  const uniqueAuthors = useMemo(() => {
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
  }, [authors]);

  const uniquePapers = useMemo(() => {
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
  }, [authors]);

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
        <Accordion variant="default" mt={12} styles={accordionStyles}>
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
                  {uniqueAuthors.slice(0, 30).map((a) => (
                    <div
                      key={a.name}
                      role={onSelectAuthor ? "button" : undefined}
                      tabIndex={onSelectAuthor ? 0 : undefined}
                      className={`flex items-baseline justify-between gap-2 rounded-lg px-2 py-1 -mx-2 transition-colors ${onSelectAuthor ? "cursor-pointer hover:bg-[var(--mode-accent-subtle)] focus-visible:bg-[var(--mode-accent-subtle)] focus-visible:outline-none" : ""}`}
                      onClick={onSelectAuthor ? () => onSelectAuthor({ name: a.name, orcid: a.orcid }) : undefined}
                      onKeyDown={onSelectAuthor ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectAuthor({ name: a.name, orcid: a.orcid });
                        }
                      } : undefined}
                    >
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
