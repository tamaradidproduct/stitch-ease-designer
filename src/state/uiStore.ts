import { create } from "zustand";
import {
  type Camera,
  type Cell,
  type Viewport,
  defaultCamera,
  panByScreen,
  zoomAt,
} from "../canvas/camera";

type UiState = {
  camera: Camera;
  viewport: Viewport;
  hover: Cell | null;
  /** True while space is held, which arms drag-to-pan. */
  spaceHeld: boolean;
  isPanning: boolean;

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

  panByScreen: (dx, dy) => {
    if (dx === 0 && dy === 0) return;
    set({ camera: panByScreen(get().camera, dx, dy) });
  },

  zoomAt: (factor, sx, sy) => {
    const { camera, viewport } = get();
    const next = zoomAt(camera, factor, sx, sy, viewport);
    if (next !== camera) set({ camera: next });
  },

  resetView: () => set({ camera: defaultCamera() }),
}));
