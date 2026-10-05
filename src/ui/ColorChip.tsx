import { useRef, useState } from "react";
import { ColorSwatchPopover } from "./ColorSwatchPopover";
import { PaletteIcon } from "./icons";

export type ColorChipProps = {
  /**
   * Every chip follows the same rule (see `applyChipColor`) - the picker's
   * quick tile, its drawer rows, and the glossary rows - so they share one
   * look too: the palette glyph reused from the reference-image panel's
   * "canvas stitch colors" button.
   */
  onSelect: (colorId: string) => void;
  label: string;
  className?: string;
  popoverPlacement?: "below-first" | "above-first";
  getPopoverBoundaryRect?: () => DOMRect | null;
};

export function ColorChip({
  onSelect,
  label,
  className,
  popoverPlacement = "below-first",
  getPopoverBoundaryRect,
}: ColorChipProps) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [boundaryRect, setBoundaryRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const openPopover = () => {
    setAnchorRect(buttonRef.current?.getBoundingClientRect() ?? null);
    setBoundaryRect(getPopoverBoundaryRect?.() ?? null);
    setOpen(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`colorChip${className ? ` ${className}` : ""}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openPopover();
        }}
      >
        <PaletteIcon width="14" height="14" />
      </button>
      {open && anchorRect && (
        <ColorSwatchPopover
          anchorRect={anchorRect}
          boundaryRect={boundaryRect}
          placement={popoverPlacement}
          onSelect={(colorId) => {
            setOpen(false);
            onSelect(colorId);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
