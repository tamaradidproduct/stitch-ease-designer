import { useLayoutEffect, useRef, useState } from "react";
import { COLOR_GRID } from "../model/colorPalette";

export type ColorSwatchPopoverProps = {
  /** The chip's own rect, measured live rather than relying on CSS containing-block luck (see the file's own doc comment). */
  anchorRect: DOMRect;
  /** Optional panel rect this popover should clear (used by floating picker chips). */
  boundaryRect?: DOMRect | null;
  placement?: "below-first" | "above-first";
  onSelect: (colorId: string) => void;
  onClose: () => void;
};

const SWATCH = 22;
const GAP = 3;
const PAD = 8;
const COLUMNS = 8;
const ROWS = 4;
const EDGE = 8;
const OFFSET = 6;

type PopoverPositionInput = {
  anchorRect: DOMRect;
  boundaryRect?: DOMRect | null;
  placement: "below-first" | "above-first";
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function resolveColorPopoverPosition({
  anchorRect,
  boundaryRect,
  placement,
  width,
  height,
  viewportWidth,
  viewportHeight,
}: PopoverPositionInput) {
  const minTop = EDGE;
  const maxTop = viewportHeight - height - EDGE;
  const left = clamp(anchorRect.left, EDGE, viewportWidth - width - EDGE);
  const topAnchor = boundaryRect?.top ?? anchorRect.top;
  const bottomAnchor = boundaryRect?.bottom ?? anchorRect.bottom;
  const above = topAnchor - height - OFFSET;
  const below = bottomAnchor + OFFSET;
  const aboveFits = above >= minTop;
  const belowFits = below <= maxTop;
  const top = placement === "above-first"
    ? aboveFits
      ? above
      : belowFits
        ? below
        : clamp(above, minTop, maxTop)
    : belowFits
      ? below
      : aboveFits
        ? above
        : clamp(below, minTop, maxTop);
  return { left, top };
}

export function handleColorSwatchClick(
  event: { stopPropagation: () => void },
  onSelect: (colorId: string) => void,
  colorId: string,
) {
  event.stopPropagation();
  onSelect(colorId);
}

/**
 * The color grid popover shared by every "open a color menu" affordance
 * (the armed quick-slot tile's own chip, the picker drawer's add-only chip,
 * the glossary panel's add-only chip - see the colorwork spec's
 * Consolidation section). Always anchors via a measured `getBoundingClientRect`
 * rather than plain CSS `position: absolute`, which is what let one earlier
 * copy of this popover render invisibly inside a clipping, scrolling
 * ancestor (`overflow: hidden` on a drawer, `overflow-y: auto` on the list
 * inside it) - `position: fixed` escapes that ancestor chain entirely, so
 * the next place this chip gets added can't silently reproduce that bug.
 *
 * Fixed grid of 32 preset swatches only - no native `<input type="color">`,
 * no "more colors" escape hatch, no "no color" cell. One click is always
 * exactly one apply.
 */
export function ColorSwatchPopover({
  anchorRect,
  boundaryRect,
  placement = "below-first",
  onSelect,
  onClose,
}: ColorSwatchPopoverProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const width = COLUMNS * SWATCH + (COLUMNS - 1) * GAP + PAD * 2;
  const height = ROWS * SWATCH + (ROWS - 1) * GAP + PAD * 2;
  const [pos, setPos] = useState({ left: anchorRect.left, top: anchorRect.bottom + OFFSET });

  useLayoutEffect(() => {
    setPos(resolveColorPopoverPosition({
      anchorRect,
      boundaryRect,
      placement,
      width,
      height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
  }, [anchorRect, boundaryRect, placement, width, height]);

  useLayoutEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onScrollOrResize = () => onClose();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      className="colorPopover"
      role="dialog"
      aria-label="Choose a color"
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width,
        display: "grid",
        gridTemplateColumns: `repeat(${COLUMNS}, ${SWATCH}px)`,
        gap: GAP,
        padding: PAD,
      }}
    >
      {COLOR_GRID.map((swatch) => (
        <button
          key={swatch.id}
          type="button"
          className="colorPopover__swatch"
          style={{ width: SWATCH, height: SWATCH, background: swatch.hex }}
          aria-label={`${swatch.hue} ${swatch.step + 1}`}
          title={swatch.hex}
          onClick={(event) => handleColorSwatchClick(event, onSelect, swatch.id)}
        />
      ))}
    </div>
  );
}
