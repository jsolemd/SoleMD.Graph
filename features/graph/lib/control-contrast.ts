export interface GraphContentContrastInput {
  showLabels: boolean;
  showDynamicLabels: boolean;
  showTopLabels: boolean;
}

export interface GraphControlContrastInput {
  graphContentContrastLevel: 0 | 1 | 2;
  hasFocusedPoint: boolean;
  hasSelection: boolean;
}

export function resolveGraphContentContrastLevel({
  showLabels,
  showDynamicLabels,
  showTopLabels,
}: GraphContentContrastInput): 0 | 1 | 2 {
  if (showDynamicLabels) {
    return 2;
  }

  if (showLabels || showTopLabels) {
    return 1;
  }

  return 0;
}

export function resolveGraphControlContrastLevel({
  graphContentContrastLevel,
  hasFocusedPoint,
  hasSelection,
}: GraphControlContrastInput): 1 | 2 {
  if (hasFocusedPoint || graphContentContrastLevel >= 2) {
    return 2;
  }

  if (hasSelection || graphContentContrastLevel >= 1) {
    return 2;
  }

  return 1;
}
