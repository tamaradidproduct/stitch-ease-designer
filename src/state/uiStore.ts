import { create } from "zustand";
import {
  type Camera,
  type Cell,
  type Point,
  type Viewport,
  defaultCamera,
  panByScreen,
  zoomAt,
} from "../canvas/camera";
import type { BoxHandle, Placement } from "../model/types";
import { quickSlotKey } from "../model/quickSlots";
import { useDocStore } from "./docStore";
import { nextHistorySequence } from "./historySequence";

export { cellKey } from "../model/cellKey";

/** Bounds for the drag-resizable right panel - narrow enough to reclaim real canvas space, wide enough to stay usable. */
export const RIGHT_PANEL_MIN_WIDTH = 260;
export const RIGHT_PANEL_MAX_WIDTH = 560;
export const RIGHT_PANEL_DEFAULT_WIDTH = 304;
const clampRightPanelWidth = (width: number): number =>
  Math.round(Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, width)));

export type Tool = "select" | "stitch" | "eraser" | "insert";

/**
 * Admin has full access, including the still-experimental reference-image
 * tracer and Suggest. Designer is everyone else invited so far - unlimited
 * charts, but those two features stay hidden until they're ready for wider
 * use. Set once per session in App.tsx from the signed-in user's
 * `app_metadata.role` (or "admin" outright for the DEV_SKIP_AUTH bypass),
 * and read from here rather than threaded through props because the riskiest
 * consumers (usePaintTool, useShortcuts) are plain hooks with no React tree
 * back to App.tsx.
 */
export type Role = "admin" | "designer";

/**
 * Armed like any other stitch, but painting with it runs template matching
 * against user exemplars from the reference image instead of placing a fixed symbol.
 */
export const SUGGEST_SYMBOL_ID = "__suggest__";

/**
 * The sticky default action a Suggest stroke performs when no review
 * modifier is physically held - toggled by the toolDock's Confirm/Suggest/
 * Dismiss buttons. Only meaningful while Suggest is armed; a literally held
 * modifier always overrides it live (see `resolveSuggestAction`).
 */
export type SuggestAction = "suggest" | "confirm" | "dismiss";

/** Where the picker is anchored: which cell it will fill, and where to draw it. */
export type PickerTarget = {
  col: number;
  row: number;
  x: number;
  y: number;
  /** The stitch already occupying this cell, if any — the picker is editing it. */
  currentSymbolId?: string;
  /** `currentSymbolId`'s color, if any (FR-25's `currentSlotKey` identity). */
  currentColorId?: string;
  /** When present, choosing a symbol replaces this whole selection. */
  selectionIds?: string[];
  selectionSpan?: number;
  /** When present (and `selectionIds` isn't), choosing a symbol fills these empty cells. */
  selectionEmptyCells?: Cell[];
  /** When true, choosing a symbol inserts and shifts rather than placing/replacing. */
  insert?: boolean;
  /** When true, choosing a symbol only arms Draw instead of editing the canvas. */
  armOnly?: boolean;
  /**
   * When true, this picker is reviewing a pending suggestion (confirmed or
   * unrecognized) rather than a plain edit - choosing a symbol resolves it
   * without re-arming, so Suggest stays armed through a whole review pass.
   */
  reviewingSuggestion?: boolean;
};

/** Inclusive cell bounds a Suggest stroke's review menu is anchored over. */
export type SuggestReviewBounds = { minCol: number; maxCol: number; minRow: number; maxRow: number };

export type SelectionBox = { start: Cell; current: Cell };

export type SelectionSnapshot = {
  placementIds: string[];
  emptyCells: Cell[];
};

export type SelectionHistoryEntry = {
  before: SelectionSnapshot;
  after: SelectionSnapshot;
  sequence: number;
};
/**
 * `blocked` is true when the drop target is occupied (by an unselected
 * stitch for a move, or by anything at all for a duplicate). `duplicating`
 * is true while Alt/Opt is held, which copies the selection instead of
 * moving it.
 */
export type SelectionMove = { col: number; row: number; blocked: boolean; duplicating: boolean };

type UiState = {
  camera: Camera;
  viewport: Viewport;
  hover: Cell | null;
  /**
   * Where Insert would land, computed with half-cell-overlapping boundary
   * snapping rather than `hover`'s plain per-cell hit test - see
   * `screenToInsertCell`. Kept separate so every other tool, and the status
   * bar, keep using ordinary per-cell `hover`.
   */
  insertHover: Cell | null;
  insertAnimation: { cell: Cell; startedAt: number } | null;
  /** True while space is held, which arms drag-to-pan. */
  spaceHeld: boolean;
  /**
   * Tap-toggled equivalent of spaceHeld for touch/Pencil, where there's no
   * key to hold - deliberately a separate flag rather than a `Tool` value:
   * Pan needs to work alongside whatever tool is already selected (Select,
   * Draw, Insert, Erase), not replace it, the same way holding Space always
   * has. Every place that already checks `spaceHeld` to arm drag-to-pan or
   * to stand down (usePanZoom, usePaintTool, useReferenceImageTool, the
   * cursor) checks this too.
   */
  panEnabled: boolean;
  /** True while Cmd/Ctrl is held, temporarily enabling Select. */
  selectHeld: boolean;
  /** True while Shift is held, enabling constrained straight-line drawing. */
  shiftHeld: boolean;
  /** True while Alt/Opt is held - duplicates the selection when dragging it, instead of moving it. */
  altHeld: boolean;
  /** Suppresses stale pointer feedback after keyboard-driven selection until the mouse moves. */
  keyboardSelectionActive: boolean;
  /** Editor-only tint behind placed stitches, useful when tracing a reference image. */
  stitchHighlightColor: string;
  stitchHighlightOpacity: number;
  isPanning: boolean;

  /** See the `Role` type - defaults to the least-privileged designer until App.tsx sets it. */
  role: Role;
  setRole: (role: Role) => void;

  /**
   * The right panel's own width in px, drag-resizable from its left edge
   * (`RightPanel.tsx`). An app-wide preference, not chart content - carries
   * over across chart switches (not reset by `resetForChart`), same as
   * anything else about how the editor is laid out rather than what's on
   * the canvas.
   */
  rightPanelWidth: number;
  setRightPanelWidth: (width: number) => void;

  tool: Tool;
  /**
   * Symbol the next click places. Null means the next click opens the picker
   * instead, which is the state the canvas starts in.
   */
  armedSymbolId: string | null;
  /**
   * The armed pen's color, alongside `armedSymbolId` - a quick slot is a
   * complete (symbol, color) pen, never a symbol that inherits whatever
   * color happens to be active (FR-26). Null for an uncolored pen. Every
   * arming path sets this explicitly (DNT-8) - never left ambient.
   */
  activeColor: string | null;
  setActiveColor: (color: string | null) => void;
  /** See `SuggestAction` - reset to "suggest" everywhere `armedSymbolId` moves away from the Suggest sentinel. */
  suggestAction: SuggestAction;
  setSuggestAction: (action: SuggestAction) => void;
  picker: PickerTarget | null;
  selectedPlacementIds: string[];
  /** Empty cells selected the same way placed stitches are - see `selectedPlacementIds`. */
  selectedEmptyCells: Cell[];
  /** App clipboard: survives tool/chart resets and changes only on Copy or Cut. */
  clipboardPlacements: Placement[];
  selectionBox: SelectionBox | null;
  selectionMove: SelectionMove | null;
  /**
   * The selection just before the most recent "click away" or Escape
   * cleared it - one level, consumed by the next `restoreLastClearedSelection`
   * and invalidated by any other selection change in between.
   */
  lastClearedSelection: string[] | null;
  /** The empty-cell counterpart of `lastClearedSelection`. */
  lastClearedEmptyCells: Cell[] | null;
  /** Selection changes on the same ordered timeline as document edits. */
  selectionUndoStack: SelectionHistoryEntry[];
  selectionRedoStack: SelectionHistoryEntry[];
  /**
   * The cell a later Cmd/Ctrl+Shift click will complete a bounding-box range
   * select from - set by the most recent click of any other kind (plain,
   * Shift-only, a drag's start), not only a prior Cmd+Shift click itself, so
   * range-select never requires its first click to hold the chord too.
   * Cleared by any other selection change - see `useShortcuts`'s Escape
   * handler and the various resets below.
   */
  selectionAnchor: Cell | null;
  setSelectionAnchor: (cell: Cell | null) => void;

  /**
   * Which of the chart's reference images the panel/tool/canvas overlay
   * currently target - only one is ever interactively edited at a time.
   * Selected only via the panel's own image list, never by clicking an
   * image on the canvas.
   */
  activeReferenceImageId: string | null;
  setActiveReferenceImageId: (id: string | null) => void;
  /**
   * Whether the reference-image panel is open. While it is, dragging the
   * reference image on the canvas moves/resizes it instead of
   * whatever the active tool would otherwise do there - closing the panel
   * hands the canvas back entirely, so there's no lingering mode to
   * accidentally leave on.
   */
  referenceImagePanelOpen: boolean;
  setReferenceImagePanelOpen: (open: boolean) => void;
  /**
   * Armed by the panel's "Set stitch size" button: the next drag on the
   * canvas draws a calibration box instead of moving/resizing the image -
   * one-shot, cleared the moment that drag ends (successful or not), so it
   * never lingers as a mode someone has to remember to turn off.
   */
  referenceImageCalibrating: boolean;
  setReferenceImageCalibrating: (calibrating: boolean) => void;
  /** Feedback while a rough scale-reference box is tightened to photographed grid lines. */
  referenceImageGridAlignmentStatus: "idle" | "detecting" | "failed";
  setReferenceImageGridAlignmentStatus: (status: "idle" | "detecting" | "failed") => void;
  /**
   * Which reference-image corner handle the pointer is over, so the cursor
   * can show the resize direction. Only meaningful while the panel is open.
   */
  referenceImageHandle: { target: "image" | "stitch"; handle: BoxHandle } | null;
  setReferenceImageHandle: (handle: { target: "image" | "stitch"; handle: BoxHandle } | null) => void;
  /**
   * Set when a calibration box was thrown away for being too small to be a
   * deliberate drag, so the panel can say so. Calibration stays armed - the
   * alternative, dropping out of the mode silently, is indistinguishable
   * from the feature not working.
   */
  referenceImageCalibrationRejected: boolean;
  setReferenceImageCalibrationRejected: (rejected: boolean) => void;
  /** The calibration box's two corners in world space, while it's being dragged out. */
  referenceImageCalibrationBox: { start: Point; current: Point } | null;
  setReferenceImageCalibrationBox: (box: { start: Point; current: Point } | null) => void;
  /**
   * Armed by "Set scale from stitches": clicks on the canvas drop marks on
   * the photo instead of moving it. Unlike the one-shot box calibration
   * this is a mode you stay in, because it takes four marks and typing
   * their numbers in between.
   */
  referenceImageMarking: boolean;
  setReferenceImageMarking: (marking: boolean) => void;
  /**
   * The mark whose stitch/row popover is open, anchored to it on the
   * canvas. Set the moment a mark is placed, so the numbers are typed while
   * looking at the stitch they describe rather than matched up afterwards
   * against a list.
   */
  referenceImageActiveMark: string | null;
  setReferenceImageActiveMark: (id: string | null) => void;
  /**
   * Cells auto-suggest scanned but couldn't match against any exemplar
   * (keyed by `cellKey`) - a distinct outcome from a low-confidence guess,
   * so a miss is visible instead of indistinguishable from the feature
   * silently doing nothing. Cleared the moment that cell gets a real match,
   * on a later scan or a hand-placed stitch.
   */
  referenceImageUnrecognized: ReadonlySet<string>;
  setReferenceImageUnrecognized: (key: string, unrecognized: boolean) => void;
  clearReferenceImageUnrecognized: () => void;

  /**
   * The bounding box (in chart cells) of the cells a single Suggest stroke
   * just produced results for - identified or unidentified, whichever the
   * matcher landed on. Purely an anchor for where the review menu appears;
   * what it reviews is always every currently pending suggestion in the
   * document, not just this batch (see `SuggestReviewMenu`). Never derived
   * from document order or from all pending suggestions, so the menu tracks
   * the stroke that just finished rather than an arbitrary earlier one.
   */
  suggestReview: SuggestReviewBounds | null;
  /** Opens the review menu anchored to `bounds`, replacing any menu already open. */
  openSuggestReview: (bounds: SuggestReviewBounds) => void;
  closeSuggestReview: () => void;

  setTool: (tool: Tool) => void;
  /** `colorId` defaults to null (DNT-8) - arming is always a whole pen, never "keep whatever was active". */
  setArmedSymbolId: (id: string | null, colorId?: string | null) => void;
  /**
   * Arms `id`/`colorId` together as one pen (FR-26); lands back on `tool`
   * (Draw by default - Insert stays Insert). `colorId` defaults to null
   * (DNT-8): a plain pick always clears whatever color was active. Normally
   * starts fresh (clears the selection and closes the picker) - pass
   * `preserveSelection` when the symbol was just chosen to fill the current
   * selection, which stays selected with its picker open so it can be
   * tweaked again immediately, armed for wherever the next click goes.
   */
  chooseSymbol: (
    id: string,
    tool?: Tool,
    preserveSelection?: boolean,
    colorId?: string | null,
  ) => void;
  /**
   * Adds the `id`/`colorId` pen to the next free quick slot without arming
   * it or touching the tool - the quick-access half of `chooseSymbol`, on
   * its own. Used when resolving a suggestion review (an identified
   * placement or an unrecognized marker): the stitch just picked belongs in
   * the glossary and the quick row exactly like any other pick, but Suggest
   * needs to stay armed so the rest of the review pass isn't interrupted.
   */
  addQuickSymbol: (id: string, colorId?: string | null) => void;
  /** Clears a quick-slot assignment (by its full quick-slot key) without moving other slots. */
  removeQuickSymbol: (key: string) => void;
  /** Reorders a quick slot (by its full quick-slot key), updating the number-key shortcuts. */
  moveQuickSymbolTo: (key: string, targetSlot: number) => void;
  openPicker: (target: PickerTarget) => void;
  closePicker: () => void;
  selectPlacement: (id: string, additive: boolean) => void;
  setSelectedPlacementIds: (ids: string[], recordUndo?: boolean) => void;
  setSelectedEmptyCells: (cells: Cell[], recordUndo?: boolean) => void;
  setSelection: (ids: string[], cells: Cell[], recordUndo?: boolean) => void;
  setClipboardPlacements: (placements: Placement[]) => void;
  setSelectionBox: (box: SelectionBox | null) => void;
  setSelectionMove: (move: SelectionMove | null) => void;
  clearSelection: () => void;
  /** Clears the selection, remembering it so Cmd/Ctrl+Z can bring it back. */
  clearSelectionWithUndo: () => void;
  /** Restores the selection stashed by `clearSelectionWithUndo`, if any. Returns whether it did. */
  restoreLastClearedSelection: () => boolean;
  undoSelection: () => boolean;
  redoSelection: () => boolean;

  setViewport: (vp: Viewport) => void;
  setHover: (cell: Cell | null) => void;
  setInsertHover: (cell: Cell | null) => void;
  setInsertAnimation: (cell: Cell | null) => void;
  setSpaceHeld: (held: boolean) => void;
  setPanEnabled: (enabled: boolean) => void;
  setSelectHeld: (held: boolean) => void;
  setShiftHeld: (held: boolean) => void;
  setAltHeld: (held: boolean) => void;
  setKeyboardSelectionActive: (active: boolean) => void;
  setStitchHighlight: (color: string, opacity?: number) => void;
  setStitchHighlightOpacity: (opacity: number) => void;
  setPanning: (panning: boolean) => void;
  panByScreen: (dx: number, dy: number) => void;
  zoomAt: (factor: number, sx: number, sy: number) => void;
  /** Pan the current view so a world-space point sits at its centre, preserving zoom. */
  centerCameraAt: (x: number, y: number) => void;
  centerViewAt100: (x: number, y: number) => void;
  resetView: () => void;
  /** Start an opened chart without carrying transient tools from another chart/session. */
  resetForChart: () => void;
};

const sameCell = (a: Cell | null, b: Cell | null) =>
  a === b || (!!a && !!b && a.col === b.col && a.row === b.row);

const sameStringList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const sameCellList = (a: readonly Cell[], b: readonly Cell[]) =>
  a.length === b.length && a.every((value, index) => sameCell(value, b[index] ?? null));

export const useUiStore = create<UiState>((set, get) => ({
  camera: defaultCamera(),
  viewport: { width: 1, height: 1 },
  hover: null,
  insertHover: null,
  insertAnimation: null,
  spaceHeld: false,
  panEnabled: false,
  selectHeld: false,
  shiftHeld: false,
  altHeld: false,
  keyboardSelectionActive: false,
  stitchHighlightColor: "#f59e0b",
  stitchHighlightOpacity: 0,
  isPanning: false,

  role: "designer",
  setRole: (role) => set({ role }),

  rightPanelWidth: RIGHT_PANEL_DEFAULT_WIDTH,
  setRightPanelWidth: (width) => set({ rightPanelWidth: clampRightPanelWidth(width) }),

  activeReferenceImageId: null,
  setActiveReferenceImageId: (activeReferenceImageId) => set({ activeReferenceImageId }),
  referenceImagePanelOpen: false,
  setReferenceImagePanelOpen: (open) =>
    // Closing the panel drops any in-progress calibration along with it -
    // there's no reason to leave that armed once the canvas goes back to
    // the normal tools.
    set(open ? {
      referenceImagePanelOpen: true,
      // Reference editing owns the canvas. Keep Draw out of the active
      // state as well as out of sight, so it cannot reappear underneath the
      // image workflow through a keyboard shortcut or panel transition.
      tool: "select",
    } : {
      referenceImagePanelOpen: false,
      tool: "stitch",
      referenceImageCalibrating: false,
      referenceImageGridAlignmentStatus: "idle",
      referenceImageCalibrationBox: null,
      referenceImageMarking: false,
      referenceImageActiveMark: null,
      referenceImageUnrecognized: new Set<string>(),
      referenceImageCalibrationRejected: false,
      referenceImageHandle: null,
    }),
  referenceImageCalibrating: false,
  setReferenceImageCalibrating: (referenceImageCalibrating) => set({ referenceImageCalibrating }),
  referenceImageGridAlignmentStatus: "idle",
  setReferenceImageGridAlignmentStatus: (referenceImageGridAlignmentStatus) =>
    set({ referenceImageGridAlignmentStatus }),
  referenceImageMarking: false,
  setReferenceImageMarking: (referenceImageMarking) => set({ referenceImageMarking }),
  referenceImageActiveMark: null,
  setReferenceImageActiveMark: (referenceImageActiveMark) => set({ referenceImageActiveMark }),
  referenceImageUnrecognized: new Set<string>(),
  setReferenceImageUnrecognized: (key, unrecognized) =>
    set((s) => {
      const next = new Set(s.referenceImageUnrecognized);
      if (unrecognized) next.add(key);
      else next.delete(key);
      return { referenceImageUnrecognized: next };
    }),
  clearReferenceImageUnrecognized: () => set({ referenceImageUnrecognized: new Set<string>() }),
  suggestReview: null,
  openSuggestReview: (bounds) => set({ suggestReview: bounds }),
  closeSuggestReview: () => set({ suggestReview: null }),
  referenceImageCalibrationBox: null,
  setReferenceImageCalibrationBox: (referenceImageCalibrationBox) =>
    set({ referenceImageCalibrationBox }),
  referenceImageCalibrationRejected: false,
  setReferenceImageCalibrationRejected: (referenceImageCalibrationRejected) =>
    set({ referenceImageCalibrationRejected }),
  referenceImageHandle: null,
  setReferenceImageHandle: (referenceImageHandle) => set({ referenceImageHandle }),

  tool: "stitch",
  armedSymbolId: null,
  activeColor: null,
  setActiveColor: (activeColor) => set({ activeColor }),
  suggestAction: "suggest",
  setSuggestAction: (suggestAction) => set({ suggestAction }),
  picker: null,
  selectedPlacementIds: [],
  selectedEmptyCells: [],
  clipboardPlacements: [],
  selectionBox: null,
  selectionMove: null,
  lastClearedSelection: null,
  lastClearedEmptyCells: null,
  selectionUndoStack: [],
  selectionRedoStack: [],
  selectionAnchor: null,
  setSelectionAnchor: (selectionAnchor) => set({ selectionAnchor }),
  setTool: (tool) => {
    const state = get();
    if (
      tool !== "select" &&
      (state.selectedPlacementIds.length || state.selectedEmptyCells.length)
    ) {
      state.setSelection([], [], true);
    }
    set((current) => ({
      tool,
      // Suggest is a drawing operation, not a selection modifier, and has no
      // useful meaning outside Draw - leaving it armed after switching to
      // any other tool creates a contradictory UI (both rows look active),
      // and for Insert specifically it's worse than cosmetic: Insert reads
      // armedSymbolId directly and would insert the synthetic id itself as
      // a placement's symbolId. Real stitches may remain armed while
      // selecting, so Cmd/Ctrl's temporary-selection workflow is unaffected.
      ...(tool !== "stitch" && current.armedSymbolId === SUGGEST_SYMBOL_ID
        ? { armedSymbolId: null, suggestAction: "suggest" as const }
        : {}),
      picker: null,
      selectionAnchor: null,
      ...(tool === "select" ? {} : { selectedPlacementIds: [], selectedEmptyCells: [] }),
    }));
  },
  setArmedSymbolId: (armedSymbolId, colorId = null) =>
    set({
      armedSymbolId,
      activeColor: armedSymbolId ? colorId : null,
      // Disarming, arming a real stitch, and re-arming Suggest itself all
      // start the sticky default fresh - a stale Confirm/Dismiss default
      // surviving a re-arm is confusing and easy to miss (FR-2).
      suggestAction: "suggest",
      tool: "stitch",
      selectedPlacementIds: [],
      selectedEmptyCells: [],
      lastClearedSelection: null,
      lastClearedEmptyCells: null,
      selectionAnchor: null,
      // Arming something (Suggest or a real stitch) is a clear signal the
      // designer wants to draw now, not pan - but disarming (armedSymbolId
      // null, e.g. the "stop drawing" buttons) has nothing to do with Pan
      // and shouldn't touch it.
      ...(armedSymbolId ? { panEnabled: false } : null),
    }),

  /** Arm a symbol/color pen and assign it to the next free quick slot, without reordering (FR-26). */
  chooseSymbol: (id, tool = "stitch", preserveSelection = false, colorId = null) => {
    useDocStore.getState().addQuickSlot(quickSlotKey(id, colorId));
    set({
      armedSymbolId: id,
      activeColor: colorId,
      // Arming a real stitch always moves away from the Suggest sentinel
      // (FR-2) - see setArmedSymbolId above.
      suggestAction: "suggest",
      tool,
      // Always an arm, never a disarm - see setArmedSymbolId above.
      panEnabled: false,
      ...(preserveSelection ? null : {
        picker: null,
        selectedPlacementIds: [],
        selectedEmptyCells: [],
        lastClearedSelection: null,
        lastClearedEmptyCells: null,
        selectionAnchor: null,
      }),
    });
  },

  addQuickSymbol: (id, colorId = null) => {
    useDocStore.getState().addQuickSlot(quickSlotKey(id, colorId));
  },

  removeQuickSymbol: (key) => {
    const state = get();
    useDocStore.getState().removeQuickSlot(key);
    if (state.armedSymbolId && quickSlotKey(state.armedSymbolId, state.activeColor) === key) {
      set({ armedSymbolId: null, activeColor: null });
    }
  },

  moveQuickSymbolTo: (key, targetSlot) => {
    // `promoteQuickSlot` adds `key` to the quick row first if it isn't
    // already there, then moves it - so dragging a glossary entry that
    // never got its own quick slot (e.g. one that only arrived via a
    // duplicate/paste or an import) onto the row promotes it, while an
    // already-slotted key just reorders exactly as before.
    useDocStore.getState().promoteQuickSlot(key, targetSlot);
  },

  // Editing a single suggested/unidentified cell always wins over the batch
  // review menu it was opened from - closing it here (rather than leaving it
  // to reappear once the picker closes) is what keeps "choose a stitch" from
  // ever reopening the menu, per the review menu's lifecycle rules.
  openPicker: (picker) => set({ picker, suggestReview: null }),
  closePicker: () => set({ picker: null }),
  selectPlacement: (id, additive) => {
    const state = get();
    const selected = state.selectedPlacementIds;
    if (!additive) {
      state.setSelection([id], [], true);
      return;
    }
    state.setSelection(
      selected.includes(id)
        ? selected.filter((selectedId) => selectedId !== id)
        : [...selected, id],
      state.selectedEmptyCells,
      true,
    );
  },
  setSelection: (selectedPlacementIds, selectedEmptyCells, recordUndo = true) =>
    set((state) => {
      if (
        sameStringList(state.selectedPlacementIds, selectedPlacementIds) &&
        sameCellList(state.selectedEmptyCells, selectedEmptyCells)
      ) return {};
      const before = {
        placementIds: state.selectedPlacementIds,
        emptyCells: state.selectedEmptyCells,
      };
      const after = { placementIds: selectedPlacementIds, emptyCells: selectedEmptyCells };
      // Empty-cell highlighting is a contextual edit target (most commonly
      // the cell whose picker is open), not a standalone selection action.
      // Only changes to actual selected stitches belong in Undo history.
      const recordSelectionHistory =
        recordUndo && !sameStringList(state.selectedPlacementIds, selectedPlacementIds);
      // A new selection action truncates the whole unified timeline's
      // future (see editorHistory.ts), not just this store's own redo
      // stack - otherwise undoing some document edits and then making a
      // new selection leaves a stale doc redoStack a "redo" could still
      // jump back into.
      if (recordSelectionHistory && useDocStore.getState().redoStack.length) {
        useDocStore.setState({ redoStack: [] });
      }
      return {
        selectedPlacementIds,
        selectedEmptyCells,
        lastClearedSelection: recordUndo ? state.selectedPlacementIds : null,
        lastClearedEmptyCells: recordUndo ? state.selectedEmptyCells : null,
        ...(recordSelectionHistory
          ? {
              selectionUndoStack: [
                ...state.selectionUndoStack,
                { before, after, sequence: nextHistorySequence() },
              ],
              selectionRedoStack: [],
            }
          : null),
      };
    }),
  setSelectedPlacementIds: (selectedPlacementIds, recordUndo = true) => {
    const state = get();
    state.setSelection(selectedPlacementIds, state.selectedEmptyCells, recordUndo);
  },
  setSelectedEmptyCells: (selectedEmptyCells, recordUndo = true) => {
    const state = get();
    state.setSelection(state.selectedPlacementIds, selectedEmptyCells, recordUndo);
  },
  setClipboardPlacements: (clipboardPlacements) => set({ clipboardPlacements }),
  setSelectionBox: (selectionBox) => set({ selectionBox }),
  setSelectionMove: (selectionMove) => set({ selectionMove }),
  clearSelection: () => set({
    selectedPlacementIds: [],
    selectedEmptyCells: [],
    lastClearedSelection: null,
    lastClearedEmptyCells: null,
    selectionBox: null,
    selectionMove: null,
  }),
  clearSelectionWithUndo: () => {
    const state = get();
    const { selectedPlacementIds: current, selectedEmptyCells: currentEmpty } = state;
    if (!current.length && !currentEmpty.length) return;
    state.setSelection([], [], true);
    set({
      lastClearedSelection: current.length ? current : null,
      lastClearedEmptyCells: currentEmpty.length ? currentEmpty : null,
      selectionBox: null,
      selectionMove: null,
    });
  },
  restoreLastClearedSelection: () => {
    const { lastClearedSelection: stash, lastClearedEmptyCells: emptyStash } = get();
    if (!stash && !emptyStash) return false;
    set({
      selectedPlacementIds: stash ?? [],
      selectedEmptyCells: emptyStash ?? [],
      lastClearedSelection: null,
      lastClearedEmptyCells: null,
    });
    return true;
  },
  undoSelection: () => {
    const state = get();
    const entry = state.selectionUndoStack[state.selectionUndoStack.length - 1];
    if (!entry) return false;
    set({
      selectedPlacementIds: entry.before.placementIds,
      selectedEmptyCells: entry.before.emptyCells,
      selectionUndoStack: state.selectionUndoStack.slice(0, -1),
      selectionRedoStack: [...state.selectionRedoStack, entry],
      picker: null,
      selectionBox: null,
      selectionMove: null,
      lastClearedSelection: null,
      lastClearedEmptyCells: null,
    });
    return true;
  },
  redoSelection: () => {
    const state = get();
    const entry = state.selectionRedoStack[state.selectionRedoStack.length - 1];
    if (!entry) return false;
    set({
      selectedPlacementIds: entry.after.placementIds,
      selectedEmptyCells: entry.after.emptyCells,
      selectionUndoStack: [...state.selectionUndoStack, entry],
      selectionRedoStack: state.selectionRedoStack.slice(0, -1),
      picker: null,
      selectionBox: null,
      selectionMove: null,
      lastClearedSelection: null,
      lastClearedEmptyCells: null,
    });
    return true;
  },

  setViewport: (viewport) => set({ viewport }),

  // Guarded so pointer moves within one cell don't wake the render loop.
  setHover: (cell) => {
    if (sameCell(get().hover, cell)) return;
    set({ hover: cell });
  },
  setInsertHover: (cell) => {
    if (sameCell(get().insertHover, cell)) return;
    set({ insertHover: cell });
  },
  setInsertAnimation: (cell) => set({
    insertAnimation: cell ? { cell, startedAt: performance.now() } : null,
  }),

  setSpaceHeld: (spaceHeld) => {
    if (get().spaceHeld === spaceHeld) return;
    set({ spaceHeld });
  },

  setPanEnabled: (panEnabled) => {
    if (get().panEnabled === panEnabled) return;
    set({ panEnabled });
  },

  setSelectHeld: (selectHeld) => {
    if (get().selectHeld === selectHeld) return;
    set({ selectHeld });
  },
  setShiftHeld: (shiftHeld) => {
    if (get().shiftHeld === shiftHeld) return;
    set({ shiftHeld });
  },
  setAltHeld: (altHeld) => {
    if (get().altHeld === altHeld) return;
    set({ altHeld });
  },
  setKeyboardSelectionActive: (keyboardSelectionActive) => {
    if (get().keyboardSelectionActive === keyboardSelectionActive) return;
    set({ keyboardSelectionActive });
  },
  setStitchHighlight: (stitchHighlightColor, opacity) => set({
    stitchHighlightColor,
    ...(opacity === undefined ? null : { stitchHighlightOpacity: opacity }),
  }),
  setStitchHighlightOpacity: (stitchHighlightOpacity) => set({ stitchHighlightOpacity }),

  setPanning: (isPanning) => set({ isPanning }),

  // The picker's on-screen position is derived from its target cell plus the
  // live camera/viewport (see StitchPicker's layout effect), so it already
  // tracks along correctly through an incremental pan or zoom - no need to
  // close it here. `centerViewAt100`/`resetView` are the deliberate "jump to
  // a very different part of the chart" actions that still should.
  panByScreen: (dx, dy) => {
    if (dx === 0 && dy === 0) return;
    set({ camera: panByScreen(get().camera, dx, dy) });
  },

  zoomAt: (factor, sx, sy) => {
    const { camera, viewport } = get();
    const next = zoomAt(camera, factor, sx, sy, viewport);
    if (next !== camera) set({ camera: next });
  },

  centerCameraAt: (x, y) => set((s) => ({ camera: { ...s.camera, x, y } })),

  centerViewAt100: (x, y) => set({ camera: { x, y, zoom: 1 }, picker: null, suggestReview: null }),

  resetView: () => set({ camera: defaultCamera(), picker: null, suggestReview: null }),

  resetForChart: () => set({
    camera: defaultCamera(),
    tool: "stitch",
    armedSymbolId: null,
    activeColor: null,
    suggestAction: "suggest",
    picker: null,
    suggestReview: null,
    selectedPlacementIds: [],
    selectedEmptyCells: [],
    selectionBox: null,
    selectionMove: null,
    lastClearedSelection: null,
    lastClearedEmptyCells: null,
    selectionUndoStack: [],
    selectionRedoStack: [],
    selectionAnchor: null,
    hover: null,
    insertHover: null,
    insertAnimation: null,
    spaceHeld: false,
    panEnabled: false,
    selectHeld: false,
    shiftHeld: false,
    altHeld: false,
    keyboardSelectionActive: false,
    isPanning: false,
    activeReferenceImageId: null,
    referenceImagePanelOpen: false,
    referenceImageCalibrating: false,
    referenceImageGridAlignmentStatus: "idle",
    referenceImageCalibrationBox: null,
    referenceImageMarking: false,
    referenceImageActiveMark: null,
    referenceImageUnrecognized: new Set<string>(),
  }),
}));
