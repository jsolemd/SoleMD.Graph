"use client";
import { CosmographSizeLegend } from "@cosmograph/react";

interface SizeLegendProps {
  selectOnClick: boolean;
  style?: React.CSSProperties;
}

export function SizeLegend({ selectOnClick, style }: SizeLegendProps) {
  return <CosmographSizeLegend selectOnClick={selectOnClick} style={style} />;
}
