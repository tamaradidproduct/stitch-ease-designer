import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cellToScreenRect } from "../canvas/camera";
import { allSymbols, getSymbol } from "../symbols/registry";
import type { StitchSymbol } from "../symbols/types";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { SymbolGlyph } from "./SymbolGlyph";
import { searchSymbols } from "./symbolSearch";

const MENU_WIDTH = 284;
const SEARCH_WIDTH = 320;
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
  const chooseSymbol = useUiStore((s) => s.chooseSymbol);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const setTool = useUiStore((s) => s.setTool);
  const quickIds = useUiStore((s) => s.quickSymbolIds);
  const camera = useUiStore((s) => s.camera);
  const viewport = useUiStore((s) => s.viewport);
  const place = useDocStore((s) => s.place);
  const erase = useDocStore((s) => s.erase);
  const insertPlacement = useDocStore((s) => s.insertPlacement);
  const replacePlacements = useDocStore((s) => s.replacePlacements);
  const repeats = useDocStore((s) => s.repeats);
  const instantiateRepeat = useDocStore((s) => s.instantiateRepeat);
  const index = useDocStore((s) => s.index);
  useDocStore((s) => s.revision);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const selectionSpan = target?.selectionSpan;

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
    setSearchOpen(false);
    setActive(0);
    requestAnimationFrame(() => searchButtonRef.current?.focus());
  }, [target]);

  // Keep the popover on screen when the clicked cell is near an edge.
  useLayoutEffect(() => {
    if (!target) return;
    const root = rootRef.current;
    if (!root) return;
    const canvasRect = document.querySelector("canvas")?.getBoundingClientRect();
    const cell = cellToScreenRect(target.col, target.row, camera, viewport);
    const placement = index.placementAt(target.col, target.row);
    const span = target.selectionSpan ?? (placement ? index.spanOf(placement) : 1);
    const anchorX = (canvasRect?.left ?? 0) + cell.x + (cell.size * span) / 2;
    const anchorY = (canvasRect?.top ?? 0) + cell.y;
    const width = searchOpen ? SEARCH_WIDTH : MENU_WIDTH;
    const height = root.offsetHeight;
    setPos({
      left: Math.max(8, Math.min(anchorX - width / 2, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(anchorY - height - 8, window.innerHeight - height - 8)),
    });
  }, [target, searchOpen, camera, viewport, index, query]);

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

  const openSearch = (initialQuery = "") => {
    setSearchOpen(true);
    setQuery(initialQuery);
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const currentSymbol = target.currentSymbolId ? getSymbol(target.currentSymbolId) : undefined;
  const placeholder = target.selectionIds
    ? `Replace ${target.selectionIds.length} selected stitch${target.selectionIds.length === 1 ? "" : "es"}`
    : target.insert
      ? `Insert a stitch at col ${target.col}, row ${target.row}`
      : currentSymbol
        ? `Replace ${currentSymbol.label} at col ${target.col}, row ${target.row}`
        : `Add a stitch at col ${target.col}, row ${target.row}`;

  const choose = (symbol: StitchSymbol) => {
    const replacingSelection = !!target.selectionIds;
    if (target.selectionIds) {
      replacePlacements(target.selectionIds, symbol.id);
      clearSelection();
    } else if (target.insert) {
      insertPlacement(symbol.id, target.col, target.row);
    } else {
      place(symbol.id, target.col, target.row);
    }
    chooseSymbol(symbol.id, target.insert ? "insert" : "stitch");
    if (replacingSelection) setTool("select");
  };

  const clear = () => {
    erase(target.col, target.row);
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
    if (searchOpen && (e.key === "Backspace" || e.key === "Delete") && !query && currentSymbol) {
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

  let resultIndex = -1;

  return (
    <div
      ref={rootRef}
      className="picker"
      data-search-open={searchOpen}
      style={{
        left: pos.left,
        top: pos.top,
        width: searchOpen ? SEARCH_WIDTH : MENU_WIDTH,
        maxHeight: MAX_HEIGHT,
      }}
      onKeyDown={onKeyDown}
    >
      <div className="picker__quick" aria-label="Choose a recent stitch or search">
        {Array.from({ length: 5 }, (_, slot) => {
          const symbol = quickSymbols[slot];
          return symbol ? (
            <button
              key={symbol.id}
              type="button"
              className="picker__quickButton"
              onClick={() => choose(symbol)}
              title={symbol.label}
              aria-label={symbol.label}
            >
              <SymbolGlyph symbol={symbol} cell={Math.max(7, Math.min(22, 58 / symbol.span))} />
            </button>
          ) : (
            <button
              key={`empty:${slot}`}
              type="button"
              className="picker__quickButton picker__quickSlot"
              onClick={() => openSearch()}
              title="Choose a stitch"
              aria-label={`Choose a stitch for recent slot ${slot + 1}`}
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
        <button
          ref={searchButtonRef}
          type="button"
          className="picker__quickButton picker__searchButton"
          data-active={!searchOpen}
          onClick={() => openSearch()}
          title="Search all stitches"
          aria-label="Search all stitches"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="m12.4 12.4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {searchOpen && (
        <>
          <div className="picker__header">
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
            {currentSymbol && (
          <button
            type="button"
            className="picker__clear"
            onClick={clear}
            aria-label="Clear stitch"
            title="Clear this stitch (Backspace)"
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
            <button
          type="button"
          className="picker__close"
          onClick={closePicker}
          aria-label="Close"
          title="Close (Esc)"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M3.5 3.5l9 9m0-9l-9 9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
            </button>
          </div>

          <div className="picker__list" ref={listRef}>
            {!query.trim() && (
              <div className="picker__empty">Type to search all stitches.</div>
            )}
            {!!query.trim() && flat.length === 0 && matchingRepeats.length === 0 && (
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
                  // A collision (e.g. the target cell, or another cell the
                  // repeat's footprint covers, is already occupied) leaves
                  // nothing placed - keep the picker open rather than
                  // closing it on what looked like a no-op click.
                  if (instantiateRepeat(repeat.id, target.col, target.row)) closePicker();
                }}
              >
                <span className="picker__repeatGlyph" aria-hidden="true">↻</span>
                <span className="picker__label">{repeat.name}</span>
                <span className="picker__span">
                  {repeat.width} × {repeat.height}
                </span>
              </button>
            ))}
          </div>
            )}

            {sections.map((section) => (
          <div key={section.key}>
            {section.title && <div className="picker__heading">{section.title}</div>}
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
                  {symbol.span > 1 && (
                    <span className="picker__span">{symbol.span} sts</span>
                  )}
                </button>
              );
            })}
          </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
