import entityEdgeSpecJson from "../spec/entity-edge-spec.json" with { type: "json" };

export interface EntityEdgeWeightFormula {
  alpha_citation: number;
  beta_idf_entity: number;
  idf_base: string;
}

export interface EntityEdgeSpec {
  entity_type_allowlist: string[];
  min_shared_entity_count: number;
  max_neighbors_per_node: number;
  weight_formula: EntityEdgeWeightFormula;
  thresholds: {
    edge_min_weight: number;
  };
}

export const ENTITY_EDGE_SPEC = entityEdgeSpecJson satisfies EntityEdgeSpec;
