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
 *   escape            disarm, so the next click opens the picker again
 *   E                 toggle the eraser
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
        else ui.setArmedSymbolId(null);
        return;
      }

      if (e.key === "/" && ui.hover) {
        e.preventDefault();
        const r = cellToScreenRect(ui.hover.col, ui.hover.row, ui.camera, ui.viewport);
        ui.openPicker({ col: ui.hover.col, row: ui.hover.row, x: r.x + 8, y: r.y + 8 });
        return;
      }

      if (e.key.toLowerCase() === "e" && !e.metaKey && !e.ctrlKey) {
        ui.setTool(ui.tool === "eraser" ? "stitch" : "eraser");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
