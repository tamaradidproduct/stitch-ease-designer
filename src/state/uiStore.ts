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

/** How many recently used symbols the picker keeps at the top. */
const RECENT_LIMIT = 12;

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
  /** True while space is held, which arms drag-to-pan. */
  spaceHeld: boolean;
  /** True while Cmd/Ctrl is held, temporarily enabling Select. */
  selectHeld: boolean;
  isPanning: boolean;

  tool: Tool;
  /**
   * Symbol the next click places. Null means the next click opens the picker
   * instead, which is the state the canvas starts in.
   */
  armedSymbolId: string | null;
  recentSymbolIds: string[];
  picker: PickerTarget | null;
  selectedPlacementIds: string[];
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
  /** The calibration box's two corners in world space, while it's being dragged out. */
  referenceImageCalibrationBox: { start: Point; current: Point } | null;
  setReferenceImageCalibrationBox: (box: { start: Point; current: Point } | null) => void;

  setTool: (tool: Tool) => void;
  setArmedSymbolId: (id: string | null) => void;
  /** Arms `id`; lands back on `tool` (Draw by default - Insert stays Insert). */
  chooseSymbol: (id: string, tool?: Tool) => void;
  openPicker: (target: PickerTarget) => void;
  closePicker: () => void;
  selectPlacement: (id: string, additive: boolean) => void;
  setSelectedPlacementIds: (ids: string[]) => void;
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
  setSpaceHeld: (held: boolean) => void;
  setSelectHeld: (held: boolean) => void;
  setPanning: (panning: boolean) => void;
  panByScreen: (dx: number, dy: number) => void;
  zoomAt: (factor: number, sx: number, sy: number) => void;
  resetView: () => void;
};

const sameCell = (a: Cell | null, b: Cell | null) =>
  a === b || (!!a && !!b && a.col === b.col && a.row === b.row);

export const useUiStore = create<UiState>((set, get) => ({
  camera: defaultCamera(),
  viewport: { width: 1, height: 1 },
  hover: null,
  insertHover: null,
  spaceHeld: false,
  selectHeld: false,
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
    }),
  referenceImageCalibrating: false,
  setReferenceImageCalibrating: (referenceImageCalibrating) => set({ referenceImageCalibrating }),
  referenceImageCalibrationBox: null,
  setReferenceImageCalibrationBox: (referenceImageCalibrationBox) =>
    set({ referenceImageCalibrationBox }),

  tool: "stitch",
  armedSymbolId: null,
  recentSymbolIds: [],
  picker: null,
  selectedPlacementIds: [],
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

  /** Arm a symbol and remember it, most recent first. */
  chooseSymbol: (id, tool = "stitch") => {
    const recent = [id, ...get().recentSymbolIds.filter((r) => r !== id)];
    set({
      armedSymbolId: id,
      tool,
      recentSymbolIds: recent.slice(0, RECENT_LIMIT),
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
  setSelectedPlacementIds: (selectedPlacementIds) =>
    set({ selectedPlacementIds, lastClearedSelection: null }),
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

  setSpaceHeld: (spaceHeld) => {
    if (get().spaceHeld === spaceHeld) return;
    set({ spaceHeld });
  },

  setSelectHeld: (selectHeld) => {
    if (get().selectHeld === selectHeld) return;
    set({ selectHeld });
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
}));
