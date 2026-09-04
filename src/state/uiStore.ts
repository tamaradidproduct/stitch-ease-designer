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
import type { CalibrationPoint } from "../model/referenceCalibration";
import type { BoxHandle, Placement } from "../model/types";

export type Tool = "select" | "stitch" | "eraser" | "insert";

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
  /** When true, choosing a symbol inserts and shifts rather than placing/replacing. */
  insert?: boolean;
};

export type SelectionBox = { start: Cell; current: Cell };
/**
 * `blocked` is true when the drop target is occupied (by an unselected
 * stitch for a move, or by anything at all for a duplicate). `duplicating`
 * is true while Alt/Opt is held, which copies the selection instead of
 * moving it.
 */
export type SelectionMove = { col: number; row: number; blocked: boolean; duplicating: boolean };

/** Five stable quick-access slots shared by the stitch picker and toolbar. */
const QUICK_SLOT_LIMIT = 5;
const QUICK_SLOT_STORAGE_KEY = "stitch-ease:quick-symbols";

export function assignQuickSymbol(slots: string[], id: string): string[] {
  if (slots.includes(id) || slots.length >= QUICK_SLOT_LIMIT) return slots;
  return [...slots, id];
}

function loadQuickSymbolIds(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(QUICK_SLOT_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return [...new Set(stored.filter((id): id is string => typeof id === "string"))]
      .slice(0, QUICK_SLOT_LIMIT);
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
  /** True while Cmd/Ctrl is held, temporarily enabling Select. */
  selectHeld: boolean;
  /** Suppresses stale pointer feedback after keyboard-driven selection until the mouse moves. */
  keyboardSelectionActive: boolean;
  isPanning: boolean;

  tool: Tool;
  /**
   * Symbol the next click places. Null means the next click opens the picker
   * instead, which is the state the canvas starts in.
   */
  armedSymbolId: string | null;
  quickSymbolIds: string[];
  picker: PickerTarget | null;
  selectedPlacementIds: string[];
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

  /**
   * Whether the reference-image panel is open. While it is, and the image
   * is unlocked, dragging it on the canvas moves/resizes it instead of
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
   * The marks placed so far, each naming a stitch and row read off the
   * photo. Held here rather than on the document: they are scaffolding for
   * one calibration, not part of the chart, and the scale they produce is
   * what actually persists.
   */
  referenceImagePoints: CalibrationPoint[];
  addReferenceImagePoint: (point: CalibrationPoint) => void;
  updateReferenceImagePoint: (id: string, patch: Partial<CalibrationPoint>) => void;
  removeReferenceImagePoint: (id: string) => void;
  clearReferenceImagePoints: () => void;

  setTool: (tool: Tool) => void;
  setArmedSymbolId: (id: string | null) => void;
  /** Arms `id`; lands back on `tool` (Draw by default - Insert stays Insert). */
  chooseSymbol: (id: string, tool?: Tool) => void;
  openPicker: (target: PickerTarget) => void;
  closePicker: () => void;
  selectPlacement: (id: string, additive: boolean) => void;
  setSelectedPlacementIds: (ids: string[], recordUndo?: boolean) => void;
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
  setSelectHeld: (held: boolean) => void;
  setKeyboardSelectionActive: (active: boolean) => void;
  setPanning: (panning: boolean) => void;
  panByScreen: (dx: number, dy: number) => void;
  zoomAt: (factor: number, sx: number, sy: number) => void;
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
  selectHeld: false,
  keyboardSelectionActive: false,
  isPanning: false,
  referenceImagePanelOpen: false,
  setReferenceImagePanelOpen: (open) =>
    // Closing the panel drops any in-progress calibration along with it -
    // there's no reason to leave that armed once the canvas goes back to
    // the normal tools.
    set(open ? { referenceImagePanelOpen: true } : {
      referenceImagePanelOpen: false,
      referenceImageCalibrating: false,
      referenceImageCalibrationBox: null,
      referenceImageMarking: false,
      referenceImageCalibrationRejected: false,
      referenceImageHandle: null,
    }),
  referenceImageCalibrating: false,
  setReferenceImageCalibrating: (referenceImageCalibrating) => set({ referenceImageCalibrating }),
  referenceImageMarking: false,
  setReferenceImageMarking: (referenceImageMarking) => set({ referenceImageMarking }),
  referenceImagePoints: [],
  addReferenceImagePoint: (point) =>
    set((s) => ({ referenceImagePoints: [...s.referenceImagePoints, point] })),
  updateReferenceImagePoint: (id, patch) =>
    set((s) => ({
      referenceImagePoints: s.referenceImagePoints.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    })),
  removeReferenceImagePoint: (id) =>
    set((s) => ({ referenceImagePoints: s.referenceImagePoints.filter((p) => p.id !== id) })),
  clearReferenceImagePoints: () => set({ referenceImagePoints: [] }),
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
  clipboardPlacements: [],
  selectionBox: null,
  selectionMove: null,
  lastClearedSelection: null,
  setTool: (tool) =>
    set({
      tool,
      picker: null,
      lastClearedSelection: null,
      ...(tool === "select" ? {} : { selectedPlacementIds: [] }),
    }),
  setArmedSymbolId: (armedSymbolId) =>
    set({ armedSymbolId, tool: "stitch", selectedPlacementIds: [], lastClearedSelection: null }),

  /** Arm a symbol and assign it to the next free quick slot, without reordering. */
  chooseSymbol: (id, tool = "stitch") => {
    const current = get().quickSymbolIds;
    const quickSymbolIds = assignQuickSymbol(current, id);
    if (quickSymbolIds !== current) saveQuickSymbolIds(quickSymbolIds);
    set({
      armedSymbolId: id,
      tool,
      quickSymbolIds,
      picker: null,
      selectedPlacementIds: [],
      lastClearedSelection: null,
    });
  },

  openPicker: (picker) => set({ picker }),
  closePicker: () => set({ picker: null }),
  selectPlacement: (id, additive) => {
    const selected = get().selectedPlacementIds;
    if (!additive) {
      set({ selectedPlacementIds: [id], lastClearedSelection: null });
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
  setClipboardPlacements: (clipboardPlacements) => set({ clipboardPlacements }),
  setSelectionBox: (selectionBox) => set({ selectionBox }),
  setSelectionMove: (selectionMove) => set({ selectionMove }),
  clearSelection: () => set({
    selectedPlacementIds: [],
    lastClearedSelection: null,
    selectionBox: null,
    selectionMove: null,
  }),
  clearSelectionWithUndo: () => {
    const current = get().selectedPlacementIds;
    if (!current.length) return;
    set({
      selectedPlacementIds: [],
      lastClearedSelection: current,
      selectionBox: null,
      selectionMove: null,
    });
  },
  restoreLastClearedSelection: () => {
    const stash = get().lastClearedSelection;
    if (!stash) return false;
    set({ selectedPlacementIds: stash, lastClearedSelection: null });
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

  setSelectHeld: (selectHeld) => {
    if (get().selectHeld === selectHeld) return;
    set({ selectHeld });
  },
  setKeyboardSelectionActive: (keyboardSelectionActive) => {
    if (get().keyboardSelectionActive === keyboardSelectionActive) return;
    set({ keyboardSelectionActive });
  },

  setPanning: (isPanning) => set({ isPanning }),

  // Any camera move detaches the picker from the cell it was anchored to, so
  // it closes rather than floating over an unrelated part of the grid.
  panByScreen: (dx, dy) => {
    if (dx === 0 && dy === 0) return;
    set({ camera: panByScreen(get().camera, dx, dy), picker: null });
  },

  zoomAt: (factor, sx, sy) => {
    const { camera, viewport } = get();
    const next = zoomAt(camera, factor, sx, sy, viewport);
    if (next !== camera) set({ camera: next, picker: null });
  },

  resetView: () => set({ camera: defaultCamera(), picker: null }),

  resetForChart: () => set({
    camera: defaultCamera(),
    tool: "stitch",
    armedSymbolId: null,
    picker: null,
    selectedPlacementIds: [],
    selectionBox: null,
    selectionMove: null,
    lastClearedSelection: null,
    hover: null,
    insertHover: null,
    insertAnimation: null,
    spaceHeld: false,
    selectHeld: false,
    keyboardSelectionActive: false,
    isPanning: false,
    referenceImagePanelOpen: false,
    referenceImageCalibrating: false,
    referenceImageCalibrationBox: null,
  }),
}));
