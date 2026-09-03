import { type RefObject, useEffect } from "react";
import { type Cell, screenToCell } from "../canvas/camera";
import { RULER } from "../canvas/theme";
import { DocIndex } from "../model/docIndex";
import { stitchGroups } from "../model/stitchNumbers";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

/**
 * Placing and erasing stitches.
 *
 *   click empty cell      place the armed stitch, or open the picker if none is armed
 *   click filled cell     open the picker to replace the placed symbol
 *   drag in Select        marquee-select every symbol in the cell rectangle
 *   cmd/ctrl + click/drag temporarily use Select
 *   drag                  paint the armed stitch across cells, filled or not
 *   right / alt           erase
 *   double click          reopen the picker at that cell
 *
 * A click and a drag start the same way, so the filled-cell check only applies
 * to the initial pointerdown — once a stroke is underway, dragging across
 * already-filled cells keeps painting through them as normal. Erasing is
 * unaffected either way: erase is already the "edit this cell" action.
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
    let selecting = false;
    let erasing = false;
    let last: Cell | null = null;
    let selectionStart: Cell | null = null;
    let selectionBaseline: string[] = [];
    let selectionAdditive = false;
    let selectionMoved = false;
    let movingSelection = false;

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

    const insideSelectedArea = (cell: Cell): boolean => {
      const selected = ui().selectedPlacementIds.flatMap((id) => {
        const placement = doc().index.placements.get(id);
        return placement ? [placement] : [];
      });
      if (!selected.length) return false;

      // Treat each connected selection independently. An irregular group's
      // internal gaps are draggable, but empty space between distant selected
      // groups is not turned into one enormous move target.
      return stitchGroups(DocIndex.from(selected)).some((group) => {
        const coordinates = [...group.cells].map((cellKey) => {
          const [col, row] = cellKey.split(",").map(Number);
          return { col: col!, row: row! };
        });
        const cols = coordinates.map((point) => point.col);
        const rows = coordinates.map((point) => point.row);
        return (
          cell.col >= Math.min(...cols) &&
          cell.col <= Math.max(...cols) &&
          cell.row >= Math.min(...rows) &&
          cell.row <= Math.max(...rows)
        );
      });
    };

    const groupIdsFor = (placementId: string): string[] => {
      const placement = doc().index.placements.get(placementId);
      if (!placement?.groupId) return placement ? [placement.id] : [];
      return [...doc().index.placements.values()]
        .filter((candidate) => candidate.groupId === placement.groupId)
        .map((candidate) => candidate.id);
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

      const temporarySelect = ui().selectHeld || e.metaKey || e.ctrlKey;
      if (ui().tool === "select" || temporarySelect) {
        if (e.button !== 0) return;
        e.preventDefault();
        if (!e.shiftKey && insideSelectedArea(cell)) {
          movingSelection = true;
          selectionStart = cell;
          last = cell;
          canvas.setPointerCapture(e.pointerId);
          return;
        }
        selecting = true;
        selectionStart = cell;
        selectionBaseline = e.shiftKey ? [...ui().selectedPlacementIds] : [];
        selectionAdditive = e.shiftKey;
        selectionMoved = false;
        last = cell;
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      const wantsErase = e.button === 2 || e.altKey || ui().tool === "eraser";
      if (!wantsErase) {
        const existing = doc().index.placementAt(cell.col, cell.row);
        if (existing || !ui().armedSymbolId) {
          const rect = canvas.getBoundingClientRect();
          ui().openPicker({
            col: cell.col,
            row: cell.row,
            x: e.clientX - rect.left + 8,
            y: e.clientY - rect.top + 8,
            ...(existing ? { currentSymbolId: existing.symbolId } : null),
          });
          return;
        }
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
      if (movingSelection) {
        const cell = cellAt(e);
        if (!cell || !selectionStart) return;
        last = cell;
        ui().setSelectionMove({
          col: cell.col - selectionStart.col,
          row: cell.row - selectionStart.row,
        });
        return;
      }
      if (selecting) {
        const cell = cellAt(e);
        if (!cell || (last && last.col === cell.col && last.row === cell.row)) return;
        last = cell;
        selectionMoved = true;
        const start = selectionStart!;
        ui().setSelectionBox({ start, current: cell });
        const minCol = Math.min(start.col, cell.col);
        const maxCol = Math.max(start.col, cell.col);
        const minRow = Math.min(start.row, cell.row);
        const maxRow = Math.max(start.row, cell.row);
        const ids = doc()
          .index.query({ minCol, maxCol, minRow, maxRow })
          .flatMap((placement) => groupIdsFor(placement.id));
        ui().setSelectedPlacementIds([...new Set([...selectionBaseline, ...ids])]);
        return;
      }
      if (!painting) return;
      const cell = cellAt(e);
      if (cell) paint(cell);
    };

    const endStroke = (e: PointerEvent) => {
      if (movingSelection) {
        const move = ui().selectionMove;
        if (move) doc().movePlacements(ui().selectedPlacementIds, move.col, move.row);
        movingSelection = false;
        selectionStart = null;
        last = null;
        ui().setSelectionMove(null);
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        return;
      }
      if (selecting) {
        const start = selectionStart!;
        const existing = doc().index.placementAt(start.col, start.row);
        if (!selectionMoved) {
          if (existing) {
            const ids = groupIdsFor(existing.id);
            if (selectionAdditive) {
              const selected = new Set(ui().selectedPlacementIds);
              const removing = ids.every((id) => selected.has(id));
              for (const id of ids) {
                if (removing) selected.delete(id);
                else selected.add(id);
              }
              ui().setSelectedPlacementIds([...selected]);
            } else ui().setSelectedPlacementIds(ids);
          } else if (!selectionAdditive) {
            ui().clearSelection();
            if (!ui().selectHeld && ui().tool === "select") {
              ui().setTool("stitch");
              const armed = ui().armedSymbolId;
              if (armed) doc().place(armed, start.col, start.row);
              else {
                const rect = canvas.getBoundingClientRect();
                ui().openPicker({
                  col: start.col,
                  row: start.row,
                  x: e.clientX - rect.left + 8,
                  y: e.clientY - rect.top + 8,
                });
              }
            }
          }
        }
        selecting = false;
        selectionStart = null;
        selectionBaseline = [];
        selectionAdditive = false;
        selectionMoved = false;
        ui().setSelectionBox(null);
        last = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        return;
      }
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
      if (ui().tool === "select" || ui().selectHeld || e.metaKey || e.ctrlKey) return;
      const cell = cellAt(e);
      if (!cell) return;
      const rect = canvas.getBoundingClientRect();
      const existing = doc().index.placementAt(cell.col, cell.row);
      ui().openPicker({
        col: cell.col,
        row: cell.row,
        x: e.clientX - rect.left + 8,
        y: e.clientY - rect.top + 8,
        ...(existing ? { currentSymbolId: existing.symbolId } : null),
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
