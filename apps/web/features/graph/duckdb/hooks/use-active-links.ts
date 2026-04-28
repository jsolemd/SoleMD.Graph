"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type { GraphLayer } from "@solemd/graph";

import { queryRows } from "@/features/graph/duckdb/queries/core";
import {
  buildCurrentViewPredicate,
  escapeSqlLiteral,
  getLayerTableName,
} from "@/features/graph/duckdb/sql-helpers";
import { EDGE_SOURCE_BITMAP } from "@/features/graph/lib/edge-types";

const ACTIVE_LINK_SOURCE_BITMAP = EDGE_SOURCE_BITMAP.citation;
const RESIDENT_KEY_SEPARATOR = "\u001f";

export interface ActiveLinkEdge {
  srcPaperId: string;
  dstPaperId: string;
  weight: number | null;
  kind: string;
  sourceBitmap: number;
}

export interface UseActiveLinksOptions {
  connection: AsyncDuckDBConnection | null;
  activeLayer: GraphLayer;
  currentPointScopeSql: string | null;
  residentPaperIds: readonly string[];
  enabled?: boolean;
}

export interface UseActiveLinksResult {
  edges: ActiveLinkEdge[];
  status: "idle" | "loading" | "ready" | "error";
  error: Error | null;
}

interface ActiveLinkRow {
  srcPaperId?: unknown;
  dstPaperId?: unknown;
  weight?: unknown;
  kind?: unknown;
  sourceBitmap?: unknown;
}

interface ActiveLinkState {
  rawEdges: ActiveLinkEdge[];
  status: UseActiveLinksResult["status"];
  error: Error | null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readWeight(value: unknown): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readSourceBitmap(value: unknown): number {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0
    ? numeric
    : ACTIVE_LINK_SOURCE_BITMAP;
}

function mapActiveLinkRow(row: ActiveLinkRow): ActiveLinkEdge | null {
  const srcPaperId = readString(row.srcPaperId);
  const dstPaperId = readString(row.dstPaperId);
  if (srcPaperId == null || dstPaperId == null) return null;

  return {
    srcPaperId,
    dstPaperId,
    weight: readWeight(row.weight),
    kind: readString(row.kind) ?? "citation",
    sourceBitmap: readSourceBitmap(row.sourceBitmap),
  };
}

function isMissingActiveLinksRelation(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return (
    (message.includes("active_links_web") ||
      message.includes("orb_entity_edges_current")) &&
    (
      message.includes("Catalog Error") ||
      message.includes("does not exist") ||
      message.includes("not found")
    )
  );
}

function normalizeResidentPaperIds(paperIds: readonly string[]): string[] {
  return Array.from(
    new Set(paperIds.filter((paperId) => paperId.length > 0)),
  ).sort();
}

function buildResidentPaperIdKey(paperIds: readonly string[]): string {
  return normalizeResidentPaperIds(paperIds).join(RESIDENT_KEY_SEPARATOR);
}

function readResidentPaperIdKey(key: string): string[] {
  return key.length === 0 ? [] : key.split(RESIDENT_KEY_SEPARATOR);
}

function buildResidentPaperValues(paperIds: readonly string[]): string {
  return paperIds
    .map((paperId) => `('${escapeSqlLiteral(paperId)}')`)
    .join(", ");
}

export function buildActiveLinksSql(args: {
  activeLayer: GraphLayer;
  currentPointScopeSql: string | null;
  residentPaperIds: readonly string[];
}): string {
  const pointTable = getLayerTableName(args.activeLayer);
  const scopePredicate = buildCurrentViewPredicate({
    currentPointScopeSql: args.currentPointScopeSql,
  });
  const residentPaperIds = normalizeResidentPaperIds(args.residentPaperIds);
  if (residentPaperIds.length === 0) {
    return `
      SELECT
        NULL::VARCHAR AS srcPaperId,
        NULL::VARCHAR AS dstPaperId,
        NULL::DOUBLE AS weight,
        NULL::VARCHAR AS kind,
        ${ACTIVE_LINK_SOURCE_BITMAP} AS sourceBitmap
      WHERE false
    `;
  }

  const residentValues = buildResidentPaperValues(residentPaperIds);

  return `
    WITH scoped_points AS (
      SELECT
        id,
        COALESCE(NULLIF(paperId, ''), id) AS paperId
      FROM ${pointTable}
      WHERE ${scopePredicate}
    ),
    resident_papers(paperId) AS (
      VALUES ${residentValues}
    ),
    source_edges AS (
      SELECT
        source_node_id,
        target_node_id,
        weight,
        COALESCE(NULLIF(link_kind, ''), 'citation') AS kind,
        ${EDGE_SOURCE_BITMAP.citation}::INTEGER AS sourceBitmap
      FROM active_links_web
      WHERE source_node_id IS NOT NULL
        AND target_node_id IS NOT NULL
      UNION ALL
      SELECT
        source_node_id,
        target_node_id,
        weight,
        COALESCE(NULLIF(link_kind, ''), 'entity') AS kind,
        COALESCE(source_bitmap, ${EDGE_SOURCE_BITMAP.entity})::INTEGER AS sourceBitmap
      FROM orb_entity_edges_current
      WHERE source_node_id IS NOT NULL
        AND target_node_id IS NOT NULL
    )
    SELECT
      src.paperId AS srcPaperId,
      dst.paperId AS dstPaperId,
      edge.weight AS weight,
      edge.kind AS kind,
      edge.sourceBitmap AS sourceBitmap
    FROM source_edges edge
    JOIN scoped_points src
      ON src.id = edge.source_node_id
    JOIN scoped_points dst
      ON dst.id = edge.target_node_id
    JOIN resident_papers resident_src
      ON resident_src.paperId = src.paperId
    JOIN resident_papers resident_dst
      ON resident_dst.paperId = dst.paperId
    ORDER BY
      COALESCE(edge.weight, 0) DESC,
      src.paperId,
      dst.paperId
  `;
}

export function filterResidentActiveLinks(
  edges: readonly ActiveLinkEdge[],
  residentPaperIds: readonly string[],
): ActiveLinkEdge[] {
  if (residentPaperIds.length === 0 || edges.length === 0) return [];

  const resident = new Set(residentPaperIds);
  return edges.filter(
    (edge) => resident.has(edge.srcPaperId) && resident.has(edge.dstPaperId),
  );
}

export function useActiveLinks(
  options: UseActiveLinksOptions,
): UseActiveLinksResult {
  const {
    connection,
    activeLayer,
    currentPointScopeSql,
    residentPaperIds,
    enabled = true,
  } = options;
  const requestIdRef = useRef(0);
  const [state, setState] = useState<ActiveLinkState>({
    rawEdges: [],
    status: "idle",
    error: null,
  });
  const residentPaperIdKey = useMemo(
    () => buildResidentPaperIdKey(residentPaperIds),
    [residentPaperIds],
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!enabled || connection == null) {
      setState({ rawEdges: [], status: "idle", error: null });
      return;
    }

    const residentPaperIdsForQuery = readResidentPaperIdKey(residentPaperIdKey);
    if (residentPaperIdsForQuery.length === 0) {
      setState({ rawEdges: [], status: "ready", error: null });
      return;
    }

    setState({ rawEdges: [], status: "loading", error: null });

    void queryRows<ActiveLinkRow>(
      connection,
      buildActiveLinksSql({
        activeLayer,
        currentPointScopeSql,
        residentPaperIds: residentPaperIdsForQuery,
      }),
    )
      .then((rows) => {
        if (requestId !== requestIdRef.current) return;
        setState({
          rawEdges: rows
            .map(mapActiveLinkRow)
            .filter((edge): edge is ActiveLinkEdge => edge != null),
          status: "ready",
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (requestId !== requestIdRef.current) return;
        if (isMissingActiveLinksRelation(error)) {
          setState({ rawEdges: [], status: "ready", error: null });
          return;
        }
        setState({
          rawEdges: [],
          status: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
  }, [activeLayer, connection, currentPointScopeSql, enabled, residentPaperIdKey]);

  const edges = useMemo(
    () => filterResidentActiveLinks(state.rawEdges, residentPaperIds),
    [residentPaperIds, state.rawEdges],
  );

  return {
    edges,
    status: state.status,
    error: state.error,
  };
}
