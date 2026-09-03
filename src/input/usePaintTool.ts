import { type RefObject, useEffect } from "react";
import { type Cell, screenToCell } from "../canvas/camera";
import { RULER } from "../canvas/theme";
import { DocIndex } from "../model/docIndex";
import { stitchGroups } from "../model/stitchNumbers";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

/**
 * Placing, selecting, and moving stitches.
 *
 *   click empty cell        place the armed stitch, or open the picker if none is armed
 *   click filled cell       select it (its whole group, if it's part of one)
 *   drag an existing selection   move it together, from any tool
 *   drag in Select           marquee-select every symbol in the cell rectangle
 *   cmd/ctrl + click/drag    temporarily use Select
 *   drag from an empty cell  paint the armed stitch across cells
 *   double click              open the picker at that cell, to place or replace
 *
 * There's no dedicated erase gesture: select a stitch (or several) and press
 * Delete instead.
 *
 * A click and a drag start the same way, so the filled-cell check only applies
 * to the initial pointerdown — once a paint stroke is underway, dragging
 * across already-filled cells keeps painting through them as normal.
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

    /**
     * groupId -> member placement ids, for every grouped placement in the
     * document. Built once per call rather than once per matched placement:
     * a marquee drag calls this on every pointermove that crosses into a new
     * cell, and groupIdsFor's own per-placement scan would otherwise re-walk
     * every placement in the document for each cell the marquee covers.
     */
    const groupMembersMap = (): Map<string, string[]> => {
      const map = new Map<string, string[]>();
      for (const placement of doc().index.placements.values()) {
        if (!placement.groupId) continue;
        const members = map.get(placement.groupId);
        if (members) members.push(placement.id);
        else map.set(placement.groupId, [placement.id]);
      }
      return map;
    };

    /** Select `placementId`'s whole group; `additive` toggles it into/out of the existing selection. */
    const selectExisting = (placementId: string, additive: boolean) => {
      const ids = groupIdsFor(placementId);
      if (!additive) {
        ui().setSelectedPlacementIds(ids);
        return;
      }
      const selected = new Set(ui().selectedPlacementIds);
      const removing = ids.every((id) => selected.has(id));
      for (const id of ids) {
        if (removing) selected.delete(id);
        else selected.add(id);
      }
      ui().setSelectedPlacementIds([...selected]);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (ui().spaceHeld || e.button !== 0) return; // panning, or not a plain left click

      // A click on the canvas while the picker is open just dismisses it,
      // rather than also dropping a stitch where the user aimed to close.
      if (ui().picker) {
        ui().closePicker();
        return;
      }

      const cell = cellAt(e);
      if (!cell) return;

      // An existing multi-select is always draggable from within it, no
      // matter which tool is active - Cmd/Select is only needed to *start* a
      // selection, not to move one that's already made.
      if (!e.shiftKey && ui().selectedPlacementIds.length && insideSelectedArea(cell)) {
        e.preventDefault();
        movingSelection = true;
        selectionStart = cell;
        last = cell;
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      const temporarySelect = ui().selectHeld || e.metaKey || e.ctrlKey;
      if (ui().tool === "select" || temporarySelect) {
        e.preventDefault();
        selecting = true;
        selectionStart = cell;
        selectionBaseline = e.shiftKey ? [...ui().selectedPlacementIds] : [];
        selectionAdditive = e.shiftKey;
        selectionMoved = false;
        last = cell;
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      // A click that starts on an existing stitch selects it rather than
      // painting or opening the picker - the picker still opens via double
      // click, and there's no dedicated erase gesture: select and Delete.
      const existing = doc().index.placementAt(cell.col, cell.row);
      if (existing) {
        selectExisting(existing.id, e.shiftKey);
        return;
      }

      if (!ui().armedSymbolId) {
        const rect = canvas.getBoundingClientRect();
        ui().openPicker({
          col: cell.col,
          row: cell.row,
          x: e.clientX - rect.left + 8,
          y: e.clientY - rect.top + 8,
        });
        return;
      }

      e.preventDefault();
      painting = true;
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
        const move = { col: cell.col - selectionStart.col, row: cell.row - selectionStart.row };
        const blocked =
          (move.col !== 0 || move.row !== 0) &&
          !doc().canMovePlacements(ui().selectedPlacementIds, move.col, move.row);
        ui().setSelectionMove({ ...move, blocked });
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
        const groups = groupMembersMap();
        const ids = doc()
          .index.query({ minCol, maxCol, minRow, maxRow })
          .flatMap((placement) => groups.get(placement.groupId ?? "") ?? [placement.id]);
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
            selectExisting(existing.id, selectionAdditive);
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
      last = null;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      doc().endStroke();
    };

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
    canvas.addEventListener("dblclick", onDoubleClick);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endStroke);
      canvas.removeEventListener("pointercancel", endStroke);
      canvas.removeEventListener("dblclick", onDoubleClick);
    };
  }, [ref]);
}
