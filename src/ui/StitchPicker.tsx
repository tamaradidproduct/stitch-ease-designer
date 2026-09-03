import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { allSymbols, getSymbol } from "../symbols/registry";
import type { StitchSymbol } from "../symbols/types";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { SymbolGlyph } from "./SymbolGlyph";
import { searchSymbols } from "./symbolSearch";

const WIDTH = 288;
const MAX_HEIGHT = 380;
const GLYPH_BUDGET = 210;

const CATEGORY_LABEL: Record<string, string> = {
  basic: "Basic",
  decrease: "Decreases",
  increase: "Increases",
  cable: "Cables",
  brioche: "Brioche",
  special: "Special",
};

const CATEGORY_ORDER = ["basic", "decrease", "increase", "cable", "brioche", "special"];

type Section = { key: string; title: string | null; symbols: StitchSymbol[] };

/**
 * Grouped sections for a query: recents lead when there's no query at all,
 * searching drops them so the ranking isn't fighting a pinned section.
 * Pulled out of the component so the reset-on-reopen effect can compute the
 * same "no query" ordering the picker will render into, without waiting for
 * the query state reset to actually take effect first.
 */
function buildSections(query: string, recentIds: string[]): Section[] {
  const results = searchSymbols(allSymbols(), query);
  if (query.trim()) return [{ key: "results", title: null, symbols: results }];

  const recent = recentIds
    .map((id) => getSymbol(id))
    .filter((s): s is StitchSymbol => !!s);

  const byCategory = new Map<string, StitchSymbol[]>();
  for (const s of results) {
    let group = byCategory.get(s.category);
    if (!group) byCategory.set(s.category, (group = []));
    group.push(s);
  }
  const groups = [...byCategory.entries()].sort(
    ([a], [b]) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b),
  );

  return [
    ...(recent.length ? [{ key: "recent", title: "Recent", symbols: recent }] : []),
    ...groups.map(([category, symbols]) => ({
      key: category,
      title: CATEGORY_LABEL[category] ?? category,
      symbols,
    })),
  ];
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
  const recentIds = useUiStore((s) => s.recentSymbolIds);
  const place = useDocStore((s) => s.place);
  const erase = useDocStore((s) => s.erase);
  const replacePlacements = useDocStore((s) => s.replacePlacements);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const selectionSpan = target?.selectionSpan;

  const sections = useMemo(() => {
    const built = buildSections(query, recentIds);
    if (!selectionSpan) return built;
    return built
      .map((section) => ({
        ...section,
        symbols: section.symbols.filter((symbol) => symbol.span === selectionSpan),
      }))
      .filter((section) => section.symbols.length > 0);
  }, [query, recentIds, selectionSpan]);

  // Flat order is what the arrow keys walk, so it must match render order.
  const flat = useMemo(() => sections.flatMap((s) => s.symbols), [sections]);

  // The picker never unmounts — it just renders null while closed — so a
  // mount-only effect would focus and reset state exactly once, the first
  // time it ever opens, and never again. Keying on `target` instead makes
  // every open behave like a fresh one: a stale search from the last cell
  // doesn't carry over, and if this cell already has a stitch, the list
  // starts on it rather than always at the top.
  useEffect(() => {
    if (!target) return;
    setQuery("");
    inputRef.current?.focus();

    if (target.currentSymbolId) {
      const initial = buildSections("", recentIds).flatMap((s) => s.symbols);
      const at = initial.findIndex((s) => s.id === target.currentSymbolId);
      setActive(at >= 0 ? at : 0);
    } else {
      setActive(0);
    }
    // Only the identity of `target` should retrigger this — recentIds and
    // query are read fresh inside, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Keep the popover on screen when the clicked cell is near an edge.
  useLayoutEffect(() => {
    if (!target) return;
    const height = rootRef.current?.offsetHeight ?? MAX_HEIGHT;
    setPos({
      left: Math.max(8, Math.min(target.x, window.innerWidth - WIDTH - 8)),
      top: Math.max(8, Math.min(target.y, window.innerHeight - height - 8)),
    });
  }, [target]);

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

  const currentSymbol = target.currentSymbolId ? getSymbol(target.currentSymbolId) : undefined;
  const placeholder = target.selectionIds
    ? `Replace ${target.selectionIds.length} selected stitch${target.selectionIds.length === 1 ? "" : "es"}`
    : currentSymbol
      ? `Replace ${currentSymbol.label} at col ${target.col}, row ${target.row}`
      : `Add a stitch at col ${target.col}, row ${target.row}`;

  const choose = (symbol: StitchSymbol) => {
    const replacingSelection = !!target.selectionIds;
    if (target.selectionIds) {
      replacePlacements(target.selectionIds, symbol.id);
      clearSelection();
    } else {
      place(symbol.id, target.col, target.row);
    }
    chooseSymbol(symbol.id);
    if (replacingSelection) setTool("select");
  };

  const clear = () => {
    erase(target.col, target.row);
    closePicker();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closePicker();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const symbol = flat[active];
      if (symbol) choose(symbol);
      return;
    }
    // Only when the search box is empty, so backspacing out a typed query
    // never doubles as clearing the stitch underneath it.
    if ((e.key === "Backspace" || e.key === "Delete") && !query && currentSymbol) {
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

  let index = -1;

  return (
    <div
      ref={rootRef}
      className="picker"
      style={{ left: pos.left, top: pos.top, width: WIDTH, maxHeight: MAX_HEIGHT }}
      onKeyDown={onKeyDown}
    >
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
        {flat.length === 0 && <div className="picker__empty">No stitch matches that.</div>}

        {sections.map((section) => (
          <div key={section.key}>
            {section.title && <div className="picker__heading">{section.title}</div>}
            {section.symbols.map((symbol) => {
              index += 1;
              const isActive = index === active;
              const at = index;
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
    </div>
  );
}
