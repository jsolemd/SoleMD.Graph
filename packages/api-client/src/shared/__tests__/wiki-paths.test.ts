import {
  buildWikiBacklinksEnginePath,
  buildWikiPageBundleEnginePath,
  buildWikiPageContextEnginePath,
  buildWikiPageEnginePath,
  encodeWikiSlug,
} from "../wiki-paths"

describe("wiki-paths engine builders URL-encode slugs", () => {
  const problematicSlug = "entities/schizo phrenia?x"
  const unicodeSlug = "entities/α-receptor"

  it("encodeWikiSlug encodes segments independently and keeps the slash separator", () => {
    expect(encodeWikiSlug(problematicSlug)).toBe(
      "entities/schizo%20phrenia%3Fx",
    )
    expect(encodeWikiSlug(unicodeSlug)).toBe("entities/%CE%B1-receptor")
  })

  it("buildWikiPageEnginePath encodes the slug", () => {
    expect(buildWikiPageEnginePath(problematicSlug)).toBe(
      "/api/v1/wiki/pages/entities/schizo%20phrenia%3Fx",
    )
  })

  it("buildWikiPageBundleEnginePath encodes the slug", () => {
    expect(buildWikiPageBundleEnginePath(problematicSlug)).toBe(
      "/api/v1/wiki/page-bundle/entities/schizo%20phrenia%3Fx",
    )
  })

  it("buildWikiPageContextEnginePath encodes the slug", () => {
    expect(buildWikiPageContextEnginePath(problematicSlug)).toBe(
      "/api/v1/wiki/page-context/entities/schizo%20phrenia%3Fx",
    )
  })

  it("buildWikiBacklinksEnginePath encodes the slug", () => {
    expect(buildWikiBacklinksEnginePath(problematicSlug)).toBe(
      "/api/v1/wiki/backlinks/entities/schizo%20phrenia%3Fx",
    )
  })

  it("engine builders preserve the graph_release_id query parameter", () => {
    expect(
      buildWikiPageEnginePath("entities/foo", { graphReleaseId: "abc-123" }),
    ).toBe("/api/v1/wiki/pages/entities/foo?graph_release_id=abc-123")
  })

  it("encodes unicode segments", () => {
    expect(buildWikiPageEnginePath(unicodeSlug)).toBe(
      "/api/v1/wiki/pages/entities/%CE%B1-receptor",
    )
  })
})
