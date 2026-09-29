import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { getSwatch } from "../model/colorPalette";
import {
  FIRST_ROW_SIDES,
  WORKED_MODES,
  type Corner,
  type FirstRowSide,
  type PatternInfo,
  type Worked,
} from "../model/types";
import { useDocStore } from "../state/docStore";

/** Grid layout order (top row, then bottom row) for the first-stitch corner picker. */
const CORNER_GRID_ORDER: Corner[] = ["tl", "tr", "bl", "br"];
const CORNER_LABELS: Record<Corner, string> = {
  tl: "Top left",
  tr: "Top right",
  bl: "Bottom left",
  br: "Bottom right",
};
const CORNER_SHORT: Record<Corner, string> = {
  tl: "TL",
  tr: "TR",
  bl: "BL",
  br: "BR",
};

/** The read-only line shown on the trigger button when the menu is closed. */
function summarize(patternInfo: PatternInfo, namedColorCount: number): string {
  const parts: string[] = [];
  if (patternInfo.worked) parts.push(patternInfo.worked === "flat" ? "Flat" : "Round");
  if (patternInfo.worked !== "round" && patternInfo.firstRow) parts.push(patternInfo.firstRow);
  if (patternInfo.firstStitch) parts.push(CORNER_SHORT[patternInfo.firstStitch]);
  if (namedColorCount > 0) {
    parts.push(`${namedColorCount} color name${namedColorCount === 1 ? "" : "s"}`);
  }
  return parts.length ? parts.join(" · ") : "Not set";
}

/**
 * Lives in the topbar next to the chart name: a read-only summary of
 * `worked`/`firstRow`/`firstStitch`/`colorNames` by default, opening into the
 * editable controls only once clicked - the preview reads these instead of
 * asking, so most of the time there's nothing to *do* here, only to check.
 */
export function PatternSettingsMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const patternInfo = useDocStore((state) => state.patternInfo);
  const setPatternInfo = useDocStore((state) => state.setPatternInfo);
  const setColorName = useDocStore((state) => state.setColorName);
  const index = useDocStore((state) => state.index);
  const revision = useDocStore((state) => state.revision);

  const usedColorIds = useMemo(() => {
    // The document mutates its index in place; revision invalidates this
    // cached snapshot when placements change.
    void revision;
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const p of index.toArray()) {
      if (p.colorId && !seen.has(p.colorId)) {
        seen.add(p.colorId);
        ids.push(p.colorId);
      }
    }
    return ids;
  }, [index, revision]);

  const namedColorCount = useMemo(
    () => usedColorIds.filter((id) => patternInfo.colorNames?.[id]).length,
    [usedColorIds, patternInfo.colorNames],
  );

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setPos({ left: rect.left, top: rect.bottom + 6 });
    };
    updatePosition();
    const dismissOutside = (event: PointerEvent) => {
      if (
        popoverRef.current?.contains(event.target as Node) ||
        triggerRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("keydown", dismissOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("keydown", dismissOnEscape, true);
    };
  }, [open]);

  return (
    <div className="patternSettings">
      <button
        ref={triggerRef}
        type="button"
        className="patternSettings__trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="patternSettings__label">Pattern settings</span>
        <span className="patternSettings__summary">{summarize(patternInfo, namedColorCount)}</span>
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="patternSettings__popover"
          role="dialog"
          aria-label="Pattern settings"
          style={{ position: "fixed", left: pos.left, top: pos.top }}
        >
          <div className="patternInfo">
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
                          // Uncontrolled so typing doesn't push an undo step
                          // per keystroke, but that means React won't notice
                          // an external change (undo/redo) on its own - a
                          // key tied to the stored value forces a remount so
                          // the field doesn't silently drift from the store.
                          key={patternInfo.colorNames?.[colorId] ?? ""}
                          type="text"
                          defaultValue={patternInfo.colorNames?.[colorId] ?? ""}
                          placeholder={swatch ? `${swatch.hue} ${swatch.step + 1}` : "Name"}
                          aria-label="Name for this color"
                          onBlur={(event) => setColorName(colorId, event.target.value)}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
