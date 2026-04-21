import { fieldBlobHotspots } from "./field-hotspot-overlay";

export type FieldClusterId = "papers" | "entities" | "relations";

export interface FieldConnectionCluster {
  accentVar: string;
  id: FieldClusterId;
  // Hotspot indices that belong to this semantic cluster. The first index
  // is the cluster's "anchor" (the named hotspot); remaining indices are
  // background dots that co-locate with it to read as a tight group.
  members: readonly number[];
}

export interface FieldConnectionPair {
  arch?: number;
  color: string;
  direction?: 1 | -1;
  from: number;
  kind: "intra" | "bridge";
  to: number;
}

// Three semantic clusters — papers / entities / relations — each bound to
// one named hotspot (indices 0/1/2 in `fieldBlobHotspots`) plus a
// handful of nearby background dots so the cluster reads as a group rather
// than a lone point. Cluster accents are pulled from the token palette so
// they match the rest of the landing chapters.
export const fieldConnectionClusters: readonly FieldConnectionCluster[] = [
  {
    id: "papers",
    accentVar: "var(--color-soft-lavender)",
    members: [0, 3, 8, 16],
  },
  {
    id: "entities",
    accentVar: "var(--color-golden-yellow)",
    members: [1, 5, 11, 22],
  },
  {
    id: "relations",
    accentVar: "var(--color-teal)",
    members: [2, 7, 14, 28],
  },
] as const;

function intra(
  cluster: FieldConnectionCluster,
  from: number,
  to: number,
  direction: 1 | -1 = 1,
): FieldConnectionPair {
  return {
    color: cluster.accentVar,
    direction,
    from,
    kind: "intra",
    to,
  };
}

function bridge(
  from: number,
  to: number,
  color: string,
  direction: 1 | -1 = 1,
): FieldConnectionPair {
  return {
    color,
    direction,
    from,
    kind: "bridge",
    to,
  };
}

const papers = fieldConnectionClusters[0]!;
const entities = fieldConnectionClusters[1]!;
const relations = fieldConnectionClusters[2]!;

// Intra-cluster edges form a small web inside each cluster (3 edges ->
// triangle/fan per cluster). Inter-cluster bridges are fewer (3 total) so
// the viewer reads "three neighborhoods, a few bridges between them".
export const fieldConnectionPairs: readonly FieldConnectionPair[] = [
  intra(papers, 0, 3, 1),
  intra(papers, 0, 8, -1),
  intra(papers, 3, 16, 1),

  intra(entities, 1, 5, -1),
  intra(entities, 1, 11, 1),
  intra(entities, 5, 22, -1),

  intra(relations, 2, 7, 1),
  intra(relations, 2, 14, -1),
  intra(relations, 7, 28, 1),

  bridge(0, 1, "var(--color-soft-blue)", 1),
  bridge(1, 2, "var(--color-soft-blue)", -1),
  bridge(2, 0, "var(--color-soft-blue)", 1),
] as const;

if (process.env.NODE_ENV !== "production") {
  for (const pair of fieldConnectionPairs) {
    if (
      pair.from >= fieldBlobHotspots.length ||
      pair.to >= fieldBlobHotspots.length
    ) {
      console.warn(
        `[field-connection-pairs] pair ${pair.from}->${pair.to} references a hotspot index that is out of range.`,
      );
    }
  }
}
