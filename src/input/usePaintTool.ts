import { type RefObject, useEffect } from "react";
import { type Cell, screenToCell, screenToInsertCell } from "../canvas/camera";
import { RULER } from "../canvas/theme";
import { DocIndex } from "../model/docIndex";
import { stitchGroups } from "../model/stitchNumbers";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

/**
 * Placing, selecting, moving, and inserting stitches.
 *
 *   click empty cell (Draw)     place the armed stitch, or open the picker if none is armed
 *   click filled cell (Draw)    select it (its whole group, if it's part of one)
 *   click a cell (Eraser)       erase whatever's there
 *   click a cell (Insert)       insert the armed stitch there, shifting the rest of the row -
 *                                open the picker first if nothing's armed; no-op inside a
 *                                multi-cell symbol, which can't be split
 *   click away from a selection      clear it, without also placing/erasing on that same click
 *   drag an existing selection       move it together, from any tool
 *   alt/opt + drag a selection       copy it instead of moving it, leaving the originals in place
 *   drag in Select               marquee-select every symbol in the cell rectangle
 *   cmd/ctrl + click/drag        temporarily use Select
 *   shift + click/drag           add to (or remove from) the selection, any tool
 *   drag from an empty cell (Draw/Eraser)  paint or erase across every cell crossed
 *   double click                  open the picker at that cell, to place or replace - not Insert
 *
 * Insert is click-only, not drag-to-repeat like Draw/Eraser: each insert
 * shifts columns out from under the cursor, so repeating it along a drag
 * would keep landing somewhere different than where the pointer visually is.
 *
 * Alt is read live off every pointer move, not just at the start of the
 * drag, so holding or releasing it mid-drag toggles between moving and
 * duplicating without restarting the gesture.
 *
 * A click and a drag start the same way, so the filled-cell check only applies
 * to the initial pointerdown — once a paint stroke is underway, dragging
 * across already-filled cells keeps painting/erasing through them as normal.
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

    // Insert's own target, snapped to the nearest boundary rather than the
    // nearest whole cell - see `screenToInsertCell`. Computed fresh from the
    // event rather than read off `insertHover` so a click always lands
    // exactly where its own indicator was drawn, not wherever the last
    // pointermove happened to leave the store.
    const insertCellAt = (e: PointerEvent | MouseEvent): Cell | null => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (sx < RULER || sy < RULER) return null;
      const { camera, viewport } = ui();
      return screenToInsertCell(sx, sy, camera, viewport);
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
      return doc().index.groupMembers(placement.groupId).map((candidate) => candidate.id);
    };

    /** Select `placementId`'s whole group and return the resulting selection. */
    const selectExisting = (placementId: string, additive: boolean): string[] => {
      const ids = groupIdsFor(placementId);
      if (!additive) {
        ui().setSelectedPlacementIds(ids);
        return ids;
      }
      const selected = new Set(ui().selectedPlacementIds);
      const removing = ids.every((id) => selected.has(id));
      for (const id of ids) {
        if (removing) selected.delete(id);
        else selected.add(id);
      }
      const next = [...selected];
      ui().setSelectedPlacementIds(next);
      return next;
    };

    const openPickerForSingleSelection = (ids: string[], e: PointerEvent) => {
      if (ids.length !== 1) return;
      const placement = doc().index.placements.get(ids[0]!);
      if (!placement) return;
      const rect = canvas.getBoundingClientRect();
      ui().openPicker({
        col: placement.col,
        row: placement.row,
        x: e.clientX - rect.left + 8,
        y: e.clientY - rect.top + 8,
        currentSymbolId: placement.symbolId,
        selectionIds: ids,
        selectionSpan: doc().index.spanOf(placement),
      });
    };

    const onPointerDown = (e: PointerEvent) => {
      if (ui().spaceHeld || e.button !== 0) return; // panning, or not a plain left click

      // The selected stitch remains draggable while its edit picker is open.
      // Other canvas clicks only dismiss the picker, rather than also acting
      // on whatever happened to be underneath the dismissal click.
      if (ui().picker) {
        const pickerCell = cellAt(e);
        ui().closePicker();
        if (
          pickerCell &&
          !e.shiftKey &&
          ui().selectedPlacementIds.length &&
          insideSelectedArea(pickerCell)
        ) {
          e.preventDefault();
          movingSelection = true;
          selectionStart = pickerCell;
          last = pickerCell;
          canvas.setPointerCapture(e.pointerId);
        }
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

      const existing = doc().index.placementAt(cell.col, cell.row);

      // Clicking empty space away from an active selection just dismisses
      // it - the same click doesn't also place or erase, so an accidental
      // deselect doesn't also cost you a stitch.
      if (!e.shiftKey && !existing && ui().selectedPlacementIds.length) {
        ui().clearSelectionWithUndo();
        return;
      }

      if (ui().tool === "eraser") {
        e.preventDefault();
        painting = true;
        erasing = true;
        last = null;
        canvas.setPointerCapture(e.pointerId);
        doc().beginStroke();
        paint(cell);
        return;
      }

      if (ui().tool === "insert") {
        const target = insertCellAt(e);
        // No indicator is shown when this isn't a valid target either (see
        // the renderer), so the click just does nothing rather than
        // silently picking a side or a spot with nothing to insert between.
        if (!target || !doc().canInsertAt(target.col, target.row)) return;
        e.preventDefault();
        const armed = ui().armedSymbolId;
        if (armed) {
          doc().insertPlacement(armed, target.col, target.row);
        } else {
          const rect = canvas.getBoundingClientRect();
          ui().openPicker({
            col: target.col,
            row: target.row,
            x: e.clientX - rect.left + 8,
            y: e.clientY - rect.top + 8,
            insert: true,
          });
        }
        return;
      }

      // A single selected stitch is the edit target: keep its selection
      // visible underneath the picker. Treat pointerdown as a provisional
      // move so the picker opens only after a click is confirmed on pointerup
      // and can never appear underneath the gesture that initiated it.
      if (existing) {
        const ids = selectExisting(existing.id, e.shiftKey);
        if (ids.length === 1 && !e.shiftKey) {
          e.preventDefault();
          movingSelection = true;
          selectionStart = cell;
          last = cell;
          canvas.setPointerCapture(e.pointerId);
        } else {
          openPickerForSingleSelection(ids, e);
        }
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
        const hasMoved = move.col !== 0 || move.row !== 0;
        // Alt/Opt is read live, each frame, so toggling it mid-drag flips
        // between moving and duplicating without having to restart the drag.
        const duplicating = e.altKey;
        const ids = ui().selectedPlacementIds;
        const blocked =
          hasMoved &&
          !(duplicating
            ? doc().canDuplicatePlacements(ids, move.col, move.row)
            : doc().canMovePlacements(ids, move.col, move.row));
        ui().setSelectionMove({ ...move, blocked, duplicating });
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
        // Resolve each distinct group's membership once per call rather than
        // once per matched placement: a marquee over many members of one
        // large group would otherwise re-walk that group's full membership
        // set once per member it happens to cross.
        const resolvedGroups = new Map<string, string[]>();
        const ids = doc()
          .index.query({ minCol, maxCol, minRow, maxRow })
          .flatMap((placement) => {
            if (!placement.groupId) return [placement.id];
            let members = resolvedGroups.get(placement.groupId);
            if (!members) {
              members = doc().index.groupMembers(placement.groupId).map((member) => member.id);
              resolvedGroups.set(placement.groupId, members);
            }
            return members;
          });
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
        const moved = !!move && (move.col !== 0 || move.row !== 0);
        if (moved && move.duplicating) {
          const copyIds = doc().duplicatePlacementsAt(ui().selectedPlacementIds, move.col, move.row);
          if (copyIds.length) ui().setSelectedPlacementIds(copyIds);
        } else if (moved) {
          doc().movePlacements(ui().selectedPlacementIds, move.col, move.row);
        } else {
          // Pointerdown on an existing selection is provisionally a move.
          // If it never leaves the cell, it was a click instead: edit the
          // one selected stitch rather than silently doing nothing.
          openPickerForSingleSelection(ui().selectedPlacementIds, e);
        }
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
            const ids = selectExisting(existing.id, selectionAdditive);
            openPickerForSingleSelection(ids, e);
          } else if (!selectionAdditive) {
            ui().clearSelectionWithUndo();
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

    const onDoubleClick = (e: MouseEvent) => {
      // Insert's own click already opens the (differently-worded) picker
      // when nothing's armed - a "replace in place" picker here would
      // contradict what a single click just did.
      if (ui().tool === "select" || ui().tool === "insert" || ui().selectHeld || e.metaKey || e.ctrlKey)
        return;
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
