import { create } from "zustand";
import { DocIndex } from "../model/docIndex";
import { apply, eraseChange, mergeChanges, placeChange } from "../model/ops";
import { isEmptyChange, type Change, type DocMeta } from "../model/types";
import type { LoadedChart } from "../storage/DocStore";

/**
 * Where the open chart stands with storage.
 *
 * Note there's no "dirty" here: unsaved work is `revision !== savedRevision`,
 * derived rather than tracked, so the two can't disagree.
 *
 * `conflict` is sticky until the user resolves it. Autosave stops while it
 * holds, so a chart changed in another tab can't be quietly overwritten.
 */
export type SaveStatus = "idle" | "saving" | "conflict" | "error";

type DocState = {
  index: DocIndex;
  /**
   * Bumped on every mutation. DocIndex is mutable for speed, so this is what
   * subscribers watch instead of identity.
   */
  revision: number;

  /** The open chart's metadata, or null when none is open. */
  meta: DocMeta | null;
  /** The `revision` last written to storage. */
  savedRevision: number;
  status: SaveStatus;
  /** Accompanies `conflict`/`error`, for the UI to show. */
  statusDetail: string | null;
  /** Symbols the stored chart referenced that this build's library lacks. */
  unknownSymbolIds: string[];

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

  /** Replace everything with a chart from storage. */
  openChart: (loaded: LoadedChart) => void;
  /** Storage accepted a write made at `revision`. */
  markSaved: (meta: DocMeta, revision: number) => void;
  setStatus: (status: SaveStatus, detail?: string | null) => void;
  /** After a rename, which changes the rev without touching the stitches. */
  setMeta: (meta: DocMeta) => void;
};

export const selectIsDirty = (s: DocState): boolean => s.revision !== s.savedRevision;

/**
 * Whether `id` is still the open chart.
 *
 * For guarding the result of an async write (a rename, a save) against a
 * chart switch that happened while it was in flight: `index`/`revision` are
 * already the newly opened chart's by the time the write settles, so
 * applying the write's result unconditionally would attach the wrong
 * chart's stitches to `meta` (or vice versa) - `openChart` replaces `meta`
 * wholesale on every switch, so comparing ids here is enough to catch it.
 */
export const isChartOpen = (id: string): boolean => useDocStore.getState().meta?.id === id;

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

  /**
   * Everything that has to be dropped when a different chart is opened.
   *
   * Undo above all: left in place, an undo after switching charts would apply
   * the previous chart's inverse changes to this one and resurrect stitches
   * that were never here.
   */
  const blank = () => ({
    index: DocIndex.from([]),
    undoStack: [] as Change[],
    redoStack: [] as Change[],
    stroke: null,
  });

  return {
    ...blank(),
    revision: 0,
    meta: null,
    savedRevision: 0,
    status: "idle" as SaveStatus,
    statusDetail: null,
    unknownSymbolIds: [],

    place: (symbolId, col, row) => commit(placeChange(get().index, symbolId, col, row)),
    erase: (col, row) => commit(eraseChange(get().index, col, row)),

    beginStroke: () => set({ stroke: [] }),

    endStroke: () => {
      const { stroke, undoStack } = get();
      if (!stroke) return;
      if (stroke.length === 0) {
        set({ stroke: null });
        return;
      }
      // The stroke is already applied; bank a single inverse for all of it.
      const merged = mergeChanges(stroke);
      const inverse: Change = { added: merged.removed, removed: merged.added };
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

    openChart: ({ meta, placements, unknownSymbolIds }) => {
      const revision = get().revision + 1;
      set({
        ...blank(),
        index: DocIndex.from(placements),
        revision,
        // Freshly loaded is by definition saved, so autosave doesn't
        // immediately rewrite what it just read.
        savedRevision: revision,
        meta,
        status: "idle",
        statusDetail: null,
        unknownSymbolIds,
      });
    },

    markSaved: (meta, revision) =>
      set({ meta, savedRevision: revision, status: "idle", statusDetail: null }),

    setStatus: (status, detail = null) => set({ status, statusDetail: detail }),

    setMeta: (meta) => set({ meta }),
  };
});
