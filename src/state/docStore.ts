import { create } from "zustand";
import { DocIndex } from "../model/docIndex";
import { apply, eraseChange, mergeChanges, placeChange } from "../model/ops";
import { isEmptyChange, type Change, type Placement } from "../model/types";

type DocState = {
  index: DocIndex;
  /**
   * Bumped on every mutation. DocIndex is mutable for speed, so this is what
   * subscribers watch instead of identity.
   */
  revision: number;

  undoStack: Change[];
  redoStack: Change[];
  /** Changes accumulated during the current drag, merged into one entry. */
  stroke: Change[] | null;

  place: (symbolId: string, col: number, row: number) => void;
  erase: (col: number, row: number) => void;
  beginStroke: () => void;
  endStroke: () => void;
  undo: () => void;
  redo: () => void;
  load: (placements: Placement[]) => void;
  clear: () => void;
};

export const useDocStore = create<DocState>((set, get) => {
  /** Run a change, then either bank it as history or fold it into the stroke. */
  const commit = (change: Change) => {
    if (isEmptyChange(change)) return;
    const { index, stroke, revision, undoStack } = get();
    const inverse = apply(index, change);

    if (stroke) {
      set({ revision: revision + 1, stroke: [...stroke, change], redoStack: [] });
    } else {
      set({
        revision: revision + 1,
        undoStack: [...undoStack, inverse],
        redoStack: [],
      });
    }
  };

  return {
    index: DocIndex.from([]),
    revision: 0,
    undoStack: [],
    redoStack: [],
    stroke: null,

    place: (symbolId, col, row) => commit(placeChange(get().index, symbolId, col, row)),
    erase: (col, row) => commit(eraseChange(get().index, col, row)),

    beginStroke: () => set({ stroke: [] }),

    endStroke: () => {
      const { stroke, index, undoStack } = get();
      if (!stroke) return;
      if (stroke.length === 0) {
        set({ stroke: null });
        return;
      }
      // The stroke is already applied; bank a single inverse for all of it.
      const merged = mergeChanges(stroke);
      const inverse: Change = { added: merged.removed, removed: merged.added };
      void index;
      set({ stroke: null, undoStack: [...undoStack, inverse], redoStack: [] });
    },

    undo: () => {
      const { undoStack, redoStack, index, revision } = get();
      const change = undoStack[undoStack.length - 1];
      if (!change) return;
      const inverse = apply(index, change);
      set({
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, inverse],
        revision: revision + 1,
      });
    },

    redo: () => {
      const { undoStack, redoStack, index, revision } = get();
      const change = redoStack[redoStack.length - 1];
      if (!change) return;
      const inverse = apply(index, change);
      set({
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, inverse],
        revision: revision + 1,
      });
    },

    load: (placements) =>
      set({
        index: DocIndex.from(placements),
        revision: get().revision + 1,
        undoStack: [],
        redoStack: [],
        stroke: null,
      }),

    clear: () =>
      set({
        index: DocIndex.from([]),
        revision: get().revision + 1,
        undoStack: [],
        redoStack: [],
        stroke: null,
      }),
  };
});
