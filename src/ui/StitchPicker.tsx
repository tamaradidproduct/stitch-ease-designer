import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { allSymbols, getSymbol } from "../symbols/registry";
import type { StitchSymbol } from "../symbols/types";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { SymbolGlyph } from "./SymbolGlyph";
import { searchSymbols } from "./symbolSearch";

// Most patterns lean on a handful of stitches, so the ring is a fixed set of
// recently-used slots rather than the whole library — one slot is always a
// search entry point (not just the empty ones), so browsing the full
// library is never more than one click away even with a full ring.
const RING_SIZE = 8;
const SEARCH_SLOT = 4; // bottom of the ring — opposite the first recent slot
const RECENT_SLOTS = [0, 1, 2, 3, 5, 6, 7]; // ring positions for recents, in recency order
const RECENT_CAPACITY = RECENT_SLOTS.length;
const ITEM_RADIUS = 92;
const HUB_R = 26;
const RESULTS_WIDTH = 260;
const RESULTS_MAX_HEIGHT = 320;

type RingSlot =
  | { type: "symbol"; symbol: StitchSymbol }
  | { type: "empty" }
  | { type: "search" };

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
  // Set when the search slot (or an empty one) is used to browse the full
  // library rather than pick from recents — distinct from `query` so that
  // click can show every stitch without faking a typed search.
  const [browsing, setBrowsing] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [hub, setHub] = useState({ left: 0, top: 0 });

  // Ring slots: one fixed search slot, the rest the most recent stitches
  // padded with empty "add" slots — never more, never a shifting radius.
  const ringSlots = useMemo<RingSlot[]>(() => {
    const recent = recentIds
      .slice(0, RECENT_CAPACITY)
      .map((id) => getSymbol(id))
      .filter((s): s is StitchSymbol => !!s);
    const slots: RingSlot[] = Array.from({ length: RING_SIZE }, () => ({ type: "empty" }));
    slots[SEARCH_SLOT] = { type: "search" };
    RECENT_SLOTS.forEach((slotIndex, i) => {
      const symbol = recent[i];
      if (symbol) slots[slotIndex] = { type: "symbol", symbol };
    });
    return slots;
  }, [recentIds]);

  const showResults = query.trim().length > 0 || browsing;
  const results = useMemo(() => searchSymbols(allSymbols(), query), [query]);

  // The picker never unmounts — it just renders null while closed — so a
  // mount-only effect would focus and reset state exactly once, the first
  // time it ever opens, and never again. Keying on `target` instead makes
  // every open behave like a fresh one: a stale search from the last cell
  // doesn't carry over, and if this cell already has a stitch, the ring
  // starts with it highlighted.
  useEffect(() => {
    if (!target) return;
    setQuery("");
    setBrowsing(false);
    inputRef.current?.focus();

    const recentIndex = target.currentSymbolId
      ? recentIds.slice(0, RECENT_CAPACITY).indexOf(target.currentSymbolId)
      : -1;
    const at = recentIndex >= 0 ? (RECENT_SLOTS[recentIndex] ?? -1) : -1;
    setActive(at >= 0 ? at : 0);
    // Only the identity of `target` should retrigger this — recentIds is
    // read fresh inside, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Keep the whole radial fan (or, while showing results, the list panel) on
  // screen: clamp the hub so nothing runs off a viewport edge.
  useLayoutEffect(() => {
    if (!target) return;
    const topMargin = HUB_R + 26 + 8; // search toolbar sits above the hub
    if (showResults) {
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
    // above it (offset ITEM_RADIUS + 40, plus its own height).
    const radialMargin = ITEM_RADIUS + 90;
    setHub({
      left: Math.max(radialMargin, Math.min(target.x, window.innerWidth - radialMargin)),
      top: Math.max(
        Math.max(radialMargin, topMargin),
        Math.min(target.y, window.innerHeight - radialMargin),
      ),
    });
  }, [target, showResults]);

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

  const browseAll = () => {
    setBrowsing(true);
    setActive(0);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closePicker();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (showResults) {
        const symbol = results[active];
        if (symbol) choose(symbol);
        return;
      }
      const slot = ringSlots[active];
      if (slot?.type === "symbol") choose(slot.symbol);
      else browseAll();
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
    if (!step) return;
    e.preventDefault();
    const count = showResults ? results.length : ringSlots.length;
    if (count) setActive((i) => (i + step + count) % count);
  };

  return (
    <div
      ref={rootRef}
      className="radial-picker"
      style={{ left: hub.left, top: hub.top }}
      onKeyDown={onKeyDown}
    >
      {/* The hub itself is the close button — a dedicated ring slot handles
          search instead, so the hub has one job. */}
      <button
        type="button"
        className="radial-picker__hub"
        style={{ width: HUB_R * 2, height: HUB_R * 2 }}
        onClick={closePicker}
        aria-label="Close"
        title="Close (Esc)"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path
            d="M3.5 3.5l9 9m0-9l-9 9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </button>

      {/* One toolbar above everything else, pushed clear of the ring's top
          edge so it never overlaps the items fanned out below it. */}
      <div
        className="radial-picker__toolbar"
        style={{ top: -(showResults ? HUB_R + 26 : ITEM_RADIUS + 40) }}
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
      </div>

      {/* Individual floating buttons with gaps between them, rather than one
          solid panel, so the chart underneath — including neighbouring
          stitches — stays visible through and around the ring. */}
      {!showResults && (
        <div className="radial-picker__ring">
          {ringSlots.map((slot, i) => {
            const { dx, dy } = spokePoint(i, ringSlots.length, ITEM_RADIUS);
            const isActive = i === active;
            const transform = `translate(${dx}px, ${dy}px) translate(-50%, -50%)`;

            if (slot.type === "search") {
              return (
                <button
                  key="search"
                  type="button"
                  className="radial-picker__item radial-picker__item--search"
                  data-active={isActive}
                  style={{ transform }}
                  onPointerEnter={() => setActive(i)}
                  onClick={browseAll}
                  title="Search all stitches"
                >
                  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                    <circle
                      cx="6.5"
                      cy="6.5"
                      r="4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              );
            }

            if (slot.type === "empty") {
              return (
                <button
                  key={`empty-${i}`}
                  type="button"
                  className="radial-picker__item radial-picker__item--empty"
                  data-active={isActive}
                  style={{ transform }}
                  onPointerEnter={() => setActive(i)}
                  onClick={browseAll}
                  title="Add a stitch"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path
                      d="M8 3.5v9M3.5 8h9"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              );
            }

            const { symbol } = slot;
            return (
              <button
                key={symbol.id}
                type="button"
                className="radial-picker__item"
                data-active={isActive}
                data-current={symbol.id === target.currentSymbolId}
                style={{ transform }}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(symbol)}
                title={symbol.label + (symbol.span > 1 ? ` (${symbol.span} sts)` : "")}
              >
                <SymbolGlyph symbol={symbol} cell={cellSizeFor(symbol, 44)} />
              </button>
            );
          })}
        </div>
      )}

      {showResults && (
        <div
          className="radial-picker__results"
          ref={listRef}
          style={{ width: RESULTS_WIDTH, maxHeight: RESULTS_MAX_HEIGHT, left: HUB_R + 12, top: -12 }}
        >
          {results.length === 0 && <div className="picker__empty">No stitch matches that.</div>}
          {results.map((symbol, i) => {
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
