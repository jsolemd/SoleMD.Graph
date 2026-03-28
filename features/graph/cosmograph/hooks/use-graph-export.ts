"use client";
import { useCallback } from "react";
import { useCosmograph } from "@cosmograph/react";

export function useGraphExport() {
  const { cosmograph } = useCosmograph();

  const captureScreenshot = useCallback((filename = "solemd-graph.png") => {
    cosmograph?.captureScreenshot(filename);
  }, [cosmograph]);

  const exportDataAsCsv = useCallback(async (filename = "solemd-graph-data.csv") => {
    const pointsData = await cosmograph?.getPointsData();
    if (!pointsData) return;
    const rows = cosmograph?.convertCosmographDataToObject(pointsData) ?? [];
    if (rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    const csv = [
      keys.join(","),
      ...rows.map((row) =>
        keys.map((k) => JSON.stringify((row as Record<string, unknown>)[k] ?? "")).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [cosmograph]);

  return { captureScreenshot, exportDataAsCsv };
}
