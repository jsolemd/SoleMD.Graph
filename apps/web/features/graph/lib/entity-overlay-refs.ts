import type {
  GraphEntityRef,
  GraphEntityOverlayRef,
} from "@solemd/api-client/shared/graph-entity";

const EMPTY_ENTITY_OVERLAY_REFS = Object.freeze(
  [],
) as readonly GraphEntityOverlayRef[];

export function toEntityOverlayRef(
  entity: Pick<GraphEntityRef, "entityType" | "sourceIdentifier">,
): GraphEntityOverlayRef {
  return {
    entityType: entity.entityType,
    sourceIdentifier: entity.sourceIdentifier,
  };
}

export function deduplicateEntityOverlayRefs(
  refs: readonly GraphEntityOverlayRef[],
): readonly GraphEntityOverlayRef[] {
  if (refs.length === 0) {
    return EMPTY_ENTITY_OVERLAY_REFS;
  }

  const seen = new Set<string>();
  const deduplicated: GraphEntityOverlayRef[] = [];

  for (const ref of refs) {
    const key = `${ref.entityType}:${ref.sourceIdentifier}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduplicated.push(ref);
  }

  return Object.freeze(deduplicated);
}

export function computeEntityOverlayRefsKey(
  refs: readonly GraphEntityOverlayRef[],
): string {
  if (refs.length === 0) {
    return "";
  }

  const uniqueKeys = new Set<string>();
  for (const ref of refs) {
    uniqueKeys.add(`${ref.entityType}:${ref.sourceIdentifier}`);
  }

  return Array.from(uniqueKeys).sort().join("\n");
}

export function areEntityOverlayRefsEqual(
  left: readonly GraphEntityOverlayRef[],
  right: readonly GraphEntityOverlayRef[],
): boolean {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return computeEntityOverlayRefsKey(left) === computeEntityOverlayRefsKey(right);
}
