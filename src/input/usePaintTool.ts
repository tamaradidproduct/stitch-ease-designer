import { type RefObject, useEffect } from "react";
import { type Cell, screenToCell } from "../canvas/camera";
import { RULER } from "../canvas/theme";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

/**
 * Placing and erasing stitches.
 *
 *   click            place the armed stitch, or open the picker if none is armed
 *   drag             paint the armed stitch across cells
 *   right / alt      erase
 *   double click     reopen the picker at that cell
 *
 * Pan gestures win: space-drag and middle-drag are handled by usePanZoom, and
 * this hook stays out of the way when either is in play.
 */
export function usePaintTool(ref: RefObject<HTMLCanvasElement | null>): void {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ui = useUiStore.getState;
    const doc = useDocStore.getState;

    let painting = false;
    let erasing = false;
    let last: Cell | null = null;

    const cellAt = (e: PointerEvent | MouseEvent): Cell | null => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (sx < RULER || sy < RULER) return null;
      const { camera, viewport } = ui();
      return screenToCell(sx, sy, camera, viewport);
    };

    const paint = (cell: Cell) => {
      if (last && last.col === cell.col && last.row === cell.row) return;
      last = cell;
      if (erasing) {
        doc().erase(cell.col, cell.row);
        return;
      }
      const armed = ui().armedSymbolId;
      if (armed) doc().place(armed, cell.col, cell.row);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (ui().spaceHeld || e.button === 1) return; // panning

      // A click on the canvas while the picker is open just dismisses it,
      // rather than also dropping a stitch where the user aimed to close.
      if (ui().picker) {
        ui().closePicker();
        return;
      }

      const cell = cellAt(e);
      if (!cell) return;

      const wantsErase = e.button === 2 || e.altKey || ui().tool === "eraser";
      if (!wantsErase && !ui().armedSymbolId) {
        const rect = canvas.getBoundingClientRect();
        ui().openPicker({
          col: cell.col,
          row: cell.row,
          x: e.clientX - rect.left + 8,
          y: e.clientY - rect.top + 8,
        });
        return;
      }

      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault();
      painting = true;
      erasing = wantsErase;
      last = null;
      canvas.setPointerCapture(e.pointerId);
      doc().beginStroke();
      paint(cell);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!painting) return;
      const cell = cellAt(e);
      if (cell) paint(cell);
    };

    const endStroke = (e: PointerEvent) => {
      if (!painting) return;
      painting = false;
      erasing = false;
      last = null;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      doc().endStroke();
    };

    // Right-drag is an erase gesture, so the context menu must not interrupt.
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onDoubleClick = (e: MouseEvent) => {
      const cell = cellAt(e);
      if (!cell) return;
      const rect = canvas.getBoundingClientRect();
      ui().openPicker({
        col: cell.col,
        row: cell.row,
        x: e.clientX - rect.left + 8,
        y: e.clientY - rect.top + 8,
      });
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointercancel", endStroke);
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("dblclick", onDoubleClick);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endStroke);
      canvas.removeEventListener("pointercancel", endStroke);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("dblclick", onDoubleClick);
    };
  }, [ref]);
}
