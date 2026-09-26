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
import { rowDirectionAt } from "../model/rowDirection";
import {
  isEmptyChange,
  type Change,
  type DocMeta,
  type PatternInfo,
  type ReferenceImage,
  type RepeatDefinition,
  type Placement,
} from "../model/types";
import { newUuid } from "../uuid";
import type { LoadedChart } from "../storage/ChartStore";
import { nextHistorySequence } from "./historySequence";
import { useUiStore } from "./uiStore";
import {
  DEFAULT_STITCH_IDS,
  assignQuickSlot,
  moveQuickSlotTo,
  parseQuickSlotId,
  quickSlotKey,
  removeQuickSlot,
  renameQuickSlot,
} from "../model/quickSlots";

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
type HistoryEntry = {
  /** Shared with selection history so Undo can respect true action order. */
  sequence: number;
  /** Placement/repeat history uses reversible operations. */
  change?: Change;
  repeats?: RepeatDefinition[];
  /**
   * Reference-image edits are small immutable snapshots, scoped to one
   * image by id. `before` is the image's state before this entry's change -
   * `null` for "didn't exist" (undoing an add removes it), a full snapshot
   * otherwise. `index` is that image's array position just before this
   * entry's change, captured for a patch exactly like a removal - array
   * order is manual z-order (FR-52), so undoing either one must restore the
   * image in place, not just anywhere.
   */
  referenceImageChange?: { id: string; before: ReferenceImage | null; index?: number };
};

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
  /** Pattern screenshots behind (or in front of) the chart, if any have been uploaded. */
  referenceImages: ReferenceImage[];

  /**
   * Chart-scoped glossary/quick-row membership (FR-32) - entries are
   * quick-slot keys (`symbolId` or `symbolId::colorId`, see `quickSlots.ts`).
   * Chart settings, not document content: mutated outside `commit()`, so
   * Cmd/Ctrl+Z never touches them (see §6 "Undo scope" in the colorwork spec).
   */
  glossaryIds: string[];
  quickSymbolIds: string[];

  /**
   * See `PatternInfo`. Chart settings, not document content - like
   * `glossaryIds`/`quickSymbolIds` above, mutated outside `commit()` so
   * Cmd/Ctrl+Z never touches it.
   */
  patternInfo: PatternInfo;

  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  /** Changes accumulated during the current drag, merged into one entry. */
  stroke: Change[] | null;

  /**
   * `suggested`/`confidence` mark it as an unaccepted guess from auto-suggest
   * - see `Placement`. `colorId` is null/undefined for an uncolored pen
   * (DNT-8: every call site is responsible for passing its own color
   * explicitly, never "whatever's active").
   */
  place: (
    symbolId: string,
    col: number,
    row: number,
    suggested?: boolean,
    confidence?: number,
    colorId?: string | null,
  ) => void;
  erase: (col: number, row: number) => void;
  /**
   * Clears the suggested flag on suggested placements in one undoable step -
   * every one of them by default, or just `ids` (Alt-click confirming a
   * single guess doesn't need to wait for a full review pass).
   */
  acceptSuggestions: (ids?: string[]) => void;
  /**
   * Erases suggested placements in one undoable step - every one of them by
   * default, or just `ids`. The identified-review counterpart to
   * `acceptSuggestions`: same targeting rules, opposite outcome.
   */
  dismissSuggestions: (ids?: string[]) => void;
  /** Returns the replaced placements' new ids, or the original `ids` unchanged if nothing was replaced. */
  replacePlacements: (ids: string[], symbolId: string, colorId?: string | null) => string[];
  erasePlacements: (ids: string[]) => void;
  movePlacements: (ids: string[], deltaCol: number, deltaRow: number) => void;
  /** Whether `movePlacements` would actually move anything, without doing it. */
  canMovePlacements: (ids: string[], deltaCol: number, deltaRow: number) => boolean;
  createRepeat: (ids: string[]) => void;
  /** Returns whether the repeat was actually placed (false on a collision). */
  instantiateRepeat: (repeatId: string, col: number, row: number) => boolean;
  duplicatePlacements: (ids: string[]) => string[];
  /** Inserts a copy beside the selection in knitting order, shifting the row to make room. */
  duplicatePlacementsInRow: (ids: string[]) => string[];
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
  insertPlacement: (symbolId: string, col: number, row: number, colorId?: string | null) => void;
  /**
   * Recolors exactly `ids` (must currently share one (symbolId, colorId)
   * combo - callers enforce FR-33's homogeneity rule) to `colorId`. A
   * document edit like any other placement change, so it's undoable.
   * Returns the recolored placements' new ids.
   */
  recolorPlacements: (ids: string[], colorId: string | null) => string[];
  /** Merges a patch into `patternInfo`. Not undoable - see the field's own doc comment. */
  setPatternInfo: (patch: Partial<PatternInfo>) => void;
  /** Names (or renames) one color; an empty/blank name removes its entry. */
  setColorName: (colorId: string, name: string) => void;
  /** Replaces the whole glossary array. Not undoable - see the field's own doc comment. */
  setGlossaryIds: (ids: string[]) => void;
  /** Replaces the whole quick-row array. Not undoable - see the field's own doc comment. */
  setQuickSymbolIds: (ids: string[]) => void;
  /** Adds `id` to the glossary if it isn't already there. */
  addGlossaryId: (id: string) => void;
  /** Removes `id` from the glossary. */
  removeGlossaryId: (id: string) => void;
  /** Adds `key` to the next free quick slot; newly placed or colored swatches move ahead of unplaced plain slots. */
  addQuickSlot: (key: string) => void;
  /** Clears a quick-slot assignment without moving other slots. */
  removeQuickSlot: (key: string) => void;
  /** Reorders a quick slot, updating its number-key shortcut. */
  moveQuickSlotTo: (key: string, targetSlot: number) => void;
  /**
   * Moves `key` into the quick row at `targetSlot`, adding it first if it
   * isn't already a quick slot - the drag-and-drop path for promoting a
   * glossary entry that didn't make it into a quick slot (e.g. one that only
   * arrived via a duplicate/paste or an import, never an explicit arm/pick)
   * up into the row where it can get a keyboard shortcut and be reordered
   * like any other slot. A no-op move for an already-slotted key is
   * unaffected - this only adds the "insert if missing" step in front of it.
   */
  promoteQuickSlot: (key: string, targetSlot: number) => void;
  /** Reorders a glossary entry (adding it to the explicit list first if it was only placement-derived). */
  moveGlossaryIdTo: (key: string, targetIndex: number) => void;
  /**
   * DNT-12's rename-vs-mint recolor path: renaming `oldKey` to `newKey` in
   * place is only safe when nothing else on the chart still uses `oldKey`'s
   * (symbol, color) combo, excluding `excludingPlacementIds` (the placements
   * actually being recolored). When siblings remain, mints (or reuses) a new
   * slot for `newKey` instead of touching `oldKey`'s slot. Applies to both
   * the quick row and the glossary, wherever `oldKey` is currently present.
   */
  recolorQuickSlot: (oldKey: string, newKey: string, excludingPlacementIds: string[]) => void;
  /**
   * Adds a freshly uploaded reference image, appended at the end unless
   * `atIndex` is given (the panel's "Replace" flow uses it to land the new
   * image back in the slot the old one occupied). Undoable - Cmd/Ctrl+Z
   * removes it again, from wherever it landed.
   */
  addReferenceImage: (image: ReferenceImage, atIndex?: number) => void;
  /**
   * Patches one reference image by id - a no-op if it's not present.
   * Everything but `id` itself is patchable, `ref` included, though the
   * panel's own "Replace" action goes through `addReferenceImage` +
   * `removeReferenceImage` instead (two separately undoable steps) rather
   * than patching `ref` in place here.
   */
  updateReferenceImage: (id: string, patch: Partial<Omit<ReferenceImage, "id">>) => void;
  /** Coalesce a continuous reference-image gesture into one undo step. */
  beginReferenceImageEdit: (id: string) => void;
  endReferenceImageEdit: () => void;
  /** Removes a reference image outright. Undoable - Cmd/Ctrl+Z restores it at its original position. */
  removeReferenceImage: (id: string) => void;
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

function promoteQuickSlotOverUnplacedPlainSlots(
  slots: readonly string[],
  index: DocIndex,
  key: string,
): string[] {
  const { colorId: keyColorId } = parseQuickSlotId(key);
  // Confirmed placements only, matching countConfirmedStitches/
  // selectableGlossaryEntryPlacementIds elsewhere in the glossary: a
  // still-pending Suggest guess isn't something the designer has actually
  // drawn, so it must not block a genuinely-placed stitch from promoting.
  const placedSwatches = new Set<string>();
  const placedPlainSymbols = new Set<string>();
  for (const placement of index.placements.values()) {
    if (placement.suggested) continue;
    placedSwatches.add(quickSlotKey(placement.symbolId, placement.colorId));
    if (!placement.colorId) placedPlainSymbols.add(placement.symbolId);
  }
  if (!keyColorId && !placedSwatches.has(key)) return [...slots];
  const targetSlot = slots.findIndex((slot) => {
    if (!slot) return false;
    const { symbolId, colorId } = parseQuickSlotId(slot);
    return !colorId && !placedPlainSymbols.has(symbolId);
  });
  if (targetSlot === -1) return [...slots];
  // Only move left: `key` may already sit ahead of `targetSlot` (nothing to
  // promote past), and moveQuickSlotTo walks it *to* that index regardless
  // of direction - asking it to move right would demote an already-promoted
  // swatch past the very unplaced default it's supposed to stay ahead of.
  const currentIndex = slots.indexOf(key);
  if (currentIndex !== -1 && currentIndex <= targetSlot) return [...slots];
  return moveQuickSlotTo(slots, key, targetSlot);
}

/** `images`, as they stood just before `change` was (or is about to be) applied - the snapshot the opposite undo/redo stack needs. */
function referenceImageChangeEntry(
  images: readonly ReferenceImage[],
  id: string,
): { before: ReferenceImage | null; index?: number } {
  const index = images.findIndex((img) => img.id === id);
  return index === -1 ? { before: null } : { before: images[index]!, index };
}

/**
 * Applies one `{ id, before, index? }` snapshot to `images` - the single
 * operation undo/redo both use, in opposite directions. `before: null`
 * means the image didn't exist yet, so applying it removes `id`; otherwise
 * it upserts `before` back in, at `index` when the id isn't already present
 * (undoing a removal), or in place when it is (undoing a patch).
 */
function applyReferenceImageChange(
  images: readonly ReferenceImage[],
  change: { id: string; before: ReferenceImage | null; index?: number },
): ReferenceImage[] {
  const without = images.filter((img) => img.id !== change.id);
  if (change.before === null) return without;
  const at = change.index !== undefined && change.index <= without.length ? change.index : without.length;
  return [...without.slice(0, at), change.before, ...without.slice(at)];
}

export const useDocStore = create<DocState>((set, get) => {
  // Kept in the store closure rather than rendered state: it is only a
  // history bookkeeping boundary for a live drag, not UI data.
  let referenceImageEditStart: { id: string; before: ReferenceImage; index?: number } | undefined;
  let referenceImageEditChanged = false;

  /**
   * A new document edit truncates the *whole* unified timeline's future, not
   * just this store's own slice of it - otherwise a selection change made
   * after undoing some edits could still be followed by a stale "redo" that
   * jumps back to a point before it (see editorHistory.ts). Every site below
   * that clears this store's own `redoStack` for a fresh edit calls this too.
   */
  const clearSelectionRedo = () => {
    if (useUiStore.getState().selectionRedoStack.length) {
      useUiStore.setState({ selectionRedoStack: [] });
    }
  };

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
        sequence: nextHistorySequence(),
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
    clearSelectionRedo();
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
    referenceImages: [],
    glossaryIds: [...DEFAULT_STITCH_IDS],
    quickSymbolIds: [...DEFAULT_STITCH_IDS],
    patternInfo: {},

    place: (symbolId, col, row, suggested, confidence, colorId) =>
      commit(placeChange(get().index, symbolId, col, row, suggested, confidence, colorId)),
    erase: (col, row) => commit(eraseChange(get().index, col, row)),
    acceptSuggestions: (ids) => {
      const idSet = ids ? new Set(ids) : null;
      const suggested = [...get().index.placements.values()].filter(
        (p) => p.suggested && (!idSet || idSet.has(p.id)),
      );
      if (!suggested.length) return;
      commit({
        removed: suggested,
        added: suggested.map(({ suggested: _dropped, confidence: _score, ...rest }) => rest),
      });
    },
    dismissSuggestions: (ids) => {
      const idSet = ids ? new Set(ids) : null;
      const suggested = [...get().index.placements.values()].filter(
        (p) => p.suggested && (!idSet || idSet.has(p.id)),
      );
      if (!suggested.length) return;
      commit({ added: [], removed: suggested });
    },
    canInsertAt: (col, row) => canInsertAtIndex(get().index, col, row),
    insertPlacement: (symbolId, col, row, colorId) =>
      commit(insertChange(get().index, symbolId, col, row, colorId)),

    recolorPlacements: (ids, colorId) => {
      const selected = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (!selected.length) return ids;
      if (selected.every((p) => (p.colorId ?? null) === (colorId ?? null))) return ids;
      const added = selected.map((p) => ({
        ...p,
        id: newPlacementId(),
        ...(colorId ? { colorId } : {}),
      }));
      commit({ removed: selected, added });
      return added.map((p) => p.id);
    },

    setPatternInfo: (patch) =>
      set((s) => ({ patternInfo: { ...s.patternInfo, ...patch }, revision: s.revision + 1 })),
    setColorName: (colorId, name) => {
      const trimmed = name.trim();
      const { colorNames } = get().patternInfo;
      const next = { ...colorNames };
      if (trimmed) {
        next[colorId] = trimmed;
      } else {
        delete next[colorId];
      }
      get().setPatternInfo({ colorNames: next });
    },
    setGlossaryIds: (glossaryIds) => set((s) => ({ glossaryIds, revision: s.revision + 1 })),
    setQuickSymbolIds: (quickSymbolIds) => set((s) => ({ quickSymbolIds, revision: s.revision + 1 })),
    addGlossaryId: (id) => {
      const current = get().glossaryIds;
      if (current.includes(id)) return;
      get().setGlossaryIds([...current, id]);
    },
    removeGlossaryId: (id) => {
      const current = get().glossaryIds;
      if (!current.includes(id)) return;
      get().setGlossaryIds(current.filter((existing) => existing !== id));
    },
    addQuickSlot: (key) => {
      const state = get();
      const assigned = assignQuickSlot(state.quickSymbolIds, key);
      const next = promoteQuickSlotOverUnplacedPlainSlots(assigned, state.index, key);
      if (next !== state.quickSymbolIds) state.setQuickSymbolIds(next);
    },
    removeQuickSlot: (key) => {
      const current = get().quickSymbolIds;
      const next = removeQuickSlot(current, key);
      if (next !== current) get().setQuickSymbolIds(next);
    },
    moveQuickSlotTo: (key, targetSlot) => {
      const current = get().quickSymbolIds;
      const next = moveQuickSlotTo(current, key, targetSlot);
      if (next !== current) get().setQuickSymbolIds(next);
    },
    promoteQuickSlot: (key, targetSlot) => {
      const state = get();
      const isNewKey = !state.quickSymbolIds.includes(key);
      // An overflow entry dropped onto a slot that's already empty can be
      // written straight into that index - there's nothing to displace, so
      // routing it through addQuickSlot's first-vacant-slot placement
      // followed by a chain of adjacent swaps back to the real target would
      // only disturb slots the drop never touched.
      if (isNewKey && targetSlot >= 0 && !state.quickSymbolIds[targetSlot]) {
        const next = [...state.quickSymbolIds];
        while (next.length <= targetSlot) next.push("");
        next[targetSlot] = key;
        state.setQuickSymbolIds(next);
        return;
      }
      if (isNewKey) state.addQuickSlot(key);
      get().moveQuickSlotTo(key, targetSlot);
    },
    moveGlossaryIdTo: (key, targetIndex) => {
      const state = get();
      const current = state.glossaryIds.includes(key)
        ? state.glossaryIds
        : [...state.glossaryIds, key];
      const from = current.indexOf(key);
      const clampedTarget = Math.max(0, Math.min(targetIndex, current.length - 1));
      if (from === clampedTarget && current === state.glossaryIds) return;
      const without = current.filter((id) => id !== key);
      const next = [
        ...without.slice(0, clampedTarget),
        key,
        ...without.slice(clampedTarget),
      ];
      state.setGlossaryIds(next);
    },
    recolorQuickSlot: (oldKey, newKey, excludingPlacementIds) => {
      if (oldKey === newKey) return;
      const { symbolId, colorId } = parseQuickSlotId(oldKey);
      const excluded = new Set(excludingPlacementIds);
      // DNT-12: renaming in place is only safe when nothing else on the
      // chart still uses the old combo.
      let hasSibling = false;
      for (const p of get().index.placements.values()) {
        if (!excluded.has(p.id) && p.symbolId === symbolId && (p.colorId ?? null) === (colorId ?? null)) {
          hasSibling = true;
          break;
        }
      }
      const state = get();
      if (hasSibling) {
        // Siblings remain - mint (or reuse) a new slot for the new combo,
        // leaving the old one untouched.
        if (state.quickSymbolIds.includes(oldKey)) state.addQuickSlot(newKey);
        if (state.glossaryIds.includes(oldKey)) state.addGlossaryId(newKey);
        return;
      }
      // DNT-10: renaming in place must not silently create a duplicate slot
      // when an *older* slot already holds this exact resulting pen -
      // that older slot is emptied instead, rather than bailing out
      // (bailing looks like the color simply didn't apply).
      if (state.quickSymbolIds.includes(oldKey)) {
        const withoutOlderDuplicate = state.quickSymbolIds.includes(newKey)
          ? removeQuickSlot(state.quickSymbolIds, newKey)
          : state.quickSymbolIds;
        const renamed = renameQuickSlot(withoutOlderDuplicate, oldKey, newKey);
        state.setQuickSymbolIds(
          promoteQuickSlotOverUnplacedPlainSlots(renamed, state.index, newKey),
        );
      }
      if (state.glossaryIds.includes(oldKey)) {
        const withoutOlderDuplicate = state.glossaryIds.filter((id) => id !== newKey);
        state.setGlossaryIds(
          withoutOlderDuplicate.map((id) => (id === oldKey ? newKey : id)),
        );
      }
    },

    // Adding, removing, and editing a reference image are all undoable -
    // each banks a `{ id, before, index? }` snapshot (`before: null` means
    // "didn't exist"), so Cmd/Ctrl+Z on a delete brings the image straight
    // back at the position it was removed from.
    addReferenceImage: (image, atIndex) =>
      set((s) => {
        const at = atIndex !== undefined && atIndex <= s.referenceImages.length ? atIndex : s.referenceImages.length;
        return {
          referenceImages: [...s.referenceImages.slice(0, at), image, ...s.referenceImages.slice(at)],
          revision: s.revision + 1,
          undoStack: [...s.undoStack, {
            sequence: nextHistorySequence(),
            referenceImageChange: { id: image.id, before: null },
          }],
          redoStack: [],
        };
      }),
    // Reference-point edits are document changes, unlike camera movement, so
    // keep a compact before-image snapshot for Cmd/Ctrl+Z. This deliberately
    // covers image transforms too: a dragged mark is still an editable
    // reference point, even though it updates continuously while dragging.
    updateReferenceImage: (id, patch) => {
      const s = get();
      const current = referenceImageChangeEntry(s.referenceImages, id);
      if (current.before === null) return;
      const next = { ...current.before, ...patch };
      const nextImages = s.referenceImages.map((img) => (img.id === id ? next : img));
      if (referenceImageEditStart !== undefined) {
        referenceImageEditChanged = true;
        set({ referenceImages: nextImages, revision: s.revision + 1, redoStack: [] });
      } else {
        set({
          referenceImages: nextImages,
          revision: s.revision + 1,
          undoStack: [...s.undoStack, {
            sequence: nextHistorySequence(),
            referenceImageChange: { id, ...current },
          }],
          redoStack: [],
        });
      }
      clearSelectionRedo();
    },
    beginReferenceImageEdit: (id) => {
      if (referenceImageEditStart !== undefined) return;
      const current = referenceImageChangeEntry(get().referenceImages, id);
      if (current.before === null) return;
      referenceImageEditStart = {
        id,
        before: current.before,
        ...(current.index !== undefined ? { index: current.index } : {}),
      };
      referenceImageEditChanged = false;
    },
    endReferenceImageEdit: () => {
      if (referenceImageEditStart === undefined) return;
      const { id, before, index } = referenceImageEditStart;
      const changed = referenceImageEditChanged;
      referenceImageEditStart = undefined;
      referenceImageEditChanged = false;
      if (!changed) return;
      set((s) => ({
        undoStack: [...s.undoStack, {
          sequence: nextHistorySequence(),
          referenceImageChange: { id, before, ...(index !== undefined ? { index } : {}) },
        }],
        redoStack: [],
      }));
      clearSelectionRedo();
    },
    removeReferenceImage: (id) =>
      set((s) => {
        const index = s.referenceImages.findIndex((img) => img.id === id);
        if (index === -1) return {};
        return {
          referenceImages: s.referenceImages.filter((img) => img.id !== id),
          revision: s.revision + 1,
          undoStack: [...s.undoStack, {
            sequence: nextHistorySequence(),
            referenceImageChange: { id, before: s.referenceImages[index]!, index },
          }],
          redoStack: [],
        };
      }),

    replacePlacements: (ids, symbolId, colorId) => {
      const selected = ids
        .map((id) => get().index.placements.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (!selected.length || selected.some((p) => get().index.spanOf(p) !== spanOf(symbolId))) return ids;
      if (selected.every((p) => p.symbolId === symbolId && (p.colorId ?? null) === (colorId ?? null))) {
        return ids;
      }
      // Spread first: a replaced stitch keeps whatever group it belonged
      // to (a repeat instance, a duplicated cluster) rather than silently
      // dropping out of it. Choosing a replacement is a deliberate,
      // resolved answer, so it also drops any suggested/confidence
      // flags - the same as accepting a suggestion outright. `colorId`
      // defaults to stripped (DNT-8): a plain pick is a whole new pen, never
      // whatever color happened to be active.
      const added = selected.map(({ suggested: _dropped, confidence: _score, colorId: _old, ...rest }) => ({
        ...rest,
        id: newPlacementId(),
        symbolId,
        ...(colorId ? { colorId } : {}),
      }));
      commit({ removed: selected, added });
      return added.map((p) => p.id);
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
          ...(p.colorId ? { colorId: p.colorId } : {}),
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
        ...(stitch.colorId ? { colorId: stitch.colorId } : {}),
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
    duplicatePlacementsInRow: (ids) => {
      const selected = ids
        .map((id) => get().index.placements.get(id))
        .filter((placement): placement is Placement => !!placement);
      if (!selected.length) return [];

      const selectedIds = new Set(selected.map((placement) => placement.id));
      const rows = new Map<number, Placement[]>();
      for (const placement of selected) {
        const row = rows.get(placement.row) ?? [];
        row.push(placement);
        rows.set(placement.row, row);
      }

      const removed: Placement[] = [];
      const shifted: Placement[] = [];
      const copies: Placement[] = [];
      const copiedGroups = new Map<string, string>();

      for (const [row, rowSelection] of rows) {
        const minCol = Math.min(...rowSelection.map((placement) => placement.col));
        const maxCol = Math.max(...rowSelection.map(
          (placement) => placement.col + get().index.spanOf(placement),
        ));
        const width = maxCol - minCol;
        const direction = rowDirectionAt(row) === "rtl" ? -1 : 1;

        const moving = get().index.toArray().filter((placement) =>
          placement.row === row &&
          !selectedIds.has(placement.id) &&
          (direction < 0 ? placement.col < minCol : placement.col >= maxCol));
        removed.push(...moving);
        shifted.push(...moving.map((placement) => ({
          ...placement,
          col: placement.col + direction * width,
        })));

        for (const placement of rowSelection) {
          const { groupId: sourceGroupId, ...rest } = placement;
          const groupId = sourceGroupId
            ? (copiedGroups.get(sourceGroupId) ?? newUuid("group_"))
            : undefined;
          if (sourceGroupId && groupId) copiedGroups.set(sourceGroupId, groupId);
          copies.push({
            ...rest,
            id: newPlacementId(),
            col: placement.col + direction * width,
            ...(groupId ? { groupId } : null),
          });
        }
      }

      commit({ removed, added: [...shifted, ...copies] });
      return copies.map((placement) => placement.id);
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
      set({
        stroke: null,
        undoStack: [...undoStack, { sequence: nextHistorySequence(), change: inverse }],
        redoStack: [],
      });
      clearSelectionRedo();
    },

    undo: () => {
      const { undoStack, redoStack, index, revision, repeats, referenceImages } = get();
      const entry = undoStack[undoStack.length - 1];
      if (!entry) return;
      const inverse = entry.change ? apply(index, entry.change) : undefined;
      const redoEntry: HistoryEntry = {
        sequence: entry.sequence,
        ...(inverse ? { change: inverse } : {}),
        ...(entry.repeats !== undefined ? { repeats } : {}),
        ...(entry.referenceImageChange
          ? { referenceImageChange: { id: entry.referenceImageChange.id, ...referenceImageChangeEntry(referenceImages, entry.referenceImageChange.id) } }
          : {}),
      };
      set({
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, redoEntry],
        revision: revision + 1,
        ...(entry.repeats !== undefined ? { repeats: entry.repeats } : {}),
        ...(entry.referenceImageChange
          ? { referenceImages: applyReferenceImageChange(referenceImages, entry.referenceImageChange) }
          : {}),
      });
    },

    redo: () => {
      const { undoStack, redoStack, index, revision, repeats, referenceImages } = get();
      const entry = redoStack[redoStack.length - 1];
      if (!entry) return;
      const inverse = entry.change ? apply(index, entry.change) : undefined;
      const undoEntry: HistoryEntry = {
        sequence: entry.sequence,
        ...(inverse ? { change: inverse } : {}),
        ...(entry.repeats !== undefined ? { repeats } : {}),
        ...(entry.referenceImageChange
          ? { referenceImageChange: { id: entry.referenceImageChange.id, ...referenceImageChangeEntry(referenceImages, entry.referenceImageChange.id) } }
          : {}),
      };
      set({
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, undoEntry],
        revision: revision + 1,
        ...(entry.repeats !== undefined ? { repeats: entry.repeats } : {}),
        ...(entry.referenceImageChange
          ? { referenceImages: applyReferenceImageChange(referenceImages, entry.referenceImageChange) }
          : {}),
      });
    },

    openChart: ({
      meta,
      placements,
      repeats = [],
      referenceImages = [],
      glossaryIds = [...DEFAULT_STITCH_IDS],
      quickSymbolIds = [...DEFAULT_STITCH_IDS],
      patternInfo = {},
      unknownSymbolIds,
    }) => {
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
        referenceImages,
        glossaryIds,
        quickSymbolIds,
        patternInfo,
      });
    },

    markSaved: (meta, revision) =>
      set({ meta, savedRevision: revision, status: "idle", statusDetail: null }),

    setStatus: (status, detail = null) => set({ status, statusDetail: detail }),

    setMeta: (meta) => set({ meta }),
  };
});
