"use client";
import {
  CosmographRangeColorLegend,
  CosmographTypeColorLegend,
} from "@cosmograph/react";

interface ColorLegendsProps {
  variant: "type" | "range";
  selectOnClick: boolean;
  style?: React.CSSProperties;
}

export function ColorLegends({ variant, selectOnClick, style }: ColorLegendsProps) {
  if (variant === "range") {
    return <CosmographRangeColorLegend style={style} />;
  }
  return <CosmographTypeColorLegend selectOnClick={selectOnClick} style={style} />;
}
