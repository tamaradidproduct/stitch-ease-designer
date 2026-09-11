import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { allSymbols, getSymbol } from "../symbols/registry";
import { CELL } from "../canvas/camera";
import { exportChartCsv } from "../storage/exportCsv";
import { type ImageFormat, exportChartImage } from "../storage/exportImage";
import { exportChart } from "../storage/exportImport";
import { cellWithinReferenceImage } from "../canvas/referenceImageCrop";
import { useDocStore } from "../state/docStore";
import { SUGGEST_SYMBOL_ID, useUiStore } from "../state/uiStore";
import { ReferenceImagePanel } from "./ReferenceImagePanel";
import { SymbolGlyph } from "./SymbolGlyph";
import { searchSymbols } from "./symbolSearch";
import { tapActivate } from "./tapActivate";
import { collectGlossarySymbols, loadGlossaryIds } from "./chartGlossary";

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

export function RightPanel() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [traceMenuOpen, setTraceMenuOpen] = useState(false);
  const glossaryModuleRef = useRef<HTMLElement | null>(null);
  const [glossaryQuery, setGlossaryQuery] = useState("");
  const [searchSlot, setSearchSlot] = useState<number | null>(null);
  const [activeGlossaryResult, setActiveGlossaryResult] = useState(0);
  const [draggingQuickId, setDraggingQuickId] = useState<string | null>(null);
  const [dragOverQuickId, setDragOverQuickId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [addedGlossaryIds, setAddedGlossaryIds] = useState<string[]>(() =>
    loadGlossaryIds(useDocStore.getState().meta?.id),
  );
  const glossarySearchRef = useRef<HTMLInputElement | null>(null);
  const inlineSearchRef = useRef<HTMLDivElement | null>(null);
  const meta = useDocStore((state) => state.meta);
  const index = useDocStore((state) => state.index);
  const repeats = useDocStore((state) => state.repeats);
  const referenceImage = useDocStore((state) => state.referenceImage);
  const revision = useDocStore((state) => state.revision);
  const acceptSuggestions = useDocStore((state) => state.acceptSuggestions);
  const dismissSuggestions = useDocStore((state) => state.dismissSuggestions);
  const isAdmin = useUiStore((state) => state.role === "admin");
  const chooseSymbol = useUiStore((state) => state.chooseSymbol);
  const armedSymbolId = useUiStore((state) => state.armedSymbolId);
  const tool = useUiStore((state) => state.tool);
  const quickSymbolIds = useUiStore((state) => state.quickSymbolIds);
  const removeQuickSymbol = useUiStore((state) => state.removeQuickSymbol);
  const moveQuickSymbolTo = useUiStore((state) => state.moveQuickSymbolTo);
  const setArmedSymbolId = useUiStore((state) => state.setArmedSymbolId);
  const openPicker = useUiStore((state) => state.openPicker);
  const zoom = useUiStore((state) => state.camera.zoom);
  const viewport = useUiStore((state) => state.viewport);
  const zoomAt = useUiStore((state) => state.zoomAt);
  const centerViewAt100 = useUiStore((state) => state.centerViewAt100);
  const stitchHighlightColor = useUiStore((state) => state.stitchHighlightColor);
  const stitchHighlightOpacity = useUiStore((state) => state.stitchHighlightOpacity);
  const setStitchHighlight = useUiStore((state) => state.setStitchHighlight);
  const setStitchHighlightOpacity = useUiStore((state) => state.setStitchHighlightOpacity);
  const referenceImageUnrecognized = useUiStore((state) => state.referenceImageUnrecognized);
  const clearReferenceImageUnrecognized = useUiStore((state) => state.clearReferenceImageUnrecognized);
  const chartId = meta?.id;

  useEffect(() => {
    setAddedGlossaryIds(loadGlossaryIds(chartId));
  }, [chartId]);

  // Plain useEffect defers to a paint-independent scheduler tick, which
  // lands outside the synchronous user-gesture window iOS requires to raise
  // the on-screen keyboard for a focus() call - the same issue StitchPicker
  // had (see the comment there). useLayoutEffect runs synchronously, before
  // paint, in the same tick as the click that set searchSlot.
  useLayoutEffect(() => {
    if (searchSlot !== null) glossarySearchRef.current?.focus();
  }, [searchSlot]);

  // Search queries can remove the currently highlighted result. Start each
  // new query at its first visible match so Arrow navigation always has a
  // predictable target.
  useEffect(() => {
    setActiveGlossaryResult(0);
  }, [searchSlot, glossaryQuery]);

  useEffect(() => {
    if (!traceMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!glossaryModuleRef.current?.contains(event.target as Node)) setTraceMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTraceMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [traceMenuOpen]);

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

  const { placements, glossary, glossaryIds, stitchCounts } = useMemo(() => {
    // The document mutates its index in place; its revision invalidates this
    // cached snapshot when placements change.
    void revision;
    const chartPlacements = index.toArray();
    const chartGlossary = collectGlossarySymbols(
      addedGlossaryIds,
      chartPlacements.map((placement) => placement.symbolId),
    );
    const chartGlossaryIds = new Set(chartGlossary.map((symbol) => symbol.id));
    const chartStitchCounts = chartPlacements.reduce((counts, placement) => {
      counts.set(placement.symbolId, (counts.get(placement.symbolId) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    return {
      placements: chartPlacements,
      glossary: chartGlossary,
      glossaryIds: chartGlossaryIds,
      stitchCounts: chartStitchCounts,
    };
  }, [addedGlossaryIds, index, revision]);
  // Grouped by category (basic, increases, decreases, ...) rather than left
  // flat, so browsing the full library reads as a glossary instead of a wall
  // of stitches. Array.prototype.sort is stable, so search relevance order
  // (when there's a query) survives within each category bucket.
  const glossaryResults = searchSlot === null
    ? []
    : (glossaryQuery.trim() ? searchSymbols(allSymbols(), glossaryQuery) : allSymbols())
      .filter((symbol) => !glossaryIds.has(symbol.id))
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
  const slottedIds = new Set(quickSymbolIds);
  const remainingGlossary = glossary.filter((symbol) => !slottedIds.has(symbol.id));
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
  const unrecognizedCells = [...referenceImageUnrecognized].flatMap((key) => {
    const [colStr, rowStr] = key.split(",");
    const col = Number(colStr);
    const row = Number(rowStr);
    if (!Number.isFinite(col) || !Number.isFinite(row) || index.placementAt(col, row)) return [];
    return [{ col, row }];
  });
  const unrecognizedCount = unrecognizedCells.length;

  const addToGlossary = (id: string) => {
    if (!meta || glossaryIds.has(id)) return;
    const next = [...addedGlossaryIds, id];
    setAddedGlossaryIds(next);
    setGlossaryQuery("");
    try {
      localStorage.setItem(`stitch-ease:glossary:${meta.id}`, JSON.stringify(next));
    } catch {
      // The glossary remains available for this session if storage is unavailable.
    }
  };
  const removeFromGlossary = (id: string) => {
    if (!meta || (stitchCounts.get(id) ?? 0) > 0) return;
    const next = addedGlossaryIds.filter((symbolId) => symbolId !== id);
    setAddedGlossaryIds(next);
    removeQuickSymbol(id);
    try {
      localStorage.setItem(`stitch-ease:glossary:${meta.id}`, JSON.stringify(next));
    } catch {
      // The glossary remains updated for this session if storage is unavailable.
    }
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
      <section ref={glossaryModuleRef} className="sideModule glossaryModule">
        <div className="sideModule__header">
          <div>
            <h2>Stitch glossary</h2>
            <span>
              {glossary.length} stitch type{glossary.length === 1 ? "" : "s"} in this pattern
            </span>
          </div>
          <button
            type="button"
            className="glossaryModule__paletteButton"
            data-on={traceMenuOpen || stitchHighlightOpacity > 0}
            onClick={() => setTraceMenuOpen((open) => !open)}
            aria-expanded={traceMenuOpen}
            aria-label="Canvas stitch colors"
            title="Canvas stitch colors"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 3a7 7 0 1 0 0 14h1.2a1.6 1.6 0 0 0 0-3.2h-.5a1.2 1.2 0 0 1 0-2.4H13A4 4 0 0 0 17 7.5C17 5 14 3 10 3Z" />
              <circle cx="6.5" cy="8" r=".8" /><circle cx="9" cy="5.8" r=".8" /><circle cx="13" cy="6.8" r=".8" />
            </svg>
          </button>
        </div>
        {traceMenuOpen && (
          <div className="traceColors traceColors--popover">
            <div className="traceColors__label">
              <span>Canvas stitch color</span>
              <button type="button" onClick={() => setStitchHighlightOpacity(0)}>Off</button>
            </div>
            <div className="traceColors__presets" aria-label="Stitch highlight color">
              {["#f59e0b", "#ec4899", "#8b5cf6", "#10b981", "#0284c7"].map((color) => (
                <button
                  key={color}
                  type="button"
                  style={{ background: color }}
                  data-on={stitchHighlightColor === color && stitchHighlightOpacity > 0}
                  onClick={() => setStitchHighlight(color, stitchHighlightOpacity || 0.22)}
                  aria-label={`Use ${color} stitch highlight`}
                />
              ))}
              <label className="traceColors__custom" title="Choose a custom color">
                <input
                  type="color"
                  value={stitchHighlightColor}
                  onChange={(event) => setStitchHighlight(event.target.value, stitchHighlightOpacity || 0.22)}
                  aria-label="Custom stitch highlight color"
                />
              </label>
            </div>
            <label className="traceColors__intensity">
              <span>Intensity</span>
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.05"
                value={stitchHighlightOpacity}
                onChange={(event) => setStitchHighlightOpacity(Number(event.target.value))}
              />
            </label>
          </div>
        )}
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
                  title="Draw with Suggest (G) - tap again to stop drawing. Matches each cell against stitches you've already confirmed over the reference image. Landing on a suggestion with a real stitch armed confirms it as that stitch outright; Shift-click confirms it as its own guess instead. Shift+Opt erases a cell, suggested or confirmed - all of this drags and Shift straight-lines/gap-fills the same way Draw does."
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
                  <span className="glossary__label">Suggest</span>
                  <span
                    className="glossary__count"
                    title={
                      suggestTaughtCount > 0
                        ? `Recognizes ${suggestTaughtCount} stitch type${suggestTaughtCount === 1 ? "" : "s"} you've confirmed over the reference image`
                        : "Confirm at least one stitch over the reference image first"
                    }
                  >
                    {suggestTaughtCount}
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
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m4 10 3.5 3.5L16 5" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="glossary__reviewAction"
                  onClick={() => dismissSuggestions()}
                  aria-label="Dismiss all identified suggestions"
                  title="Dismiss all"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />
                  </svg>
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
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />
                  </svg>
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
              const id = quickSymbolIds[slot];
              const symbol = id ? getSymbol(id) : undefined;
              return id && symbol ? (
                <div
                  key={id}
                  className="glossary__item"
                  data-on={id === armedSymbolId && tool === "stitch"}
                  data-drag-over={dragOverQuickId === id}
                  onDragOver={(event) => {
                    if (draggingQuickId && draggingQuickId !== id) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDragOverQuickId(id);
                    }
                  }}
                  onDragLeave={() => setDragOverQuickId((current) => current === id ? null : current)}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId = draggingQuickId;
                    if (draggedId && draggedId !== id) moveQuickSymbolTo(draggedId, slot);
                    setDraggingQuickId(null);
                    setDragOverQuickId(null);
                  }}
                >
                  <button
                    type="button"
                    draggable
                    className="glossary__dragHandle"
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", symbol.id);
                      setDraggingQuickId(symbol.id);
                    }}
                    onDragEnd={() => {
                      setDraggingQuickId(null);
                      setDragOverQuickId(null);
                    }}
                    aria-label={`Drag to reorder ${symbol.label}`}
                    title="Drag to reorder"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="5" cy="3.5" r="1" /><circle cx="11" cy="3.5" r="1" />
                      <circle cx="5" cy="8" r="1" /><circle cx="11" cy="8" r="1" />
                      <circle cx="5" cy="12.5" r="1" /><circle cx="11" cy="12.5" r="1" />
                    </svg>
                  </button>
                  {slot < 5 ? (
                    <kbd className="glossary__shortcut" aria-label={`Shortcut ${slot + 1}`}>{slot + 1}</kbd>
                  ) : <span className="glossary__shortcutSpacer" />}
                  <button
                    type="button"
                    className="glossary__arm"
                    {...tapActivate(() =>
                      setArmedSymbolId(id === armedSymbolId && tool === "stitch" ? null : id)
                    )}
                    title={`Draw with ${symbol.label} (${slot + 1}) - tap again to stop drawing`}
                  >
                    <span className="glossary__glyph">
                      <SymbolGlyph symbol={symbol} cell={Math.max(7, Math.min(20, 54 / symbol.span))} />
                    </span>
                    <span className="glossary__label">{symbol.label}</span>
                    <span className="glossary__count" title={`${stitchCounts.get(symbol.id) ?? 0} placed`}>
                      {stitchCounts.get(symbol.id) ?? 0}
                    </span>
                  </button>
                  {id === armedSymbolId && tool === "stitch" ? (
                    disarmButton
                  ) : (stitchCounts.get(symbol.id) ?? 0) === 0 ? (
                    <button
                      type="button"
                      className="glossary__remove"
                      onClick={() => removeFromGlossary(symbol.id)}
                      aria-label={`Remove ${symbol.label} from glossary`}
                      title="Remove from glossary"
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M3.5 3.5l9 9m0-9-9 9" />
                      </svg>
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
                  {glossaryResults.length > 0 && (() => {
                    let resultIndex = -1;
                    return (
                      <div id="glossary-search-results" className="glossarySearch__results" role="listbox">
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
                  onClick={() => searchForQuickStitch(slot)}
                  title={slot < 5 ? `Choose a stitch for shortcut ${slot + 1}` : "Add another stitch"}
                >
                  <span className="glossary__dragHandle glossary__dragHandle--empty" aria-hidden="true">
                    <svg viewBox="0 0 16 16">
                      <circle cx="5" cy="3.5" r="1" /><circle cx="11" cy="3.5" r="1" />
                      <circle cx="5" cy="8" r="1" /><circle cx="11" cy="8" r="1" />
                      <circle cx="5" cy="12.5" r="1" /><circle cx="11" cy="12.5" r="1" />
                    </svg>
                  </span>
                  {slot < 5 ? <kbd className="glossary__shortcut">{slot + 1}</kbd> : <span className="glossary__shortcutSpacer" />}
                  <span className="glossary__emptyGlyph" aria-hidden="true">+</span>
                  <span className="glossary__label">Add stitch</span>
                </button>
              );
            })}
            {remainingGlossary.map((symbol) => (
              <div
                key={symbol.id}
                className="glossary__item"
                data-on={symbol.id === armedSymbolId && tool === "stitch"}
              >
                <button
                  type="button"
                  className="glossary__arm"
                  {...tapActivate(() =>
                    symbol.id === armedSymbolId && tool === "stitch"
                      ? setArmedSymbolId(null)
                      : chooseSymbol(symbol.id)
                  )}
                  title={`Draw with ${symbol.label} - tap again to stop drawing`}
                >
                  <span className="glossary__glyph">
                    <SymbolGlyph symbol={symbol} cell={Math.max(7, Math.min(20, 54 / symbol.span))} />
                  </span>
                  <span className="glossary__label">{symbol.label}</span>
                  <span className="glossary__count" title={`${stitchCounts.get(symbol.id) ?? 0} placed`}>
                    {stitchCounts.get(symbol.id) ?? 0}
                  </span>
                </button>
                {symbol.id === armedSymbolId && tool === "stitch" ? (
                  disarmButton
                ) : (stitchCounts.get(symbol.id) ?? 0) === 0 ? (
                  <button
                    type="button"
                    className="glossary__remove"
                    onClick={() => removeFromGlossary(symbol.id)}
                    aria-label={`Remove ${symbol.label} from glossary`}
                    title="Remove from glossary"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3.5 3.5l9 9m0-9-9 9" />
                    </svg>
                  </button>
                ) : (
                  <span className="glossary__removeSlot" aria-hidden="true" />
                )}
              </div>
            ))}
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
            <div className="refpanel__actions">
              <button
                type="button"
                className="btn"
                disabled={!meta}
                onClick={() => {
                  if (meta) void exportChart(meta.name, index.toArray(), repeats, referenceImage ?? undefined);
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
