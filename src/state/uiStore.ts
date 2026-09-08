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

/** Cell key for the unrecognized set - one placement per cell, so coordinates identify it. */
export const cellKey = (col: number, row: number): string => `${col},${row}`;

/** Where the picker is anchored: which cell it will fill, and where to draw it. */
export type PickerTarget = {
  col: number;
  row: number;
  x: number;
  y: number;
  /** The stitch already occupying this cell, if any — the picker is editing it. */
  currentSymbolId?: string;
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

export type SelectionBox = { start: Cell; current: Cell };
/**
 * `blocked` is true when the drop target is occupied (by an unselected
 * stitch for a move, or by anything at all for a duplicate). `duplicating`
 * is true while Alt/Opt is held, which copies the selection instead of
 * moving it.
 */
export type SelectionMove = { col: number; row: number; blocked: boolean; duplicating: boolean };

/** Stable quick-access order; the first five entries also have number-key shortcuts. */
const QUICK_SLOT_STORAGE_KEY = "stitch-ease:quick-symbols";

export function assignQuickSymbol(slots: string[], id: string): string[] {
  if (slots.includes(id)) return slots;
  const openSlot = slots.indexOf("");
  if (openSlot !== -1) {
    return slots.map((slot, index) => (index === openSlot ? id : slot));
  }
  return [...slots, id];
}

/**
 * Swaps a quick stitch with its neighbouring slot. Empty slots deliberately
 * participate in the swap: moving into one changes the number-key shortcut
 * without renumbering the other stitches.
 */
export function moveQuickSymbol(slots: string[], id: string, direction: -1 | 1): string[] {
  const from = slots.indexOf(id);
  const to = from + direction;
  if (from === -1 || to < 0) return slots;

  const next = [...slots];
  while (next.length <= to) next.push("");
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** Moves a stitch to a slot by walking it through its adjacent neighbours. */
export function moveQuickSymbolTo(slots: string[], id: string, targetSlot: number): string[] {
  const start = slots.indexOf(id);
  if (start === -1 || start === targetSlot || targetSlot < 0) return slots;

  let next = slots;
  const direction: -1 | 1 = targetSlot < start ? -1 : 1;
  for (let slot = start; slot !== targetSlot; slot += direction) {
    next = moveQuickSymbol(next, id, direction);
  }
  return next;
}

function loadQuickSymbolIds(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(QUICK_SLOT_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    const seen = new Set<string>();
    return stored.flatMap((id) => {
      // Empty strings are deliberate vacant slots. Keep every one so a
      // removed shortcut never causes its neighbours to slide into a new
      // number after a reload.
      if (id === "") return [id];
      if (typeof id !== "string" || seen.has(id)) return [];
      seen.add(id);
      return [id];
    });
  } catch {
    return [];
  }
}

function saveQuickSymbolIds(ids: string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(QUICK_SLOT_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable in private/restricted browser contexts;
    // stable slots still work for the lifetime of the current app session.
  }
}

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

  tool: Tool;
  /**
   * Symbol the next click places. Null means the next click opens the picker
   * instead, which is the state the canvas starts in.
   */
  armedSymbolId: string | null;
  quickSymbolIds: string[];
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
  /**
   * The first cell of a Cmd+Shift click-then-click range select, waiting for
   * a second Cmd+Shift click to complete the bounding box. Cleared by any
   * other selection change - see `useShortcuts`'s Escape handler and the
   * various resets below.
   */
  selectionAnchor: Cell | null;
  setSelectionAnchor: (cell: Cell | null) => void;

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

  setTool: (tool: Tool) => void;
  setArmedSymbolId: (id: string | null) => void;
  /**
   * Arms `id`; lands back on `tool` (Draw by default - Insert stays Insert).
   * Normally starts fresh (clears the selection and closes the picker) -
   * pass `preserveSelection` when the symbol was just chosen to fill the
   * current selection, which stays selected with its picker open so it can
   * be tweaked again immediately, armed for wherever the next click goes.
   */
  chooseSymbol: (id: string, tool?: Tool, preserveSelection?: boolean) => void;
  /** Clears a stitch's quick-access assignment without moving other slots. */
  removeQuickSymbol: (id: string) => void;
  /** Reorders a quick stitch, updating the number-key shortcuts. */
  moveQuickSymbolTo: (id: string, targetSlot: number) => void;
  openPicker: (target: PickerTarget) => void;
  closePicker: () => void;
  selectPlacement: (id: string, additive: boolean) => void;
  setSelectedPlacementIds: (ids: string[], recordUndo?: boolean) => void;
  setSelectedEmptyCells: (cells: Cell[], recordUndo?: boolean) => void;
  setClipboardPlacements: (placements: Placement[]) => void;
  setSelectionBox: (box: SelectionBox | null) => void;
  setSelectionMove: (move: SelectionMove | null) => void;
  clearSelection: () => void;
  /** Clears the selection, remembering it so Cmd/Ctrl+Z can bring it back. */
  clearSelectionWithUndo: () => void;
  /** Restores the selection stashed by `clearSelectionWithUndo`, if any. Returns whether it did. */
  restoreLastClearedSelection: () => boolean;

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
  quickSymbolIds: loadQuickSymbolIds(),
  picker: null,
  selectedPlacementIds: [],
  selectedEmptyCells: [],
  clipboardPlacements: [],
  selectionBox: null,
  selectionMove: null,
  lastClearedSelection: null,
  lastClearedEmptyCells: null,
  selectionAnchor: null,
  setSelectionAnchor: (selectionAnchor) => set({ selectionAnchor }),
  setTool: (tool) =>
    set({
      tool,
      picker: null,
      lastClearedSelection: null,
      lastClearedEmptyCells: null,
      selectionAnchor: null,
      ...(tool === "select" ? {} : { selectedPlacementIds: [], selectedEmptyCells: [] }),
    }),
  setArmedSymbolId: (armedSymbolId) =>
    set({
      armedSymbolId,
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

  /** Arm a symbol and assign it to the next free quick slot, without reordering. */
  chooseSymbol: (id, tool = "stitch", preserveSelection = false) => {
    const current = get().quickSymbolIds;
    const quickSymbolIds = assignQuickSymbol(current, id);
    if (quickSymbolIds !== current) saveQuickSymbolIds(quickSymbolIds);
    set({
      armedSymbolId: id,
      tool,
      quickSymbolIds,
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

  removeQuickSymbol: (id) => {
    const state = get();
    const slot = state.quickSymbolIds.indexOf(id);
    if (slot === -1) return;
    const quickSymbolIds = state.quickSymbolIds.map((symbolId, index) =>
      index === slot ? "" : symbolId,
    );
    saveQuickSymbolIds(quickSymbolIds);
    set({
      quickSymbolIds,
      ...(state.armedSymbolId === id ? { armedSymbolId: null } : {}),
    });
  },

  moveQuickSymbolTo: (id, targetSlot) => {
    const current = get().quickSymbolIds;
    const quickSymbolIds = moveQuickSymbolTo(current, id, targetSlot);
    if (quickSymbolIds === current) return;
    saveQuickSymbolIds(quickSymbolIds);
    set({ quickSymbolIds });
  },

  openPicker: (picker) => set({ picker }),
  closePicker: () => set({ picker: null }),
  selectPlacement: (id, additive) => {
    const selected = get().selectedPlacementIds;
    if (!additive) {
      set({ selectedPlacementIds: [id], selectedEmptyCells: [], lastClearedSelection: null });
      return;
    }
    set({
      selectedPlacementIds: selected.includes(id)
        ? selected.filter((selectedId) => selectedId !== id)
        : [...selected, id],
      lastClearedSelection: null,
    });
  },
  setSelectedPlacementIds: (selectedPlacementIds, recordUndo = true) =>
    set((state) => ({
      selectedPlacementIds,
      lastClearedSelection: recordUndo ? state.selectedPlacementIds : null,
    })),
  setSelectedEmptyCells: (selectedEmptyCells, recordUndo = true) =>
    set((state) => ({
      selectedEmptyCells,
      lastClearedEmptyCells: recordUndo ? state.selectedEmptyCells : null,
    })),
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
    const { selectedPlacementIds: current, selectedEmptyCells: currentEmpty } = get();
    if (!current.length && !currentEmpty.length) return;
    set({
      selectedPlacementIds: [],
      selectedEmptyCells: [],
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

  centerViewAt100: (x, y) => set({ camera: { x, y, zoom: 1 }, picker: null }),

  resetView: () => set({ camera: defaultCamera(), picker: null }),

  resetForChart: () => set({
    camera: defaultCamera(),
    tool: "stitch",
    armedSymbolId: null,
    picker: null,
    selectedPlacementIds: [],
    selectedEmptyCells: [],
    selectionBox: null,
    selectionMove: null,
    lastClearedSelection: null,
    lastClearedEmptyCells: null,
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
    referenceImagePanelOpen: false,
    referenceImageCalibrating: false,
    referenceImageGridAlignmentStatus: "idle",
    referenceImageCalibrationBox: null,
    referenceImageMarking: false,
    referenceImageActiveMark: null,
    referenceImageUnrecognized: new Set<string>(),
  }),
}));
