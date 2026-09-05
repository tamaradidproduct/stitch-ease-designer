import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cellToScreenRect } from "../canvas/camera";
import { allSymbols, getSymbol } from "../symbols/registry";
import type { StitchSymbol } from "../symbols/types";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { insertTargetCol } from "../model/ops";
import { SymbolGlyph } from "./SymbolGlyph";
import { searchSymbols } from "./symbolSearch";

const MENU_WIDTH = 284;
const SEARCH_SLOT_WIDTH = 200;
const MAX_HEIGHT = 380;
const GLYPH_BUDGET = 210;

type Section = { key: string; title: string | null; symbols: StitchSymbol[] };

/** Searching is deliberately empty until the designer types a query. */
function buildSections(query: string): Section[] {
  return query.trim()
    ? [{ key: "results", title: null, symbols: searchSymbols(allSymbols(), query) }]
    : [];
}

/** Cables are up to 12 cells wide; shrink the cell so the whole span fits. */
const cellSizeFor = (symbol: StitchSymbol) =>
  Math.max(9, Math.min(22, Math.floor(GLYPH_BUDGET / symbol.span)));

export function StitchPicker() {
  const target = useUiStore((s) => s.picker);
  const closePicker = useUiStore((s) => s.closePicker);
  const openPicker = useUiStore((s) => s.openPicker);
  const chooseSymbol = useUiStore((s) => s.chooseSymbol);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const setSelectedPlacementIds = useUiStore((s) => s.setSelectedPlacementIds);
  const tool = useUiStore((s) => s.tool);
  const setInsertAnimation = useUiStore((s) => s.setInsertAnimation);
  const quickIds = useUiStore((s) => s.quickSymbolIds);
  const camera = useUiStore((s) => s.camera);
  const viewport = useUiStore((s) => s.viewport);
  const place = useDocStore((s) => s.place);
  const erase = useDocStore((s) => s.erase);
  const erasePlacements = useDocStore((s) => s.erasePlacements);
  const createRepeat = useDocStore((s) => s.createRepeat);
  const duplicateSelection = useDocStore((s) => s.duplicatePlacementsInRow);
  const insertPlacement = useDocStore((s) => s.insertPlacement);
  const replacePlacements = useDocStore((s) => s.replacePlacements);
  const repeats = useDocStore((s) => s.repeats);
  const instantiateRepeat = useDocStore((s) => s.instantiateRepeat);
  const index = useDocStore((s) => s.index);
  useDocStore((s) => s.revision);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchOrigin, setSearchOrigin] = useState(5);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ compactLeft: 0, searchLeft: 0, top: 0 });
  const selectionSpan = target?.selectionSpan;
  const currentSymbol = target?.currentSymbolId ? getSymbol(target.currentSymbolId) : undefined;
  const canDelete = !!currentSymbol || !!target?.selectionIds?.length;
  const menuWidth = MENU_WIDTH + (canDelete ? 45 : 0);
  const expandedMenuWidth = menuWidth + SEARCH_SLOT_WIDTH - 40;

  const sections = useMemo(() => {
    if (!query.trim()) return [];
    const built = buildSections(query);
    if (!selectionSpan) return built;
    return built
      .map((section) => ({
        ...section,
        symbols: section.symbols.filter((symbol) => symbol.span === selectionSpan),
      }))
      .filter((section) => section.symbols.length > 0);
  }, [query, selectionSpan]);

  const quickSymbols = useMemo(
    () => quickIds
      .map((id) => getSymbol(id))
      .filter((symbol): symbol is StitchSymbol =>
        !!symbol && (!selectionSpan || symbol.span === selectionSpan))
      .slice(0, 5),
    [quickIds, selectionSpan],
  );

  // Flat order is what the arrow keys walk, so it must match render order.
  const flat = useMemo(() => sections.flatMap((s) => s.symbols), [sections]);
  const matchingRepeats = target?.selectionIds || !query.trim()
    ? []
    : repeats.filter((repeat) => repeat.name.toLowerCase().includes(query.trim().toLowerCase()));

  // The picker never unmounts — it just renders null while closed — so a
  // mount-only effect would focus and reset state exactly once, the first
  // time it ever opens, and never again. Keying on `target` instead makes
  // every open behave like a fresh one: a stale search from the last cell
  // doesn't carry over, and if this cell already has a stitch, the list
  // starts on it rather than always at the top.
  useEffect(() => {
    if (!target) return;
    setQuery("");
    setSearchOpen(!!target.armOnly);
    setSearchOrigin(5);
    setActive(0);
    requestAnimationFrame(() => {
      if (target.armOnly) inputRef.current?.focus();
      else searchButtonRef.current?.focus();
    });
  }, [target]);

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
        compactLeft: Math.max(8, Math.min(anchorX - menuWidth / 2, window.innerWidth - menuWidth - 8)),
        searchLeft: Math.max(8, Math.min(anchorX - width / 2, window.innerWidth - width - 8)),
        top: Math.max(8, anchorY - root.offsetHeight - 10),
      });
      return;
    }
    const canvasRect = document.querySelector("canvas")?.getBoundingClientRect();
    const selection = target.selectionIds?.flatMap((id) => {
      const selectedPlacement = index.placements.get(id);
      return selectedPlacement ? [selectedPlacement] : [];
    }) ?? [];
    const cell = cellToScreenRect(target.col, target.row, camera, viewport);
    const placement = index.placementAt(target.col, target.row);
    const span = target.selectionSpan ?? (placement ? index.spanOf(placement) : 1);
    const minCol = selection.length ? Math.min(...selection.map((item) => item.col)) : target.col;
    const maxCol = selection.length
      ? Math.max(...selection.map((item) => item.col + index.spanOf(item)))
      : target.col + span;
    const maxRow = selection.length ? Math.max(...selection.map((item) => item.row)) : target.row;
    const leftEdge = cellToScreenRect(minCol, maxRow, camera, viewport);
    const rightEdge = cellToScreenRect(maxCol, maxRow, camera, viewport);
    const anchorX = (canvasRect?.left ?? 0) + (leftEdge.x + rightEdge.x) / 2;
    const anchorY = (canvasRect?.top ?? 0) + (selection.length ? leftEdge.y : cell.y);
    const height = root.offsetHeight;
    const compactLeft = Math.max(8, Math.min(
      anchorX - menuWidth / 2,
      window.innerWidth - menuWidth - 8,
    ));
    const searchFieldOffset = 7 + searchOrigin * 45;
    const searchLeft = Math.max(8, Math.min(
      anchorX - SEARCH_SLOT_WIDTH / 2 - searchFieldOffset,
      window.innerWidth - expandedMenuWidth - 8,
    ));
    setPos({
      compactLeft,
      searchLeft,
      top: Math.max(8, Math.min(anchorY - height - 14, window.innerHeight - height - 8)),
    });
  }, [target, camera, viewport, index, searchOpen, searchOrigin, menuWidth, expandedMenuWidth]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      // The canvas closes the picker itself, so that the click which dismisses
      // it doesn't also drop a stitch at the spot the user aimed to close.
      if (e.target instanceof HTMLCanvasElement) return;
      closePicker();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [closePicker]);

  if (!target) return null;

  const openSearch = (initialQuery = "", origin = 5) => {
    setSearchOpen(true);
    setSearchOrigin(origin);
    setQuery(initialQuery);
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const placeholder = target.armOnly
    ? "Choose a stitch to draw"
    : target.selectionIds
    ? `Replace ${target.selectionIds.length} selected stitch${target.selectionIds.length === 1 ? "" : "es"}`
    : target.insert
      ? `Insert a stitch at col ${target.col}, row ${target.row}`
      : currentSymbol
        ? `Replace ${currentSymbol.label} at col ${target.col}, row ${target.row}`
        : `Add a stitch at col ${target.col}, row ${target.row}`;

  const choose = (symbol: StitchSymbol) => {
    if (target.armOnly) {
      chooseSymbol(symbol.id);
      return;
    }
    const replacingSelection = !!target.selectionIds;
    if (target.selectionIds) {
      replacePlacements(target.selectionIds, symbol.id);
      clearSelection();
    } else if (target.insert) {
      const insertedCol = insertTargetCol(index, symbol.id, target.col, target.row);
      insertPlacement(symbol.id, target.col, target.row);
      if (insertedCol !== null) {
        setInsertAnimation({ col: insertedCol, row: target.row });
      }
    } else {
      place(symbol.id, target.col, target.row);
    }
    chooseSymbol(symbol.id, target.insert ? "insert" : replacingSelection ? tool : "stitch");
  };

  const clear = () => {
    if (target.selectionIds?.length) {
      erasePlacements(target.selectionIds);
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
      <svg className="picker__searchIcon" viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="m12.4 12.4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
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
      <button
        type="button"
        className="picker__close"
        onClick={closePicker}
        aria-label="Close"
        title="Close (Esc)"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M3.5 3.5l9 9m0-9-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        </svg>
      </button>
    </div>
  );

  let resultIndex = -1;

  return (
    <div
      ref={rootRef}
      className="picker"
      data-search-open={searchOpen}
      style={{
        left: searchOpen ? pos.searchLeft : pos.compactLeft,
        top: pos.top,
        width: searchOpen ? expandedMenuWidth : menuWidth,
        maxHeight: MAX_HEIGHT,
      }}
      onKeyDown={onKeyDown}
    >
      <div className="picker__quick" aria-label="Choose a recent stitch or search">
          {Array.from({ length: 5 }, (_, slot) => {
            if (searchOpen && searchOrigin === slot) return renderSearchField(`search:${slot}`);
            const symbol = quickSymbols[slot];
            return symbol ? (
              <button
                key={symbol.id}
                type="button"
                className="picker__quickButton"
                onClick={() => choose(symbol)}
                title={symbol.label}
                aria-label={symbol.label}
                data-label={symbol.label}
              >
                <SymbolGlyph symbol={symbol} cell={Math.max(7, Math.min(22, 58 / symbol.span))} />
              </button>
            ) : (
              <button
                key={`empty:${slot}`}
                type="button"
                className="picker__quickButton picker__quickSlot"
                onClick={() => openSearch("", slot)}
                title="Choose a stitch"
                aria-label={`Choose a stitch for recent slot ${slot + 1}`}
                data-label="Choose stitch"
              >
                <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                  <path
                    d="M10 5.5v9M5.5 10h9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            );
          })}
          {searchOpen && searchOrigin === 5 ? renderSearchField("search:5") : (
            <button
              ref={searchButtonRef}
              type="button"
              className="picker__quickButton picker__searchButton"
              onClick={() => openSearch("", 5)}
              title="Search all stitches"
              aria-label="Search all stitches"
              data-label="Search stitches"
            >
              <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="m12.4 12.4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="picker__quickButton picker__deleteButton"
              onClick={clear}
              aria-label="Clear stitch"
              title="Clear this stitch (Backspace)"
              data-label="Delete"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  d="M3.5 5h9M6.5 5V3.5h3V5M4.5 5l.5 8h6l.5-8"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </button>
          )}
        </div>

        {target.selectionIds && target.selectionIds.length > 1 && (
          <div className="picker__selectionBubbles" aria-label="Selection actions">
            <button
              type="button"
              onClick={() => createRepeat(target.selectionIds!)}
              title="Create a chart-local repeat"
              aria-label="Create repeat"
              data-label="Repeat"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <rect x="3" y="5" width="9" height="9" rx="1.5" />
                <path d="M8 3h6a3 3 0 0 1 3 3v6m0 0-2.5-2.5M17 12l-2.5 2.5" />
              </svg>
            </button>
            <button
              type="button"
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
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <rect x="3" y="3" width="10" height="10" rx="1.5" />
                <path d="M7 13v2a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
              </svg>
            </button>
          </div>
        )}

          {searchOpen && !!query.trim() && (
            <div className="picker__results picker__list" ref={listRef}>
            {flat.length === 0 && matchingRepeats.length === 0 && (
              <div className="picker__empty">No stitch matches that.</div>
            )}

            {matchingRepeats.length > 0 && (
              <div>
                <div className="picker__heading">This chart</div>
                {matchingRepeats.map((repeat) => (
                  <button
                    key={repeat.id}
                    type="button"
                    className="picker__item"
                    onClick={() => {
                      if (instantiateRepeat(repeat.id, target.col, target.row)) closePicker();
                    }}
                  >
                    <span className="picker__repeatGlyph" aria-hidden="true">↻</span>
                    <span className="picker__label">{repeat.name}</span>
                    <span className="picker__span">{repeat.width} × {repeat.height}</span>
                  </button>
                ))}
              </div>
            )}

            {sections.map((section) => (
              <div key={section.key}>
                {section.symbols.map((symbol) => {
                  resultIndex += 1;
                  const isActive = resultIndex === active;
                  const at = resultIndex;
                  return (
                    <button
                      key={`${section.key}:${symbol.id}`}
                      type="button"
                      className="picker__item"
                      data-active={isActive}
                      onPointerEnter={() => setActive(at)}
                      onClick={() => choose(symbol)}
                    >
                      <span className="picker__glyph">
                        <SymbolGlyph symbol={symbol} cell={cellSizeFor(symbol)} />
                      </span>
                      <span className="picker__label">{symbol.label}</span>
                      {symbol.id === target.currentSymbolId && (
                        <span className="picker__current">current</span>
                      )}
                      {symbol.span > 1 && <span className="picker__span">{symbol.span} sts</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            </div>
          )}
    </div>
  );
}
