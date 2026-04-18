/** @jest-environment jsdom */
import type {
  GraphBundleQueries,
  GraphPointRecord,
} from "@/features/graph/types";
import {
  resolveWikiOverlay,
  commitWikiOverlay,
  cacheWikiGraphNodes,
  clearWikiGraphOverlay,
} from "../wiki-graph-sync";

function makeMockQueries() {
  return {
    ensureGraphPaperRefsAvailable: jest.fn(),
    setOverlayProducerPointIds: jest
      .fn()
      .mockResolvedValue({ overlayCount: 0 }),
    clearOverlayProducer: jest.fn().mockResolvedValue({ overlayCount: 0 }),
    getPaperNodesByGraphPaperRefs: jest.fn(),
  } as unknown as GraphBundleQueries;
}

function makePointRecord(
  overrides: Partial<GraphPointRecord>,
): GraphPointRecord {
  return {
    index: 0,
    id: "pt-0",
    paperId: null,
    nodeKind: "paper",
    nodeRole: "primary",
    color: "#000",
    colorLight: "#fff",
    x: 0,
    y: 0,
    clusterId: 0,
    clusterLabel: null,
    displayLabel: null,
    displayPreview: null,
    paperTitle: null,
    citekey: null,
    journal: null,
    year: null,
    semanticGroups: null,
    relationCategories: null,
    textAvailability: null,
    paperAuthorCount: null,
    paperReferenceCount: null,
    paperEntityCount: null,
    paperRelationCount: null,
    isInBase: false,
    baseRank: null,
    isOverlayActive: false,
    ...overrides,
  };
}

describe("resolveWikiOverlay", () => {
  it("returns empty resolution when graphPaperRefs is empty", async () => {
    const queries = makeMockQueries();
    const result = await resolveWikiOverlay({ queries, graphPaperRefs: [] });

    expect(result).toEqual({
      availability: {
        activeGraphPaperRefs: [],
        universePointIdsByGraphPaperRef: {},
        unresolvedGraphPaperRefs: [],
      },
      pointIds: [],
    });
    expect(queries.ensureGraphPaperRefsAvailable).not.toHaveBeenCalled();
  });

  it("extracts point IDs from universe papers", async () => {
    const queries = makeMockQueries();
    (queries.ensureGraphPaperRefsAvailable as jest.Mock).mockResolvedValue({
      activeGraphPaperRefs: [],
      universePointIdsByGraphPaperRef: {
        "s2:abc123": "pt-10",
        "s2:def456": "pt-20",
      },
      unresolvedGraphPaperRefs: [],
    });

    const result = await resolveWikiOverlay({
      queries,
      graphPaperRefs: ["s2:abc123", "s2:def456"],
    });

    expect(result.pointIds).toEqual(expect.arrayContaining(["pt-10", "pt-20"]));
    expect(result.pointIds).toHaveLength(2);
    expect(result.availability.universePointIdsByGraphPaperRef).toEqual({
      "s2:abc123": "pt-10",
      "s2:def456": "pt-20",
    });
  });

  it("handles mixed active, universe, and unresolved refs", async () => {
    const queries = makeMockQueries();
    (queries.ensureGraphPaperRefsAvailable as jest.Mock).mockResolvedValue({
      activeGraphPaperRefs: ["s2:active1"],
      universePointIdsByGraphPaperRef: {
        "s2:universe1": "pt-50",
      },
      unresolvedGraphPaperRefs: ["s2:missing1"],
    });

    const result = await resolveWikiOverlay({
      queries,
      graphPaperRefs: ["s2:active1", "s2:universe1", "s2:missing1"],
    });

    expect(result.availability.activeGraphPaperRefs).toEqual(["s2:active1"]);
    expect(result.pointIds).toEqual(["pt-50"]);
    expect(result.availability.unresolvedGraphPaperRefs).toEqual([
      "s2:missing1",
    ]);
  });
});

describe("commitWikiOverlay", () => {
  it("calls setOverlayProducerPointIds when pointIds is non-empty", async () => {
    const queries = makeMockQueries();
    const producerId = "wiki-overlay";

    await commitWikiOverlay({
      producerId,
      queries,
      pointIds: ["pt-1", "pt-2"],
    });

    expect(queries.setOverlayProducerPointIds).toHaveBeenCalledWith({
      producerId: "wiki-overlay",
      pointIds: ["pt-1", "pt-2"],
    });
    expect(queries.clearOverlayProducer).not.toHaveBeenCalled();
  });

  it("calls clearOverlayProducer when pointIds is empty", async () => {
    const queries = makeMockQueries();
    const producerId = "wiki-overlay";

    await commitWikiOverlay({ producerId, queries, pointIds: [] });

    expect(queries.clearOverlayProducer).toHaveBeenCalledWith("wiki-overlay");
    expect(queries.setOverlayProducerPointIds).not.toHaveBeenCalled();
  });
});

describe("cacheWikiGraphNodes", () => {
  it("returns empty map when graphPaperRefs is empty", async () => {
    const queries = makeMockQueries();
    const result = await cacheWikiGraphNodes({ queries, graphPaperRefs: [] });

    expect(result).toEqual({});
    expect(queries.getPaperNodesByGraphPaperRefs).not.toHaveBeenCalled();
  });

  it("maps graphPaperRef to resolved nodes", async () => {
    const queries = makeMockQueries();
    const abcNode = makePointRecord({ index: 42, id: "pt-42" });
    const defNode = makePointRecord({ index: 99, id: "pt-99" });
    (queries.getPaperNodesByGraphPaperRefs as jest.Mock).mockResolvedValue({
      "s2:abc": abcNode,
      "s2:def": defNode,
    });

    const result = await cacheWikiGraphNodes({
      queries,
      graphPaperRefs: ["s2:abc", "s2:def"],
    });

    expect(result).toEqual({ "s2:abc": abcNode, "s2:def": defNode });
  });

  it("skips entries with non-finite index", async () => {
    const queries = makeMockQueries();
    (queries.getPaperNodesByGraphPaperRefs as jest.Mock).mockResolvedValue({
      "s2:good": makePointRecord({ index: 7 }),
      "s2:nan": makePointRecord({ index: NaN }),
      "s2:inf": makePointRecord({ index: Infinity }),
      "s2:neg-inf": makePointRecord({ index: -Infinity }),
    });

    const result = await cacheWikiGraphNodes({
      queries,
      graphPaperRefs: ["s2:good", "s2:nan", "s2:inf", "s2:neg-inf"],
    });

    expect(result).toEqual({
      "s2:good": expect.objectContaining({ index: 7 }),
    });
  });
});

describe("clearWikiGraphOverlay", () => {
  it("calls clearOverlayProducer", async () => {
    const queries = makeMockQueries();
    const producerId = "wiki-overlay";

    await clearWikiGraphOverlay({ producerId, queries });

    expect(queries.clearOverlayProducer).toHaveBeenCalledWith("wiki-overlay");
  });
});
