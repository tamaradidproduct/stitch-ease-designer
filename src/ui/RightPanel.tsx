import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { allSymbols, getSymbol } from "../symbols/registry";
import { CELL } from "../canvas/camera";
import { exportChartCsv } from "../storage/exportCsv";
import { type ImageFormat, exportChartImage } from "../storage/exportImage";
import { exportChart } from "../storage/exportImport";
import { cellWithinReferenceImage } from "../canvas/referenceImageCrop";
import { unoccupiedCellsFromKeys } from "../model/cellKey";
import { getSwatch } from "../model/colorPalette";
import {
  FIRST_ROW_SIDES,
  WORKED_MODES,
  type Corner,
  type FirstRowSide,
  type Worked,
} from "../model/types";
import { useDocStore } from "../state/docStore";
import { SUGGEST_SYMBOL_ID, useUiStore } from "../state/uiStore";
import { ReferenceImagePanel } from "./ReferenceImagePanel";
import { SymbolGlyph } from "./SymbolGlyph";
import { searchSymbols } from "./symbolSearch";
import { tapActivate } from "./tapActivate";
import {
  collectColoredGlossaryEntries,
  countConfirmedColoredStitches,
  countConfirmedStitches,
  saveGlossaryIds,
  selectableGlossaryEntryPlacementIds,
  symbolsWithAnyPlacement,
  useGlossaryIds,
} from "./chartGlossary";
import { parseQuickSlotId, quickSlotKey } from "../model/quickSlots";
import { addColoredVariant } from "./colorwork";
import { ColorChip } from "./ColorChip";
import { CheckIcon, CloseIcon, CrossIcon, DragHandleIcon } from "./icons";

/**
 * Section order for the glossary search dropdown; anything uncategorized
 * sorts last. Deliberately its own constant, not a shared one with
 * registry.ts's (unexported, export-image-only) CATEGORY_ORDER: that one
 * puts decreases before increases, a different editorial call for a
 * different context, not a value the two should be kept in sync with.
 */
const GLOSSARY_CATEGORY_ORDER = ["basic", "increase", "decrease", "cable", "brioche", "special"];
const CATEGORY_LABELS: Record<string, string> = {
  basic: "Basic stitches",
  increase: "Increases",
  decrease: "Decreases",
  cable: "Cables",
  brioche: "Brioche",
  special: "Special",
};

/** Grid layout order (top row, then bottom row) for the first-stitch corner picker. */
const CORNER_GRID_ORDER: Corner[] = ["tl", "tr", "bl", "br"];
const CORNER_LABELS: Record<Corner, string> = {
  tl: "Top left",
  tr: "Top right",
  bl: "Bottom left",
  br: "Bottom right",
};

export function RightPanel() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [glossaryQuery, setGlossaryQuery] = useState("");
  const [searchSlot, setSearchSlot] = useState<number | null>(null);
  const [activeGlossaryResult, setActiveGlossaryResult] = useState(0);
  const [draggingQuickId, setDraggingQuickId] = useState<string | null>(null);
  const [dragOverQuickId, setDragOverQuickId] = useState<string | null>(null);
  const [dragOverQuickSlot, setDragOverQuickSlot] = useState<number | null>(null);
  const [patternInfoOpen, setPatternInfoOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [includeReferenceImage, setIncludeReferenceImage] = useState(true);
  const glossarySearchRef = useRef<HTMLInputElement | null>(null);
  const inlineSearchRef = useRef<HTMLDivElement | null>(null);
  const meta = useDocStore((state) => state.meta);
  const index = useDocStore((state) => state.index);
  const repeats = useDocStore((state) => state.repeats);
  const referenceImage = useDocStore((state) => state.referenceImage);
  const patternInfo = useDocStore((state) => state.patternInfo);
  const setPatternInfo = useDocStore((state) => state.setPatternInfo);
  const setColorName = useDocStore((state) => state.setColorName);
  const revision = useDocStore((state) => state.revision);
  const acceptSuggestions = useDocStore((state) => state.acceptSuggestions);
  const dismissSuggestions = useDocStore((state) => state.dismissSuggestions);
  const isAdmin = useUiStore((state) => state.role === "admin");
  const chooseSymbol = useUiStore((state) => state.chooseSymbol);
  const armedSymbolId = useUiStore((state) => state.armedSymbolId);
  const activeColor = useUiStore((state) => state.activeColor);
  const tool = useUiStore((state) => state.tool);
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
  const addedGlossaryIds = useGlossaryIds();

  const resetDragState = () => {
    setDraggingQuickId(null);
    setDragOverQuickId(null);
    setDragOverQuickSlot(null);
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

  useEffect(() => {
    if (searchSlot === null) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!inlineSearchRef.current?.contains(event.target as Node)) {
        // Dismissal is its own gesture: intercept it before the canvas sees
        // the pointerdown, so an armed stitch is never placed as the menu
        // closes.
        event.preventDefault();
        event.stopPropagation();
        setSearchSlot(null);
        setGlossaryQuery("");
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSearchSlot(null);
      setGlossaryQuery("");
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [searchSlot]);


  // Shown in an armed row's trailing slot in place of whatever's normally
  // there (remove-from-glossary, or nothing) - a stitch that's mid-draw
  // isn't a candidate for removal anyway, and this is the one spot on
  // every armed row that's guaranteed free for it.
  const disarmButton = (
    <button
      type="button"
      className="glossary__disarm"
      {...tapActivate(() => setArmedSymbolId(null))}
      aria-label="Stop drawing"
      title="Stop drawing (Esc)"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7" />
        <path d="m5 15 10-10" />
      </svg>
    </button>
  );

  const { placements, glossary, plainGlossaryIds, stitchCounts, coloredCounts, symbolsPlaced, usedColorIds } = useMemo(() => {
    // The document mutates its index in place; its revision invalidates this
    // cached snapshot when placements change.
    void revision;
    const chartPlacements = index.toArray();
    const chartGlossary = collectColoredGlossaryEntries(addedGlossaryIds, chartPlacements);
    const colorIds: string[] = [];
    const seenColorIds = new Set<string>();
    for (const p of chartPlacements) {
      if (p.colorId && !seenColorIds.has(p.colorId)) {
        seenColorIds.add(p.colorId);
        colorIds.push(p.colorId);
      }
    }
    return {
      placements: chartPlacements,
      glossary: chartGlossary,
      usedColorIds: colorIds,
      // Which *plain* symbols already have a glossary row - what the
      // search-to-add dropdown (always a plain add) needs to exclude.
      plainGlossaryIds: new Set(
        chartGlossary.filter((entry) => !entry.colorId).map((entry) => entry.symbol.id),
      ),
      // Displayed count excludes still-pending suggestions (FR-13, G-8) and,
      // per DNT-13, excludes colored placements of the same symbol - a
      // colored combo is a separate inventory line with its own count.
      // Glossary removal-safety needs a separate "any placement at all"
      // check, confirmed or suggested, or a symbol with only a pending
      // suggestion would look removable (FR-14, G-9). Distinctly named
      // values from the start, not one reused for multiple purposes.
      stitchCounts: countConfirmedStitches(chartPlacements),
      coloredCounts: countConfirmedColoredStitches(chartPlacements),
      symbolsPlaced: symbolsWithAnyPlacement(chartPlacements),
    };
  }, [addedGlossaryIds, index, revision]);
  // Grouped by category (basic, increases, decreases, ...) rather than left
  // flat, so browsing the full library reads as a glossary instead of a wall
  // of stitches. Array.prototype.sort is stable, so search relevance order
  // (when there's a query) survives within each category bucket.
  const glossaryResults = searchSlot === null
    ? []
    : (glossaryQuery.trim() ? searchSymbols(allSymbols(), glossaryQuery) : allSymbols())
      .filter((symbol) => !plainGlossaryIds.has(symbol.id))
      .sort((a, b) => {
        const ai = GLOSSARY_CATEGORY_ORDER.indexOf(a.category);
        const bi = GLOSSARY_CATEGORY_ORDER.indexOf(b.category);
        return (
          (ai === -1 ? GLOSSARY_CATEGORY_ORDER.length : ai) -
          (bi === -1 ? GLOSSARY_CATEGORY_ORDER.length : bi)
        );
      });
  const glossarySections: { key: string; title: string; symbols: typeof glossaryResults }[] = [];
  for (const symbol of glossaryResults) {
    const current = glossarySections[glossarySections.length - 1];
    if (current?.key === symbol.category) {
      current.symbols.push(symbol);
    } else {
      glossarySections.push({
        key: symbol.category,
        title: CATEGORY_LABELS[symbol.category] ?? symbol.category,
        symbols: [symbol],
      });
    }
  }
  const slottedKeys = new Set(quickSymbolIds);
  const remainingGlossary = glossary.filter((entry) => !slottedKeys.has(entry.key));
  const slotCount = Math.max(5, quickSymbolIds.length + 1);

  // How many distinct stitches Suggest currently has an exemplar for -
  // a confirmed (non-suggested) placement sitting inside the reference
  // image counts as one. Shown on the Suggest row so it's clear at a
  // glance whether there's anything to match against yet.
  const suggestTaughtCount = referenceImage
    ? new Set(
        placements
          .filter((p) => !p.suggested && cellWithinReferenceImage(referenceImage, p.col, p.row))
          .map((p) => p.symbolId),
      ).size
    : 0;
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
    saveGlossaryIds(meta.id, next);
  };
  /** `key` is a full quick-slot key - a bare symbolId for a plain row, `symbolId::colorId` for a colored one. */
  const removeFromGlossary = (key: string) => {
    if (!meta || symbolsPlaced.has(key)) return;
    const next = addedGlossaryIds.filter((existing) => existing !== key);
    removeQuickSymbol(key);
    saveGlossaryIds(meta.id, next);
  };
  const chooseSearchResult = (id: string) => {
    addToGlossary(id);
    chooseSymbol(id);
    setSearchSlot(null);
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
      chooseSearchResult(glossaryResults[activeGlossaryResult]!.id);
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

  return (
    <aside className="rightPanel" aria-label="Pattern details">
      <section className="sideModule">
        <div className="sideModule__header">
          <div>
            <h2>Stitch glossary</h2>
            <span>
              {glossary.length} stitch type{glossary.length === 1 ? "" : "s"} in this pattern
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
              const count = parsed?.colorId
                ? (coloredCounts.get(key!) ?? 0)
                : (stitchCounts.get(symbol?.id ?? "") ?? 0);
              const selectAllLabel = `Select all ${count} placed ${symbol?.label} stitches`;
              return key && symbol ? (
                <div
                  key={key}
                  className="glossary__item"
                  data-on={armed && tool === "stitch"}
                  data-drag-over={dragOverQuickId === key}
                  onDragOver={(event) => {
                    if (draggingQuickId && draggingQuickId !== key) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDragOverQuickId(key);
                    }
                  }}
                  onDragLeave={() => setDragOverQuickId((current) => current === key ? null : current)}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedKey = draggingQuickId;
                    if (draggedKey && draggedKey !== key) moveQuickSymbolTo(draggedKey, slot);
                    resetDragState();
                  }}
                >
                  <button
                    type="button"
                    draggable
                    className="glossary__dragHandle"
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", key);
                      setDraggingQuickId(key);
                    }}
                    onDragEnd={resetDragState}
                    aria-label={`Drag to reorder ${symbol.label}`}
                    title="Drag to reorder"
                  >
                  <DragHandleIcon />
                  </button>
                  {slot < 5 ? (
                    <kbd className="glossary__shortcut" aria-label={`Shortcut ${slot + 1}`}>{slot + 1}</kbd>
                  ) : <span className="glossary__shortcutSpacer" />}
                  <button
                    type="button"
                    className="glossary__arm"
                    {...tapActivate(() =>
                      armed && tool === "stitch"
                        ? setArmedSymbolId(null)
                        : setArmedSymbolId(symbol.id, parsed?.colorId ?? null)
                    )}
                    title={`Draw with ${symbol.label} (${slot + 1}) - tap again to stop drawing`}
                  >
                    <span className="glossary__glyph">
                      <SymbolGlyph symbol={symbol} cell={Math.max(7, Math.min(20, 54 / symbol.span))} colorId={parsed?.colorId} />
                    </span>
                    <span className="glossary__label">{symbol.label}</span>
                  </button>
                  <button
                    type="button"
                    className="glossary__count glossary__selectEntry"
                    disabled={!count}
                    onClick={() => setSelection(selectableGlossaryEntryPlacementIds(placements, key), [], true)}
                    aria-label={selectAllLabel}
                    title={selectAllLabel}
                  >
                    All ({count})
                  </button>
                  {/* FR-34/Bug 8: the add-only chip belongs on every plain
                      row, slotted or not - a colored row never gets it. */}
                  {!parsed?.colorId && (
                    <ColorChip
                      mode="add-only"
                      label={`Add a colored ${symbol.label}`}
                      className="glossary__colorChip"
                      onSelect={(colorId) => addColoredVariant(symbol.id, colorId)}
                    />
                  )}
                  {armed && tool === "stitch" ? (
                    disarmButton
                  ) : !symbolsPlaced.has(key) ? (
                    <button
                      type="button"
                      className="glossary__remove"
                      onClick={() => removeFromGlossary(key)}
                      aria-label={`Remove ${symbol.label} from glossary`}
                      title="Remove from glossary"
                    >
                      <CloseIcon />
                    </button>
                  ) : (
                    <span className="glossary__removeSlot" aria-hidden="true" />
                  )}
                </div>
              ) : searchSlot === slot ? (
                <div ref={inlineSearchRef} key={`search:${slot}`} className="glossary__inlineSearch">
                  {slot < 5 ? <kbd className="glossary__shortcut">{slot + 1}</kbd> : <span className="glossary__shortcutSpacer" />}
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <circle cx="8.5" cy="8.5" r="5.25" /><path d="m12.4 12.4 4 4" />
                  </svg>
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
                        ? `glossary-search-result-${glossaryResults[activeGlossaryResult]!.id}`
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
                        {glossarySections.map((section) => (
                          <div key={section.key}>
                            <div className="glossarySearch__heading">{section.title}</div>
                            {section.symbols.map((result) => {
                              resultIndex += 1;
                              const at = resultIndex;
                              return (
                                <button
                                  id={`glossary-search-result-${result.id}`}
                                  key={result.id}
                                  type="button"
                                  role="option"
                                  aria-selected={at === activeGlossaryResult}
                                  data-active={at === activeGlossaryResult}
                                  onPointerEnter={() => setActiveGlossaryResult(at)}
                                  onClick={() => chooseSearchResult(result.id)}
                                >
                                  <span className="glossarySearch__glyph">
                                    <SymbolGlyph symbol={result} cell={Math.max(7, Math.min(18, 48 / result.span))} />
                                  </span>
                                  <span>{result.label}</span><strong>Add</strong>
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
                  onDragOver={(event) => {
                    if (draggingQuickId) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (dragOverQuickSlot !== slot) setDragOverQuickSlot(slot);
                    }
                  }}
                  onDragLeave={() =>
                    setDragOverQuickSlot((current) => current === slot ? null : current)
                  }
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId = draggingQuickId;
                    if (draggedId) moveQuickSymbolTo(draggedId, slot);
                    resetDragState();
                  }}
                  onClick={() => searchForQuickStitch(slot)}
                  title={slot < 5 ? `Choose a stitch for shortcut ${slot + 1}` : "Add another stitch"}
                >
                  <span className="glossary__dragHandle glossary__dragHandle--empty" aria-hidden="true">
                    <DragHandleIcon />
                  </span>
                  {slot < 5 ? <kbd className="glossary__shortcut">{slot + 1}</kbd> : <span className="glossary__shortcutSpacer" />}
                  <span className="glossary__emptyGlyph" aria-hidden="true">+</span>
                  <span className="glossary__label">Add stitch</span>
                </button>
              );
            })}
            {remainingGlossary.map((entry) => {
              const { symbol, colorId, key } = entry;
              const armed = key === quickSlotKey(armedSymbolId ?? "", activeColor) && !!armedSymbolId;
              const count = colorId ? (coloredCounts.get(key) ?? 0) : (stitchCounts.get(symbol.id) ?? 0);
              const selectAllLabel = `Select all ${count} placed ${symbol.label} stitches`;
              return (
                <div
                  key={key}
                  className="glossary__item"
                  data-on={armed && tool === "stitch"}
                  data-drag-over={dragOverQuickId === key}
                  onDragOver={(event) => {
                    if (draggingQuickId && draggingQuickId !== key) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDragOverQuickId(key);
                    }
                  }}
                  onDragLeave={() => setDragOverQuickId((current) => current === key ? null : current)}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedKey = draggingQuickId;
                    resetDragState();
                    if (!draggedKey || draggedKey === key) return;
                    // Reordering within the overflow list only - promoting a
                    // slotted item out of the quick row isn't supported here
                    // (it wouldn't render in this list to begin with).
                    if (quickSymbolIds.includes(draggedKey)) return;
                    const targetIndex = remainingGlossary.findIndex((candidate) => candidate.key === key);
                    useDocStore.getState().moveGlossaryIdTo(draggedKey, targetIndex);
                  }}
                >
                  <button
                    type="button"
                    draggable
                    className="glossary__dragHandle"
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", key);
                      setDraggingQuickId(key);
                    }}
                    onDragEnd={resetDragState}
                    aria-label={`Drag to reorder ${symbol.label}`}
                    title="Drag to reorder, or onto a numbered slot above to pin it there"
                  >
                      <DragHandleIcon />
                    </button>
                  <span className="glossary__shortcutSpacer" />
                  <button
                    type="button"
                    className="glossary__arm"
                    {...tapActivate(() =>
                      armed && tool === "stitch"
                        ? setArmedSymbolId(null)
                        : chooseSymbol(symbol.id, undefined, undefined, colorId)
                    )}
                    title={`Draw with ${symbol.label} - tap again to stop drawing`}
                  >
                    <span className="glossary__glyph">
                      <SymbolGlyph symbol={symbol} cell={Math.max(7, Math.min(20, 54 / symbol.span))} colorId={colorId} />
                    </span>
                    <span className="glossary__label">{symbol.label}</span>
                  </button>
                  <button
                    type="button"
                    className="glossary__count glossary__selectEntry"
                    disabled={!count}
                    onClick={() => setSelection(selectableGlossaryEntryPlacementIds(placements, key), [], true)}
                    aria-label={selectAllLabel}
                    title={selectAllLabel}
                  >
                    All ({count})
                  </button>
                  {!colorId && (
                    <ColorChip
                      mode="add-only"
                      label={`Add a colored ${symbol.label}`}
                      className="glossary__colorChip"
                      onSelect={(newColorId) => addColoredVariant(symbol.id, newColorId)}
                    />
                  )}
                  {armed && tool === "stitch" ? (
                    disarmButton
                  ) : !symbolsPlaced.has(key) ? (
                    <button
                      type="button"
                      className="glossary__remove"
                      onClick={() => removeFromGlossary(key)}
                      aria-label={`Remove ${symbol.label} from glossary`}
                      title="Remove from glossary"
                    >
                      <CloseIcon />
                    </button>
                  ) : (
                    <span className="glossary__removeSlot" aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {isAdmin && <ReferenceImagePanel />}

      <div className="rightPanel__bottom">
      <section className="sideModule">
        <button
          type="button"
          className="sideModule__header sideModule__toggle"
          onClick={() => setPatternInfoOpen((open) => !open)}
          aria-expanded={patternInfoOpen}
        >
          <div>
            <h2>Pattern info</h2>
            <span>Fill in details for the preview instead of asking</span>
          </div>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" data-open={patternInfoOpen}>
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        </button>
        {patternInfoOpen && (
          <div className="sideModule__body patternInfo">
            <div className="patternInfo__field">
              <span className="patternInfo__label">Worked</span>
              <div className="patternInfo__toggle" role="radiogroup" aria-label="Worked flat or in the round">
                {WORKED_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={patternInfo.worked === mode}
                    data-on={patternInfo.worked === mode}
                    onClick={() => setPatternInfo({ worked: mode as Worked })}
                  >
                    {mode === "flat" ? "Flat" : "Round"}
                  </button>
                ))}
              </div>
            </div>
            {patternInfo.worked !== "round" && (
              <div className="patternInfo__field">
                <span className="patternInfo__label">First row</span>
                <div className="patternInfo__toggle" role="radiogroup" aria-label="First row RS or WS">
                  {FIRST_ROW_SIDES.map((side) => (
                    <button
                      key={side}
                      type="button"
                      role="radio"
                      aria-checked={patternInfo.firstRow === side}
                      data-on={patternInfo.firstRow === side}
                      onClick={() => setPatternInfo({ firstRow: side as FirstRowSide })}
                    >
                      {side}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="patternInfo__field">
              <span className="patternInfo__label">First stitch</span>
              <div className="patternInfo__corners" role="radiogroup" aria-label="Which corner the first stitch is at">
                {CORNER_GRID_ORDER.map((corner) => (
                  <button
                    key={corner}
                    type="button"
                    role="radio"
                    aria-checked={patternInfo.firstStitch === corner}
                    data-on={patternInfo.firstStitch === corner}
                    aria-label={CORNER_LABELS[corner]}
                    title={CORNER_LABELS[corner]}
                    onClick={() => setPatternInfo({ firstStitch: corner })}
                  />
                ))}
              </div>
            </div>
            {usedColorIds.length > 0 && (
              <div className="patternInfo__field">
                <span className="patternInfo__label">Color names</span>
                <div className="patternInfo__colorNames">
                  {usedColorIds.map((colorId) => {
                    const swatch = getSwatch(colorId);
                    return (
                      <label key={colorId} className="patternInfo__colorName">
                        <span
                          className="patternInfo__swatch"
                          style={{ background: swatch?.hex ?? colorId }}
                          aria-hidden="true"
                        />
                        <input
                          type="text"
                          defaultValue={patternInfo.colorNames?.[colorId] ?? ""}
                          placeholder={swatch ? `${swatch.hue} ${swatch.step + 1}` : "Name"}
                          aria-label={`Name for this color`}
                          onBlur={(event) => setColorName(colorId, event.target.value)}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

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
            {referenceImage && (
              <label className="refpanel__checkbox">
                <input
                  type="checkbox"
                  checked={includeReferenceImage}
                  onChange={(event) => setIncludeReferenceImage(event.target.checked)}
                />
                Include reference image
              </label>
            )}
            <div className="refpanel__actions">
              <button
                type="button"
                className="btn"
                disabled={!meta}
                onClick={() => {
                  if (meta) {
                    void exportChart(
                      meta.name,
                      index.toArray(),
                      repeats,
                      referenceImage ?? undefined,
                      addedGlossaryIds,
                      quickSymbolIds,
                      patternInfo,
                      includeReferenceImage,
                    );
                  }
                }}
              >
                Stitch Ease file
              </button>
              <button
                type="button"
                className="btn"
                disabled={!meta}
                onClick={() => {
                  if (meta) exportChartCsv(meta.name, index.toArray());
                }}
              >
                CSV
              </button>
              {(["png", "jpg"] as ImageFormat[]).map((format) => (
                <button
                  key={format}
                  type="button"
                  className="btn"
                  disabled={!meta || !!exportBusy}
                  onClick={() => {
                    if (!meta) return;
                    setExportError(null);
                    setExportBusy(format);
                    exportChartImage(meta.name, index.toArray(), format)
                      .catch((error: unknown) =>
                        setExportError(error instanceof Error ? error.message : "Could not export the image"),
                      )
                      .finally(() => setExportBusy(null));
                  }}
                >
                  {exportBusy === format ? "Exporting…" : format.toUpperCase()}
                </button>
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
              <dt><kbd>⌘/Ctrl G</kbd></dt><dd>Create repeat</dd>
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
          <button type="button" className="btn navigator__center" onClick={centerChart}>
            Center chart at 100%
          </button>
        </div>
      </section>
      </div>
    </aside>
  );
}
