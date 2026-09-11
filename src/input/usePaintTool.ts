import { type RefObject, useEffect } from "react";
import { type Cell, screenToCell, screenToInsertCell } from "../canvas/camera";
import { RULER } from "../canvas/theme";
import { DocIndex } from "../model/docIndex";
import { stitchGroups } from "../model/stitchNumbers";
import { insertTargetCol } from "../model/ops";
import { getSharedReferenceImageCache } from "../canvas/referenceImageCache";
import { cellWithinReferenceImage, cropReferenceImageCell } from "../canvas/referenceImageCrop";
import { binarizeCrop, extractExemplars, matchCandidateStitch } from "../model/templateMatch";
import { useDocStore } from "../state/docStore";
import { SUGGEST_SYMBOL_ID, cellKey, useUiStore } from "../state/uiStore";

/**
 * Whether a click/pointerdown that just produced `ids` (via `selectExisting`)
 * should open that single stitch's edit picker. A shift/cmd-additive click is
 * building or trimming a multi-selection, never editing it, regardless of how
 * many ids the selection happens to land on afterward - so it must never
 * open the picker, even when it leaves exactly one id selected.
 */
export function shouldOpenPickerForSelection(ids: string[], additive: boolean): boolean {
  return !additive && ids.length === 1;
}

export type StraightAxis = "row" | "column";

/** Choose the axis a Shift-constrained draw should follow. */
export function straightAxisFor(start: Cell, target: Cell): StraightAxis {
  return Math.abs(target.col - start.col) >= Math.abs(target.row - start.row)
    ? "row"
    : "column";
}

/** Project a target cell onto the selected straight axis through `start`. */
export function constrainToStraightAxis(start: Cell, target: Cell, axis: StraightAxis): Cell {
  return axis === "row" ? { col: target.col, row: start.row } : { col: start.col, row: target.row };
}

/** Return every cell, including both endpoints, on an orthogonal line. */
export function straightLineCells(from: Cell, to: Cell): Cell[] {
  const colStep = Math.sign(to.col - from.col);
  const rowStep = Math.sign(to.row - from.row);
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  return Array.from({ length: steps + 1 }, (_, step) => ({
    col: from.col + colStep * step,
    row: from.row + rowStep * step,
  }));
}

/**
 * What one cell of a stroke does. Suggest, confirm, and erase are exactly
 * as "drawable" as placing a real stitch is - the same drag, the same Shift
 * straight-line and gap-fill continuation - just a different per-cell
 * action, which is what lets all four share the one stroke engine below
 * instead of each needing its own copy of it.
 */
export type StrokeMode =
  | { kind: "place"; symbolId: string }
  | { kind: "suggest" }
  | { kind: "confirm"; overrideSymbolId?: string }
  | { kind: "erase" };

/** Identifies a mode for the "is this a continuation of the same stroke" check - see `lastDrawn`. */
export function strokeKey(mode: StrokeMode): string {
  if (mode.kind === "place") return `place:${mode.symbolId}`;
  if (mode.kind === "confirm") return `confirm:${mode.overrideSymbolId ?? ""}`;
  return mode.kind;
}

/**
 * The mode a pointer event's modifiers and the currently armed stitch imply.
 * Read live on every move rather than captured once at the start of a drag,
 * so toggling Shift or Alt mid-stroke switches what the rest of it does -
 * the same way Alt already flips an in-progress selection-drag between
 * moving and duplicating.
 *
 * Shift+Opt is the destructive chord (erases whatever's at the cell,
 * suggested or confirmed) and always wins. Shift alone confirms a
 * suggestion under the cursor - but only when `targetIsSuggested`, so an
 * armed stitch's straight-line draw (also Shift) still works everywhere
 * else; without that gate Shift would shadow the armed stitch the same way
 * Cmd/Ctrl used to. A real armed stitch (not Suggest itself) rides along as
 * `overrideSymbolId` - confirming a suggestion as that specific stitch
 * instead of whatever it was guessed as.
 *
 * That override no longer needs Shift held at all: with a real stitch
 * armed, landing on a suggestion - by click or by dragging across it -
 * confirms it as that stitch outright. Shift is still how a suggestion gets
 * confirmed as its own guess (nothing armed but Suggest itself), and still
 * how the confirm gesture straight-lines/gap-fills; it's just no longer the
 * only way to override one with a stitch you already know you want, which
 * has no keyboard-free equivalent on a touch device anyway.
 */
export function modeFor(
  e: { shiftKey: boolean; altKey: boolean },
  armedSymbolId: string | null,
  targetIsSuggested: boolean,
): StrokeMode | null {
  if (e.shiftKey && e.altKey) return { kind: "erase" };
  const overrideSymbolId =
    armedSymbolId && armedSymbolId !== SUGGEST_SYMBOL_ID ? armedSymbolId : null;
  if (targetIsSuggested && (e.shiftKey || overrideSymbolId)) {
    return overrideSymbolId ? { kind: "confirm", overrideSymbolId } : { kind: "confirm" };
  }
  if (armedSymbolId === SUGGEST_SYMBOL_ID) return { kind: "suggest" };
  if (armedSymbolId) return { kind: "place", symbolId: armedSymbolId };
  return null;
}

/**
 * Placing, selecting, moving, and inserting stitches.
 *
 *   click empty cell (Draw)     select it and open the picker, or place the armed stitch if one's armed
 *   click filled cell (Draw)    select it (its whole group, if it's part of one) and open the picker
 *   click a cell (Eraser)       erase whatever's there
 *   click a cell (Insert)       insert the armed stitch there, shifting the rest of the row -
 *                                open the picker first if nothing's armed; no-op inside a
 *                                multi-cell symbol, which can't be split
 *   drag over a filled cell (Draw)  ignored - the Overwrite Safety Block never overwrites an
 *                                existing placement, it just skips that cell - except a
 *                                suggested one with a real stitch armed, which it confirms as
 *                                that stitch (see the click/drag entry over a suggestion below)
 *   click away from a selection      clear it, without also placing/erasing on that same click -
 *                                only while a stitch is armed; unarmed, a click on empty space
 *                                always lands a new selection there instead
 *   drag an existing selection       move it together, from any tool
 *   alt/opt + drag a selection       copy it instead of moving it, leaving the originals in place
 *   drag in Select               marquee-select every symbol in the rectangle; also every
 *                                empty cell, but only while Opt is additionally held
 *   cmd/ctrl + click/drag        temporarily use Select
 *   click/drag over a suggestion or needs-identification marker with a real stitch armed,
 *                                confirms/places that stitch outright - no modifier needed,
 *                                since there's no keyboard-free equivalent of one on a touch device
 *   shift + click over a suggestion  confirms it as its own guess (no override); shift + drag
 *                                while armed elsewhere draws a straight line instead
 *   shift + opt (+ drag)         erase whatever's at the cell - suggested or confirmed
 *   cmd/ctrl + shift + click     toggle one cell into/out of the selection pool; a second such
 *                                click on another cell selects the bounding box between them
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
    let selectionEmptyBaseline: Cell[] = [];
    let selectionAdditive = false;
    let selectionMoved = false;
    let movingSelection = false;
    let constrainedStroke = false;
    let straightAxis: StraightAxis | null = null;
    let lastDrawn: { cell: Cell; key: string } | null = null;
    // A Shift-pointerdown after drawing may be either a gap-fill click or a
    // new straight stroke. Wait for movement to disambiguate.
    let pendingShiftFill: { from: Cell; to: Cell } | null = null;
    // The mode the current drag is painting with - re-derived from live
    // modifiers on every move (see `modeFor`), not fixed at pointerdown.
    let currentMode: StrokeMode | null = null;
    // Cells this pointer gesture's Suggest matching actually produced a
    // result for (identified or unidentified) - reset per gesture, read once
    // the gesture ends to anchor the review menu over exactly this batch,
    // never over all pending suggestions or an earlier batch.
    let suggestBatchCells: Cell[] = [];

    const finishSuggestBatch = () => {
      if (suggestBatchCells.length) {
        const cols = suggestBatchCells.map((c) => c.col);
        const rows = suggestBatchCells.map((c) => c.row);
        ui().openSuggestReview({
          minCol: Math.min(...cols),
          maxCol: Math.max(...cols),
          minRow: Math.min(...rows),
          maxRow: Math.max(...rows),
        });
      }
      suggestBatchCells = [];
    };

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

    // Runs one cell through the matcher and either places a suggestion or
    // flags the cell as unread - never leaves a scanned cell with no visible
    // outcome, which is what made a low-confidence miss indistinguishable
    // from the feature silently doing nothing.
    const matchAndPlace = (cell: Cell) => {
      // Suggest is still experimental - a single choke point for both the
      // normal drag path and the Select-tool quick-action shortcut below,
      // so a designer session can never trigger a match even if something
      // upstream still manages to arm Suggest or reach this call.
      if (ui().role !== "admin") return;
      const refImage = doc().referenceImage;
      if (!refImage || !cellWithinReferenceImage(refImage, cell.col, cell.row)) return;
      const cachedImg = getSharedReferenceImageCache().get(refImage.ref);
      if (!cachedImg) return;

      const exemplars = extractExemplars(doc().index, refImage, cachedImg, doc().revision);
      const crop = cropReferenceImageCell(refImage, cachedImg, cell.col, cell.row, 32);
      const grid = binarizeCrop(crop);
      const match = matchCandidateStitch(grid, exemplars);
      const key = cellKey(cell.col, cell.row);

      if (match.symbolId) {
        doc().place(match.symbolId, cell.col, cell.row, true, match.confidence);
        ui().setReferenceImageUnrecognized(key, false);
      } else {
        ui().setReferenceImageUnrecognized(key, true);
      }
      suggestBatchCells.push(cell);
    };

    /**
     * Confirms the suggestion at `cell`, if there is one - a no-op
     * elsewhere, so dragging loosely across a row only ever touches the
     * cells that were actually pending review. With `overrideSymbolId` (a
     * real stitch armed alongside Cmd/Ctrl), the suggestion is replaced with
     * that stitch and confirmed in the same step, rather than accepted as
     * whatever it was originally guessed to be.
     */
    const confirmAt = (cell: Cell, overrideSymbolId?: string) => {
      const target = doc().index.placementAt(cell.col, cell.row);
      if (!target?.suggested) return;
      if (overrideSymbolId && overrideSymbolId !== target.symbolId) {
        doc().replacePlacements([target.id], overrideSymbolId);
      } else {
        doc().acceptSuggestions([target.id]);
      }
    };

    /**
     * Erases whatever placement is at `cell`, suggested or confirmed - the
     * Shift+Opt destructive brush. Unlike `confirmAt`, this isn't gated to
     * suggestions only: Shift+Opt is a deliberate, unambiguous chord, so it's
     * safe to let it erase any stitch it crosses.
     */
    const eraseAt = (cell: Cell) => {
      const target = doc().index.placementAt(cell.col, cell.row);
      if (target) {
        doc().erasePlacements([target.id]);
        return;
      }
      // No placement to erase - but a cell Suggest scanned and couldn't
      // read is its own kind of "something's here" mark. Dismiss clears
      // that the same way it clears an unwanted suggestion, instead of
      // silently doing nothing.
      const key = cellKey(cell.col, cell.row);
      if (ui().referenceImageUnrecognized.has(key)) ui().setReferenceImageUnrecognized(key, false);
    };

    /** Applies `mode` to one cell - the shared body Draw, Suggest, confirm, and erase all paint through. */
    const applyMode = (mode: StrokeMode, cell: Cell) => {
      switch (mode.kind) {
        case "place":
          // Overwrite Safety Block: freehand drawing never overwrites a
          // cell that already holds a placement (confirmed or suggested) -
          // it's skipped, and the rest of the drag keeps going.
          if (doc().index.placementAt(cell.col, cell.row)) return;
          doc().place(mode.symbolId, cell.col, cell.row);
          // An unreadable cell has no placement to trip the block above, so
          // a drag can land here too - clear the stale mark rather than
          // leaving it flagged as unread under a stitch that's now there.
          {
            const key = cellKey(cell.col, cell.row);
            if (ui().referenceImageUnrecognized.has(key)) ui().setReferenceImageUnrecognized(key, false);
          }
          return;
        case "suggest":
          matchAndPlace(cell);
          return;
        case "confirm":
          confirmAt(cell, mode.overrideSymbolId);
          return;
        case "erase":
          eraseAt(cell);
          return;
      }
    };

    const paint = (cell: Cell) => {
      if (last && last.col === cell.col && last.row === cell.row) return;
      last = cell;
      if (erasing) {
        doc().erase(cell.col, cell.row);
        return;
      }
      if (!currentMode) return;
      applyMode(currentMode, cell);
      lastDrawn = { cell, key: strokeKey(currentMode) };
    };

    const paintStraightSegment = (from: Cell, to: Cell) => {
      for (const cell of straightLineCells(from, to)) paint(cell);
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

    /** Every placement id (whole groups) and empty cell inside the rectangle between `a` and `b`, inclusive - the Cmd+Shift click-then-click range select. */
    const cellsInBoundingBox = (a: Cell, b: Cell): { ids: string[]; emptyCells: Cell[] } => {
      const minCol = Math.min(a.col, b.col);
      const maxCol = Math.max(a.col, b.col);
      const minRow = Math.min(a.row, b.row);
      const maxRow = Math.max(a.row, b.row);
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
      const emptyCells: Cell[] = [];
      for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
          if (!doc().index.placementAt(col, row)) emptyCells.push({ col, row });
        }
      }
      return { ids: [...new Set(ids)], emptyCells };
    };

    /** Select `placementId`'s whole group and return the resulting selection. */
    const selectExisting = (placementId: string, additive: boolean): string[] => {
      const ids = groupIdsFor(placementId);
      if (!additive) {
        // A non-additive selection always replaces whatever was selected
        // before, empty cells included - otherwise a stale empty-cell
        // selection could linger alongside a freshly selected stitch.
        if (ui().selectedEmptyCells.length) ui().setSelectedEmptyCells([]);
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

    const openPickerForSingleSelection = (ids: string[], e: PointerEvent, additive: boolean) => {
      if (!shouldOpenPickerForSelection(ids, additive)) return;
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
        reviewingSuggestion: !!placement.suggested,
      });
    };

    const onPointerDown = (e: PointerEvent) => {
      // A fresh gesture never carries over a previous one's batch - the only
      // paths that populate it (matchAndPlace, the Select-tool quick-action)
      // run entirely between this point and the matching endStroke below.
      suggestBatchCells = [];
      if (ui().spaceHeld || ui().panEnabled || e.button !== 0) return; // panning, or not a plain left click
      // Reference-image editing is a modal canvas workflow. Even if a tool
      // shortcut managed to change the stored tool, no stitch interaction
      // may run until the reference panel is closed again.
      if (ui().referenceImagePanelOpen) return;

      // Any canvas click starting a real interaction is "outside" the review
      // menu (its own buttons live off-canvas, in a fixed-position element
      // the click would have landed on instead) - closes it permanently for
      // that batch, same as SuggestReviewMenu's own outside-pointerdown
      // listener does for clicks elsewhere in the app. If this same click
      // goes on to produce a fresh Suggest batch, `finishSuggestBatch` opens
      // a new menu for it below - never a reopening of this one.
      const wasReviewOpen = !!ui().suggestReview;
      if (wasReviewOpen) ui().closeSuggestReview();

      // The selected stitch remains draggable while its edit picker is open.
      // Modifier clicks are selection commands and must act on this first
      // click rather than being consumed merely to dismiss the picker:
      // Cmd/Ctrl retargets it, while Shift grows or trims the selection.
      if (ui().picker) {
        const pickerCell = cellAt(e);
        const targetAtPickerCell = pickerCell
          ? doc().index.placementAt(pickerCell.col, pickerCell.row)
          : undefined;
        const modeHere = pickerCell
          ? modeFor(e, ui().armedSymbolId, !!targetAtPickerCell?.suggested)
          : null;

        // Reviewing a suggestion, or erasing, elsewhere on the canvas wins
        // over Shift/Cmd's usual meaning here (retarget the open picker) -
        // the same precedence confirm/erase already have everywhere else.
        // Without this, confirming-with-an-override was silently swallowed
        // by whatever picker happened to still be open from the click before.
        if (pickerCell && (modeHere?.kind === "confirm" || modeHere?.kind === "erase")) {
          e.preventDefault();
          ui().closePicker();
          applyMode(modeHere, pickerCell);
          return;
        }

        const modifierSelect = e.shiftKey || e.metaKey || e.ctrlKey;
        const modifierTarget = pickerCell
          ? doc().index.placementAt(pickerCell.col, pickerCell.row)
          : undefined;

        if (modifierSelect && modifierTarget) {
          e.preventDefault();
          ui().closePicker();
          const ids = selectExisting(modifierTarget.id, e.shiftKey);
          if (!e.shiftKey) openPickerForSingleSelection(ids, e, false);
          return;
        }

        ui().closePicker();
        if (!pickerCell) return;
        if (
          !e.shiftKey &&
          ui().selectedPlacementIds.length &&
          insideSelectedArea(pickerCell)
        ) {
          e.preventDefault();
          movingSelection = true;
          selectionStart = pickerCell;
          last = pickerCell;
          canvas.setPointerCapture(e.pointerId);
          return;
        }
        // An armed click on empty space while a picker was open dismisses
        // it (and the selection under it) rather than also painting there -
        // this first click's job is closing the picker, full stop. A second
        // click, with the picker now gone, paints normally.
        if (!e.shiftKey && ui().armedSymbolId && !doc().index.placementAt(pickerCell.col, pickerCell.row)) {
          ui().clearSelection();
          return;
        }
        // Neither a modifier command nor a drag on the current selection:
        // the picker is now closed, and this click is handled exactly like
        // any other click on the canvas below - most importantly, a plain
        // click on a new empty or filled cell selects it and opens its own
        // picker in this same gesture, instead of just closing the old one
        // and requiring a second click to act on the new cell.
      }

      const cell = cellAt(e);
      if (!cell) return;

      // The Cmd+Shift range-select anchor only survives into a second
      // Cmd+Shift click - anything else (a plain click, a drag, an
      // unrelated tool switch) drops it, so a stale anchor never resurfaces
      // as a surprise bounding box much later.
      if (!((e.metaKey || e.ctrlKey) && e.shiftKey)) ui().setSelectionAnchor(null);

      // Confirm/erase claim the gesture only when it actually applies -
      // elsewhere, Shift and Alt keep their other meanings (straight-line
      // draw, duplicate-drag) undisturbed. This intentionally runs ahead of
      // `temporarySelect` and the multi-select drag check further down:
      // reviewing a suggestion or erasing is a narrow, deliberate action
      // gated on a modifier, and it wins over whatever else that modifier or
      // an active selection would otherwise mean here.
      const existingAtCell = doc().index.placementAt(cell.col, cell.row);
      const modeHere = modeFor(e, ui().armedSymbolId, !!existingAtCell?.suggested);

      // Shift has to be down before the gesture begins. Reading the store as
      // well as the pointer event keeps the canvas state and its cursor in
      // sync even if the browser delivers the key transition just before the
      // pointer event. Draw and Suggest only draw in the Draw tool; confirm
      // and erase are review/destructive actions and work regardless of tool.
      const toolAllowsDrawing = modeHere?.kind === "confirm" || modeHere?.kind === "erase" || ui().tool === "stitch";
      // Erase never gets the straight-line/gap-fill treatment, even though
      // it's also Shift-gated - Opt turns Shift's meaning fully destructive,
      // and a gap-fill silently erasing a whole line between two clicks is
      // exactly the kind of surprise a deliberate destructive chord should
      // avoid. Erase only ever touches the cells it's actually dragged over.
      const canDrawStraight =
        modeHere !== null &&
        modeHere.kind !== "erase" &&
        toolAllowsDrawing &&
        (e.shiftKey || ui().shiftHeld);

      // Once a cell has been painted, a pre-held Shift click fills from that
      // cell to the click. Do not fill yet: if the pointer moves, this
      // becomes a new constrained stroke beginning at this cell instead.
      if (canDrawStraight && lastDrawn?.key === strokeKey(modeHere!)) {
        e.preventDefault();
        pendingShiftFill = { from: lastDrawn.cell, to: cell };
        last = null;
        painting = true;
        constrainedStroke = true;
        straightAxis = null;
        currentMode = modeHere;
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      if (modeHere && (modeHere.kind === "confirm" || modeHere.kind === "erase")) {
        e.preventDefault();
        painting = true;
        last = null;
        constrainedStroke = canDrawStraight;
        straightAxis = null;
        currentMode = modeHere;
        canvas.setPointerCapture(e.pointerId);
        doc().beginStroke();
        paint(cell);
        return;
      }

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
        selectionEmptyBaseline = e.shiftKey ? [...ui().selectedEmptyCells] : [];
        selectionAdditive = e.shiftKey;
        selectionMoved = false;
        last = cell;
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      const existing = existingAtCell;

      // Clicking empty space away from a selection while a stitch is armed
      // paints right there, same as any other armed click on empty space -
      // it doesn't wait for a separate click to dismiss a selection first,
      // e.g. one just left behind by picking a symbol for it. The stale
      // selection is cleared (without undo - it's not something a Cmd/Ctrl+Z
      // would sensibly restore in the middle of an unrelated paint stroke) so
      // it doesn't linger highlighted once the designer's attention has
      // clearly moved on. Unarmed, a click on empty space always selects it
      // and opens its picker instead (see below), even away from an existing
      // selection - Cmd's selection clutch works the same way plain click
      // does here, it just gets you there via a different route.
      if (
        !e.shiftKey &&
        !existing &&
        ui().armedSymbolId &&
        (ui().selectedPlacementIds.length || ui().selectedEmptyCells.length)
      ) {
        ui().clearSelection();
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
          const insertedCol = insertTargetCol(doc().index, armed, target.col, target.row);
          doc().insertPlacement(armed, target.col, target.row);
          if (insertedCol !== null) {
            ui().setInsertAnimation({ col: insertedCol, row: target.row });
          }
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
          openPickerForSingleSelection(ids, e, e.shiftKey);
        }
        return;
      }

      // A cell Suggest could not identify has no placement to click on -
      // without this, an armed tool would just fall through to painting over
      // it below, silently re-running the same failed match instead of ever
      // giving the designer a way to say what it actually is.
      const unreadable = !e.shiftKey && ui().referenceImageUnrecognized.has(cellKey(cell.col, cell.row));

      // A plain empty cell - never scanned, nothing pending to click on -
      // is not itself part of the review. While the review menu was open,
      // this click's whole job was dismissing it, whether or not a stitch
      // (Suggest included) happens to be armed: painting through it here
      // would turn one click into two unrelated actions instead of the
      // plain dismissal the menu's own outside-click handling already
      // promises for every other kind of "outside" click.
      if (wasReviewOpen && !existingAtCell && !unreadable) return;

      // A real stitch armed (not Suggest itself) is exactly as explicit a
      // choice here as it is for overriding an actual suggestion (see
      // modeFor). Keep it as a real paint stroke, rather than a one-off
      // placement: a designer who explicitly chose a stitch should be able
      // to paint it across several needs-identification cells in one drag.
      const unreadableOverride =
        unreadable && ui().armedSymbolId && ui().armedSymbolId !== SUGGEST_SYMBOL_ID
          ? ui().armedSymbolId
          : null;

      if (unreadableOverride) {
        e.preventDefault();
        painting = true;
        last = null;
        constrainedStroke = canDrawStraight;
        straightAxis = null;
        currentMode = { kind: "place", symbolId: unreadableOverride };
        canvas.setPointerCapture(e.pointerId);
        doc().beginStroke();
        paint(cell);
        return;
      }

      if (!ui().armedSymbolId || unreadable) {
        const rect = canvas.getBoundingClientRect();
        if (ui().selectedPlacementIds.length) ui().setSelectedPlacementIds([]);
        ui().setSelectedEmptyCells([cell]);
        ui().openPicker({
          col: cell.col,
          row: cell.row,
          x: e.clientX - rect.left + 8,
          y: e.clientY - rect.top + 8,
          selectionEmptyCells: [cell],
          ...(unreadable ? { reviewingSuggestion: true } : null),
        });
        return;
      }

      e.preventDefault();
      painting = true;
      last = null;
      constrainedStroke = canDrawStraight;
      straightAxis = null;
      currentMode = modeHere;
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

        // Empty cells join a marquee's results too, but only while Opt is
        // also held (Cmd+Opt) - plain Cmd-drag stays exactly the marquee it
        // always was, selecting only what it lands on. Opt is read live, so
        // toggling it mid-drag adds or drops the empty cells without
        // restarting the gesture, same as everywhere else Opt is live.
        // Every other empty-cell path (a plain or Cmd click, replacing a
        // selection by clicking away) is intentionally NOT gated this way -
        // this restriction is specific to the drag/marquee tool.
        if (e.altKey) {
          const emptyCells = new Map<string, Cell>(
            selectionEmptyBaseline.map((c) => [cellKey(c.col, c.row), c]),
          );
          for (let col = minCol; col <= maxCol; col++) {
            for (let row = minRow; row <= maxRow; row++) {
              if (!doc().index.placementAt(col, row)) emptyCells.set(cellKey(col, row), { col, row });
            }
          }
          ui().setSelectedEmptyCells([...emptyCells.values()]);
        } else if (ui().selectedEmptyCells.length !== selectionEmptyBaseline.length) {
          ui().setSelectedEmptyCells(selectionEmptyBaseline);
        }
        return;
      }
      if (!painting) return;
      const cell = cellAt(e);
      if (!cell) return;
      // Read live, same as the armed stitch always was - toggling Shift or
      // Alt mid-drag switches what the rest of the stroke does, the same
      // way Alt already flips a selection-drag between moving and
      // duplicating. Erasing has its own dedicated flag and stays out of
      // this entirely.
      if (!erasing) {
        const targetHere = doc().index.placementAt(cell.col, cell.row);
        currentMode = modeFor(e, ui().armedSymbolId, !!targetHere?.suggested);
      }
      if (pendingShiftFill) {
        // Movement turns the pending click into a fresh straight stroke. Its
        // anchor is where this pointer gesture started, never the previous
        // stitch that a Shift-click would have used as its gap-fill anchor.
        if (cell.col === pendingShiftFill.to.col && cell.row === pendingShiftFill.to.row) return;
        const start = pendingShiftFill.to;
        pendingShiftFill = null;
        last = null;
        doc().beginStroke();
        paint(start);
      }
      if (constrainedStroke && straightAxis === null) {
        const start = lastDrawn?.cell;
        if (start && (start.col !== cell.col || start.row !== cell.row)) {
          straightAxis = straightAxisFor(start, cell);
        }
      }
      if (straightAxis) {
        const start = lastDrawn?.cell;
        if (start) paintStraightSegment(start, constrainToStraightAxis(start, cell, straightAxis));
        return;
      }
      paint(cell);
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
          // one selected stitch rather than silently doing nothing. This
          // gesture only ever starts non-additive (see the two `!e.shiftKey`
          // guards that set movingSelection), so it always may open.
          openPickerForSingleSelection(ui().selectedPlacementIds, e, false);
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
          if (selectionAdditive) {
            // Cmd+Shift: the first click on a cell toggles it into the pool
            // and becomes a range anchor; a second Cmd+Shift click on
            // another cell completes a bounding-box select instead of just
            // toggling that one too.
            const anchor = ui().selectionAnchor;
            if (anchor && (anchor.col !== start.col || anchor.row !== start.row)) {
              const { ids, emptyCells } = cellsInBoundingBox(anchor, start);
              ui().setSelectedPlacementIds(ids);
              ui().setSelectedEmptyCells(emptyCells);
              ui().setSelectionAnchor(null);
            } else if (existing) {
              const ids = selectExisting(existing.id, true);
              ui().setSelectionAnchor(ids.includes(existing.id) ? start : null);
            } else {
              const emptyCells = ui().selectedEmptyCells;
              const key = cellKey(start.col, start.row);
              const exists = emptyCells.some((cell) => cellKey(cell.col, cell.row) === key);
              const nextEmpty = exists
                ? emptyCells.filter((cell) => cellKey(cell.col, cell.row) !== key)
                : [...emptyCells, start];
              ui().setSelectedEmptyCells(nextEmpty);
              ui().setSelectionAnchor(exists ? null : start);
            }
          } else if (existing) {
            const ids = selectExisting(existing.id, false);
            openPickerForSingleSelection(ids, e, false);
          } else if (!selectionAdditive) {
            ui().clearSelectionWithUndo();
            if (ui().selectHeld) {
              // Cmd's selection clutch ends the same way an unarmed baseline
              // click does - select the empty cell and open its picker -
              // regardless of what's armed, since Cmd always means "select."
              ui().setSelectedEmptyCells([start]);
              const rect = canvas.getBoundingClientRect();
              ui().openPicker({
                col: start.col,
                row: start.row,
                x: e.clientX - rect.left + 8,
                y: e.clientY - rect.top + 8,
                selectionEmptyCells: [start],
              });
            } else if (ui().tool === "select") {
              // Parked in the Select tool (not via Cmd): a quick single
              // action on empty space, then back to Draw.
              ui().setTool("stitch");
              const armed = ui().armedSymbolId;
              if (armed === SUGGEST_SYMBOL_ID) {
                applyMode({ kind: "suggest" }, start);
                finishSuggestBatch();
              } else if (armed) doc().place(armed, start.col, start.row);
              else {
                ui().setSelectedEmptyCells([start]);
                const rect = canvas.getBoundingClientRect();
                ui().openPicker({
                  col: start.col,
                  row: start.row,
                  x: e.clientX - rect.left + 8,
                  y: e.clientY - rect.top + 8,
                  selectionEmptyCells: [start],
                });
              }
            }
          }
        }
        selecting = false;
        selectionStart = null;
        selectionBaseline = [];
        selectionEmptyBaseline = [];
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
      constrainedStroke = false;
      straightAxis = null;
      last = null;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      if (pendingShiftFill) {
        const { from, to } = pendingShiftFill;
        pendingShiftFill = null;
        // A cancelled pointer gesture never represents an intentional click.
        if (e.type === "pointercancel") {
          currentMode = null;
          return;
        }
        const axis = straightAxisFor(from, to);
        doc().beginStroke();
        paintStraightSegment(from, constrainToStraightAxis(from, to, axis));
        doc().endStroke();
        finishSuggestBatch();
        currentMode = null;
        return;
      }
      doc().endStroke();
      finishSuggestBatch();
      currentMode = null;
    };

    const onDoubleClick = (e: MouseEvent) => {
      // Insert's own click already opens the (differently-worded) picker
      // when nothing's armed - a "replace in place" picker here would
      // contradict what a single click just did.
      if (
        ui().tool === "select" ||
        ui().tool === "insert" ||
        ui().panEnabled ||
        ui().selectHeld ||
        e.metaKey ||
        e.ctrlKey
      )
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
