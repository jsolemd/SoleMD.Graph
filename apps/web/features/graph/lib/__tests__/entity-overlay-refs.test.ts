import type {
  GraphEntityOverlayRef,
  GraphEntityRef,
} from "@solemd/api-client/shared/graph-entity";

import {
  areEntityOverlayRefsEqual,
  computeEntityOverlayRefsKey,
  deduplicateEntityOverlayRefs,
  toEntityOverlayRef,
} from "../entity-overlay-refs";

const SCHIZOPHRENIA_ENTITY = {
  entityType: "disease",
  conceptNamespace: "mesh",
  conceptId: "D012559",
  sourceIdentifier: "MESH:D012559",
  canonicalName: "Schizophrenia",
} satisfies GraphEntityRef;

describe("entity-overlay-refs", () => {
  it("maps canonical entity identity into one graph overlay ref", () => {
    expect(toEntityOverlayRef(SCHIZOPHRENIA_ENTITY)).toEqual<GraphEntityOverlayRef>({
      entityType: "disease",
      sourceIdentifier: "MESH:D012559",
    });
  });

  it("compares overlay refs by canonical key rather than input order", () => {
    const left = deduplicateEntityOverlayRefs([
      {
        entityType: "disease",
        sourceIdentifier: "MESH:D012559",
      },
      {
        entityType: "chemical",
        sourceIdentifier: "MESH:D004298",
      },
      {
        entityType: "disease",
        sourceIdentifier: "MESH:D012559",
      },
    ]);
    const right = deduplicateEntityOverlayRefs([
      {
        entityType: "chemical",
        sourceIdentifier: "MESH:D004298",
      },
      {
        entityType: "disease",
        sourceIdentifier: "MESH:D012559",
      },
    ]);

    expect(computeEntityOverlayRefsKey(left)).toBe(
      computeEntityOverlayRefsKey(right),
    );
    expect(areEntityOverlayRefsEqual(left, right)).toBe(true);
  });
});
