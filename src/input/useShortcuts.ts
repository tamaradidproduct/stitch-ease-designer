import { useEffect } from "react";
import { cellToScreenRect } from "../canvas/camera";
import type { Placement } from "../model/types";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable);

/**
 * Editing shortcuts.
 *
 *   cmd/ctrl Z        undo            shift for redo - restores a just-cleared
 *                     selection first, before touching the chart history
 *   Tab / Shift+Tab   select the next stitch to the right / left
 *   /                 open the picker at the hovered cell
 *   escape            clear selection, or disarm the current stitch
 *   S / D / E / I     select / draw / erase / insert
 *   Delete/Backspace  erase the selection
 */
export function useShortcuts(): void {
  useEffect(() => {
    let shiftHeld = false;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftHeld = true;
      if (e.key === "Meta" || e.key === "Control") {
        useUiStore.getState().setSelectHeld(true);
      }

      // The picker owns its own keys while its search field has focus.
      if (isTyping(e.target) && e.key !== "Tab") return;

      const ui = useUiStore.getState();
      const doc = useDocStore.getState();

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doc.redo();
        else if (!ui.restoreLastClearedSelection()) doc.undo();
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        ui.setKeyboardSelectionActive(true);
        ui.setHover(null);
        ui.setInsertHover(null);
        const selected = ui.selectedPlacementIds
          .map((id) => doc.index.placements.get(id))
          .filter((placement): placement is Placement => !!placement);
        if (!selected.length) return;
        const row = selected[0]!.row;
        const inRow = doc.index.toArray().filter((placement) => placement.row === row);
        const minCol = Math.min(...selected.map((placement) => placement.col));
        const maxCol = Math.max(...selected.map(
          (placement) => placement.col + doc.index.spanOf(placement) - 1,
        ));
        const reverse = e.shiftKey || shiftHeld;
        const candidate = reverse
          ? inRow
            .filter((placement) => placement.col + doc.index.spanOf(placement) - 1 < minCol)
            .sort((a, b) => b.col - a.col)[0]
          : inRow
            .filter((placement) => placement.col > maxCol)
            .sort((a, b) => a.col - b.col)[0];
        if (candidate) {
          ui.setSelectedPlacementIds([candidate.id]);
          const r = cellToScreenRect(candidate.col, candidate.row, ui.camera, ui.viewport);
          ui.openPicker({
            col: candidate.col,
            row: candidate.row,
            x: r.x + 8,
            y: r.y + 8,
            currentSymbolId: candidate.symbolId,
            selectionIds: [candidate.id],
            selectionSpan: doc.index.spanOf(candidate),
          });
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        ui.setClipboardPlacements(ui.selectedPlacementIds
          .map((id) => doc.index.placements.get(id))
          .filter((placement): placement is Placement => !!placement)
          .map((placement) => ({ ...placement })));
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        ui.setClipboardPlacements(ui.selectedPlacementIds
          .map((id) => doc.index.placements.get(id))
          .filter((placement): placement is Placement => !!placement)
          .map((placement) => ({ ...placement })));
        if (ui.selectedPlacementIds.length) {
          doc.erasePlacements(ui.selectedPlacementIds);
          ui.clearSelection();
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        if (!ui.clipboardPlacements.length || !ui.hover) return;
        const minCol = Math.min(...ui.clipboardPlacements.map((placement) => placement.col));
        const minRow = Math.min(...ui.clipboardPlacements.map((placement) => placement.row));
        const deltaCol = ui.hover.col - minCol;
        const deltaRow = ui.hover.row - minRow;
        doc.beginStroke();
        const before = new Set(doc.index.placements.keys());
        for (const placement of ui.clipboardPlacements) {
          doc.place(
            placement.symbolId,
            placement.col + deltaCol,
            placement.row + deltaRow,
          );
        }
        doc.endStroke();
        const ids = doc.index.toArray().filter((placement) => !before.has(placement.id)).map((p) => p.id);
        if (ids.length) ui.setSelectedPlacementIds(ids, false);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        if (!ui.selectedPlacementIds.length) return;
        e.preventDefault();
        const ids = doc.duplicatePlacementsInRow(ui.selectedPlacementIds);
        if (ids.length) {
          ui.closePicker();
          ui.setSelectedPlacementIds(ids, false);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "g") {
        if (!ui.selectedPlacementIds.length) return;
        e.preventDefault();
        doc.createRepeat(ui.selectedPlacementIds);
        return;
      }

      if (e.key === "Escape") {
        if (ui.picker) ui.closePicker();
        else if (ui.selectedPlacementIds.length) ui.clearSelectionWithUndo();
        else ui.setArmedSymbolId(null);
        return;
      }

      if ((e.key === "Backspace" || e.key === "Delete") && ui.selectedPlacementIds.length) {
        e.preventDefault();
        doc.erasePlacements(ui.selectedPlacementIds);
        ui.clearSelection();
        return;
      }

      if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey) {
        ui.setTool("select");
        return;
      }

      if (e.key.toLowerCase() === "d" && !e.metaKey && !e.ctrlKey) {
        ui.setTool("stitch");
        return;
      }

      if (e.key.toLowerCase() === "e" && !e.metaKey && !e.ctrlKey) {
        ui.setTool(ui.tool === "eraser" ? "stitch" : "eraser");
        return;
      }

      if (e.key.toLowerCase() === "i" && !e.metaKey && !e.ctrlKey) {
        ui.setTool(ui.tool === "insert" ? "stitch" : "insert");
        return;
      }

      if (e.key === "/" && ui.hover) {
        e.preventDefault();
        const r = cellToScreenRect(ui.hover.col, ui.hover.row, ui.camera, ui.viewport);
        const existing = doc.index.placementAt(ui.hover.col, ui.hover.row);
        ui.openPicker({
          col: ui.hover.col,
          row: ui.hover.row,
          x: r.x + 8,
          y: r.y + 8,
          ...(existing ? { currentSymbolId: existing.symbolId } : null),
        });
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftHeld = false;
      if (e.key === "Meta" || e.key === "Control") {
        useUiStore.getState().setSelectHeld(false);
      }
    };

    const onBlur = () => {
      shiftHeld = false;
      useUiStore.getState().setSelectHeld(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
