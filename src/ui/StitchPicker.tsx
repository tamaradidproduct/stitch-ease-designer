import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { allSymbols, getSymbol } from "../symbols/registry";
import type { StitchSymbol } from "../symbols/types";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { SymbolGlyph } from "./SymbolGlyph";
import { searchSymbols } from "./symbolSearch";

const CATEGORY_LABEL: Record<string, string> = {
  basic: "Basic",
  decrease: "Decreases",
  increase: "Increases",
  cable: "Cables",
  brioche: "Brioche",
  special: "Special",
};

const CATEGORY_ORDER = ["basic", "decrease", "increase", "cable", "brioche", "special"];

// Short enough to fit a tab dot, distinct even between categories that share
// a first letter (Basic / Brioche).
const TAB_ABBR: Record<string, string> = {
  recent: "Rc",
  basic: "Ba",
  decrease: "Dc",
  increase: "In",
  cable: "Cb",
  brioche: "Br",
  special: "Sp",
};

// Radial layout tuning. The tab ring is small and fixed; the item ring grows
// with the active category's size so a big category (cables) spreads its
// items further out instead of piling them on top of each other.
const TAB_RADIUS = 44;
const HUB_R = 26;
const ITEM_RADIUS_MIN = 74;
const ITEM_RADIUS_MAX = 260;
const RESULTS_WIDTH = 260;
const RESULTS_MAX_HEIGHT = 320;

type Section = { key: string; title: string | null; symbols: StitchSymbol[] };

/**
 * Grouped sections for a query: recents lead when there's no query at all,
 * searching drops them so the ranking isn't fighting a pinned section. With
 * no query, each section also doubles as one spoke of the radial menu (its
 * `title` becomes a tab label), so this is the single source of truth for
 * both the tab ring and the search fallback list.
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
const cellSizeFor = (symbol: StitchSymbol, budget: number) =>
  Math.max(8, Math.min(20, Math.floor(budget / symbol.span)));

/** Point on a circle of radius `r`, `i`-th of `n` evenly spaced starting at the top. */
function spokePoint(i: number, n: number, r: number) {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
  return { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
}

export function StitchPicker() {
  const target = useUiStore((s) => s.picker);
  const closePicker = useUiStore((s) => s.closePicker);
  const chooseSymbol = useUiStore((s) => s.chooseSymbol);
  const recentIds = useUiStore((s) => s.recentSymbolIds);
  const place = useDocStore((s) => s.place);
  const erase = useDocStore((s) => s.erase);

  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState(0);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [hub, setHub] = useState({ left: 0, top: 0 });

  const sections = useMemo(() => buildSections(query, recentIds), [query, recentIds]);
  const searching = query.trim().length > 0;

  // In search mode there's one flat "results" section; otherwise the radial
  // ring shows whichever tab section is active.
  const activeSection = searching ? sections[0] : sections[Math.min(activeTab, sections.length - 1)];
  const ringItems = activeSection?.symbols ?? [];

  // The picker never unmounts — it just renders null while closed — so a
  // mount-only effect would focus and reset state exactly once, the first
  // time it ever opens, and never again. Keying on `target` instead makes
  // every open behave like a fresh one: a stale search from the last cell
  // doesn't carry over, and if this cell already has a stitch, the ring
  // opens on its category with that stitch highlighted.
  useEffect(() => {
    if (!target) return;
    setQuery("");
    inputRef.current?.focus();

    const initial = buildSections("", recentIds);
    if (target.currentSymbolId) {
      const tabIndex = initial.findIndex((sec) =>
        sec.symbols.some((s) => s.id === target.currentSymbolId),
      );
      const section = initial[tabIndex >= 0 ? tabIndex : 0];
      const itemIndex = section?.symbols.findIndex((s) => s.id === target.currentSymbolId) ?? -1;
      setActiveTab(tabIndex >= 0 ? tabIndex : 0);
      setActive(itemIndex >= 0 ? itemIndex : 0);
    } else {
      setActiveTab(0);
      setActive(0);
    }
    // Only the identity of `target` should retrigger this — recentIds and
    // query are read fresh inside, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Reset the item cursor whenever the ring's contents change underneath it,
  // so arrow-key navigation never points past the end of a shorter category.
  useEffect(() => {
    setActive(0);
  }, [activeSection?.key]);

  const itemRadius = useMemo(() => {
    const n = ringItems.length || 1;
    return Math.round(Math.min(ITEM_RADIUS_MAX, Math.max(ITEM_RADIUS_MIN, 56 + n * 7)));
  }, [ringItems.length]);

  // Keep the whole radial fan (or, while searching, the results panel) on
  // screen: clamp the hub so nothing runs off a viewport edge.
  useLayoutEffect(() => {
    if (!target) return;
    const topMargin = HUB_R + 26 + 8; // hub-actions row sits above the hub
    if (searching) {
      setHub({
        left: Math.max(8, Math.min(target.x, window.innerWidth - HUB_R - 12 - RESULTS_WIDTH - 8)),
        top: Math.max(
          topMargin,
          Math.min(target.y, window.innerHeight - RESULTS_MAX_HEIGHT + 12 - 8),
        ),
      });
      return;
    }
    // Covers both the ring's outer edge and the search toolbar that floats
    // above it (offset itemRadius + 40, plus its own height).
    const radialMargin = itemRadius + 90;
    setHub({
      left: Math.max(radialMargin, Math.min(target.x, window.innerWidth - radialMargin)),
      top: Math.max(
        Math.max(radialMargin, topMargin),
        Math.min(target.y, window.innerHeight - radialMargin),
      ),
    });
  }, [target, itemRadius, searching]);

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

  const choose = (symbol: StitchSymbol) => {
    place(symbol.id, target.col, target.row);
    chooseSymbol(symbol.id);
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
      const symbol = ringItems[active];
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
    if (!searching && (e.key === "Tab" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      // Cycle the active spoke — which category (or Recent) the outer ring shows.
      e.preventDefault();
      const step = e.key === "ArrowLeft" ? -1 : 1;
      setActiveTab((i) => (i + step + sections.length) % sections.length);
      return;
    }
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (step && ringItems.length) {
      e.preventDefault();
      setActive((i) => (i + step + ringItems.length) % ringItems.length);
    }
  };

  const glyphBudget = Math.max(28, (2 * Math.PI * itemRadius) / Math.max(ringItems.length, 1) - 8);

  return (
    <div
      ref={rootRef}
      className="radial-picker"
      style={{ left: hub.left, top: hub.top }}
      onKeyDown={onKeyDown}
    >
      <div className="radial-picker__hub" style={{ width: HUB_R * 2, height: HUB_R * 2 }}>
        {currentSymbol && !searching ? (
          <span className="radial-picker__hub-glyph">
            <SymbolGlyph symbol={currentSymbol} cell={Math.min(16, HUB_R)} />
          </span>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {/* One toolbar above everything else, pushed clear of the ring's top
          edge so it never overlaps the tabs or items fanned out below it. */}
      <div
        className="radial-picker__toolbar"
        style={{ top: -(searching ? HUB_R + 26 : itemRadius + 40) }}
      >
        <input
          ref={inputRef}
          className="radial-picker__search"
          placeholder={currentSymbol ? "Search or type to replace…" : "Search stitches…"}
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
            className="radial-picker__action"
            onClick={clear}
            aria-label="Clear stitch"
            title="Clear this stitch (Backspace)"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
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
          className="radial-picker__action"
          onClick={closePicker}
          aria-label="Close"
          title="Close (Esc)"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
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

      {!searching && sections.length > 0 && (
        <div className="radial-picker__tabs">
          {sections.map((section, i) => {
            const { dx, dy } = spokePoint(i, sections.length, TAB_RADIUS);
            const isActive = i === activeTab;
            return (
              <button
                key={section.key}
                type="button"
                className="radial-picker__tab"
                data-active={isActive}
                style={{ transform: `translate(${dx}px, ${dy}px) translate(-50%, -50%)` }}
                // Switching a spoke shouldn't steal focus from the search
                // field — keystrokes right after would otherwise fall
                // through to the global shortcuts (e.g. "e" for eraser).
                onMouseDown={(e) => e.preventDefault()}
                onPointerEnter={() => setActiveTab(i)}
                onClick={() => setActiveTab(i)}
                title={section.title ?? ""}
              >
                {TAB_ABBR[section.key] ?? (section.title ?? "?").slice(0, 2)}
              </button>
            );
          })}
        </div>
      )}

      {/* Individual floating buttons with gaps between them, rather than one
          solid panel, so the chart underneath — including neighbouring
          stitches — stays visible through and around the ring. */}
      {!searching && (
        <div className="radial-picker__ring">
          {ringItems.map((symbol, i) => {
            const { dx, dy } = spokePoint(i, ringItems.length, itemRadius);
            const isActive = i === active;
            return (
              <button
                key={symbol.id}
                type="button"
                className="radial-picker__item"
                data-active={isActive}
                data-current={symbol.id === target.currentSymbolId}
                style={{ transform: `translate(${dx}px, ${dy}px) translate(-50%, -50%)` }}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(symbol)}
                title={symbol.label + (symbol.span > 1 ? ` (${symbol.span} sts)` : "")}
              >
                <SymbolGlyph symbol={symbol} cell={cellSizeFor(symbol, glyphBudget)} />
              </button>
            );
          })}
          {ringItems.length === 0 && (
            <div
              className="radial-picker__empty"
              style={{ transform: `translate(0, ${itemRadius}px) translate(-50%, -50%)` }}
            >
              Nothing here yet.
            </div>
          )}
        </div>
      )}

      {searching && (
        <div
          className="radial-picker__results"
          ref={listRef}
          style={{ width: RESULTS_WIDTH, maxHeight: RESULTS_MAX_HEIGHT, left: HUB_R + 12, top: -12 }}
        >
          {ringItems.length === 0 && (
            <div className="picker__empty">No stitch matches that.</div>
          )}
          {ringItems.map((symbol, i) => {
            const isActive = i === active;
            return (
              <button
                key={symbol.id}
                type="button"
                className="picker__item"
                data-active={isActive}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(symbol)}
              >
                <span className="picker__glyph">
                  <SymbolGlyph symbol={symbol} cell={cellSizeFor(symbol, 210)} />
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
      )}
    </div>
  );
}
