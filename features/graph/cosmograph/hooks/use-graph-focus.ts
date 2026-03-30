"use client";

import { useCallback } from "react";
import type { GraphPointRecord } from "@/features/graph/types";
import { useGraphStore } from "@/features/graph/stores";
import { useGraphCamera } from "./use-graph-camera";
import { useGraphSelection } from "./use-graph-selection";

interface FocusPointOptions {
  zoomDuration?: number | null;
  selectPoint?: boolean;
  addToSelection?: boolean;
  expandLinks?: boolean;
}

function isSameResolvedTarget(
  selectedNode: GraphPointRecord | null,
  index: number,
  node?: GraphPointRecord | null,
) {
  if (selectedNode == null) {
    return false;
  }

  if (selectedNode.index !== index) {
    return false;
  }

  if (!node) {
    return true;
  }

  return selectedNode.id === node.id;
}

export function useGraphFocus() {
  const focusedPointIndex = useGraphStore((s) => s.focusedPointIndex);
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const { zoomToPoint } = useGraphCamera();
  const { selectPoint, setFocusedPoint } = useGraphSelection();

  const focusPoint = useCallback(
    (
      index: number,
      {
        zoomDuration = 250,
        selectPoint: shouldSelectPoint = false,
        addToSelection = false,
        expandLinks = false,
      }: FocusPointOptions = {},
    ) => {
      const changedFocus = focusedPointIndex !== index;

      if (changedFocus) {
        setFocusedPoint(index);
      }

      if (shouldSelectPoint && changedFocus) {
        selectPoint(index, addToSelection, expandLinks);
      }

      if (changedFocus && zoomDuration != null) {
        zoomToPoint(index, zoomDuration);
      }

      return changedFocus;
    },
    [focusedPointIndex, selectPoint, setFocusedPoint, zoomToPoint],
  );

  const focusNode = useCallback(
    (
      node: GraphPointRecord,
      options?: FocusPointOptions,
    ) => {
      const sameResolvedTarget = isSameResolvedTarget(
        selectedNode,
        node.index,
        node,
      );

      if (!sameResolvedTarget) {
        selectNode(node);
      }

      const changedFocus = focusPoint(node.index, options);

      return changedFocus || !sameResolvedTarget;
    },
    [focusPoint, selectNode, selectedNode],
  );

  return {
    focusPoint,
    focusNode,
    isFocusedPoint: useCallback(
      (index: number) => focusedPointIndex === index,
      [focusedPointIndex],
    ),
  };
}
