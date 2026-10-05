import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { allSymbols, getSymbol } from "../symbols/registry";
import { CELL } from "../canvas/camera";
import { exportChartCsv } from "../storage/exportCsv";
import { type ImageFormat, exportChartImage } from "../storage/exportImage";
import { exportChart } from "../storage/exportImport";
import { cellWithinReferenceImage } from "../canvas/referenceImageCrop";
import { unoccupiedCellsFromKeys } from "../model/cellKey";
import { useDocStore } from "../state/docStore";
import { RIGHT_PANEL_MAX_WIDTH, RIGHT_PANEL_MIN_WIDTH, SUGGEST_SYMBOL_ID, useUiStore } from "../state/uiStore";
import { ReferenceImagePanel } from "./ReferenceImagePanel";
import { SymbolGlyph } from "./SymbolGlyph";
import { browseSymbols, searchMotifs } from "./symbolSearch";
import { tapActivate } from "./tapActivate";
import { DisarmDrawingButton } from "./DisarmDrawingButton";
import {
  collectColoredGlossaryEntries,
  countGlossaryStitches,
  saveGlossaryIds,
  selectableGlossaryEntryPlacementIds,
  symbolsWithAnyPlacement,
  useGlossaryIds,
} from "./chartGlossary";
import { parseQuickSlotId, quickSlotInsertEdge, quickSlotKey } from "../model/quickSlots";
import { motifIdFromKey, motifKey } from "../model/motifs";
import { MotifCellGlyph } from "./motifUi";
import { armMotifPen } from "./motifActions";
import { applyChipColor } from "./colorwork";
import { CheckIcon, CrossIcon, DragHandleIcon, SearchIcon } from "./icons";
import { useDismissOnOutsideOrEscape } from "./useDismissOnOutsideOrEscape";
import { useQuickSlotDropTarget } from "./useQuickSlotDropTarget";
import { GlossaryRow } from "./GlossaryRow";
import { glyphCellSize } from "./glyphSize";
import { Button } from "./Button";

type GlossaryResult = { kind: "motif"; id: string } | { kind: "stitch"; id: string };

export function RightPanel() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [glossaryQuery, setGlossaryQuery] = useState("");
  const [searchSlot, setSearchSlot] = useState<number | null>(null);
  const [activeGlossaryResult, setActiveGlossaryResult] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [includeReferenceImage, setIncludeReferenceImage] = useState(true);
  const glossarySearchRef = useRef<HTMLInputElement | null>(null);
  const inlineSearchRef = useRef<HTMLDivElement | null>(null);
  const meta = useDocStore((state) => state.meta);
  const index = useDocStore((state) => state.index);
  const repeats = useDocStore((state) => state.repeats);
  const referenceImages = useDocStore((state) => state.referenceImages);
  const patternInfo = useDocStore((state) => state.patternInfo);
  const revision = useDocStore((state) => state.revision);
  const acceptSuggestions = useDocStore((state) => state.acceptSuggestions);
  const dismissSuggestions = useDocStore((state) => state.dismissSuggestions);
  const isAdmin = useUiStore((state) => state.role === "admin");
  const chooseSymbol = useUiStore((state) => state.chooseSymbol);
  const armedSymbolId = useUiStore((state) => state.armedSymbolId);
  const activeColor = useUiStore((state) => state.activeColor);
  const tool = useUiStore((state) => state.tool);
  const armedMotif = useUiStore((state) => state.armedMotif);
  const quickSymbolIds = useDocStore((state) => state.quickSymbolIds);
  const removeQuickSymbol = useUiStore((state) => state.removeQuickSymbol);
  const moveQuickSymbolTo = useUiStore((state) => state.moveQuickSymbolTo);
  const setArmedSymbolId = useUiStore((state) => state.setArmedSymbolId);
  const openPicker = useUiStore((state) => state.openPicker);
  const zoom = useUiStore((state) => state.camera.zoom);
  const viewport = useUiStore((state) => state.viewport);
  const zoomAt = useUiStore((state) => state.zoomAt);
  const centerViewAt100 = useUiStore((state) => state.centerViewAt100);
  const referenceImageUnrecognized = useUiStore((state) => state.referenceImageUnrecognized);
  const clearReferenceImageUnrecognized = useUiStore((state) => state.clearReferenceImageUnrecognized);
  const setSelection = useUiStore((state) => state.setSelection);
  const selectedPlacementIds = useUiStore((state) => state.selectedPlacementIds);
  const rightPanelWidth = useUiStore((state) => state.rightPanelWidth);
  const setRightPanelWidth = useUiStore((state) => state.setRightPanelWidth);
  const addedGlossaryIds = useGlossaryIds();
  const {
    draggingQuickId,
    dragOverQuickId,
    dragOverQuickSlot,
    startDragging,
    resetDragState,
    trackDragOverKey,
    forFilledSlot,
    forEmptySlot,
  } = useQuickSlotDropTarget(moveQuickSymbolTo);

  // Drag-to-resize from the panel's left edge. Pointer capture keeps the
  // handle receiving move/up events even once the cursor leaves its thin
  // hit area mid-drag, the same pattern useReferenceImageTool.ts uses for
  // canvas drags.
  const onResizeHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = rightPanelWidth;
    const onMove = (moveEvent: PointerEvent) => {
      setRightPanelWidth(startWidth + (startX - moveEvent.clientX));
    };
    // A plain pointerup only fires on a clean release. A gesture the OS or
    // browser interrupts (touch scroll takeover, a system dialog stealing
    // focus) instead ends the drag with pointercancel/lostpointercapture and
    // no pointerup at all - without listening for those too, the resize
    // would get stuck mid-drag and these listeners would leak.
    const cleanup = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      handle.removeEventListener("lostpointercapture", cleanup);
    };
    const onUp = (upEvent: PointerEvent) => {
      try {
        handle.releasePointerCapture(upEvent.pointerId);
      } catch {
        // Already released (e.g. by the lostpointercapture that's about to fire).
      }
      cleanup();
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
    handle.addEventListener("lostpointercapture", cleanup);
  };

  // Plain useEffect defers to a paint-independent scheduler tick, which
  // lands outside the synchronous user-gesture window iOS requires to raise
  // the on-screen keyboard for a focus() call - the same issue StitchPicker
  // had (see the comment there). useLayoutEffect runs synchronously, before
  // paint, in the same tick as the click that set searchSlot.
  useLayoutEffect(() => {
    if (searchSlot !== null) glossarySearchRef.current?.focus();
  }, [searchSlot]);

  // The results dropdown anchors via a measured rect rather than plain CSS
  // `position: absolute`, which is what let it render clipped away here:
  // `.sideModule` (the "Stitch glossary" card) sets `overflow: hidden` so it
  // can round its own corners, and an absolutely-positioned dropdown that
  // extends past the card's bottom edge was cut off there instead of
  // floating over the rest of the sidebar - the exact class of bug the
  // picker's drawer popover already hit once (see ColorSwatchPopover's own
  // doc comment). `position: fixed` escapes that ancestor's clipping
  // entirely.
  const [searchResultsRect, setSearchResultsRect] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (searchSlot === null) {
      setSearchResultsRect(null);
      return;
    }
    const updateSearchResultsRect = () => {
      const rect = inlineSearchRef.current?.getBoundingClientRect();
      setSearchResultsRect(rect ? { left: rect.left, top: rect.bottom + 4, width: rect.width } : null);
    };
    updateSearchResultsRect();
    document.addEventListener("scroll", updateSearchResultsRect, true);
    window.addEventListener("resize", updateSearchResultsRect);
    return () => {
      document.removeEventListener("scroll", updateSearchResultsRect, true);
      window.removeEventListener("resize", updateSearchResultsRect);
    };
  }, [searchSlot]);

  // Search queries can remove the currently highlighted result. Start each
  // new query at its first visible match so Arrow navigation always has a
  // predictable target.
  useEffect(() => {
    setActiveGlossaryResult(0);
  }, [searchSlot, glossaryQuery]);

  useDismissOnOutsideOrEscape({
    enabled: searchSlot !== null,
    containerRef: inlineSearchRef,
    onDismiss: () => {
      setSearchSlot(null);
      setGlossaryQuery("");
    },
    // Dismissal is its own gesture: intercept the outside pointerdown before
    // the canvas sees it, so an armed stitch is never placed as the menu
    // closes. Escape doesn't need this - it can't also place a stitch.
    suppressDismissingPointerdown: true,
  });


  // Shown in an armed row's trailing slot in place of whatever's normally
  // there (remove-from-glossary, or nothing) - a stitch that's mid-draw
  // isn't a candidate for removal anyway, and this is the one spot on
  // every armed row that's guaranteed free for it.
  const disarmButton = (
    <DisarmDrawingButton className="glossary__disarm" onActivate={() => setArmedSymbolId(null)} />
  );

  const { placements, loosePlacements, glossary, plainGlossaryIds, stitchCounts, symbolsPlaced, looseSymbolsPlaced } = useMemo(() => {
    // The document mutates its index in place; its revision invalidates this
    // cached snapshot when placements change.
    void revision;
    const chartPlacements = index.toArray();
    // FR-64: a stitch's count (and its Select all) covers only stitches
    // outside motif copies - a copy's stitches belong to its motif, which
    // has its own row and count.
    const copyIds = new Set(repeats.flatMap((motif) => (motif.copies ?? []).map((copy) => copy.id)));
    const looseOnly = chartPlacements.filter((p) => !p.groupId || !copyIds.has(p.groupId));
    // Quick slots are glossary entries too, even when they have neither an
    // explicit glossary id nor a placement yet. Keeping them in this one
    // shared set makes the header, rows, and picker agree (#322).
    const chartGlossary = collectColoredGlossaryEntries(
      [...quickSymbolIds, ...addedGlossaryIds],
      chartPlacements,
    );
    return {
      placements: chartPlacements,
      loosePlacements: looseOnly,
      glossary: chartGlossary,
      // Which *plain* symbols already have a glossary row - what the
      // search-to-add dropdown (always a plain add) needs to exclude.
      plainGlossaryIds: new Set(
        chartGlossary.filter((entry) => !entry.colorId).map((entry) => entry.symbol.id),
      ),
      // Loose stitches only, a cable counted once as itself; pending
      // suggestions don't count (see countGlossaryStitches).
      // Glossary removal-safety needs a separate "any placement at all"
      // check, confirmed or suggested, or a symbol with only a pending
      // suggestion would look removable (FR-14, G-9). Distinctly named
      // values from the start, not one reused for multiple purposes.
      stitchCounts: countGlossaryStitches(looseOnly),
      symbolsPlaced: symbolsWithAnyPlacement(chartPlacements),
      looseSymbolsPlaced: symbolsWithAnyPlacement(looseOnly),
    };
  }, [quickSymbolIds, addedGlossaryIds, index, revision, repeats]);
  // The same search the picker uses: browse what isn't in the glossary yet,
  // or every match for a typed query (glossary entries tagged "Added").
  // Motifs only turn up for a query - every motif already has a row.
  const { glossarySections, motifResults, glossaryResults } = useMemo(() => {
    if (searchSlot === null) {
      return { glossarySections: [], motifResults: [], glossaryResults: [] };
    }
    const sections = browseSymbols(allSymbols(), glossaryQuery, (id) => plainGlossaryIds.has(id));
    const motifs = searchMotifs(repeats, glossaryQuery);
    // Flat order is what the arrow keys walk, so it must match render order.
    const results: GlossaryResult[] = [
      ...motifs.map((motif) => ({ kind: "motif" as const, id: motif.id })),
      ...sections.flatMap((section) => section.symbols.map((symbol) => ({ kind: "stitch" as const, id: symbol.id }))),
    ];
    return { glossarySections: sections, motifResults: motifs, glossaryResults: results };
  }, [searchSlot, glossaryQuery, plainGlossaryIds, repeats]);
  const slottedKeys = new Set(quickSymbolIds);
  const remainingGlossary = glossary.filter((entry) => !slottedKeys.has(entry.key));
  // Motifs not in a quick slot still belong in the glossary, after the
  // stitches, the same way an unslotted stitch does (FR-64).
  const remainingMotifs = repeats.filter((motif) => !slottedKeys.has(motifKey(motif.id)));
  // A stitch used inside a motif can't leave the glossary even with nothing
  // placed loose on the chart - the motif still draws with it (FR-64).
  const motifsUsing = new Map<string, string[]>();
  for (const motif of repeats) {
    for (const key of new Set(motif.stitches.map((s) => quickSlotKey(s.symbolId, s.colorId)))) {
      motifsUsing.set(key, [...(motifsUsing.get(key) ?? []), motif.name]);
    }
  }
  const stitchRemoval = (key: string) => {
    const usedIn = motifsUsing.get(key);
    if (looseSymbolsPlaced.has(key)) {
      return { removable: false, removeBlockedReason: "Placed on the chart - erase those stitches first" };
    }
    if (symbolsPlaced.has(key)) {
      return { removable: false, removeBlockedReason: "Used inside motif copies" };
    }
    if (usedIn?.length) return { removable: false, removeBlockedReason: `Used in ${usedIn.join(", ")}` };
    return { removable: true, removeBlockedReason: undefined };
  };
  // Select all picks exactly what the row counts: loose stitches only.
  const selectAllProps = (key: string) => {
    const ids = selectableGlossaryEntryPlacementIds(loosePlacements, key);
    return {
      selectAllLabel: `Select all ${ids.length} placed`,
      onSelectAll: () => setSelection(ids, [], true),
    };
  };
  const motifRowProps = (motif: (typeof repeats)[number]) => {
    const copies = motif.copies ?? [];
    return {
      label: motif.name,
      glyph: <MotifCellGlyph />,
      armed: armedMotif?.id === motif.id && tool === "stitch",
      onDisarm: () => setArmedSymbolId(null),
      disarmButton,
      count: copies.length,
      selectAllLabel: `Select all ${copies.length} ${copies.length === 1 ? "copy" : "copies"}`,
      onSelectAll: () =>
        setSelection(copies.flatMap((copy) => index.groupMembers(copy.id).map((p) => p.id)), [], true),
      removable: copies.length === 0,
      removeBlockedReason: "Has copies on the chart - delete the motif instead",
      // A motif lives only in the glossary, so removing its row - slotted or
      // not - is deleting it (undoable), same as an unplaced stitch's X.
      onRemove: () => useDocStore.getState().deleteMotif(motif.id, "detach"),
      onRename: (name: string) => useDocStore.getState().renameMotif(motif.id, name),
      menuItems: [
        { label: "Stamp mirrored", onSelect: () => armMotifPen(motif.id, true) },
        { label: "Delete motif…", onSelect: () => useUiStore.getState().setMotifDeleteRequest(motif.id) },
      ],
    };
  };
  const slotCount = Math.max(5, quickSymbolIds.length + 1);

  // How many distinct stitches Suggest currently has an exemplar for -
  // a confirmed (non-suggested) placement sitting inside any reference
  // image counts as one. Shown on the Suggest row so it's clear at a
  // glance whether there's anything to match against yet.
  const suggestTaughtCount = new Set(
    placements
      .filter(
        (p) =>
          !p.suggested &&
          referenceImages.some((image) => cellWithinReferenceImage(image, p.col, p.row)),
      )
      .map((p) => p.symbolId),
  ).size;
  const suggestedPlacements = placements.filter((p) => p.suggested);
  const suggestedCount = suggestedPlacements.length;
  // A marker is stale once something's been placed at its cell by any other
  // route (a hand-placed stitch, a later successful scan).
  const unrecognizedCells = unoccupiedCellsFromKeys(
    referenceImageUnrecognized,
    (col, row) => !!index.placementAt(col, row),
  );
  const unrecognizedCount = unrecognizedCells.length;

  const addToGlossary = (id: string) => {
    if (!meta || plainGlossaryIds.has(id)) return;
    const next = [...addedGlossaryIds, id];
    setGlossaryQuery("");
    saveGlossaryIds(next);
  };
  /** `key` is a full quick-slot key - a bare symbolId for a plain row, `symbolId::colorId` for a colored one. */
  const removeFromGlossary = (key: string) => {
    if (!meta || symbolsPlaced.has(key)) return;
    const next = addedGlossaryIds.filter((existing) => existing !== key);
    removeQuickSymbol(key);
    saveGlossaryIds(next);
  };
  const chooseSearchResult = (result: GlossaryResult) => {
    if (result.kind === "motif") {
      armMotifPen(result.id);
      closeGlossarySearch();
      return;
    }
    addToGlossary(result.id);
    chooseSymbol(result.id);
    // addToGlossary early-returns (without clearing the query) when the
    // chosen result is already in the glossary, so clear it here too -
    // otherwise the next "Add stitch" open would show this stale query
    // instead of the browse-all view.
    closeGlossarySearch();
  };
  const searchForQuickStitch = (slot: number) => {
    setSearchSlot(slot);
    setGlossaryQuery("");
  };
  const closeGlossarySearch = () => {
    setSearchSlot(null);
    setGlossaryQuery("");
  };
  const navigateGlossarySearch = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeGlossarySearch();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
    if (!glossaryResults.length) return;
    event.preventDefault();
    if (event.key === "Enter") {
      chooseSearchResult(glossaryResults[activeGlossaryResult]!);
      return;
    }
    const direction = event.key === "ArrowDown" ? 1 : -1;
    setActiveGlossaryResult((current) =>
      (current + direction + glossaryResults.length) % glossaryResults.length,
    );
  };

  const zoomFromCenter = (factor: number) => {
    zoomAt(factor, viewport.width / 2, viewport.height / 2);
  };

  const centerChart = () => {
    if (!placements.length) {
      centerViewAt100(0, 0);
      return;
    }
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    for (const placement of placements) {
      minCol = Math.min(minCol, placement.col);
      maxCol = Math.max(maxCol, placement.col + index.spanOf(placement));
      minRow = Math.min(minRow, placement.row);
      maxRow = Math.max(maxRow, placement.row + 1);
    }
    centerViewAt100(((minCol + maxCol) / 2) * CELL, ((minRow + maxRow) / 2) * CELL);
  };

  // An open quick slot: the inline search while it's open, else its
  // "Add stitch" row. The numbered five render in place (position is their
  // shortcut); the one open slot past them renders once, at the very end of
  // the list, so the glossary never shows a blank row partway down.
  const renderOpenSlot = (slot: number) => (
    searchSlot === slot ? (
                <div
                  ref={inlineSearchRef}
                  key={`search:${slot}`}
                  className="glossary__inlineSearch"
                  data-drag-over={dragOverQuickSlot === slot}
                  {...forEmptySlot(slot, closeGlossarySearch)}
                >
                  {slot < 5 ? <kbd className="glossary__shortcut">{slot + 1}</kbd> : <span className="glossary__shortcutSpacer" />}
                  <SearchIcon />
                  <input
                    ref={glossarySearchRef}
                    type="search"
                    value={glossaryQuery}
                    onChange={(event) => setGlossaryQuery(event.target.value)}
                    onKeyDown={navigateGlossarySearch}
                    placeholder="Search stitches…"
                    aria-label="Search stitches to add"
                    aria-controls="glossary-search-results"
                    aria-activedescendant={
                      glossaryResults[activeGlossaryResult]
                        ? `glossary-search-result-${glossaryResults[activeGlossaryResult]!.kind}-${glossaryResults[activeGlossaryResult]!.id}`
                        : undefined
                    }
                  />
                  {glossaryResults.length > 0 && searchResultsRect && (() => {
                    let resultIndex = -1;
                    return (
                      <div
                        id="glossary-search-results"
                        className="glossarySearch__results"
                        role="listbox"
                        style={{
                          position: "fixed",
                          left: searchResultsRect.left,
                          top: searchResultsRect.top,
                          width: searchResultsRect.width,
                        }}
                      >
                        {motifResults.length > 0 && (
                          <div>
                            <div className="glossarySearch__heading">Motifs</div>
                            {motifResults.map((motif) => {
                              resultIndex += 1;
                              const at = resultIndex;
                              return (
                                <button
                                  id={`glossary-search-result-motif-${motif.id}`}
                                  key={motif.id}
                                  type="button"
                                  role="option"
                                  aria-selected={at === activeGlossaryResult}
                                  data-active={at === activeGlossaryResult}
                                  onPointerEnter={() => setActiveGlossaryResult(at)}
                                  onClick={() => chooseSearchResult({ kind: "motif", id: motif.id })}
                                >
                                  <span className="glossarySearch__glyph">
                                    <MotifCellGlyph />
                                  </span>
                                  <span>{motif.name}</span>
                                  <strong>Added</strong>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {glossarySections.map((section) => (
                          <div key={section.key}>
                            <div className="glossarySearch__heading">{section.title}</div>
                            {section.symbols.map((result) => {
                              resultIndex += 1;
                              const at = resultIndex;
                              return (
                                <button
                                  id={`glossary-search-result-stitch-${result.id}`}
                                  key={result.id}
                                  type="button"
                                  role="option"
                                  aria-selected={at === activeGlossaryResult}
                                  data-active={at === activeGlossaryResult}
                                  onPointerEnter={() => setActiveGlossaryResult(at)}
                                  onClick={() => chooseSearchResult({ kind: "stitch", id: result.id })}
                                >
                                  <span className="glossarySearch__glyph">
                                    <SymbolGlyph symbol={result} cell={glyphCellSize(result.span, 48, 18)} />
                                  </span>
                                  <span>{result.label}</span>
                                  <strong>{plainGlossaryIds.has(result.id) ? "Added" : "Select"}</strong>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <button
                  key={`empty:${slot}`}
                  type="button"
                  className="glossary__item glossary__item--empty"
                  data-drag-over={dragOverQuickSlot === slot}
                  {...forEmptySlot(slot)}
                  onClick={() => searchForQuickStitch(slot)}
                  title={slot < 5 ? `Choose a quick stitch (${slot + 1})` : "Add another stitch"}
                >
                  <span className="glossary__dragHandle glossary__dragHandle--empty" aria-hidden="true">
                    <DragHandleIcon />
                  </span>
                  {slot < 5 ? <kbd className="glossary__shortcut">{slot + 1}</kbd> : <span className="glossary__shortcutSpacer" />}
                  <span className="glossary__emptyGlyph" aria-hidden="true">+</span>
                  <span className="glossary__label">Add stitch</span>
                </button>
              )
  );

  return (
    <aside className="rightPanel" aria-label="Pattern details" style={{ width: rightPanelWidth }}>
      <div
        className="rightPanel__resizeHandle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        aria-valuenow={Math.round(rightPanelWidth)}
        aria-valuemin={RIGHT_PANEL_MIN_WIDTH}
        aria-valuemax={RIGHT_PANEL_MAX_WIDTH}
        onPointerDown={onResizeHandlePointerDown}
      />
      <section className="sideModule">
        <div className="sideModule__header">
          <div>
            <h2>Stitch glossary</h2>
            <span>
              {/* A colored stitch is its own type, separate from its plain one. */}
              {glossary.length} stitch type{glossary.length === 1 ? "" : "s"}
              {repeats.length > 0 && ` · ${repeats.length} motif${repeats.length === 1 ? "" : "s"}`} in this chart
            </span>
          </div>
        </div>
        <div className="sideModule__body">
          <div className="glossary">
            {isAdmin && (
              <div className="glossary__item" data-on={armedSymbolId === SUGGEST_SYMBOL_ID && tool === "stitch"}>
                <span className="glossary__dragHandle glossary__dragHandle--empty" aria-hidden="true" />
                <kbd className="glossary__shortcut" aria-label="Shortcut G">G</kbd>
                <button
                  type="button"
                  className="glossary__arm"
                  {...tapActivate(() =>
                    setArmedSymbolId(
                      armedSymbolId === SUGGEST_SYMBOL_ID && tool === "stitch" ? null : SUGGEST_SYMBOL_ID,
                    )
                  )}
                  title="Draw with Suggest (G) - tap again to stop drawing. Matches each cell against stitches you've already confirmed over the reference image. Landing on a suggestion with a real stitch armed confirms it as that stitch outright. Cmd/Ctrl confirms a suggestion as its own guess instead; Shift+Opt dismisses a suggestion or unrecognized marker (never a hand-drawn or confirmed stitch) - or tap the toolDock's Confirm/Dismiss buttons to make either the sticky default. All of this drags and Shift straight-lines/gap-fills the same way Draw does."
                >
                  <span className="glossary__glyph" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="16" height="16">
                      <path
                        d="M4 16 13 7m2.5-2.5L17 3M6 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="glossary__labelGroup">
                    <span className="glossary__label">Suggest</span>
                    <span className="glossary__subtitle">
                      {suggestTaughtCount > 0
                        ? `Recognizes ${suggestTaughtCount} stitch type${suggestTaughtCount === 1 ? "" : "s"}`
                        : "Confirm a stitch to enable Suggest"}
                    </span>
                  </span>
                </button>
                {armedSymbolId === SUGGEST_SYMBOL_ID && tool === "stitch" ? (
                  disarmButton
                ) : (
                  <span className="glossary__removeSlot" aria-hidden="true" />
                )}
              </div>
            )}
            {isAdmin && suggestedCount > 0 && (
              <div className="glossary__item">
                <span className="glossary__dragHandle glossary__dragHandle--empty" aria-hidden="true" />
                <span
                  className="glossary__reviewPreview glossary__reviewPreview--identified"
                  aria-hidden="true"
                />
                <span className="glossary__label">
                  {suggestedCount} identified
                </span>
                <button
                  type="button"
                  className="glossary__reviewAction"
                  onClick={() => acceptSuggestions()}
                  aria-label="Accept all identified suggestions"
                  title="Accept all"
                >
                  <CheckIcon />
                </button>
                <button
                  type="button"
                  className="glossary__reviewAction"
                  onClick={() => dismissSuggestions()}
                  aria-label="Dismiss all identified suggestions"
                  title="Dismiss all"
                >
                  <CrossIcon />
                </button>
              </div>
            )}
            {isAdmin && unrecognizedCount > 0 && (
              <div className="glossary__item">
                <span className="glossary__dragHandle glossary__dragHandle--empty" aria-hidden="true" />
                <span
                  className="glossary__reviewPreview glossary__reviewPreview--unrecognized"
                  aria-hidden="true"
                />
                <span className="glossary__label">
                  {unrecognizedCount} unidentified
                </span>
                <button
                  type="button"
                  className="glossary__reviewAction"
                  onClick={clearReferenceImageUnrecognized}
                  aria-label="Dismiss all unidentified markers"
                  title="Dismiss all"
                >
                  <CrossIcon />
                </button>
                <button
                  type="button"
                  className="glossary__reviewAction"
                  onClick={() => {
                    const first = unrecognizedCells[0];
                    if (!first) return;
                    openPicker({
                      col: first.col,
                      row: first.row,
                      x: 0,
                      y: 0,
                      selectionEmptyCells: unrecognizedCells,
                      reviewingSuggestion: true,
                    });
                  }}
                  aria-label="Replace all unidentified markers with a chosen stitch"
                  title="Replace all"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M4 8.5h9.5M11 5.5l3 3-3 3M16 11.5H6.5M9 8.5l-3 3 3 3" />
                  </svg>
                </button>
              </div>
            )}
            {Array.from({ length: slotCount }, (_, slot) => {
              const key = quickSymbolIds[slot];
              const parsed = key ? parseQuickSlotId(key) : undefined;
              const symbol = parsed ? getSymbol(parsed.symbolId) : undefined;
              const armed = !!key && key === quickSlotKey(armedSymbolId ?? "", activeColor) && !!armedSymbolId;
              const count = key ? (stitchCounts.get(key) ?? 0) : 0;
              // #271: dropping onto an already-occupied quick slot pushes
              // the existing stitches along (see promoteQuickSlot/
              // moveQuickSlotTo) rather than filling in place, so it gets
              // the insertion-line signifier instead of the empty-slot's
              // full highlight.
              const insertEdge = dragOverQuickId === key
                ? quickSlotInsertEdge(draggingQuickId ? quickSymbolIds.indexOf(draggingQuickId) : -1, slot)
                : null;
              const rowDrop = key ? forFilledSlot(key, slot) : null;
              const motifId = key ? motifIdFromKey(key) : null;
              const motif = motifId ? repeats.find((r) => r.id === motifId) : undefined;
              const slotMoves = key ? {
                moveUp: {
                  disabled: !quickSymbolIds.slice(0, slot).some(Boolean),
                  onClick: () => useDocStore.getState().moveQuickSlotDirection(key, -1),
                  title: "Move up (Alt+Up while armed)",
                },
                moveDown: {
                  disabled: !quickSymbolIds.slice(slot + 1).some(Boolean),
                  onClick: () => useDocStore.getState().moveQuickSlotDirection(key, 1),
                  title: "Move down (Alt+Down while armed)",
                },
              } : null;
              if (key && motif) {
                return (
                  <GlossaryRow
                    key={key}
                    {...motifRowProps(motif)}
                    armMode="arm-only"
                    onArm={() => useUiStore.getState().armMotif(motif.id)}
                    shortcutSlot={slot < 5 ? slot : undefined}
                    dragHandleTitle="Drag to reorder"
                    onDragHandleStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", key);
                      startDragging(key);
                    }}
                    onDragHandleEnd={resetDragState}
                    {...slotMoves!}
                    onRowDragOver={rowDrop!.onDragOver}
                    onRowDragLeave={rowDrop!.onDragLeave}
                    onRowDrop={rowDrop!.onDrop}
                    dragIndicator={{ kind: "insert-edge", edge: insertEdge }}
                  />
                );
              }
              return key && symbol ? (
                <GlossaryRow
                  key={key}
                  label={symbol.label}
                  glyph={<SymbolGlyph symbol={symbol} cell={glyphCellSize(symbol.span, 54, 20)} colorId={parsed?.colorId} />}
                  colorId={parsed?.colorId}
                  // Pure arm: this item is already in a quick slot, so
                  // nothing needs promoting (issue #323's arming
                  // unification - see GlossaryRow's own `armMode` doc).
                  armed={armed && tool === "stitch"}
                  armMode="arm-only"
                  onArm={() => setArmedSymbolId(symbol.id, parsed?.colorId ?? null)}
                  onDisarm={() => setArmedSymbolId(null)}
                  disarmButton={disarmButton}
                  count={count}
                  {...selectAllProps(key)}
                  onChooseColor={(colorId) => applyChipColor(symbol.id, colorId, selectedPlacementIds)}
                  {...stitchRemoval(key)}
                  onRemove={() => removeFromGlossary(key)}
                  shortcutSlot={slot < 5 ? slot : undefined}
                  dragHandleTitle="Drag to reorder"
                  onDragHandleStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", key);
                    startDragging(key);
                  }}
                  onDragHandleEnd={resetDragState}
                  // #326: keyboard/touch-friendly reorder, alongside drag -
                  // dragging stays available, this is the primary path.
                  // Bounded to the actual quickSymbolIds array (not the
                  // padded display slotCount), matching moveQuickSlotDirection's
                  // own early-outs. The same move is also reachable via
                  // Alt+Up/Down while this exact (symbol, color) pen is
                  // armed - see useShortcuts.ts.
                  moveUp={{
                    disabled: !quickSymbolIds.slice(0, slot).some(Boolean),
                    onClick: () => useDocStore.getState().moveQuickSlotDirection(key, -1),
                    title: "Move up (Alt+Up while armed)",
                  }}
                  moveDown={{
                    disabled: !quickSymbolIds.slice(slot + 1).some(Boolean),
                    onClick: () => useDocStore.getState().moveQuickSlotDirection(key, 1),
                    title: "Move down (Alt+Down while armed)",
                  }}
                  onRowDragOver={rowDrop!.onDragOver}
                  onRowDragLeave={rowDrop!.onDragLeave}
                  onRowDrop={rowDrop!.onDrop}
                  dragIndicator={{ kind: "insert-edge", edge: insertEdge }}
                />
              ) : slot < 5 ? renderOpenSlot(slot) : null;
            })}
            {remainingGlossary.map((entry, overflowIndex) => {
              const { symbol, colorId, key } = entry;
              const armed = key === quickSlotKey(armedSymbolId ?? "", activeColor) && !!armedSymbolId;
              const count = stitchCounts.get(key) ?? 0;
              const dragHandlers = trackDragOverKey(key);
              return (
                <GlossaryRow
                  key={key}
                  label={symbol.label}
                  glyph={<SymbolGlyph symbol={symbol} cell={glyphCellSize(symbol.span, 54, 20)} colorId={colorId} />}
                  colorId={colorId}
                  // Arm-and-promote: this item isn't in a quick slot yet, so
                  // choosing it also assigns one (issue #323's arming
                  // unification - see GlossaryRow's own `armMode` doc).
                  armed={armed && tool === "stitch"}
                  armMode="arm-and-promote"
                  onArm={() => chooseSymbol(symbol.id, undefined, undefined, colorId)}
                  onDisarm={() => setArmedSymbolId(null)}
                  disarmButton={disarmButton}
                  count={count}
                  {...selectAllProps(key)}
                  onChooseColor={(newColorId) => applyChipColor(symbol.id, newColorId, selectedPlacementIds)}
                  {...stitchRemoval(key)}
                  onRemove={() => removeFromGlossary(key)}
                  // Overflow rows have no numbered shortcut - always the spacer.
                  dragHandleTitle="Drag to reorder, or onto a numbered slot above to pin it there"
                  onDragHandleStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", key);
                    startDragging(key);
                  }}
                  onDragHandleEnd={resetDragState}
                  onRowDragOver={dragHandlers.onDragOver}
                  onRowDragLeave={dragHandlers.onDragLeave}
                  onRowDrop={(event) => {
                    event.preventDefault();
                    const draggedKey = draggingQuickId;
                    resetDragState();
                    if (!draggedKey || draggedKey === key) return;
                    // Reordering within the overflow list only - promoting a
                    // slotted item out of the quick row isn't supported here
                    // (it wouldn't render in this list to begin with).
                    if (quickSymbolIds.includes(draggedKey)) return;
                    const targetIndex = addedGlossaryIds.indexOf(key);
                    if (targetIndex !== -1) useDocStore.getState().moveGlossaryIdTo(draggedKey, targetIndex);
                  }}
                  // #326: keyboard/touch-friendly reorder, within the
                  // overflow list only - mirrors the overflow drag/drop's
                  // own guard above, which refuses to move a slotted item
                  // via this path. No global keyboard shortcut covers this
                  // list (unlike the numbered quick row's Alt+Up/Down), so
                  // the tooltip doesn't claim one.
                  moveUp={{
                    disabled: overflowIndex === 0,
                    onClick: () => {
                      const targetKey = remainingGlossary[overflowIndex - 1]?.key;
                      const targetIndex = targetKey ? addedGlossaryIds.indexOf(targetKey) : -1;
                      if (targetIndex !== -1) useDocStore.getState().moveGlossaryIdTo(key, targetIndex);
                    },
                    title: "Move up",
                  }}
                  moveDown={{
                    disabled: overflowIndex === remainingGlossary.length - 1,
                    onClick: () => {
                      const targetKey = remainingGlossary[overflowIndex + 1]?.key;
                      const targetIndex = targetKey ? addedGlossaryIds.indexOf(targetKey) : -1;
                      if (targetIndex !== -1) useDocStore.getState().moveGlossaryIdTo(key, targetIndex);
                    },
                    title: "Move down",
                  }}
                  dragIndicator={{ kind: "drag-over", active: dragOverQuickId === key }}
                />
              );
            })}
            {remainingMotifs.map((motif, overflowIndex) => {
              const key = motifKey(motif.id);
              const dragHandlers = trackDragOverKey(key);
              // Reorders within the unslotted motifs, the same way the
              // unslotted stitches above reorder among themselves.
              const moveNextTo = (neighbor: (typeof repeats)[number] | undefined) => {
                const targetIndex = neighbor ? repeats.indexOf(neighbor) : -1;
                if (targetIndex !== -1) useDocStore.getState().moveMotifTo(motif.id, targetIndex);
              };
              return (
                <GlossaryRow
                  key={key}
                  {...motifRowProps(motif)}
                  armMode="arm-and-promote"
                  onArm={() => armMotifPen(motif.id)}
                  dragHandleTitle="Drag to reorder, or onto a numbered slot above to pin it there"
                  onDragHandleStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", key);
                    startDragging(key);
                  }}
                  onDragHandleEnd={resetDragState}
                  onRowDragOver={dragHandlers.onDragOver}
                  onRowDragLeave={dragHandlers.onDragLeave}
                  onRowDrop={(event) => {
                    event.preventDefault();
                    const draggedKey = draggingQuickId;
                    resetDragState();
                    const draggedId = draggedKey ? motifIdFromKey(draggedKey) : null;
                    // Only another unslotted motif reorders here.
                    if (!draggedId || draggedKey === key || quickSymbolIds.includes(draggedKey!)) return;
                    useDocStore.getState().moveMotifTo(draggedId, repeats.indexOf(motif));
                  }}
                  moveUp={{
                    disabled: overflowIndex === 0,
                    onClick: () => moveNextTo(remainingMotifs[overflowIndex - 1]),
                    title: "Move up",
                  }}
                  moveDown={{
                    disabled: overflowIndex === remainingMotifs.length - 1,
                    onClick: () => moveNextTo(remainingMotifs[overflowIndex + 1]),
                    title: "Move down",
                  }}
                  dragIndicator={{ kind: "drag-over", active: dragOverQuickId === key }}
                />
              );
            })}
            {slotCount > 5 && renderOpenSlot(slotCount - 1)}
          </div>
        </div>
      </section>

      {isAdmin && <ReferenceImagePanel />}

      <div className="rightPanel__bottom">
      <section className="sideModule">
        <button
          type="button"
          className="sideModule__header sideModule__toggle"
          onClick={() => setExportOpen((open) => !open)}
          aria-expanded={exportOpen}
        >
          <div>
            <h2>Export</h2>
            <span>Share or save this pattern</span>
          </div>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" data-open={exportOpen}>
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        </button>
        {exportOpen && (
          <div className="sideModule__body">
            {referenceImages.length > 0 && (
              <label className="refpanel__checkbox">
                <input
                  type="checkbox"
                  checked={includeReferenceImage}
                  onChange={(event) => setIncludeReferenceImage(event.target.checked)}
                />
                Include reference image{referenceImages.length > 1 ? "s" : ""}
              </label>
            )}
            <div className="refpanel__actions">
              <Button
                disabled={!meta}
                onClick={() => {
                  if (meta) {
                    void exportChart(
                      meta.name,
                      index.toArray(),
                      repeats,
                      referenceImages,
                      addedGlossaryIds,
                      quickSymbolIds,
                      patternInfo,
                      includeReferenceImage,
                    );
                  }
                }}
              >
                Stitch Ease file
              </Button>
              <Button
                disabled={!meta}
                onClick={() => {
                  if (meta) exportChartCsv(meta.name, index.toArray());
                }}
              >
                CSV
              </Button>
              {(["png", "jpg"] as ImageFormat[]).map((format) => (
                <Button
                  key={format}
                  disabled={!meta || !!exportBusy}
                  onClick={() => {
                    if (!meta) return;
                    setExportError(null);
                    setExportBusy(format);
                    exportChartImage(meta.name, index.toArray(), format, repeats)
                      .catch((error: unknown) =>
                        setExportError(error instanceof Error ? error.message : "Could not export the image"),
                      )
                      .finally(() => setExportBusy(null));
                  }}
                >
                  {exportBusy === format ? "Exporting…" : format.toUpperCase()}
                </Button>
              ))}
            </div>
            {exportError && <p className="refpanel__error">{exportError}</p>}
          </div>
        )}
      </section>

      <section className="sideModule">
        <button
          type="button"
          className="sideModule__header sideModule__toggle"
          onClick={() => setHelpOpen((open) => !open)}
          aria-expanded={helpOpen}
        >
          <div>
            <h2>Help</h2>
            <span>Keyboard shortcuts</span>
          </div>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" data-open={helpOpen}>
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        </button>
        {helpOpen && (
          <div className="sideModule__body">
            <dl className="shortcutList">
              <dt><kbd>S</kbd> <kbd>D</kbd> <kbd>I</kbd> <kbd>E</kbd></dt><dd>Select, Draw, Insert, Erase</dd>
              <dt><kbd>1–5</kbd></dt><dd>Choose a quick stitch</dd>
              <dt><kbd>Tab</kbd> / <kbd>Shift Tab</kbd></dt><dd>Next stitch right / left</dd>
              <dt><kbd>Shift click</kbd></dt><dd>Add or remove from selection</dd>
              <dt><kbd>⌘/Ctrl C</kbd> <kbd>X</kbd> <kbd>V</kbd></dt><dd>Copy or cut selection · paste at hovered cell</dd>
              <dt><kbd>⌘/Ctrl D</kbd></dt><dd>Duplicate selection</dd>
              <dt><kbd>⌘/Ctrl G</kbd></dt><dd>Make motif</dd>
              <dt><kbd>⌘/Ctrl Z</kbd></dt><dd>Undo</dd>
              <dt><kbd>Shift ⌘/Ctrl Z</kbd></dt><dd>Redo</dd>
              <dt><kbd>Delete</kbd></dt><dd>Erase selection</dd>
              <dt><kbd>/</kbd></dt><dd>Open stitch picker at cursor</dd>
              <dt><kbd>Esc</kbd></dt><dd>Close or clear selection</dd>
              <dt><kbd>Space drag</kbd></dt><dd>Pan canvas</dd>
              <dt><kbd>⌘/Ctrl scroll</kbd></dt><dd>Zoom canvas</dd>
              <dt><kbd>⌘/Ctrl +</kbd> / <kbd>−</kbd></dt><dd>Zoom in / out</dd>
              <dt><kbd>⌘/Ctrl 0</kbd></dt><dd>Reset view to 100%</dd>
            </dl>
          </div>
        )}
      </section>

      <section className="sideModule">
        <div className="sideModule__header">
          <div>
            <h2>Navigator</h2>
            <span>Move around the canvas</span>
          </div>
        </div>
        <div className="sideModule__body navigator">
          <div className="navigator__zoom" aria-label="Canvas zoom">
            <button type="button" onClick={() => zoomFromCenter(1 / 1.2)} aria-label="Zoom out">−</button>
            <output aria-live="polite">{Math.round(zoom * 100)}%</output>
            <button type="button" onClick={() => zoomFromCenter(1.2)} aria-label="Zoom in">+</button>
          </div>
          <Button className="navigator__center" onClick={centerChart}>
            Center chart at 100%
          </Button>
        </div>
      </section>
      </div>
    </aside>
  );
}
