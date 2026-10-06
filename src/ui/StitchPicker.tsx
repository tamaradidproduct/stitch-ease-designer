import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cellToScreenRect } from "../canvas/camera";
import { cellKey } from "../model/cellKey";
import { allSymbols, getSymbol } from "../symbols/registry";
import type { StitchSymbol } from "../symbols/types";
import { useDocStore } from "../state/docStore";
import { type PickerTarget, useUiStore } from "../state/uiStore";
import { insertTargetCol } from "../model/ops";
import { SymbolGlyph } from "./SymbolGlyph";
import { browseSymbols, searchMotifs } from "./symbolSearch";
import { CloseIcon, DuplicateIcon, MakeMotifIcon, MoreIcon, QuickAddIcon, SearchIcon, TrashSmallIcon } from "./icons";
import { collectColoredGlossaryEntries, useGlossaryIds } from "./chartGlossary";
import { clamp } from "./utils";
import { parseQuickSlotId } from "../model/quickSlots";
import { motifIdFromKey, stampOrigin } from "../model/motifs";
import { rowDirectionAt } from "../model/rowDirection";
import { effectiveBase, isBaseStitch } from "../model/cableComposition";
import { MotifCopyBubbles, MotifDrawerSection, MotifGlyph, MotifQuickTile } from "./motifUi";
import { armMotifPen, eraseKeepingMotifStitches, selectedMotifCopy } from "./motifActions";
import { applyChipColor, currentSlotForPicker } from "./colorwork";
import { ColorChip } from "./ColorChip";
import { QuickTile } from "./QuickTile";
import { useDismissOnOutsideOrEscape } from "./useDismissOnOutsideOrEscape";
import { Popover } from "./Popover";
import { Button } from "./Button";
import { TextField } from "./Field";

const MENU_WIDTH = 284;
const SEARCH_SLOT_WIDTH = 200;
const MAX_HEIGHT = 380;
const MAX_HEIGHT_RESULTS = 326;
const GLYPH_BUDGET = 210;

/** Cables are up to 12 cells wide; shrink the cell so the whole span fits. */
const cellSizeFor = (symbol: StitchSymbol) =>
  Math.max(9, Math.min(22, Math.floor(GLYPH_BUDGET / symbol.span)));

export function StitchPicker() {
  const target = useUiStore((s) => s.picker);
  // The picker used to stay mounted and merely return null below. That still
  // ran its revision-driven index snapshots after every drawing operation.
  // Keep the closed state to this tiny selector so the full body unmounts
  // until a picker target actually exists (#325).
  // A direct switch between targets does not pass through the closed state.
  // Key the body by the target identity so its local search/drawer state
  // cannot flash from the previous target (#325).
  const targetKey = target
    ? [
      target.col,
      target.row,
      target.currentSymbolId ?? "",
      target.selectionIds?.join(",") ?? "",
      target.selectionEmptyCells?.map((cell) => `${cell.col},${cell.row}`).join(";") ?? "",
      target.armOnly ? "arm" : "",
      target.baseCell ? `base:${target.baseCell.placementId}:${target.baseCell.offset}` : "",
    ]
      .join(":")
    : "";
  return target ? <StitchPickerBody key={targetKey} target={target} /> : null;
}

function StitchPickerBody({ target }: { target: PickerTarget }) {
  const closePicker = useUiStore((s) => s.closePicker);
  const openPicker = useUiStore((s) => s.openPicker);
  const chooseSymbol = useUiStore((s) => s.chooseSymbol);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const setSelectedPlacementIds = useUiStore((s) => s.setSelectedPlacementIds);
  const setInsertAnimation = useUiStore((s) => s.setInsertAnimation);
  const quickIds = useDocStore((s) => s.quickSymbolIds);
  const armedSymbolId = useUiStore((s) => s.armedSymbolId);
  const activeColor = useUiStore((s) => s.activeColor);
  const camera = useUiStore((s) => s.camera);
  const viewport = useUiStore((s) => s.viewport);
  const place = useDocStore((s) => s.place);
  const erase = useDocStore((s) => s.erase);
  const createRepeat = useDocStore((s) => s.createRepeat);
  const duplicateSelection = useDocStore((s) => s.duplicatePlacementsInRow);
  const insertPlacement = useDocStore((s) => s.insertPlacement);
  const replacePlacements = useDocStore((s) => s.replacePlacements);
  const beginStroke = useDocStore((s) => s.beginStroke);
  const endStroke = useDocStore((s) => s.endStroke);
  const repeats = useDocStore((s) => s.repeats);
  const stampMotif = useDocStore((s) => s.stampMotif);
  const armedMotif = useUiStore((s) => s.armedMotif);
  const index = useDocStore((s) => s.index);
  const revision = useDocStore((s) => s.revision);
  const addedGlossaryIds = useGlossaryIds();

  // FR-25: one identity every consumer here reads - chip visibility, the
  // recolor effect, and (via `key ===` checks below) tile highlighting.
  // FR-40's "every instance" check needs the full placement list, which
  // the document mutates in place - `revision` (unread otherwise) is this
  // memo's real invalidation signal, same as `moreSymbols` below.
  const currentSlot = useMemo(() => {
    void revision;
    // FR-40's "every instance" check only runs inside the selection branch,
    // so skip the O(n) snapshot the rest of the time (StitchPicker stays
    // mounted and this memo re-evaluates on every document revision, active
    // drawing/dragging included).
    const allPlacements = target?.selectionIds?.length ? index.toArray() : [];
    return currentSlotForPicker(
      target,
      (id) => index.placements.get(id),
      armedSymbolId,
      activeColor,
      allPlacements,
      (col, row) => index.placementAt(col, row),
    );
  }, [target, index, armedSymbolId, activeColor, revision]);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOrigin, setSearchOrigin] = useState(5);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ compactLeft: 0, searchLeft: 0, top: 0 });
  const [resultsMaxHeight, setResultsMaxHeight] = useState(MAX_HEIGHT_RESULTS);
  const selectionSpan = target?.selectionSpan;
  const currentSymbol = target?.currentSymbolId ? getSymbol(target.currentSymbolId) : undefined;
  const baseCell = target?.baseCell;
  const basePlacement = baseCell ? index.placements.get(baseCell.placementId) : undefined;
  // Only a cell the designer changed has anything to clear back to.
  const changedBase = basePlacement?.base?.[baseCell!.offset] ?? null;
  const cellStitch = basePlacement ? effectiveBase(basePlacement)[baseCell!.offset] : null;
  const canDelete = baseCell ? !!changedBase : !!currentSymbol || !!target?.selectionIds?.length;

  // Plain stitches that already have a glossary row (quick slots count) -
  // what search hides until a query is typed, and tags "Added" after.
  const plainGlossaryIds = useMemo(() => {
    void revision;
    return new Set(collectColoredGlossaryEntries([...quickIds, ...addedGlossaryIds], index.toArray())
      .filter((entry) => !entry.colorId)
      .map((entry) => entry.symbol.id));
  }, [quickIds, addedGlossaryIds, index, revision]);
  // One identity drives the active tile, its color chip, and every
  // "current" tag, so they can never disagree. A cable cell holds a plain
  // stitch, so there any color of that stitch is current.
  const isCurrent = (entry: { key: string; symbol: StitchSymbol }) =>
    baseCell ? entry.symbol.id === cellStitch : currentSlot?.key === entry.key;
  // What a color chip acts on: the selection, or the one stitch under the picker.
  const chipTargetIds = target.selectionIds ?? currentSlot?.placementIds ?? [];

  const sections = useMemo(() => {
    const built = browseSymbols(allSymbols(), query, (id) => plainGlossaryIds.has(id));
    if (!selectionSpan) return built;
    return built
      .map((section) => ({
        ...section,
        symbols: section.symbols.filter((symbol) =>
          symbol.span === selectionSpan && (!target.baseCell || isBaseStitch(symbol.id))),
      }))
      .filter((section) => section.symbols.length > 0);
  }, [query, selectionSpan, target.baseCell, plainGlossaryIds]);

  type QuickEntry = { key: string; symbol: StitchSymbol; colorId?: string; disabled?: boolean };
  const quickSymbols = useMemo(
    () => quickIds.slice(0, 5)
      .map((key): QuickEntry | null => {
        const { symbolId, colorId } = parseQuickSlotId(key);
        const symbol = getSymbol(symbolId);
        return symbol
          ? {
            key,
            symbol,
            ...(colorId ? { colorId } : {}),
            ...((selectionSpan && symbol.span !== selectionSpan) || (target.baseCell && !isBaseStitch(symbol.id))
              ? { disabled: true }
              : {}),
          }
          : null;
      }),
      // Preserve holes and filtered positions: quick slot N must remain
      // picker position N, rather than compacting later entries left (#322).
    [quickIds, selectionSpan, target.baseCell],
  );
  // FR-30: a sixth, dynamic tile when the current selection is a real
  // stitch whose combo isn't already one of the five visible slots. Not
  // persisted - just a view of `currentSlot`, gone the moment the picker
  // moves elsewhere.
  // Quick slots holding a motif pen (FR-64), by slot position.
  const quickMotifs = useMemo(
    () => quickIds.slice(0, 5).map((key) => {
      // A base cell only takes a one-cell stitch, never a motif.
      const motifId = key && !target.baseCell ? motifIdFromKey(key) : null;
      return motifId ? repeats.find((r) => r.id === motifId) ?? null : null;
    }),
    [quickIds, repeats, target.baseCell],
  );
  // Picking a motif on an empty cell stamps it there (anchored like the
  // stamp ghost) and arms it; anywhere else it only arms.
  const chooseMotif = (motifId: string) => {
    const motif = repeats.find((r) => r.id === motifId);
    if (motif && !target.selectionIds && !target.selectionEmptyCells && !target.insert && !target.armOnly && !target.currentSymbolId) {
      stampMotif(motif.id, [stampOrigin(motif, target)]);
    }
    armMotifPen(motifId);
  };
  const dynamicSlot = useMemo(() => {
    if (!currentSlot || !currentSlot.placementIds.length) return null;
    if (quickSymbols.some((entry) => entry?.key === currentSlot.key)) return null;
    const symbol = getSymbol(currentSlot.symbolId);
    if (!symbol || (selectionSpan && symbol.span !== selectionSpan)) return null;
    return { key: currentSlot.key, symbol, ...(currentSlot.colorId ? { colorId: currentSlot.colorId } : {}) } satisfies QuickEntry;
  }, [currentSlot, quickSymbols, selectionSpan]);
  const moreEntries = useMemo(() => {
    // The document mutates its index in place; its revision invalidates this
    // cached snapshot when placements change.
    void revision;
    const visibleKeys = new Set(quickSymbols.flatMap((entry) => entry ? [entry.key] : []));
    // Color-aware (keyed by symbolId::colorId, not just symbolId) - a
    // colored variant is its own distinct glossary entry, same as it is in
    // RightPanel's glossary list, so it needs its own row here rather than
    // collapsing into whichever (colored or plain) form of the symbol was
    // added first. Using the plain-symbol view here used to make any color
    // variant beyond the first silently uncollectable from this drawer.
    return collectColoredGlossaryEntries(
      // The right panel treats assigned quick slots as glossary rows too,
      // including slots beyond the five shown in this compact picker.
      [...quickIds, ...addedGlossaryIds],
      index.toArray(),
    ).filter((entry) =>
      !visibleKeys.has(entry.key) && (!selectionSpan || entry.symbol.span === selectionSpan));
  }, [quickSymbols, quickIds, addedGlossaryIds, index, selectionSpan, revision]);
  const hasMore = moreEntries.length > 0 || repeats.length > 0;
  const copyInfo = useMemo(() => {
    void revision;
    return target.selectionIds ? selectedMotifCopy(target.selectionIds, index, repeats) : null;
  }, [target, index, repeats, revision]);
  const menuWidth = MENU_WIDTH + (dynamicSlot ? 45 : 0) + (hasMore ? 45 : 0) + (canDelete ? 45 : 0);
  const expandedMenuWidth = menuWidth + SEARCH_SLOT_WIDTH - 40;

  // Flat order is what the arrow keys walk, so it must match render order.
  const flat = useMemo(() => sections.flatMap((s) => s.symbols), [sections]);
  const matchingRepeats = target.selectionIds || baseCell ? [] : searchMotifs(repeats, query);

  // The picker never unmounts — it just renders null while closed — so a
  // mount-only effect would focus and reset state exactly once, the first
  // time it ever opens, and never again. Keying on `target` instead makes
  // every open behave like a fresh one: a stale search from the last cell
  // doesn't carry over, and if this cell already has a stitch, the list
  // starts on it rather than always at the top.
  // iOS only raises the on-screen keyboard for a focus() that lands
  // synchronously within the user gesture that opened the picker - a
  // requestAnimationFrame callback runs a paint later, well outside that
  // window (this is also why a Pencil tap, which doesn't share the same
  // touch-gesture restriction, used to work here when a finger tap didn't).
  // flushSync can't be used here - React forbids calling it from inside a
  // lifecycle/commit callback like this one - but useLayoutEffect doesn't
  // need it: a state update made from inside a layout effect is already
  // guaranteed to re-render and re-run layout effects synchronously, before
  // the browser paints, which is the same "no yielding to the event loop"
  // property flushSync would have provided. The searchButtonRef case needs
  // none of this - that button exists either way - so it's focused directly,
  // right here; the armOnly/inputRef case waits for the second effect below,
  // once the search input this reset just requested has actually mounted.
  useLayoutEffect(() => {
    if (!target) return;
    setQuery("");
    setSearchOpen(!!target.armOnly);
    setMoreOpen(false);
    setSearchOrigin(5);
    setActive(0);
    if (!target.armOnly) searchButtonRef.current?.focus();
  }, [target]);

  useLayoutEffect(() => {
    if (target?.armOnly && searchOpen) inputRef.current?.focus();
  }, [target, searchOpen]);

  // Keep the contextual picker above the selected stitch or selection while
  // keeping it on screen near the canvas edges.
  useLayoutEffect(() => {
    if (!target) return;
    const root = rootRef.current;
    if (!root) return;
    if (target.armOnly) {
      const dockRect = document.querySelector<HTMLElement>(".toolDock")?.getBoundingClientRect();
      const anchorX = dockRect ? dockRect.left + dockRect.width / 2 : window.innerWidth / 2;
      const anchorY = dockRect?.top ?? window.innerHeight - 100;
      const width = searchOpen ? expandedMenuWidth : menuWidth;
      setPos({
        compactLeft: clamp(anchorX - menuWidth / 2, 8, window.innerWidth - menuWidth - 8),
        searchLeft: clamp(anchorX - width / 2, 8, window.innerWidth - width - 8),
        top: Math.max(8, anchorY - root.offsetHeight - 10),
      });
      return;
    }
    const canvasRect = document.querySelector("canvas")?.getBoundingClientRect();
    const selection = target.selectionIds?.flatMap((id) => {
      const selectedPlacement = index.placements.get(id);
      return selectedPlacement ? [selectedPlacement] : [];
    }) ?? [];
    // A bulk empty-cell target (e.g. "Replace all" on every pending
    // unidentified marker) is just as much a multi-cell selection as
    // `selectionIds` is - it needs the same bounding-box treatment so the
    // picker opens over the whole batch instead of jumping to whichever
    // cell happens to be `target.col/row` (previously always the first).
    const emptyCells = target.selectionEmptyCells ?? [];
    const hasMultiCellSelection = selection.length > 0 || emptyCells.length > 0;
    const cell = cellToScreenRect(target.col, target.row, camera, viewport);
    const placement = index.placementAt(target.col, target.row);
    const span = target.selectionSpan ?? (placement ? index.spanOf(placement) : 1);
    const minCol = hasMultiCellSelection
      ? Math.min(...selection.map((item) => item.col), ...emptyCells.map((c) => c.col))
      : target.col;
    const maxCol = hasMultiCellSelection
      ? Math.max(
          ...selection.map((item) => item.col + index.spanOf(item)),
          ...emptyCells.map((c) => c.col + 1),
        )
      : target.col + span;
    const maxRow = hasMultiCellSelection
      ? Math.max(...selection.map((item) => item.row), ...emptyCells.map((c) => c.row))
      : target.row;
    const leftEdge = cellToScreenRect(minCol, maxRow, camera, viewport);
    const rightEdge = cellToScreenRect(maxCol, maxRow, camera, viewport);
    const anchorX = (canvasRect?.left ?? 0) + (leftEdge.x + rightEdge.x) / 2;
    const anchorY = (canvasRect?.top ?? 0) + (hasMultiCellSelection ? leftEdge.y : cell.y);
    const height = root.offsetHeight;
    const compactLeft = clamp(
      anchorX - menuWidth / 2,
      8,
      window.innerWidth - menuWidth - 8,
    );
    const searchFieldOffset = 7 + searchOrigin * 45;
    const searchLeft = clamp(
      anchorX - SEARCH_SLOT_WIDTH / 2 - searchFieldOffset,
      8,
      window.innerWidth - expandedMenuWidth - 8,
    );
    setPos({
      compactLeft,
      searchLeft,
      top: clamp(anchorY - height - 14, 8, window.innerHeight - height - 8),
    });
  }, [target, camera, viewport, index, searchOpen, searchOrigin, menuWidth, expandedMenuWidth]);

  // The results list is positioned absolutely below the quick row, so it
  // doesn't contribute to the picker's own height and the layout effect
  // above never accounts for it - a picker anchored low on screen (most
  // stitches are below the fold, and the docked armOnly widget always sits
  // just above the tool dock) would otherwise let the list run off the
  // bottom of the viewport with no way to reach the hidden rows, since its
  // CSS max-height is a flat 326px regardless of where it lands. Clamping
  // to the space actually available below it fixes that for touch and mouse
  // scrolling alike - the bug wasn't scrolling itself, it was that most of
  // the list was rendered off-screen.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const available = window.innerHeight - list.getBoundingClientRect().top - 8;
    setResultsMaxHeight(Math.max(120, Math.min(MAX_HEIGHT_RESULTS, available)));
  }, [searchOpen, pos.top, sections, matchingRepeats.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useDismissOnOutsideOrEscape({
    onDismiss: closePicker,
    containerRef: rootRef,
    // The canvas closes the picker itself, so that the click which dismisses
    // it doesn't also drop a stitch at the spot the user aimed to close.
    ignoreTarget: (target) => target instanceof HTMLCanvasElement,
    // Escape is already handled by this component's own onKeyDown below
    // (tangled up with arrow-key navigation, backspace-to-delete, etc.,
    // which only make sense scoped to the picker's own focused root) - a
    // second, document-level Escape listener here would be redundant at
    // best.
    closeOnEscape: false,
  });

  const openSearch = (initialQuery = "", origin = 5) => {
    // Same synchronous-focus requirement as the auto-open effect above.
    flushSync(() => {
      setSearchOpen(true);
      setMoreOpen(false);
      setSearchOrigin(origin);
      setQuery(initialQuery);
      setActive(0);
    });
    inputRef.current?.focus();
  };

  const placeholder = baseCell
    ? `${getSymbol(cellStitch ?? "")?.label ?? "Stitch"} in ${getSymbol(basePlacement?.symbolId ?? "")?.label ?? "this cable"} (stitch ${
      // Numbered in knitting order, matching the ruler, not left to right.
      rowDirectionAt(target.row) === "rtl"
        ? (basePlacement ? index.spanOf(basePlacement) : 0) - baseCell.offset
        : baseCell.offset + 1
    })`
    : target.armOnly
    ? "Choose a stitch to draw"
    : target.selectionIds
    ? `Replace ${target.selectionIds.length} selected stitch${target.selectionIds.length === 1 ? "" : "es"}`
    : target.insert
      ? `Insert a stitch at col ${target.col}, row ${target.row}`
      : currentSymbol
        ? `Replace ${currentSymbol.label} at col ${target.col}, row ${target.row}`
        : `Add a stitch at col ${target.col}, row ${target.row}`;

  // The three branches below that resolve onto an existing target
  // (selection, a batch of empty cells, or a single cell) all finish the
  // same way (issue #323): reviewing a suggestion never arms whatever was
  // just picked - Suggest stays armed so a review pass can keep going cell
  // by cell - it only parks the pick in a quick slot, exactly like any
  // other pick belongs in the glossary/quick row. Otherwise, the pick gets
  // armed as normal (`shouldArm` lets the empty-cells branch skip that when
  // the whole batch turned out to already be occupied - see its own call
  // below). Pulled out once so that shared rule can't quietly drift between
  // what used to be three separately hand-written copies of it.
  const finishResolve = (symbol: StitchSymbol, colorId: string | undefined, tool: "stitch" | "insert" = "stitch", shouldArm = true) => {
    if (target.reviewingSuggestion) {
      useUiStore.getState().addQuickSymbol(symbol.id, colorId);
    } else if (shouldArm) {
      chooseSymbol(symbol.id, tool, undefined, colorId);
    }
    closePicker();
  };

  // `colorId` defaults to undefined (DNT-8): a plain pick from search or the
  // drawer is always a whole new uncolored pen, never whatever color
  // happened to be active. Only a quick-slot tile click passes its own
  // combo's color explicitly.
  const choose = (symbol: StitchSymbol, colorId?: string) => {
    if (baseCell) {
      if (isBaseStitch(symbol.id)) useDocStore.getState().setStitchBase(baseCell.placementId, baseCell.offset, symbol.id);
      clearSelection();
      closePicker();
      return;
    }
    if (target.armOnly) {
      chooseSymbol(symbol.id, undefined, undefined, colorId);
      return;
    }
    // Choosing a symbol resolves the current selection, then clears it so
    // the next canvas click acts on the next stitch immediately.
    if (target.selectionIds) {
      replacePlacements(target.selectionIds, symbol.id, colorId);
      clearSelection();
      finishResolve(symbol, colorId);
      return;
    }
    if (target.selectionEmptyCells?.length) {
      const cells = target.selectionEmptyCells;
      // Hoisted out of the loop below: `index` is mutated in place by each
      // `place()` call (same object, higher revision), so a single
      // reference stays current across iterations. `referenceImageUnrecognized`
      // is a snapshot of which cells were unrecognized *before this batch*,
      // which is exactly what each cell's own `unrecognizedKeyCleared` check
      // needs - later cells' clears don't change an earlier/later cell's own
      // original flagged status. Avoids a redundant store lookup per cell.
      const docState = useDocStore.getState();
      const unrecognizedSet = useUiStore.getState().referenceImageUnrecognized;
      beginStroke();
      for (const cell of cells) {
        if (docState.index.placementAt(cell.col, cell.row)) continue;
        // Same undoable clear as usePaintTool.ts's freehand `place` (#285) -
        // each cleared flag is banked onto this stroke's merged HistoryEntry
        // by `endStroke` below, so undo can re-flag every cell this batch
        // touched, not just the first one (#305).
        const key = cellKey(cell.col, cell.row);
        const unrecognizedKeyCleared = unrecognizedSet.has(key) ? key : undefined;
        place(symbol.id, cell.col, cell.row, undefined, undefined, colorId, unrecognizedKeyCleared);
      }
      endStroke();
      const newIds = [...new Set(cells
        .map((cell) => useDocStore.getState().index.placementAt(cell.col, cell.row)?.id)
        .filter((id): id is string => !!id))];
      clearSelection();
      // `shouldArm: newIds.length > 0` - this branch used to skip arming
      // outright (by never reaching the check at all) when every cell in
      // the batch was already occupied; nothing was actually just picked
      // for anything, so there's nothing to arm.
      finishResolve(symbol, colorId, "stitch", newIds.length > 0);
      return;
    }
    if (target.insert) {
      const insertedCol = insertTargetCol(index, symbol.id, target.col, target.row);
      insertPlacement(symbol.id, target.col, target.row, colorId);
      if (insertedCol !== null) {
        setInsertAnimation({ col: insertedCol, row: target.row });
      }
    } else {
      // Same undoable clear as usePaintTool.ts's freehand `place` (#285) -
      // threading it through `place` attaches the flag-clear to this
      // placement's own HistoryEntry so undo can re-flag the cell (#305).
      const key = cellKey(target.col, target.row);
      const unrecognizedKeyCleared = useUiStore.getState().referenceImageUnrecognized.has(key)
        ? key
        : undefined;
      place(symbol.id, target.col, target.row, undefined, undefined, colorId, unrecognizedKeyCleared);
    }
    finishResolve(symbol, colorId, target.insert ? "insert" : "stitch");
  };

  const clear = () => {
    if (baseCell) {
      useDocStore.getState().setStitchBase(baseCell.placementId, baseCell.offset, null);
      clearSelection();
    } else if (target.selectionIds?.length) {
      eraseKeepingMotifStitches(target.selectionIds);
      clearSelection();
    } else if (target.selectionEmptyCells?.length) {
      // Nothing's been placed yet - there's nothing to erase, just drop the selection.
      clearSelection();
    } else {
      erase(target.col, target.row);
    }
    closePicker();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!searchOpen && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      openSearch(e.key);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closePicker();
      return;
    }
    if (searchOpen && e.key === "Enter") {
      e.preventDefault();
      const symbol = flat[active];
      if (symbol) choose(symbol);
      return;
    }
    // Only when the search box is empty, so backspacing out a typed query
    // never doubles as clearing the stitch underneath it.
    if (searchOpen && (e.key === "Backspace" || e.key === "Delete") && !query && canDelete) {
      e.preventDefault();
      clear();
      return;
    }
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (step && flat.length) {
      e.preventDefault();
      setActive((i) => (i + step + flat.length) % flat.length);
    }
  };

  const renderSearchField = (key: string) => (
    <div key={key} className="picker__morphSearch" data-origin={searchOrigin}>
      <SearchIcon className="picker__searchIcon" width={17} height={17} strokeWidth={1.6} />
      <TextField
        variant="unstyled"
        ref={inputRef}
        className="picker__search"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        spellCheck={false}
      />
      <Button variant="unstyled"
        className="picker__close"
        onClick={closePicker}
        aria-label="Close"
        title="Close (Esc)"
      >
        <CloseIcon width={14} height={14} strokeWidth={1.6} />
      </Button>
    </div>
  );

  let resultIndex = -1;

  return (
    <div
      ref={rootRef}
      className="picker"
      data-search-open={searchOpen}
      data-drawer-below={pos.top < 280}
      style={{
        left: searchOpen ? pos.searchLeft : pos.compactLeft,
        top: pos.top,
        width: searchOpen ? expandedMenuWidth : menuWidth,
        maxHeight: MAX_HEIGHT,
      }}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-label={placeholder}
    >
      {(target.currentSymbolId || target.selectionIds || baseCell) && (
        // FR-31: a persistent label whenever the picker is open on an
        // existing stitch or selection, rather than buried in the search
        // placeholder (an extra click to see, gone the moment you type).
        // Direct mitigation for DNT-11: editing something specific with
        // nothing on screen saying so is what made a correct recolor look
        // like it landed on the wrong thing.
        <div className="picker__context">{placeholder}</div>
      )}
      <div className="picker__quick" aria-label="Quick stitches">
          {Array.from({ length: 5 }, (_, slot) => {
            if (searchOpen && searchOrigin === slot) return renderSearchField(`search:${slot}`);
            const motif = quickMotifs[slot];
            if (motif) {
              return (
                <MotifQuickTile
                  key={`motif:${motif.id}`}
                  motif={motif}
                  armed={armedMotif?.id === motif.id}
                  onChoose={() => chooseMotif(motif.id)}
                />
              );
            }
            const entry = quickSymbols[slot];
            return entry ? (
              <QuickTile
                key={entry.key}
                entry={entry}
                active={isCurrent(entry)}
                canColor={!baseCell}
                onChoose={choose}
                onChooseColor={(colorId) => {
                  applyChipColor(entry.symbol.id, colorId, chipTargetIds);
                  closePicker();
                }}
                getPopoverBoundaryRect={() => rootRef.current?.getBoundingClientRect() ?? null}
              />
            ) : (
              <Button variant="unstyled"
                key={`empty:${slot}`}
                className="picker__quickButton picker__quickSlot"
                onClick={() => openSearch("", slot)}
                title={`Choose a quick stitch (${slot + 1})`}
                aria-label={`Choose a stitch for quick slot ${slot + 1}`}
                data-label="Choose stitch"
              >
                <QuickAddIcon width="14" height="14" />
              </Button>
            );
          })}
          {dynamicSlot && !(searchOpen && searchOrigin !== 5) && (
            <>
              <span className="picker__quickDivider" aria-hidden="true" />
              <QuickTile
                key={`dynamic:${dynamicSlot.key}`}
                entry={dynamicSlot}
                active={isCurrent(dynamicSlot)}
                canColor={!baseCell}
                onChoose={choose}
                onChooseColor={(colorId) => {
                  applyChipColor(dynamicSlot.symbol.id, colorId, chipTargetIds);
                  closePicker();
                }}
                getPopoverBoundaryRect={() => rootRef.current?.getBoundingClientRect() ?? null}
              />
              <span className="picker__quickDivider" aria-hidden="true" />
            </>
          )}
          {searchOpen && searchOrigin === 5 ? renderSearchField("search:5") : (
            <Button variant="unstyled"
              ref={searchButtonRef}
              className="picker__quickButton picker__searchButton"
              onClick={() => openSearch("", 5)}
              title="Search all stitches"
              aria-label="Search all stitches"
              data-label="Search stitches"
            >
              <SearchIcon width={18} height={18} strokeWidth={1.6} />
            </Button>
          )}
          {hasMore && (
            <Button variant="unstyled"
              className="picker__quickButton picker__moreButton"
              data-active={moreOpen}
              onClick={() => {
                setSearchOpen(false);
                setMoreOpen((open) => !open);
              }}
              aria-expanded={moreOpen}
              aria-controls="picker-more-stitches"
              aria-label="More stitches from this chart"
              title="More stitches from this chart"
              data-label="More stitches"
            >
              <MoreIcon width="18" height="18" />
            </Button>
          )}
          {canDelete && (
            <Button variant="unstyled"
              className="picker__quickButton picker__deleteButton"
              onClick={clear}
              aria-label="Clear stitch"
              title="Clear stitch (Backspace)"
              data-label="Clear"
            >
              <TrashSmallIcon width="14" height="14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Button>
          )}
        </div>

        {moreOpen && (
          <Popover id="picker-more-stitches" className="picker__moreDrawer" aria-label="More stitches in this chart">
            {moreEntries.length > 0 && <div className="picker__moreHeader">This chart</div>}
            <div className="picker__moreList" hidden={!moreEntries.length}>
              {moreEntries.map((entry) => (
                <div key={entry.key} className="picker__item">
                  <Button variant="unstyled"
                    className="picker__itemMain"
                    data-colored={!!entry.colorId}
                    onClick={() => choose(entry.symbol, entry.colorId)}
                    title={entry.symbol.label}
                  >
                    <span className="picker__glyph">
                      <SymbolGlyph symbol={entry.symbol} cell={cellSizeFor(entry.symbol)} colorId={entry.colorId} />
                    </span>
                    <span className="picker__label">{entry.symbol.label}</span>
                    {isCurrent(entry) && <span className="picker__current">current</span>}
                    {entry.symbol.span > 1 && <span className="picker__span">{entry.symbol.span} sts</span>}
                  </Button>
                  {!entry.colorId && !baseCell && (
                    <ColorChip
                      label={`Color ${entry.symbol.label}`}
                      className="picker__itemColorChip"
                      onSelect={(colorId) => {
                        applyChipColor(entry.symbol.id, colorId, chipTargetIds);
                        closePicker();
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
            <MotifDrawerSection onArmed={closePicker} />
          </Popover>
        )}

        {target.selectionIds && (target.selectionIds.length > 1 || copyInfo) && (
          <div className="picker__selectionBubbles" aria-label="Selection actions">
            {copyInfo ? (
              <MotifCopyBubbles copyId={copyInfo.copy.id} overridden={copyInfo.overridden} onDone={() => {
                clearSelection();
                closePicker();
              }} />
            ) : (
            <Button variant="unstyled"
              onClick={() => {
                createRepeat(target.selectionIds!);
                clearSelection();
                closePicker();
              }}
              title="Make a motif from these stitches (⌘G)"
              aria-label="Make motif"
              data-label="Motif"
            >
              <MakeMotifIcon />
            </Button>
            )}
            <Button variant="unstyled"
              onClick={() => {
                const ids = duplicateSelection(target.selectionIds!);
                const first = ids.length ? index.placements.get(ids[0]!) : undefined;
                if (!ids.length || !first) return;
                setSelectedPlacementIds(ids, false);
                openPicker({
                  col: first.col,
                  row: first.row,
                  x: 0,
                  y: 0,
                  selectionIds: ids,
                  selectionSpan: index.spanOf(first),
                });
              }}
              title="Duplicate selected stitches"
              aria-label="Duplicate selection"
              data-label="Duplicate"
            >
              <DuplicateIcon />
            </Button>
          </div>
        )}

          {searchOpen && (
            <div
              className="picker__results picker__list"
              ref={listRef}
              style={{ maxHeight: resultsMaxHeight }}
            >
            {flat.length === 0 && matchingRepeats.length === 0 && (
              <div className="picker__empty">
                {query.trim() ? "No stitch matches that." : "Every stitch that fits is already in this chart."}
              </div>
            )}

            {matchingRepeats.length > 0 && (
              <div>
                <div className="picker__heading">Motifs</div>
                {matchingRepeats.map((repeat) => (
                  <Button variant="unstyled"
                    key={repeat.id}
                    className="picker__item"
                    onClick={() => {
                      chooseMotif(repeat.id);
                      closePicker();
                    }}
                  >
                    <span className="picker__glyph"><MotifGlyph /></span>
                    <span className="picker__label">{repeat.name}</span>
                    <span className="picker__span">{repeat.width} × {repeat.height}</span>
                    <span className="picker__added">Added</span>
                  </Button>
                ))}
              </div>
            )}

            {sections.map((section) => (
              <div key={section.key}>
                <div className="picker__heading">{section.title}</div>
                {section.symbols.map((symbol) => {
                  resultIndex += 1;
                  const isActive = resultIndex === active;
                  const at = resultIndex;
                  return (
                    <Button variant="unstyled"
                      key={`${section.key}:${symbol.id}`}
                      className="picker__item"
                      data-active={isActive}
                      onPointerEnter={() => setActive(at)}
                      onClick={() => choose(symbol)}
                    >
                      <span className="picker__glyph">
                        <SymbolGlyph symbol={symbol} cell={cellSizeFor(symbol)} />
                      </span>
                      <span className="picker__label">{symbol.label}</span>
                      {isCurrent({ key: symbol.id, symbol }) && <span className="picker__current">current</span>}
                      {symbol.span > 1 && <span className="picker__span">{symbol.span} sts</span>}
                      {plainGlossaryIds.has(symbol.id) && <span className="picker__added">Added</span>}
                    </Button>
                  );
                })}
              </div>
            ))}
            </div>
          )}
    </div>
  );
}
