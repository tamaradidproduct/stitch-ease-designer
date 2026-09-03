import { create } from "zustand";
import { DocIndex } from "../model/docIndex";
import {
  apply,
  canInsertAt as canInsertAtIndex,
  eraseChange,
  insertChange,
  mergeChanges,
  newPlacementId,
  placeChange,
} from "../model/ops";
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

/**
 * One undo/redo stack entry: the placement change to apply, plus - only for
 * an action that also touches the repeats list (currently just createRepeat)
 * - the repeats snapshot to restore when this entry is applied. Repeats are
 * few and rarely mutated, so a full snapshot is simpler than a delta and
 * keeps this local to docStore rather than teaching the shared Change/apply
 * model (ops.ts) about a second kind of state to reverse.
 */
type HistoryEntry = { change: Change; repeats?: RepeatDefinition[] };

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

  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  /** Changes accumulated during the current drag, merged into one entry. */
  stroke: Change[] | null;

  place: (symbolId: string, col: number, row: number) => void;
  erase: (col: number, row: number) => void;
  replacePlacements: (ids: string[], symbolId: string) => void;
  erasePlacements: (ids: string[]) => void;
  movePlacements: (ids: string[], deltaCol: number, deltaRow: number) => void;
  /** Whether `movePlacements` would actually move anything, without doing it. */
  canMovePlacements: (ids: string[], deltaCol: number, deltaRow: number) => boolean;
  createRepeat: (ids: string[]) => void;
  /** Returns whether the repeat was actually placed (false on a collision). */
  instantiateRepeat: (repeatId: string, col: number, row: number) => boolean;
  duplicatePlacements: (ids: string[]) => string[];
  /** Whether `duplicatePlacementsAt` would place a copy, without doing it. */
  canDuplicatePlacements: (ids: string[], deltaCol: number, deltaRow: number) => boolean;
  /** Copies `ids` to `deltaCol`/`deltaRow` away, leaving the originals in place. Returns the copies' ids. */
  duplicatePlacementsAt: (ids: string[], deltaCol: number, deltaRow: number) => string[];
  /** Whether `insertPlacement` could insert at this cell - false inside an existing multi-cell symbol. */
  canInsertAt: (col: number, row: number) => boolean;
  /**
   * Inserts a stitch at `col`/`row`, shifting whatever's there - and
   * everything further along the row in the knitting direction - out of the
   * way to make room, rather than overwriting it.
   */
  insertPlacement: (symbolId: string, col: number, row: number) => void;
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
  /**
   * Run a change, then either bank it as history or fold it into the stroke.
   *
   * `repeatsAfter`, when given, is the repeats list this action leaves in
   * place; the repeats list as it stood just before the change is captured
   * on the undo entry so undo/redo can restore each side atomically with
   * the placement edit. Not supported mid-stroke - no drag-paint action
   * touches repeats, so `commit` never needs to merge a repeats change into
   * an in-progress stroke.
   */
  const commit = (change: Change, repeatsAfter?: RepeatDefinition[]) => {
    if (isEmptyChange(change)) return;
    const { index, stroke, revision, undoStack, repeats } = get();
    const inverse = apply(index, change);

    if (stroke) {
      set({ revision: revision + 1, stroke: [...stroke, change], redoStack: [] });
    } else {
      const entry: HistoryEntry = {
        change: inverse,
        ...(repeatsAfter !== undefined ? { repeats } : {}),
      };
      set({
        revision: revision + 1,
        undoStack: [...undoStack, entry],
        redoStack: [],
        ...(repeatsAfter !== undefined ? { repeats: repeatsAfter } : {}),
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
    undoStack: [] as HistoryEntry[],
    redoStack: [] as HistoryEntry[],
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
    canInsertAt: (col, row) => canInsertAtIndex(get().index, col, row),
    insertPlacement: (symbolId, col, row) =>
      commit(insertChange(get().index, symbolId, col, row)),
    replacePlacements: (ids, symbolId) => {
      const selected = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (!selected.length || selected.some((p) => get().index.spanOf(p) !== spanOf(symbolId))) return;
      if (selected.every((p) => p.symbolId === symbolId)) return;
      commit({
        removed: selected,
        // Spread first: a replaced stitch keeps whatever group it belonged
        // to (a repeat instance, a duplicated cluster) rather than silently
        // dropping out of it.
        added: selected.map((p) => ({ ...p, id: newPlacementId(), symbolId })),
      });
    },
    erasePlacements: (ids) => {
      const removed = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (removed.length) commit({ added: [], removed });
    },
    canMovePlacements: (ids, deltaCol, deltaRow) => {
      if (deltaCol === 0 && deltaRow === 0) return false;
      const selectedIds = new Set(ids);
      const selected = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (!selected.length) return false;

      for (const placement of selected) {
        const span = get().index.spanOf(placement);
        for (let offset = 0; offset < span; offset++) {
          const hit = get().index.placementAt(
            placement.col + deltaCol + offset,
            placement.row + deltaRow,
          );
          if (hit && !selectedIds.has(hit.id)) return false;
        }
      }
      return true;
    },
    movePlacements: (ids, deltaCol, deltaRow) => {
      if (!get().canMovePlacements(ids, deltaCol, deltaRow)) return;
      const selected = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);

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
      // Both the placement grouping and the new repeat definition are one
      // logical action; passing the resulting repeats list to commit makes
      // undo restore both together, instead of leaving an orphaned,
      // unreferenced, undeletable repeat definition behind after an undo.
      commit(
        {
          removed: placements,
          added: placements.map((p) => ({ ...p, groupId })),
        },
        [...get().repeats, repeat],
      );
    },
    instantiateRepeat: (repeatId, col, row) => {
      const repeat = get().repeats.find((candidate) => candidate.id === repeatId);
      if (!repeat) return false;
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
          if (get().index.placementAt(placement.col + offset, placement.row)) return false;
        }
      }
      commit({ added, removed: [] });
      return true;
    },
    duplicatePlacements: (ids) => {
      const placements = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (!placements.length) return [];
      const minRow = Math.min(...placements.map((p) => p.row));
      const maxRow = Math.max(...placements.map((p) => p.row));
      const deltaRow = maxRow - minRow + 2;
      // Preserve each source's own grouping rather than merging every
      // selected placement into one new group: placements that already
      // shared a groupId keep sharing one (a freshly minted id, so the
      // duplicates don't merge with the originals), and placements that
      // were ungrouped stay ungrouped.
      const groupIdMap = new Map<string, string>();
      const added = placements.map((p) => {
        const next = { ...p, id: newPlacementId(), row: p.row + deltaRow };
        if (p.groupId) {
          let mapped = groupIdMap.get(p.groupId);
          if (!mapped) {
            mapped = newUuid("group_");
            groupIdMap.set(p.groupId, mapped);
          }
          next.groupId = mapped;
        }
        return next;
      });
      for (const placement of added) {
        for (let offset = 0; offset < get().index.spanOf(placement); offset++) {
          if (get().index.placementAt(placement.col + offset, placement.row)) return [];
        }
      }
      commit({ added, removed: [] });
      return added.map((p) => p.id);
    },
    canDuplicatePlacements: (ids, deltaCol, deltaRow) => {
      if (deltaCol === 0 && deltaRow === 0) return false;
      const selected = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (!selected.length) return false;

      // Unlike a move, the originals aren't going anywhere, so the copy has
      // to clear every existing placement - including the ones it's copied
      // from - not just the ones outside the selection.
      for (const placement of selected) {
        const span = get().index.spanOf(placement);
        for (let offset = 0; offset < span; offset++) {
          if (get().index.placementAt(placement.col + deltaCol + offset, placement.row + deltaRow)) {
            return false;
          }
        }
      }
      return true;
    },
    duplicatePlacementsAt: (ids, deltaCol, deltaRow) => {
      if (!get().canDuplicatePlacements(ids, deltaCol, deltaRow)) return [];
      const selected = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);

      // Each original group becomes its own new group in the copy, so
      // duplicating a selection spanning several repeats/cables keeps them
      // as separate draggable units rather than fusing them into one.
      const groupIds = new Map<string, string>();
      const added = selected.map((p) => {
        const { groupId: originalGroupId, ...rest } = p;
        const groupId = originalGroupId
          ? (groupIds.get(originalGroupId) ?? newUuid("group_"))
          : undefined;
        if (originalGroupId && groupId) groupIds.set(originalGroupId, groupId);
        return {
          ...rest,
          id: newPlacementId(),
          col: p.col + deltaCol,
          row: p.row + deltaRow,
          ...(groupId ? { groupId } : null),
        };
      });

      commit({ removed: [], added });
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
      set({ stroke: null, undoStack: [...undoStack, { change: inverse }], redoStack: [] });
    },

    undo: () => {
      const { undoStack, redoStack, index, revision, repeats } = get();
      const entry = undoStack[undoStack.length - 1];
      if (!entry) return;
      const inverse = apply(index, entry.change);
      const redoEntry: HistoryEntry = {
        change: inverse,
        ...(entry.repeats !== undefined ? { repeats } : {}),
      };
      set({
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, redoEntry],
        revision: revision + 1,
        ...(entry.repeats !== undefined ? { repeats: entry.repeats } : {}),
      });
    },

    redo: () => {
      const { undoStack, redoStack, index, revision, repeats } = get();
      const entry = redoStack[redoStack.length - 1];
      if (!entry) return;
      const inverse = apply(index, entry.change);
      const undoEntry: HistoryEntry = {
        change: inverse,
        ...(entry.repeats !== undefined ? { repeats } : {}),
      };
      set({
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, undoEntry],
        revision: revision + 1,
        ...(entry.repeats !== undefined ? { repeats: entry.repeats } : {}),
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
