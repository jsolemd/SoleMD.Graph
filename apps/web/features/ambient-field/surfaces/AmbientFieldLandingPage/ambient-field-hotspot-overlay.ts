export interface AmbientFieldBlobHotspot {
  badges: string[];
  cardLeft?: string;
  cardTop?: string;
  id: string;
  title: string;
}

// Maze authors the card seat with `left: 2.5rem; top: 0`
// (styles.css `.hotspot__ui`). Hotspots that omit cardLeft/cardTop
// fall through to those defaults in the `AmbientFieldHotspotPool`.
export const ambientFieldBlobHotspots: readonly AmbientFieldBlobHotspot[] = [
  {
    id: "papers",
    title: "Paper subset enters focus",
    badges: ["Selected", "High confidence"],
  },
  {
    id: "entities",
    title: "Entity-rich paper neighborhood",
    badges: ["Gene", "Chemical"],
  },
  {
    id: "relations",
    title: "Relation bridge becomes visible",
    badges: ["Linking", "Synthesis-ready"],
  },
  ...Array.from({ length: 37 }, (_, index) => ({
    id: `dot-${index + 4}`,
    title: "",
    badges: [],
  })),
] as const;
