export type PopoverPositionInput = {
  anchorRect: DOMRect;
  boundaryRect?: DOMRect | null;
  placement: "below-first" | "above-first";
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

const EDGE = 8;
const OFFSET = 6;

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

