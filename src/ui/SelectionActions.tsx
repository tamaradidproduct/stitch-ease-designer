import { useEffect, useRef } from "react";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

/**
 * Opens the shared stitch picker whenever a new multi-selection is formed -
 * placements and empty cells alike. A single-cell selection of either kind
 * already opens its own picker as part of the click/marquee gesture that
 * made it; this only covers the multi-cell case, which a marquee can land
 * on without ever going through that per-click path.
 */
export function SelectionActions() {
  const selectedIds = useUiStore((state) => state.selectedPlacementIds);
  const selectedEmptyCells = useUiStore((state) => state.selectedEmptyCells);
  const openPicker = useUiStore((state) => state.openPicker);
  const index = useDocStore((state) => state.index);
  const revision = useDocStore((state) => state.revision);
  const openedSelection = useRef("");
  const openedEmptySelection = useRef("");

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

  useEffect(() => {
    if (selectedEmptyCells.length < 2) {
      openedEmptySelection.current = "";
      return;
    }
    const key = selectedEmptyCells.map((c) => `${c.col},${c.row}`).sort().join(":");
    if (openedEmptySelection.current === key) return;
    openedEmptySelection.current = key;
    const first = selectedEmptyCells[0]!;
    openPicker({
      col: first.col,
      row: first.row,
      x: 0,
      y: 0,
      selectionEmptyCells: selectedEmptyCells,
    });
  }, [openPicker, selectedEmptyCells]);

  return null;
}
