import type {
  GraphEntityAlias,
  GraphEntityRef,
} from "@solemd/api-client/shared/graph-entity";

export interface GraphLoadingConstellationNode {
  id: string;
  label: string;
  entityType: string;
  x: number;
  y: number;
  size: "hero" | "major" | "minor";
}

export interface GraphLoadingConstellation {
  id: string;
  entity: GraphEntityRef;
  paperCount: number;
  aliases: readonly GraphEntityAlias[];
  anchor: {
    x: number;
    y: number;
  };
  mobileVisible: boolean;
  nodes: readonly GraphLoadingConstellationNode[];
  edges: readonly (readonly [string, string])[];
}

export const GRAPH_LOADING_CONSTELLATIONS: readonly GraphLoadingConstellation[] =
  [
    {
      id: "depression",
      entity: {
        entityType: "disease",
        conceptNamespace: "MESH",
        conceptId: "D003863",
        sourceIdentifier: "MESH:D003863",
        canonicalName: "Major depressive disorder",
      },
      paperCount: 12843,
      aliases: [
        { aliasText: "depression", isCanonical: false, aliasSource: "loader" },
        {
          aliasText: "unipolar depression",
          isCanonical: false,
          aliasSource: "loader",
        },
        { aliasText: "MDD", isCanonical: false, aliasSource: "loader" },
      ],
      anchor: { x: 18, y: 24 },
      mobileVisible: true,
      nodes: [
        {
          id: "depression-hero",
          label: "Major depressive disorder",
          entityType: "disease",
          x: 38,
          y: 40,
          size: "hero",
        },
        {
          id: "depression-serotonin",
          label: "Serotonin",
          entityType: "chemical",
          x: 14,
          y: 18,
          size: "major",
        },
        {
          id: "depression-amygdala",
          label: "Amygdala",
          entityType: "anatomy",
          x: 72,
          y: 22,
          size: "major",
        },
        {
          id: "depression-dmn",
          label: "Rumination",
          entityType: "network",
          x: 62,
          y: 78,
          size: "minor",
        },
        {
          id: "depression-inflammatory",
          label: "Inflammation",
          entityType: "biological process",
          x: 18,
          y: 72,
          size: "minor",
        },
      ],
      edges: [
        ["depression-hero", "depression-serotonin"],
        ["depression-hero", "depression-amygdala"],
        ["depression-hero", "depression-dmn"],
        ["depression-hero", "depression-inflammatory"],
      ],
    },
    {
      id: "ketamine",
      entity: {
        entityType: "chemical",
        conceptNamespace: "MESH",
        conceptId: "D020154",
        sourceIdentifier: "MESH:D020154",
        canonicalName: "Ketamine",
      },
      paperCount: 4312,
      aliases: [
        { aliasText: "esketamine", isCanonical: false, aliasSource: "loader" },
        {
          aliasText: "rapid-acting antidepressant",
          isCanonical: false,
          aliasSource: "loader",
        },
        { aliasText: "NMDA blocker", isCanonical: false, aliasSource: "loader" },
      ],
      anchor: { x: 82, y: 24 },
      mobileVisible: true,
      nodes: [
        {
          id: "ketamine-hero",
          label: "Ketamine",
          entityType: "chemical",
          x: 58,
          y: 55,
          size: "hero",
        },
        {
          id: "ketamine-nmda",
          label: "NMDA receptor",
          entityType: "receptor",
          x: 30,
          y: 20,
          size: "major",
        },
        {
          id: "ketamine-mtor",
          label: "mTOR",
          entityType: "gene",
          x: 82,
          y: 34,
          size: "major",
        },
        {
          id: "ketamine-glutamate",
          label: "Glutamate",
          entityType: "chemical",
          x: 16,
          y: 62,
          size: "minor",
        },
        {
          id: "ketamine-plasticity",
          label: "Synaptogenesis",
          entityType: "biological process",
          x: 78,
          y: 80,
          size: "minor",
        },
      ],
      edges: [
        ["ketamine-hero", "ketamine-nmda"],
        ["ketamine-hero", "ketamine-mtor"],
        ["ketamine-hero", "ketamine-glutamate"],
        ["ketamine-hero", "ketamine-plasticity"],
      ],
    },
    {
      id: "bdnf",
      entity: {
        entityType: "gene",
        conceptNamespace: "MESH",
        conceptId: "D019276",
        sourceIdentifier: "MESH:D019276",
        canonicalName: "BDNF",
      },
      paperCount: 6784,
      aliases: [
        {
          aliasText: "brain-derived neurotrophic factor",
          isCanonical: false,
          aliasSource: "loader",
        },
        { aliasText: "TrkB axis", isCanonical: false, aliasSource: "loader" },
        {
          aliasText: "plasticity marker",
          isCanonical: false,
          aliasSource: "loader",
        },
      ],
      anchor: { x: 18, y: 72 },
      mobileVisible: true,
      nodes: [
        {
          id: "bdnf-hero",
          label: "BDNF",
          entityType: "gene",
          x: 45,
          y: 58,
          size: "hero",
        },
        {
          id: "bdnf-hippocampus",
          label: "Hippocampus",
          entityType: "anatomy",
          x: 20,
          y: 25,
          size: "major",
        },
        {
          id: "bdnf-creb",
          label: "CREB",
          entityType: "gene",
          x: 68,
          y: 18,
          size: "major",
        },
        {
          id: "bdnf-stress",
          label: "Stress",
          entityType: "network",
          x: 78,
          y: 65,
          size: "minor",
        },
        {
          id: "bdnf-plasticity",
          label: "Plasticity",
          entityType: "biological process",
          x: 22,
          y: 82,
          size: "minor",
        },
      ],
      edges: [
        ["bdnf-hero", "bdnf-hippocampus"],
        ["bdnf-hero", "bdnf-creb"],
        ["bdnf-hero", "bdnf-stress"],
        ["bdnf-hero", "bdnf-plasticity"],
      ],
    },
    {
      id: "default-mode-network",
      entity: {
        entityType: "network",
        conceptNamespace: null,
        conceptId: "default-mode-network",
        sourceIdentifier: "default-mode-network",
        canonicalName: "Default mode network",
      },
      paperCount: 3590,
      aliases: [
        { aliasText: "DMN", isCanonical: false, aliasSource: "loader" },
        {
          aliasText: "self-referential network",
          isCanonical: false,
          aliasSource: "loader",
        },
        {
          aliasText: "resting-state network",
          isCanonical: false,
          aliasSource: "loader",
        },
      ],
      anchor: { x: 82, y: 72 },
      mobileVisible: false,
      nodes: [
        {
          id: "dmn-hero",
          label: "Default mode network",
          entityType: "network",
          x: 55,
          y: 42,
          size: "hero",
        },
        {
          id: "dmn-salience",
          label: "Salience network",
          entityType: "network",
          x: 18,
          y: 55,
          size: "major",
        },
        {
          id: "dmn-mpfc",
          label: "mPFC",
          entityType: "anatomy",
          x: 80,
          y: 18,
          size: "major",
        },
        {
          id: "dmn-cingulate",
          label: "ACC",
          entityType: "anatomy",
          x: 35,
          y: 80,
          size: "minor",
        },
        {
          id: "dmn-rumination",
          label: "Rumination",
          entityType: "biological process",
          x: 82,
          y: 68,
          size: "minor",
        },
      ],
      edges: [
        ["dmn-hero", "dmn-salience"],
        ["dmn-hero", "dmn-mpfc"],
        ["dmn-hero", "dmn-cingulate"],
        ["dmn-hero", "dmn-rumination"],
      ],
    },
    {
      id: "locus-coeruleus",
      entity: {
        entityType: "anatomy",
        conceptNamespace: null,
        conceptId: "locus-coeruleus",
        sourceIdentifier: "locus-coeruleus",
        canonicalName: "Locus coeruleus",
      },
      paperCount: 1874,
      aliases: [
        { aliasText: "LC", isCanonical: false, aliasSource: "loader" },
        {
          aliasText: "noradrenergic hub",
          isCanonical: false,
          aliasSource: "loader",
        },
        {
          aliasText: "arousal nucleus",
          isCanonical: false,
          aliasSource: "loader",
        },
      ],
      anchor: { x: 50, y: 12 },
      mobileVisible: false,
      nodes: [
        {
          id: "lc-hero",
          label: "Locus coeruleus",
          entityType: "anatomy",
          x: 42,
          y: 35,
          size: "hero",
        },
        {
          id: "lc-ne",
          label: "Norepinephrine",
          entityType: "chemical",
          x: 75,
          y: 20,
          size: "major",
        },
        {
          id: "lc-stress",
          label: "Stress reactivity",
          entityType: "network",
          x: 15,
          y: 58,
          size: "major",
        },
        {
          id: "lc-amygdala",
          label: "Amygdala",
          entityType: "anatomy",
          x: 65,
          y: 75,
          size: "minor",
        },
        {
          id: "lc-arousal",
          label: "Arousal",
          entityType: "biological process",
          x: 80,
          y: 55,
          size: "minor",
        },
      ],
      edges: [
        ["lc-hero", "lc-ne"],
        ["lc-hero", "lc-stress"],
        ["lc-hero", "lc-amygdala"],
        ["lc-hero", "lc-arousal"],
      ],
    },
    {
      id: "5ht2a",
      entity: {
        entityType: "receptor",
        conceptNamespace: null,
        conceptId: "5-ht2a-receptor",
        sourceIdentifier: "5-ht2a-receptor",
        canonicalName: "5-HT2A receptor",
      },
      paperCount: 2248,
      aliases: [
        { aliasText: "HTR2A", isCanonical: false, aliasSource: "loader" },
        {
          aliasText: "serotonin receptor 2A",
          isCanonical: false,
          aliasSource: "loader",
        },
        {
          aliasText: "cortical receptor",
          isCanonical: false,
          aliasSource: "loader",
        },
      ],
      anchor: { x: 50, y: 86 },
      mobileVisible: false,
      nodes: [
        {
          id: "5ht2a-hero",
          label: "5-HT2A receptor",
          entityType: "receptor",
          x: 52,
          y: 62,
          size: "hero",
        },
        {
          id: "5ht2a-serotonin",
          label: "Serotonin",
          entityType: "chemical",
          x: 28,
          y: 22,
          size: "major",
        },
        {
          id: "5ht2a-cortex",
          label: "Cortex",
          entityType: "anatomy",
          x: 78,
          y: 40,
          size: "major",
        },
        {
          id: "5ht2a-thalamus",
          label: "Thalamus",
          entityType: "anatomy",
          x: 15,
          y: 75,
          size: "minor",
        },
        {
          id: "5ht2a-plasticity",
          label: "Psychedelic response",
          entityType: "biological process",
          x: 75,
          y: 82,
          size: "minor",
        },
      ],
      edges: [
        ["5ht2a-hero", "5ht2a-serotonin"],
        ["5ht2a-hero", "5ht2a-cortex"],
        ["5ht2a-hero", "5ht2a-thalamus"],
        ["5ht2a-hero", "5ht2a-plasticity"],
      ],
    },
    {
      id: "synaptic-plasticity",
      entity: {
        entityType: "biological process",
        conceptNamespace: null,
        conceptId: "synaptic-plasticity",
        sourceIdentifier: "synaptic-plasticity",
        canonicalName: "Synaptic plasticity",
      },
      paperCount: 5186,
      aliases: [
        {
          aliasText: "neuroplasticity",
          isCanonical: false,
          aliasSource: "loader",
        },
        {
          aliasText: "synaptogenesis",
          isCanonical: false,
          aliasSource: "loader",
        },
        {
          aliasText: "activity-dependent remodeling",
          isCanonical: false,
          aliasSource: "loader",
        },
      ],
      anchor: { x: 34, y: 48 },
      mobileVisible: false,
      nodes: [
        {
          id: "plasticity-hero",
          label: "Synaptic plasticity",
          entityType: "biological process",
          x: 60,
          y: 38,
          size: "hero",
        },
        {
          id: "plasticity-bdnf",
          label: "BDNF",
          entityType: "gene",
          x: 25,
          y: 50,
          size: "major",
        },
        {
          id: "plasticity-hippocampus",
          label: "Hippocampus",
          entityType: "anatomy",
          x: 82,
          y: 58,
          size: "major",
        },
        {
          id: "plasticity-ketamine",
          label: "Ketamine",
          entityType: "chemical",
          x: 40,
          y: 78,
          size: "minor",
        },
        {
          id: "plasticity-learning",
          label: "Learning",
          entityType: "network",
          x: 78,
          y: 15,
          size: "minor",
        },
      ],
      edges: [
        ["plasticity-hero", "plasticity-bdnf"],
        ["plasticity-hero", "plasticity-hippocampus"],
        ["plasticity-hero", "plasticity-ketamine"],
        ["plasticity-hero", "plasticity-learning"],
      ],
    },
    {
      id: "mus-musculus",
      entity: {
        entityType: "species",
        conceptNamespace: "NCBITaxon",
        conceptId: "10090",
        sourceIdentifier: "NCBITaxon:10090",
        canonicalName: "Mus musculus",
      },
      paperCount: 3914,
      aliases: [
        { aliasText: "mouse", isCanonical: false, aliasSource: "loader" },
        {
          aliasText: "murine model",
          isCanonical: false,
          aliasSource: "loader",
        },
        {
          aliasText: "preclinical model organism",
          isCanonical: false,
          aliasSource: "loader",
        },
      ],
      anchor: { x: 66, y: 48 },
      mobileVisible: false,
      nodes: [
        {
          id: "mouse-hero",
          label: "Mus musculus",
          entityType: "species",
          x: 48,
          y: 45,
          size: "hero",
        },
        {
          id: "mouse-hippocampus",
          label: "Hippocampus",
          entityType: "anatomy",
          x: 18,
          y: 15,
          size: "major",
        },
        {
          id: "mouse-bdnf",
          label: "BDNF",
          entityType: "gene",
          x: 82,
          y: 25,
          size: "major",
        },
        {
          id: "mouse-ketamine",
          label: "Ketamine",
          entityType: "chemical",
          x: 72,
          y: 78,
          size: "minor",
        },
        {
          id: "mouse-stress",
          label: "Stress response",
          entityType: "biological process",
          x: 22,
          y: 72,
          size: "minor",
        },
      ],
      edges: [
        ["mouse-hero", "mouse-hippocampus"],
        ["mouse-hero", "mouse-bdnf"],
        ["mouse-hero", "mouse-ketamine"],
        ["mouse-hero", "mouse-stress"],
      ],
    },
  ] as const;
