import { useRef, useState } from "react";
import { ColorSwatchPopover } from "./ColorSwatchPopover";

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
        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
          <path
            d="M10 3a7 7 0 1 0 0 14h1.2a1.6 1.6 0 0 0 0-3.2h-.5a1.2 1.2 0 0 1 0-2.4H13A4 4 0 0 0 17 7.5C17 5 14 3 10 3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <circle cx="6.5" cy="8" r="1" fill="currentColor" />
          <circle cx="9" cy="5.8" r="1" fill="currentColor" />
          <circle cx="13" cy="6.8" r="1" fill="currentColor" />
        </svg>
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
