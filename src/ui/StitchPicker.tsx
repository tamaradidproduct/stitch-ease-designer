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

/** Cables are up to 12 cells wide; shrink the cell so the whole span fits. */
const cellSizeFor = (symbol: StitchSymbol) =>
  Math.max(9, Math.min(22, Math.floor(GLYPH_BUDGET / symbol.span)));

export function StitchPicker() {
  const target = useUiStore((s) => s.picker);
  const closePicker = useUiStore((s) => s.closePicker);
  const chooseSymbol = useUiStore((s) => s.chooseSymbol);
  const recentIds = useUiStore((s) => s.recentSymbolIds);
  const place = useDocStore((s) => s.place);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  // Recents lead when there's no query; searching drops them so the ranking
  // isn't fighting a pinned section.
  const sections = useMemo(() => {
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
    const order = ["basic", "decrease", "increase", "cable", "brioche", "special"];
    const groups = [...byCategory.entries()].sort(
      ([a], [b]) => order.indexOf(a) - order.indexOf(b),
    );

    return [
      ...(recent.length ? [{ key: "recent", title: "Recent", symbols: recent }] : []),
      ...groups.map(([category, symbols]) => ({
        key: category,
        title: CATEGORY_LABEL[category] ?? category,
        symbols,
      })),
    ];
  }, [query, recentIds]);

  // Flat order is what the arrow keys walk, so it must match render order.
  const flat = useMemo(() => sections.flatMap((s) => s.symbols), [sections]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const choose = (symbol: StitchSymbol) => {
    place(symbol.id, target.col, target.row);
    chooseSymbol(symbol.id);
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
          placeholder={`Add a stitch at col ${target.col}, row ${target.row}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
