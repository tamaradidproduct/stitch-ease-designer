import { useEffect } from "react";
import { cellToScreenRect } from "../canvas/camera";
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
 *   cmd/ctrl Z        undo            shift for redo
 *   /                 open the picker at the hovered cell
 *   escape            clear selection, or disarm the current stitch
 *   S / D             select / draw
 *   E                 toggle the eraser
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        useUiStore.getState().setSelectHeld(true);
      }

      // The picker owns its own keys while its search field has focus.
      if (isTyping(e.target)) return;

      const ui = useUiStore.getState();
      const doc = useDocStore.getState();

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doc.redo();
        else doc.undo();
        return;
      }

      if (e.key === "Escape") {
        if (ui.picker) ui.closePicker();
        else if (ui.selectedPlacementIds.length) ui.clearSelection();
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

      if (e.key.toLowerCase() === "e" && !e.metaKey && !e.ctrlKey) {
        ui.setTool(ui.tool === "eraser" ? "stitch" : "eraser");
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        useUiStore.getState().setSelectHeld(false);
      }
    };

    const onBlur = () => useUiStore.getState().setSelectHeld(false);

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
