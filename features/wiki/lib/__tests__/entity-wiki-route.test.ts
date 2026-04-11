import {
  getEntityWikiSlug,
  normalizeWikiSlug,
} from "../entity-wiki-route";

describe("entity-wiki-route", () => {
  it("normalizes wiki slugs using the engine-compatible rules", () => {
    expect(normalizeWikiSlug(" Circadian Rhythm ")).toBe("circadian-rhythm");
    expect(normalizeWikiSlug("/entities/Melatonin.md/")).toBe("entities/melatonin");
    expect(normalizeWikiSlug("A  B   C")).toBe("a-b-c");
  });

  it("derives entity wiki pages under the entities namespace", () => {
    expect(
      getEntityWikiSlug({
        entityType: "disease",
        conceptNamespace: "mesh",
        conceptId: "D012559",
        sourceIdentifier: "MESH:D012559",
        canonicalName: "Schizophrenia Spectrum Disorder",
      }),
    ).toBe("entities/schizophrenia-spectrum-disorder");
  });
});
