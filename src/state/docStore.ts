import { create } from "zustand";
import { DocIndex } from "../model/docIndex";
import { apply, eraseChange, mergeChanges, newPlacementId, placeChange } from "../model/ops";
import { spanOf } from "../symbols/registry";
import {
  isEmptyChange,
  type Change,
  type DocMeta,
  type RepeatDefinition,
} from "../model/types";
import { newUuid } from "../uuid";
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
  repeats: RepeatDefinition[];

  undoStack: Change[];
  redoStack: Change[];
  /** Changes accumulated during the current drag, merged into one entry. */
  stroke: Change[] | null;

  place: (symbolId: string, col: number, row: number) => void;
  erase: (col: number, row: number) => void;
  replacePlacements: (ids: string[], symbolId: string) => void;
  erasePlacements: (ids: string[]) => void;
  movePlacements: (ids: string[], deltaCol: number, deltaRow: number) => void;
  createRepeat: (ids: string[]) => void;
  instantiateRepeat: (repeatId: string, col: number, row: number) => void;
  duplicatePlacements: (ids: string[]) => string[];
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
    repeats: [],

    place: (symbolId, col, row) => commit(placeChange(get().index, symbolId, col, row)),
    erase: (col, row) => commit(eraseChange(get().index, col, row)),
    replacePlacements: (ids, symbolId) => {
      const selected = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (!selected.length || selected.some((p) => get().index.spanOf(p) !== spanOf(symbolId))) return;
      if (selected.every((p) => p.symbolId === symbolId)) return;
      commit({
        removed: selected,
        added: selected.map((p) => ({
          id: newPlacementId(),
          symbolId,
          col: p.col,
          row: p.row,
        })),
      });
    },
    erasePlacements: (ids) => {
      const removed = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (removed.length) commit({ added: [], removed });
    },
    movePlacements: (ids, deltaCol, deltaRow) => {
      if (deltaCol === 0 && deltaRow === 0) return;
      const selectedIds = new Set(ids);
      const selected = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (!selected.length) return;

      for (const placement of selected) {
        const span = get().index.spanOf(placement);
        for (let offset = 0; offset < span; offset++) {
          const hit = get().index.placementAt(
            placement.col + deltaCol + offset,
            placement.row + deltaRow,
          );
          if (hit && !selectedIds.has(hit.id)) return;
        }
      }

      commit({
        removed: selected,
        added: selected.map((placement) => ({
          ...placement,
          col: placement.col + deltaCol,
          row: placement.row + deltaRow,
        })),
      });
    },
    createRepeat: (ids) => {
      const placements = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (!placements.length) return;
      const minCol = Math.min(...placements.map((p) => p.col));
      const minRow = Math.min(...placements.map((p) => p.row));
      const maxCol = Math.max(...placements.map((p) => p.col + get().index.spanOf(p) - 1));
      const maxRow = Math.max(...placements.map((p) => p.row));
      const repeat: RepeatDefinition = {
        id: newUuid("repeat_"),
        name: `Repeat ${get().repeats.length + 1}`,
        width: maxCol - minCol + 1,
        height: maxRow - minRow + 1,
        stitches: placements.map((p) => ({
          symbolId: p.symbolId,
          col: p.col - minCol,
          row: p.row - minRow,
        })),
      };
      const groupId = newUuid("group_");
      commit({
        removed: placements,
        added: placements.map((p) => ({ ...p, groupId })),
      });
      set({ repeats: [...get().repeats, repeat] });
    },
    instantiateRepeat: (repeatId, col, row) => {
      const repeat = get().repeats.find((candidate) => candidate.id === repeatId);
      if (!repeat) return;
      const groupId = newUuid("group_");
      const added = repeat.stitches.map((stitch) => ({
        id: newPlacementId(),
        symbolId: stitch.symbolId,
        col: col + stitch.col,
        row: row + stitch.row,
        groupId,
      }));
      for (const placement of added) {
        for (let offset = 0; offset < spanOf(placement.symbolId); offset++) {
          if (get().index.placementAt(placement.col + offset, placement.row)) return;
        }
      }
      commit({ added, removed: [] });
    },
    duplicatePlacements: (ids) => {
      const placements = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (!placements.length) return [];
      const minRow = Math.min(...placements.map((p) => p.row));
      const maxRow = Math.max(...placements.map((p) => p.row));
      const deltaRow = maxRow - minRow + 2;
      const groupId = newUuid("group_");
      const added = placements.map((p) => ({
        ...p,
        id: newPlacementId(),
        row: p.row + deltaRow,
        groupId,
      }));
      for (const placement of added) {
        for (let offset = 0; offset < get().index.spanOf(placement); offset++) {
          if (get().index.placementAt(placement.col + offset, placement.row)) return [];
        }
      }
      commit({ added, removed: [] });
      return added.map((p) => p.id);
    },

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

    openChart: ({ meta, placements, repeats = [], unknownSymbolIds }) => {
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
        repeats,
      });
    },

    markSaved: (meta, revision) =>
      set({ meta, savedRevision: revision, status: "idle", statusDetail: null }),

    setStatus: (status, detail = null) => set({ status, statusDetail: detail }),

    setMeta: (meta) => set({ meta }),
  };
});
