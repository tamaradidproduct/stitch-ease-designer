import { describe, expect, it, vi } from "vitest";
import { handleColorSwatchClick, resolveColorPopoverPosition } from "./ColorSwatchPopover";

const rect = (left: number, top: number, right: number, bottom: number): DOMRect => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
  x: left,
  y: top,
  toJSON: () => ({}),
} as DOMRect);

describe("resolveColorPopoverPosition", () => {
  it("places above first for floating picker chips and clears the picker panel", () => {
    const pos = resolveColorPopoverPosition({
      anchorRect: rect(350, 380, 368, 398),
      boundaryRect: rect(280, 343, 620, 418),
      placement: "above-first",
      width: 200,
      height: 113,
      viewportWidth: 1280,
      viewportHeight: 900,
    });
    expect(pos.top).toBe(224);
  });

  it("falls back below when above-first would overflow the viewport top", () => {
    const pos = resolveColorPopoverPosition({
      anchorRect: rect(40, 24, 58, 42),
      boundaryRect: rect(12, 24, 400, 98),
      placement: "above-first",
      width: 200,
      height: 113,
      viewportWidth: 500,
      viewportHeight: 400,
    });
    expect(pos.top).toBe(104);
  });
});

describe("handleColorSwatchClick", () => {
  it("stops bubbling and applies only the clicked swatch", () => {
    const stopPropagation = vi.fn();
    const onSelect = vi.fn();
    handleColorSwatchClick({ stopPropagation }, onSelect, "#fecdd3");
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("#fecdd3");
  });
});
