export interface GraphLabelModeInput {
  pointLabelColumn: string;
  showPointLabels: boolean;
  showDynamicLabels: boolean;
  showHoveredPointLabel: boolean;
  hoverLabelAlwaysOn: boolean;
  zoomedIn: boolean;
  isActivelyZooming: boolean;
  hasFocusedPoint: boolean;
  focusedPointId?: string | null;
  hasSelection: boolean;
}

export interface GraphLabelMode {
  effectivePointLabelColumn: string;
  showLabels: boolean;
  showDynamicLabels: boolean;
  showTopLabels: boolean;
  showHoveredPointLabel: boolean;
  showFocusedPointLabel: boolean;
  showSelectedLabels: boolean;
  showUnselectedPointLabels: boolean;
  showClusterLabels: boolean;
  selectedPointLabelsLimit: number;
  showLabelsFor?: string[];
}

const DEFAULT_SELECTED_POINT_LABELS_LIMIT = 24;

export function resolveGraphLabelMode({
  pointLabelColumn,
  showPointLabels,
  showDynamicLabels,
  showHoveredPointLabel,
  hoverLabelAlwaysOn,
  zoomedIn,
  isActivelyZooming,
  hasFocusedPoint,
  focusedPointId,
  hasSelection,
}: GraphLabelModeInput): GraphLabelMode {
  const selectionDriven = hasFocusedPoint || hasSelection;
  const zoomDrivenDisplayLabels =
    zoomedIn && pointLabelColumn === "clusterLabel";
  const effectivePointLabelColumn =
    selectionDriven || zoomDrivenDisplayLabels
      ? "displayLabel"
      : pointLabelColumn;
  const labelsEnabled = showPointLabels || selectionDriven;

  return {
    effectivePointLabelColumn,
    showLabels: labelsEnabled,
    showDynamicLabels:
      labelsEnabled &&
      showDynamicLabels &&
      !hasFocusedPoint &&
      !hasSelection,
    showTopLabels:
      labelsEnabled &&
      !isActivelyZooming &&
      !hasFocusedPoint &&
      !hasSelection,
    showHoveredPointLabel:
      showHoveredPointLabel &&
      (hoverLabelAlwaysOn || zoomedIn) &&
      !isActivelyZooming,
    showFocusedPointLabel: hasFocusedPoint,
    showSelectedLabels: labelsEnabled && hasSelection,
    showUnselectedPointLabels: !hasSelection,
    showClusterLabels: false,
    selectedPointLabelsLimit: hasFocusedPoint
      ? 1
      : DEFAULT_SELECTED_POINT_LABELS_LIMIT,
    showLabelsFor:
      hasFocusedPoint && focusedPointId
        ? [focusedPointId]
        : undefined,
  };
}
