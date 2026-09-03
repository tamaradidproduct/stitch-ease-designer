import { create } from "zustand";
import {
  type Camera,
  type Cell,
  type Viewport,
  defaultCamera,
  panByScreen,
  zoomAt,
} from "../canvas/camera";

export type Tool = "select" | "stitch" | "eraser";

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
};

/** How many recently used symbols the picker keeps at the top. */
const RECENT_LIMIT = 12;

type UiState = {
  camera: Camera;
  viewport: Viewport;
  hover: Cell | null;
  /** True while space is held, which arms drag-to-pan. */
  spaceHeld: boolean;
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

  setTool: (tool: Tool) => void;
  setArmedSymbolId: (id: string | null) => void;
  chooseSymbol: (id: string) => void;
  openPicker: (target: PickerTarget) => void;
  closePicker: () => void;
  selectPlacement: (id: string, additive: boolean) => void;
  clearSelection: () => void;

  setViewport: (vp: Viewport) => void;
  setHover: (cell: Cell | null) => void;
  setSpaceHeld: (held: boolean) => void;
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
  spaceHeld: false,
  isPanning: false,

  tool: "stitch",
  armedSymbolId: null,
  recentSymbolIds: [],
  picker: null,
  selectedPlacementIds: [],

  setTool: (tool) => set({ tool, picker: null, ...(tool === "select" ? {} : { selectedPlacementIds: [] }) }),
  setArmedSymbolId: (armedSymbolId) =>
    set({ armedSymbolId, tool: "stitch", selectedPlacementIds: [] }),

  /** Arm a symbol and remember it, most recent first. */
  chooseSymbol: (id) => {
    const recent = [id, ...get().recentSymbolIds.filter((r) => r !== id)];
    set({
      armedSymbolId: id,
      tool: "stitch",
      recentSymbolIds: recent.slice(0, RECENT_LIMIT),
      picker: null,
      selectedPlacementIds: [],
    });
  },

  openPicker: (picker) => set({ picker }),
  closePicker: () => set({ picker: null }),
  selectPlacement: (id, additive) => {
    const selected = get().selectedPlacementIds;
    if (!additive) {
      set({ selectedPlacementIds: [id] });
      return;
    }
    set({
      selectedPlacementIds: selected.includes(id)
        ? selected.filter((selectedId) => selectedId !== id)
        : [...selected, id],
    });
  },
  clearSelection: () => set({ selectedPlacementIds: [] }),

  setViewport: (viewport) => set({ viewport }),

  // Guarded so pointer moves within one cell don't wake the render loop.
  setHover: (cell) => {
    if (sameCell(get().hover, cell)) return;
    set({ hover: cell });
  },

  setSpaceHeld: (spaceHeld) => {
    if (get().spaceHeld === spaceHeld) return;
    set({ spaceHeld });
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
