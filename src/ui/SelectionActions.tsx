import { useEffect, useRef } from "react";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

/** Opens the shared stitch picker whenever a new multi-selection is formed. */
export function SelectionActions() {
  const selectedIds = useUiStore((state) => state.selectedPlacementIds);
  const openPicker = useUiStore((state) => state.openPicker);
  const index = useDocStore((state) => state.index);
  const revision = useDocStore((state) => state.revision);
  const openedSelection = useRef("");

  useEffect(() => {
    if (selectedIds.length < 2) {
      openedSelection.current = "";
      return;
    }
    const key = [...selectedIds].sort().join(":");
    if (openedSelection.current === key) return;
    const selected = selectedIds.flatMap((id) => {
      const placement = index.placements.get(id);
      return placement ? [placement] : [];
    });
    if (selected.length < 2) return;
    openedSelection.current = key;
    const first = selected[0]!;
    const span = index.spanOf(first);
    const sameSpan = selected.every((placement) => index.spanOf(placement) === span);
    openPicker({
      col: first.col,
      row: first.row,
      x: 0,
      y: 0,
      selectionIds: selectedIds,
      ...(sameSpan ? { selectionSpan: span } : null),
    });
  }, [index, openPicker, revision, selectedIds]);

  return null;
}
